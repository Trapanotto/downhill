"""Build both fictional Lenzerheide lines from frozen swisstopo rasters.
All processing happens once, before Blender export. No runtime geodata API.
"""
from pathlib import Path
import json,math,random
import numpy as np,rasterio
from rasterio.merge import merge
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject
from scipy.ndimage import gaussian_filter,gaussian_filter1d
from scipy.spatial import cKDTree
from PIL import Image
R=Path(__file__).resolve().parents[1];C=R.parent/'geodata/lenzerheide';A=R/'public/assets/lenzerheide'
B=[2761400,1178200,2763700,1180500];W,S,E,N=B;OE,ON=2762500,1179200;H0=1400;step=2
sources=json.loads((A/'sources.json').read_text());ss=[rasterio.open(C/f['file']) for f in sources['files'] if f['kind']=='height'];raw,_=merge(ss,bounds=B,res=step,resampling=Resampling.bilinear);h=gaussian_filter(np.pad(raw[0],((0,1),(0,1)),mode='edge'),.65)
assert h.min()>1400 and h.max()<2400
np.save(C/'raw-height.npy',h)
def sample(grid,x,z):
 u=np.clip((np.asarray(x)+OE-W)/step,0,grid.shape[1]-1.001);v=np.clip((np.asarray(z)+N-ON)/step,0,grid.shape[0]-1.001);i=u.astype(int);j=v.astype(int);a=u-i;b=v-j
 return grid[j,i]*(1-a)*(1-b)+grid[j,i+1]*a*(1-b)+grid[j+1,i]*(1-a)*b+grid[j+1,i+1]*a*b
