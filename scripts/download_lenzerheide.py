"""Freeze the swisstopo source files for Lenzerheide once; never used at runtime."""
from pathlib import Path
import json,hashlib,concurrent.futures,requests,sys
R=Path(__file__).resolve().parents[1];C=R.parent/'geodata/lenzerheide';A=R/'public/assets/lenzerheide';C.mkdir(exist_ok=True,parents=True);A.mkdir(exist_ok=True,parents=True)
BBOX='9.52,46.71,9.62,46.78';jobs=[]
def catalog(name):
 p=C/(name.split('.')[-1]+'-catalog.json')
 if p.exists():return json.loads(p.read_text())
 url=f'https://data.geo.admin.ch/api/stac/v1/collections/{name}/items?bbox={BBOX}&limit=100';items=[]
 while url:
  r=requests.get(url,timeout=90);r.raise_for_status();d=r.json();items+=d['features'];url=next((l['href'] for l in d.get('links',[]) if l['rel']=='next'),None)
 p.write_text(json.dumps(items));return items
for name,kind,res in [('ch.swisstopo.swissalti3d','height','2'),('ch.swisstopo.swissimage-dop10','orthophoto','0.1')]:
 latest={}
 for item in catalog(name):
  tile=item['id'].split('_')[-1];e,n=map(int,tile.split('-'))
  if not ((2760<=e<2766 and 1176<=n<1182) if kind=='height' else (2760<=e<2766 and 1176<=n<1182)):continue
  if tile not in latest or item['id']>latest[tile]['id']:latest[tile]=item
 for tile,item in sorted(latest.items()):
  asset=next(a for k,a in item['assets'].items() if k.endswith('.tif') and '_'+res+'_2056' in k);jobs.append((asset,kind,item['id']))
def download(job):
 asset,kind,item=job;p=C/asset['href'].split('/')[-1]
 if not p.exists():
  r=requests.get(asset['href'],timeout=240);r.raise_for_status();temp=p.with_suffix('.part');temp.write_bytes(r.content);temp.rename(p)
 digest=hashlib.sha256(p.read_bytes()).hexdigest()
 if p.name in expected and expected[p.name]!=digest:raise ValueError('Source hash mismatch: '+p.name)
 record={'file':p.name,'url':asset['href'],'item':item,'sha256':digest,'bytes':p.stat().st_size,'kind':kind};print(p.name,record['bytes'],flush=True);return record
snapshot=json.loads((A/'sources.json').read_text()) if (A/'sources.json').exists() else None
expected={}
if snapshot and '--refresh' not in sys.argv:
 jobs=[({'href':f['url']},f['kind'],f['item']) for f in snapshot['files']]
 expected={f['file']:f['sha256'] for f in snapshot['files']}
print('Freezing',len(jobs),'source tiles',flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:records=list(pool.map(download,jobs))
assert sum(r['kind']=='height' for r in records)==36
assert sum(r['kind']=='orthophoto' for r in records)==36
(A/'sources.json').write_text(json.dumps({'attribution':'©swisstopo','terms':'https://www.swisstopo.admin.ch/de/nutzungsbedingungen-kostenlose-geodaten-und-geodienste','downloaded':'2026-11-01','files':records},indent=2))
print('Source snapshot complete',flush=True)
