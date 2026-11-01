"""Freeze CC0 conifer and meadow material sources; offline authoring only."""
from pathlib import Path
import json,hashlib,concurrent.futures,requests
from PIL import Image
R=Path(__file__).resolve().parents[1];C=R.parent/'geodata/lenzerheide';A=R/'public/assets/lenzerheide';jobs=[]
for name in ['fir_tree_01','leafy_grass']:
 p=R.parent/'geodata/v2'/(name+'.json')
 if not p.exists():
  r=requests.get('https://api.polyhaven.com/files/'+name,timeout=60);r.raise_for_status();p.write_text(r.text)
 d=json.loads(p.read_text())
 if name=='fir_tree_01':
  item=d['gltf']['1k']['gltf'];jobs.append((item,C/name/(name+'.gltf'),name,None))
  for rel,a in item['include'].items():jobs.append((a,C/name/rel,name,None))
 else:
  for channel,suffix in [('Diffuse','color'),('nor_gl','normal'),('arm','arm')]:
   item=d[channel]['2k']['jpg'];jobs.append((item,C/item['url'].split('/')[-1],name,A/f'floor-{suffix}.webp'))
def run(job):
 item,p,name,out=job;p.parent.mkdir(parents=True,exist_ok=True)
 if not p.exists():
  r=requests.get(item['url'],timeout=300);r.raise_for_status();p.write_bytes(r.content)
 if out:
  im=Image.open(p).convert('RGB')
  if out.name!='floor-color.webp':im.thumbnail((1024,1024),Image.Resampling.LANCZOS)
  im.save(out,quality=88,method=6)
 print(p.name,p.stat().st_size,flush=True)
 return {'asset':name,'source':'https://polyhaven.com/a/'+name,'url':item['url'],'license':'CC0-1.0','sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size,'derivative':out.name if out else 'offline Blender conifer bake / LOD'}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:records=list(pool.map(run,jobs))
(A/'art-sources.json').write_text(json.dumps({'provider':'Poly Haven','license':'https://polyhaven.com/license','assets':records},indent=2))
