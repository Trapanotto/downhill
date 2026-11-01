"""Rebuild terrain from the already downloaded 2 m swisstopo rasters.
A riding surface is graded gently into a 3.2 m corridor; the real mountain
outside that corridor remains derived from the source raster.
"""
import json,math
from pathlib import Path
import numpy as np,rasterio
from rasterio.merge import merge
from rasterio.enums import Resampling
from scipy.ndimage import gaussian_filter,gaussian_filter1d
from scipy.spatial import cKDTree
from PIL import Image
R=Path(__file__).resolve().parents[1];A=R/'public/assets';C=R.parent/'geodata'
m=json.loads((A/'region.json').read_text());W,S,E,N=m['bounds'];OE,ON=m['origin'];H0=m['heightOrigin'];step=2
files=sorted(C.glob('swissalti3d_2026_*_2_2056_5728.tif'))
assert len(files)>=12,'Run prepare_geodata.py once to obtain the frozen source tiles.'
ss=[rasterio.open(p) for p in files];raw,_=merge(ss,bounds=m['bounds'],res=step,resampling=Resampling.bilinear)
for s in ss:s.close()
h=np.pad(raw[0],((0,1),(0,1)),mode='edge').astype('float32')
# Remove sub-grid acquisition noise without flattening the large-scale terrain.
h=gaussian_filter(h,.65,mode='nearest')
t=json.loads((A/'trail.json').read_text());p=np.array(t['points']);xy=p[:,[0,2]]
def sample(grid,x,z):
 u=np.clip((x+OE-W)/step,0,grid.shape[1]-1.001);v=np.clip((z+N-ON)/step,0,grid.shape[0]-1.001);i=u.astype(int);j=v.astype(int);a=u-i;b=v-j
 return (grid[j,i]*(1-a)+grid[j,i+1]*a)*(1-b)+(grid[j+1,i]*(1-a)+grid[j+1,i+1]*a)*b
center=gaussian_filter1d(sample(h,p[:,0],p[:,2]),5,mode='nearest')
xx,zz=np.meshgrid(W+np.arange(h.shape[1])*step-OE,ON-N+np.arange(h.shape[0])*step)
dist,indices=cKDTree(xy).query(np.stack([xx.ravel(),zz.ravel()],axis=1),workers=2)
dist=dist.reshape(h.shape);indices=indices.reshape(h.shape)
# Blended shoulders avoid a floating ribbon or sharp vertical track walls.
weight=np.clip((6-dist)/4.4,0,1);weight=weight*weight*(3-2*weight)
# Limit earthworks to 1.6 m vertically; this is a designed game surface.
graded=np.clip(center[indices],h-1.6,h+1.6);h=h*(1-weight)+graded*weight
h.astype('<f4').tofile(A/'height.bin')
np.minimum(255,np.round(dist/32*255)).astype('uint8').tofile(A/'surface.bin')
p[:,1]=sample(h,p[:,0],p[:,2])-H0+.045
length=sum(np.linalg.norm(p[i]-p[i-1]) for i in range(1,len(p)))
t.update(points=p.tolist(),length=round(length),drop=round(p[0,1]-p[-1,1]),surfaceVersion=2,width=3.2)
(A/'trail.json').write_text(json.dumps(t,separators=(',',':')))
m.update(width=int(h.shape[1]),height=int(h.shape[0]),step=step,minAltitude=float(h.min()),maxAltitude=float(h.max()),surfaceVersion=2,sourceResolution=2,terrainNote='2 m source; graded fictional trail corridor, limited to 1.6 m earthworks.')
(A/'region.json').write_text(json.dumps(m,indent=2))
# A fixed local surface mask drives world-space PBR material transitions.
# R = riding surface; G = inset detail corridor; B = graded shoulder.
mask=np.stack([np.clip((2.25-dist)/.8,0,1),np.clip((13-dist)/2,0,1),np.clip((6-dist)/3,0,1)],axis=-1)
Image.fromarray((mask*255).astype('uint8')).resize((2048,2048),Image.Resampling.BILINEAR).save(A/'surface-mask.png')
forest=json.loads((A/'forest.json').read_text())
for tree in forest:tree[1]=round(float(sample(h,np.array(tree[0]),np.array(tree[2])))-H0,3)
(A/'forest.json').write_text(json.dumps(forest,separators=(',',':')))
np.save(C/'v2/height.npy',h)
print('V2 terrain',h.shape,'length',t['length'],'drop',t['drop'],'modified area',round(np.count_nonzero(weight)*step*step),'m²',flush=True)
# Dense, non-overlapping world grid for the trail corridor, ready for Blender.
xv=np.arange(math.floor(xy[:,0].min())-18,math.ceil(xy[:,0].max())+19,dtype=float)
zv=np.arange(math.floor(xy[:,1].min())-18,math.ceil(xy[:,1].max())+19,dtype=float)
fx,fz=np.meshgrid(xv,zv);fd,_=cKDTree(xy).query(np.stack([fx.ravel(),fz.ravel()],axis=1),workers=2);fd=fd.reshape(fx.shape)
inside=(fd[:-1,:-1]<14)|(fd[1:,:-1]<14)|(fd[:-1,1:]<14)|(fd[1:,1:]<14)
ys,xs=np.where(inside);nw=len(xv);quads=np.stack([ys*nw+xs,(ys+1)*nw+xs,(ys+1)*nw+xs+1,ys*nw+xs+1],axis=1)
used,inverse=np.unique(quads.ravel(),return_inverse=True);gx=fx.ravel()[used];gz=fz.ravel()[used];gy=sample(h,gx,gz)-H0+.018
np.savez_compressed(C/'v2/corridor.npz',vertices=np.stack([gx,-gz,gy],axis=1),faces=inverse.reshape(-1,4),uv=np.stack([(gx+OE-W)/(E-W),1-(gz+N-ON)/(N-S)],axis=1))
print('Dense corridor',len(used),'vertices;',len(ys),'quads',flush=True)
