"""One-time swisstopo download and preparation. Never called by the game.
Run with numpy, rasterio, scipy, pillow, pyproj, requests installed.
"""
import json, hashlib, concurrent.futures, os
from pathlib import Path
import numpy as np
import requests, rasterio
from rasterio.merge import merge
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT.parent/'geodata'
OUT=ROOT/'public/assets'
CACHE.mkdir(exist_ok=True); OUT.mkdir(exist_ok=True)
BOUNDS=[2678500,1243800,2681000,1246600]
BBOX='8.46,47.33,8.515,47.37'
manifest=[]
def catalog(collection):
 url=f'https://data.geo.admin.ch/api/stac/v1/collections/{collection}/items?bbox={BBOX}&limit=100'
 items=[]
 while url:
  d=requests.get(url,timeout=60).json();items+=d['features']
  url=next((x['href'] for x in d.get('links',[]) if x['rel']=='next'),None)
 return items

def download(job):
 asset,kind=job;p=CACHE/asset['href'].split('/')[-1]
 if not p.exists():
  r=requests.get(asset['href'],timeout=180);r.raise_for_status();p.write_bytes(r.content)
 record={'file':p.name,'url':asset['href'],'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size,'kind':kind}
 return p,record
jobs=[]
for collection,kind,res in [('ch.swisstopo.swissalti3d','height','2'),('ch.swisstopo.swissimage-dop10','orthophoto','0.1')]:
 latest={}
 for item in catalog(collection):
  tile=item['id'].split('_')[-1]
  e,n=map(int,tile.split('-'))
  if not (2678<=e<=2680 and 1243<=n<=1246):continue
  if tile not in latest or item['id']>latest[tile]['id']:latest[tile]=item
 for tile,item in latest.items():
  asset=next(a for name,a in item['assets'].items() if name.endswith('.tif') and '_'+res+'_2056' in name)
  jobs.append((asset,kind))
print('Downloading',len(jobs),'frozen source files',flush=True)
files={'height':[],'orthophoto':[]}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for p,record in pool.map(download,jobs):
  files[record['kind']].append(p);manifest.append(record)
  print(p.name,record['bytes'],flush=True)
# 4 m physics raster, retained in float32. The Blender high mesh uses the same sample positions.
srcs=[rasterio.open(p) for p in files['height']]
arr,tr=merge(srcs,bounds=BOUNDS,res=4,resampling=Resampling.bilinear)
h=arr[0];h=np.pad(h,((0,1),(0,1)),mode='edge')
for s in srcs:s.close()
assert h.min()>300 and h.max()<1000,(h.min(),h.max())
np.save(CACHE/'height.npy',h)
h.astype('<f4').tofile(OUT/'height.bin')
# Reproject each locally downloaded orthophoto into one 4096px texture. Avoid a 10GB intermediate mosaic.
from rasterio.warp import reproject
size=4096;image=np.zeros((3,size,size),dtype=np.uint8)
transform=from_bounds(*BOUNDS,size,size)
for p in files['orthophoto']:
 with rasterio.open(p) as s:
  for b in range(3):
   reproject(source=rasterio.band(s,b+1),destination=image[b],src_transform=s.transform,src_crs=s.crs,dst_transform=transform,dst_crs='EPSG:2056',resampling=Resampling.bilinear,init_dest_nodata=False)
im=Image.fromarray(np.transpose(image,(1,2,0)))
im.save(OUT/'uetliberg-4k.webp',quality=88)
im.resize((2048,2048),Image.Resampling.LANCZOS).save(OUT/'uetliberg-2k.webp',quality=84)
# Ground close-up textures: deterministic, tileable mineral and forest-floor material.
rng=np.random.default_rng(76)
from scipy.ndimage import gaussian_filter
noise=rng.random((1024,1024));n=gaussian_filter(noise,2,mode='wrap')*0.55+noise*0.45
soil=np.stack([n*100+62,n*82+49,n*58+32],axis=-1).clip(0,255).astype('uint8')
Image.fromarray(soil).save(OUT/'soil.webp',quality=90)
meta={'name':'Uetliberg · Zürich','crs':'EPSG:2056 / LN02','bounds':BOUNDS,'origin':[2679500,1245000], 'heightOrigin':400,'width':int(h.shape[1]),'height':int(h.shape[0]),'step':4,'minAltitude':float(h.min()),'maxAltitude':float(h.max()),'source':'©swisstopo','sourceSnapshot':'2026-11-01','trailNotice':'Spielerisch gestaltete Strecke auf realem Gelände; keine reale Trail-Navigation.'}
(OUT/'region.json').write_text(json.dumps(meta,indent=2))
(OUT/'sources.json').write_text(json.dumps({'attribution':'©swisstopo','terms':'https://www.swisstopo.admin.ch/de/nutzungsbedingungen-kostenlose-geodaten-und-geodienste','downloaded':'2026-11-01','files':manifest},indent=2))
print('Prepared',h.shape,'altitudes',h.min(),h.max(),'assets MB',sum(x.stat().st_size for x in OUT.iterdir())/1e6,flush=True)