# Control coordinates are LV95 offsets from E 2760000 / N 1170000.
flow=[[3100,9050],[3050,9060],[3030,9170],[2970,9200],[2930,9080],[2910,8950],[2850,8930],[2820,9080],[2760,9130],[2720,9020],[2700,8870],[2640,8830],[2600,8990],[2540,9050],[2500,8930],[2480,8780],[2410,8740],[2370,8890],[2300,8930],[2260,8810],[2230,8720],[2170,8700],[2130,8820],[2070,8820],[2020,8730],[1950,8690],[1890,8750]]
tech=flow[:4]+[[2920,9160],[2890,9070],[2840,9000],[2780,9020],[2750,8970],[2680,8950],[2640,8890],[2580,8910],[2540,8840],[2470,8830],[2430,8790],[2360,8810],[2320,8740],[2250,8720],[2210,8780],[2160,8800]]+flow[-4:]
def curve(controls):
 controls=np.array([[p[0]+2760000-OE,ON-(p[1]+1170000)] for p in controls],dtype=float);points=[]
 for k in range(len(controls)-1):
  p0=controls[max(0,k-1)];p1=controls[k];p2=controls[k+1];p3=controls[min(k+2,len(controls)-1)]
  for t in np.linspace(0,1,max(12,int(np.linalg.norm(p2-p1))),endpoint=False):points.append(.5*(2*p1+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
 return np.vstack([points,controls[-1]])
lines=[curve(flow),curve(tech)];xx,zz=np.meshgrid(W+np.arange(h.shape[1])*step-OE,ON-N+np.arange(h.shape[0])*step);queries=np.c_[xx.ravel(),zz.ravel()];distances=[]
# Grade both routes together, then add shallow berms and rounded rollers.
for lineIndex,p in enumerate(lines):
 center=gaussian_filter1d(sample(h,p[:,0],p[:,1]),5,mode='nearest');dist,idx=cKDTree(p).query(queries,workers=2);dist=dist.reshape(h.shape);idx=idx.reshape(h.shape);distances.append(dist)
 tangent=np.gradient(p,axis=0);tangent/=np.linalg.norm(tangent,axis=1)[:,None];turn=np.gradient(tangent,axis=0);curvature=tangent[:,0]*turn[:,1]-tangent[:,1]*turn[:,0]
 side=(xx-p[idx,0])*(-tangent[idx,1])+(zz-p[idx,1])*tangent[idx,0]
 bank=np.clip(-curvature[idx]*side*8,-.2,.7)*np.clip((dist-1.1)/1.3,0,1)
 target=center[idx]+bank;weight=np.clip(((5 if lineIndex else 6)-dist)/4,0,1);weight=weight*weight*(3-2*weight)
 h=h*(1-weight)+np.clip(target,h-1.6,h+1.6)*weight
# Small sculpted rollers, set on straighter flow sections; the shorter line bypasses most.
rollers=[]
p=lines[0]
for fraction in [.22,.39,.57,.74,.88]:
 i=int(fraction*(len(p)-1));v=p[min(i+6,len(p)-1)]-p[max(0,i-6)];v/=np.linalg.norm(v);dx=xx-p[i,0];dz=zz-p[i,1];along=dx*v[0]+dz*v[1];across=dx*(-v[1])+dz*v[0]
 bump=.34*np.cos(np.clip(along/7,-1,1)*math.pi/2)**2*np.clip((2.6-np.abs(across))/.8,0,1);bump[np.abs(along)>7]=0;h+=bump;rollers.append([float(p[i,0]),float(p[i,1])])
h=h.astype('float32');h.astype('<f4').tofile(A/'height.bin');np.save(C/'height.npy',h)
for index,p in enumerate(lines):
 y=sample(h,p[:,0],p[:,1])-H0+.045;points=np.c_[p[:,0],y,p[:,1]];length=np.linalg.norm(np.diff(points,axis=0),axis=1).sum();cp=[0]+list(range(180,len(points)-90,180))+[len(points)-1]
 t={'id':'technical' if index else 'flow','name':'Lenzerheide / Roots Line' if index else 'Lenzerheide / Alpine Flow','title':'Roots Line' if index else 'Alpine Flow','points':points.tolist(),'length':round(length),'drop':round(y[0]-y[-1]),'checkpoints':cp,'width':2.8 if index else 3.6,'fictional':True,'surfaceVersion':1,'medals':[170,240] if index else [230,320]}
 (A/('trail-technical.json' if index else 'trail.json')).write_text(json.dumps(t,separators=(',',':')));print(t['title'],len(p),'samples',t['length'],'m',t['drop'],'m descent, climb',np.maximum(0,np.diff(y)).sum(),flush=True)
dist=np.minimum(*distances);np.minimum(255,np.round(dist/32*255)).astype('uint8').tofile(A/'surface.bin');mask=np.stack([np.clip((2.5-dist)/.8,0,1),np.clip((13-dist)/2,0,1),np.clip((28-dist)/12,0,1)],axis=-1);Image.fromarray((mask*255).astype('uint8')).resize((2048,2048),Image.Resampling.BILINEAR).save(A/'surface-mask.png')
# Dense corridor grid is interpolated from the 2 m source; it is not 1 m survey data.
allp=np.vstack(lines);xv=np.arange(math.floor(allp[:,0].min())-18,math.ceil(allp[:,0].max())+19,dtype=float);zv=np.arange(math.floor(allp[:,1].min())-18,math.ceil(allp[:,1].max())+19,dtype=float);fx,fz=np.meshgrid(xv,zv);fd,_=cKDTree(allp).query(np.c_[fx.ravel(),fz.ravel()],workers=2);fd=fd.reshape(fx.shape);inside=(fd[:-1,:-1]<14)|(fd[1:,:-1]<14)|(fd[:-1,1:]<14)|(fd[1:,1:]<14);ys,xs=np.where(inside);nw=len(xv);quads=np.stack([ys*nw+xs,(ys+1)*nw+xs,(ys+1)*nw+xs+1,ys*nw+xs+1],axis=1);used,inv=np.unique(quads.ravel(),return_inverse=True);gx=fx.ravel()[used];gz=fz.ravel()[used];gy=sample(h,gx,gz)-H0+.018;np.savez_compressed(C/'corridor.npz',vertices=np.c_[gx,-gz,gy],faces=inv.reshape(-1,4),uv=np.c_[(gx+OE-W)/(E-W),1-(gz+N-ON)/(N-S)])
size=4096;image=np.zeros((3,size,size),dtype=np.uint8);transform=from_bounds(*B,size,size)
for item in sources['files']:
 if item['kind']!='orthophoto':continue
 with rasterio.open(C/item['file']) as src:
  for b in range(3):reproject(source=rasterio.band(src,b+1),destination=image[b],src_transform=src.transform,src_crs=src.crs,dst_transform=transform,dst_crs='EPSG:2056',resampling=Resampling.bilinear,init_dest_nodata=False)
im=Image.fromarray(np.transpose(image,(1,2,0)));im.save(A/'ortho-4k.webp',quality=88,method=6);im.resize((2048,2048),Image.Resampling.LANCZOS).save(A/'ortho-2k.webp',quality=84,method=6)
# Tree distribution informed by the frozen orthophoto; an artistic reconstruction.
random.seed(614);forest=[];tree=cKDTree(allp)
for attempt in range(50000):
 if len(forest)>=2700:break
 if len(forest)<1700:
  p=random.choice(allp);a=random.random()*math.tau;r=random.uniform(7,210);x=p[0]+math.cos(a)*r;z=p[1]+math.sin(a)*r
 else:x=random.uniform(W-OE+15,E-OE-15);z=random.uniform(ON-N+15,ON-S-15)
 if not(W-OE+15<x<E-OE-15 and ON-N+15<z<ON-S-15) or tree.query([x,z])[0]<6:continue
 rgb=image[:,int((z+N-ON)/(N-S)*(size-1)),int((x+OE-W)/(E-W)*(size-1))].astype(float)
 if rgb.mean()>106 or rgb[1]<rgb[0]*.88 or rgb[1]<rgb[2]*.92 or sample(h,x,z)>2110:continue
 forest.append([round(x,2),round(float(sample(h,x,z))-H0,3),round(z,2),round(random.uniform(.65,1.35),3),round(random.uniform(0,math.tau),3)])
(A/'forest.json').write_text(json.dumps(forest,separators=(',',':')))
# Distant real mountain ring, sampled offline at 32 m, with no collision outside the playable field.
P=[2760000,1176000,2766000,1182000];pan,_=merge(ss,bounds=P,res=32,resampling=Resampling.bilinear);pan=np.pad(pan[0],((0,1),(0,1)),mode='edge');np.savez_compressed(C/'panorama.npz',height=pan,bounds=np.array(P),step=32)
# Fixed 2048 px aerial texture for the surrounding mountains, not streamed tiles.
size=2048;imagePan=np.zeros((3,size,size),dtype=np.uint8);transformPan=from_bounds(*P,size,size)
for item in sources['files']:
 if item['kind']!='orthophoto':continue
 with rasterio.open(C/item['file']) as src:
  for band in range(3):reproject(source=rasterio.band(src,band+1),destination=imagePan[band],src_transform=src.transform,src_crs=src.crs,dst_transform=transformPan,dst_crs='EPSG:2056',resampling=Resampling.bilinear,init_dest_nodata=False)
Image.fromarray(np.transpose(imagePan,(1,2,0))).save(C/'panorama.webp',quality=87,method=6)
for src in ss:src.close()
m={'id':'lenzerheide','name':'Lenzerheide · Graubünden','biome':'alpine','crs':'EPSG:2056 / LN02','bounds':B,'origin':[OE,ON],'heightOrigin':H0,'width':int(h.shape[1]),'height':int(h.shape[0]),'step':step,'minAltitude':float(h.min()),'maxAltitude':float(h.max()),'source':'©swisstopo','sourceSnapshot':'2026-11-01','heightDataYear':'2023','imageDataYear':'2025','sourceResolution':2,'terrainNote':'2 m source with locally graded fictional routes and small authored rollers. Panorama: offline 32 m resampling.','trailNotice':'Eigens gestaltete Spielrouten; keine Nachbildung oder Navigation der offiziellen Bikepark-Linien.','rollers':rollers}
(A/'region.json').write_text(json.dumps(m,indent=2));print('Lenzerheide prepared:',h.shape,len(forest),'trees',flush=True)
