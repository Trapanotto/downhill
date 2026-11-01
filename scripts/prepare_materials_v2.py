"""Download fixed CC0 art sources once, and encode browser textures locally."""
from pathlib import Path
import json,hashlib,concurrent.futures,requests
from PIL import Image
R=Path(__file__).resolve().parents[1]; C=R.parent/'geodata/v2'; A=R/'public/assets'; C.mkdir(exist_ok=True)
jobs=[];records=[]
def catalog(name):
 p=C/(name+'.json')
 if not p.exists():p.write_text(requests.get('https://api.polyhaven.com/files/'+name,timeout=30).text)
 return json.loads(p.read_text())
for name in ['tree_small_02','fern_02']:
 d=catalog(name)['gltf']['1k']['gltf'];jobs.append((d,C/name/(name+'.gltf'),name,None))
 for rel,item in d.get('include',{}).items():jobs.append((item,C/name/rel,name,None))
for name,prefix,res in [('forest_floor','floor', '2k'),('brown_mud_rocks_01','trail', '2k'),('bark_brown_01','bark','1k')]:
 d=catalog(name)
 for channel,suffix in [('Diffuse','color'),('nor_gl','normal'),('arm','arm')]:
  item=d[channel][res]['jpg'];jobs.append((item,C/item['url'].split('/')[-1],name,A/f'{prefix}-{suffix}.webp'))
# The real tree's leaf atlas is also available separately for source inspection.
def job(j):
 item,p,name,out=j;p.parent.mkdir(parents=True,exist_ok=True)
 if not p.exists():
  r=requests.get(item['url'],timeout=180);r.raise_for_status();p.write_bytes(r.content)
 if out:
  im=Image.open(p).convert('RGB')
  if '-normal' in out.name or '-arm' in out.name:im.thumbnail((1024,1024),Image.Resampling.LANCZOS)
  im.save(out,quality=91 if 'normal' in out.name else 88)
 return {'asset':name,'source':'https://polyhaven.com/a/'+name,'license':'CC0-1.0','file':str(p.relative_to(C)),'url':item['url'],'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size,'derivative':out.name if out else 'Blender import and LOD reduction'}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for rec in pool.map(job,jobs):records.append(rec);print(rec['file'],rec['bytes'],flush=True)
(A/'art-sources.json').write_text(json.dumps({'provider':'Poly Haven','license':'https://polyhaven.com/license','apiCredit':'Powered by Poly Haven (one-time preparation only; no live API in the game)','assets':records},indent=2))
print('Materials ready',flush=True)
