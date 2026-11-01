"""Bake authored ruts, berms and takeoffs onto the existing frozen 2 m terrain.
Sparse 0.5 m delta tiles are shared by collision and Blender mesh generation.
No new survey detail is claimed; the additions are fictional trail earthworks.
"""
from pathlib import Path
import json,math,subprocess
import numpy as np
from scipy.spatial import cKDTree
from scipy.ndimage import gaussian_filter1d
R=Path(__file__).resolve().parents[1];C=R.parent/'geodata/v3';C.mkdir(exist_ok=True,parents=True)
for name,folder,source in [('uetliberg',R/'public/assets','Uetliberg.blend'),('lenzerheide',R/'public/assets/lenzerheide','Lenzerheide.blend')]:
 cache=C/name;cache.mkdir(exist_ok=True);backup=cache/source
 if not backup.exists():
  backup.write_bytes(subprocess.check_output(['git','show','9dea61d5973c7915761d5a44beb47c54bcb3a88d:'+source],cwd=R))
 m=json.loads((folder/'region.json').read_text());h=np.fromfile(folder/'height.bin',dtype='<f4').reshape(m['height'],m['width']);W,S,E,N=m['bounds'];OE,ON=m['origin'];H0=m['heightOrigin'];step=m['step']
 files=['trail.json']+(['trail-technical.json'] if name=='lenzerheide' else []);trails=[json.loads((folder/f).read_text()) for f in files];routes=[np.array(t['points'])[:,[0,2]] for t in trails];allp=np.vstack(routes);tree=cKDTree(allp)
 tangents=[];turns=[];arcs=[];ramps=[]
 for p in routes:
  tangent=np.gradient(p,axis=0);tangent/=np.linalg.norm(tangent,axis=1)[:,None];curve=np.gradient(tangent,axis=0);turn=gaussian_filter1d(tangent[:,0]*curve[:,1]-tangent[:,1]*curve[:,0],5);arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(p,axis=0),axis=1))];tangents.append(tangent);turns.append(turn);arcs.append(arc)
  last=0
  for i in range(130,len(p)-130):
   if arc[i]-last<220 or abs(turn[i])>.005:continue
   if any(np.linalg.norm(p[i]-r['position'])<70 for r in ramps):continue
   ramps.append({'position':p[i].tolist(),'tangent':tangent[i].tolist(),'height':.36 if name=='uetliberg' else .43,'length':12});last=arc[i]
   if len(ramps)>=(4 if name=='uetliberg' else 7):break
 tangent=np.vstack(tangents);turn=np.concatenate(turns);arc=np.concatenate(arcs)
 def project(x,z):
  q=np.c_[np.asarray(x).ravel(),np.asarray(z).ravel()];_,idx=tree.query(q,workers=2);delta=q-allp[idx];along=np.sum(delta*tangent[idx],axis=1);side=delta[:,0]*(-tangent[idx,1])+delta[:,1]*tangent[idx,0]
  return idx,side,arc[idx]+along
 def sculpt(x,z):
  qx=np.asarray(x).ravel();qz=np.asarray(z).ravel();idx,side,along=project(qx,qz);dist=np.hypot(qx-allp[idx,0],qz-allp[idx,1]);envelope=np.clip((6-dist)/2,0,1);envelope=envelope*envelope*(3-2*envelope)
  rut=-.038*np.exp(-((np.abs(side)-.55)/.19)**2)*(0.72+.28*np.sin(along*.11)**2)
  bank=np.clip(-turn[idx]*side*13,0,.68)*np.clip((np.abs(side)-.8)/1.1,0,1)
  delta=(rut+bank)*envelope
  for r in ramps:
   dx=qx-r['position'][0];dz=qz-r['position'][1];tx,tz=r['tangent'];u=dx*tx+dz*tz;v=-dx*tz+dz*tx
   up=np.clip((u+6)/4,0,1);up=up*up*(3-2*up);down=np.clip((6-u)/5,0,1);down=down*down*(3-2*down);cross=np.clip((2.5-np.abs(v))/.65,0,1);delta+=r['height']*up*down*cross
  delta[dist>9]=0;return np.clip(delta,-.1,1.1)
 def base(x,z):
  u=np.clip((np.asarray(x)+OE-W)/step,0,h.shape[1]-1.001);v=np.clip((np.asarray(z)+N-ON)/step,0,h.shape[0]-1.001);i=u.astype(int);j=v.astype(int);a=u-i;b=v-j
  return h[j,i]*(1-a)*(1-b)+h[j,i+1]*a*(1-b)+h[j+1,i]*(1-a)*b+h[j+1,i+1]*a*b-H0
 tiles=set()
 for p in allp[::4]:
  for x in range(math.floor((p[0]-13)/32),math.floor((p[0]+13)/32)+1):
   for z in range(math.floor((p[1]-13)/32),math.floor((p[1]+13)/32)+1):tiles.add((x,z))
 records=[];blocks=[];tiledata={};offset=0
 for x,z in sorted(tiles):
  xx,zz=np.meshgrid(x*32+np.arange(65)*.5,z*32+np.arange(65)*.5);values=np.round(sculpt(xx,zz)*1000).reshape(65,65).astype('<i2');tiledata[x,z]=values;records.append({'x':x,'z':z,'offset':offset});blocks.append(values.ravel());offset+=values.size
 np.concatenate(blocks).astype('<i2').tofile(folder/'surface-details.bin');details={'version':3,'step':.5,'tileSize':32,'size':65,'scale':.001,'tiles':records,'ramps':ramps,'note':'Authored 0.5 m trail delta tiles over frozen 2 m survey data.'};(folder/'surface-details.json').write_text(json.dumps(details,separators=(',',':')))
 def sample(x,z):
  x=np.asarray(x);z=np.asarray(z);flatx=x.ravel();flatz=z.ravel();result=np.zeros_like(flatx,dtype=float)
  tx=np.floor(flatx/32).astype(int);tz=np.floor(flatz/32).astype(int)
  for key in set(zip(tx,tz)):
   if key not in tiledata:continue
   ids=np.where((tx==key[0])&(tz==key[1]))[0];u=np.clip((flatx[ids]-key[0]*32)*2,0,63.99999);v=np.clip((flatz[ids]-key[1]*32)*2,0,63.99999);i=u.astype(int);j=v.astype(int);a=u-i;b=v-j;d=tiledata[key];result[ids]=(d[j,i]*(1-a)*(1-b)+d[j,i+1]*a*(1-b)+d[j+1,i]*(1-a)*b+d[j+1,i+1]*a*b)*.001
  return base(x,z)+result.reshape(x.shape)
 for f,t,p in zip(files,trails,routes):
  y=sample(p[:,0],p[:,1])+.045;points=np.c_[p[:,0],y,p[:,1]];t.update(points=points.tolist(),length=round(float(np.linalg.norm(np.diff(points,axis=0),axis=1).sum())),drop=round(float(y[0]-y[-1])),surfaceVersion=3);(folder/f).write_text(json.dumps(t,separators=(',',':')))
 forest=json.loads((folder/'forest.json').read_text())
 for p in forest:p[1]=round(float(sample(p[0],p[2])),4)
 (folder/'forest.json').write_text(json.dumps(forest,separators=(',',':')))
 decor=json.loads((folder/'decor.json').read_text())
 # Keep a clear riding corridor across both intersecting routes.
 decor['rocks']=[p for p in decor['rocks'] if tree.query([p[0],p[2]])[0]>2.2+p[3]*.95]
 for key in ['grass','ferns','rocks','roots']:
  for p in decor[key]:p[1]=round(float(sample(p[0],p[2]))+(.012 if key=='roots' else (-.08 if key=='rocks' else 0)),4)
 (folder/'decor.json').write_text(json.dumps(decor,separators=(',',':')))
 for resolution,label in [(.5,'high'),(1.,'mobile')]:
  xv=np.arange(math.floor(allp[:,0].min())-16,math.ceil(allp[:,0].max())+17,resolution);zv=np.arange(math.floor(allp[:,1].min())-16,math.ceil(allp[:,1].max())+17,resolution);fx,fz=np.meshgrid(xv,zv);dist,_=tree.query(np.c_[fx.ravel(),fz.ravel()],workers=2);dist=dist.reshape(fx.shape);inside=(dist[:-1,:-1]<14)|(dist[1:,:-1]<14)|(dist[:-1,1:]<14)|(dist[1:,1:]<14);ys,xs=np.where(inside);nw=len(xv);quads=np.c_[ys*nw+xs,(ys+1)*nw+xs,(ys+1)*nw+xs+1,ys*nw+xs+1];used,inv=np.unique(quads.ravel(),return_inverse=True);gx=fx.ravel()[used];gz=fz.ravel()[used];idx,side,along=project(gx,gz);gy=sample(gx,gz)+.018
  np.savez_compressed(cache/('corridor-'+label+'.npz'),vertices=np.c_[gx,-gz,gy],faces=inv.reshape(-1,4),uv=np.c_[(gx+OE-W)/(E-W),1-(gz+N-ON)/(N-S)],track=np.c_[side/12+.5,along/100]);print(name,label,len(used),'vertices',flush=True)
 m['detailVersion']=3;m['detailNote']='Authored ruts, banked corners and rounded takeoffs; sparse 0.5 m delta grid. Survey resolution stays 2 m.';(folder/'region.json').write_text(json.dumps(m,indent=2));print(name,len(records),'tiles',len(ramps),'takeoffs',flush=True)
