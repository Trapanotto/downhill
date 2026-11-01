"""Export V3 trail meshes, refine foliage cards and retain complete Blender worlds."""
from pathlib import Path
import bpy,json,math,random
import numpy as np
from mathutils import Vector
R=Path(__file__).resolve().parents[1];C=R.parent/'geodata/v3'
for name,folder,source in [('uetliberg',R/'public/assets','Uetliberg.blend'),('lenzerheide',R/'public/assets/lenzerheide','Lenzerheide.blend')]:
 bpy.ops.wm.open_mainfile(filepath=str(C/name/source));sc=bpy.context.scene;random.seed(93);m=json.loads((folder/'region.json').read_text());h=np.fromfile(folder/'height.bin',dtype='<f4').reshape(m['height'],m['width']);d=json.loads((folder/'surface-details.json').read_text());raw=np.fromfile(folder/'surface-details.bin',dtype='<i2');tile={ (t['x'],t['z']):raw[t['offset']:t['offset']+65*65].reshape(65,65) for t in d['tiles']};W,S,E,N=m['bounds'];OE,ON=m['origin'];H0=m['heightOrigin'];step=m['step']
 def height(x,z):
  u=max(0,min(h.shape[1]-1.001,(x+OE-W)/step));v=max(0,min(h.shape[0]-1.001,(z+N-ON)/step));i=int(u);j=int(v);a=u-i;b=v-j;y=h[j,i]*(1-a)*(1-b)+h[j,i+1]*a*(1-b)+h[j+1,i]*(1-a)*b+h[j+1,i+1]*a*b-H0
  key=(math.floor(x/32),math.floor(z/32))
  if key in tile:
   u=max(0,min(63.99999,(x-key[0]*32)*2));v=max(0,min(63.99999,(z-key[1]*32)*2));i=int(u);j=int(v);a=u-i;b=v-j;q=tile[key];y+=(q[j,i]*(1-a)*(1-b)+q[j,i+1]*a*(1-b)+q[j+1,i]*(1-a)*b+q[j+1,i+1]*a*b)*.001
  return float(y)
 def export(file,objects):
  bpy.ops.object.select_all(action='DESELECT')
  for o in objects:o.hide_set(False);o.select_set(True)
  bpy.context.view_layer.objects.active=objects[0];bpy.ops.export_scene.gltf(filepath=str(folder/file),use_selection=True,export_format='GLB',export_yup=True,export_extras=True)
 # Refine individual canopy cards rather than expanding uniform crown blobs.
 for level in ['high','mobile']:
  old=bpy.data.objects['tree-v2-'+level];data=old.data.copy();foliage={i for i,ma in enumerate(data.materials) if ma and any(t in ma.name.lower() for t in ['leaf','leaves','cluster'])}
  for poly in data.polygons:
   if poly.material_index not in foliage:continue
   ids=list(poly.vertices);center=sum((data.vertices[i].co for i in ids),Vector())/len(ids);factor=random.uniform(.72,1.00)
   for i in ids:
    delta=data.vertices[i].co-center;delta.x*=factor;delta.y*=factor;delta.z*=factor*(.86 if name=='lenzerheide' else 1.0);data.vertices[i].co=center+delta
  data.update();oldData=old.data
  for o in sc.objects:
   if o.type=='MESH' and o.data==oldData:o.data=data
  old.name='tree-v3-'+level;export('tree-v3-'+level+'.glb',[old]);old.hide_set(True);old.hide_render=True
 for o in list(sc.objects):
  if o.type=='MESH' and ('graded trail corridor' in o.name or o.name=='Graded Alpine Flow and Roots Line'):bpy.data.objects.remove(o,do_unlink=True)
 aerial=next(o.data.materials[0] for o in sc.objects if o.type=='MESH' and ('Uetliberg_4m' in o.name or o.name=='Lenzerheide terrain high'))
 for level in ['high','mobile']:
  p=np.load(C/name/('corridor-'+level+'.npz'));mesh=bpy.data.meshes.new('V3 trail geometry '+level);mesh.from_pydata(p['vertices'].tolist(),[],p['faces'].tolist());mesh.update();obj=bpy.data.objects.new('V3 / ruts berms takeoffs / '+level,mesh);sc.collection.objects.link(obj);mesh.materials.append(aerial)
  for poly in mesh.polygons:poly.use_smooth=True
  for layerName,values in [('UVMap',p['uv']),('TrackCoords',p['track'])]:
   layer=mesh.uv_layers.new(name=layerName)
   for poly in mesh.polygons:
    for li in poly.loop_indices:layer.data[li].uv=values[mesh.loops[li].vertex_index]
  export('corridor-v3-'+level+'.glb',[obj]);obj.hide_set(level=='mobile');obj.hide_render=level=='mobile'
 decor=json.loads((folder/'decor.json').read_text());rockPositions={(round(p[0],2),round(-p[2],2)) for p in decor['rocks']}
 # Retain vegetation and props at their actual authored contact elevations.
 for o in list(sc.objects):
  n=o.name.lower()
  if o.type!='MESH' or 'source' in n:continue
  isTree=n.startswith('v2 / forest') or n.startswith('alpine forest')
  keys=[k for k in ['grass','ferns','rocks','roots'] if n.startswith('v2 / '+k) or n.startswith('alpine / '+k)]
  if 'rocks' in keys and (round(o.location.x,2),round(o.location.y,2)) not in rockPositions:
   bpy.data.objects.remove(o,do_unlink=True);continue
  if isTree or keys:o.location.z=height(o.location.x,-o.location.y)+(.012 if 'roots' in keys else (-.08 if 'rocks' in keys else 0))
 # Physical collision boxes for the actual landmark meshes.
 colliders=[]
 for o in sc.objects:
  if o.type=='MESH' and (o.name=='Summit landmark' or o.name.startswith('Scharmoin shelter') or o.name.startswith('Shelter column')):
   coords=[o.matrix_world@Vector(c) for c in o.bound_box];low=np.min([v[:] for v in coords],axis=0);high=np.max([v[:] for v in coords],axis=0);colliders.append({'type':'building','x':float((low[0]+high[0])/2),'z':float(-(low[1]+high[1])/2),'bottom':float(low[2]),'top':float(high[2]),'halfX':float((high[0]-low[0])/2),'halfZ':float((high[1]-low[1])/2),'yaw':0})
 decor=json.loads((folder/'decor.json').read_text());decor['colliders']=colliders;(folder/'decor.json').write_text(json.dumps(decor,separators=(',',':')))
 # Replace the static rider by the complete editable weighted rider and bike.
 for o in list(sc.objects):
  if o.name in ['BikeFrame','SuspensionFork','WheelFront','WheelRear','Rider']:bpy.data.objects.remove(o,do_unlink=True)
 names=['BikeFrame','SuspensionFork','WheelFront','WheelRear','Handlebar','Crank','PedalL','PedalR','RiderRig','RiderSkin']
 with bpy.data.libraries.load(str(R/'Rider.blend'),link=False) as (src,target):target.objects=[n for n in src.objects if n in names]
 p=json.loads((folder/'trail.json').read_text())['points'][0];location=Vector((p[0],-p[2],p[1]))
 for o in target.objects:
  sc.collection.objects.link(o)
  if o.parent is None:o.location+=location
 sc['Version']='3.0 / Ride & Detail';sc['Detail']='Authored sparse 0.5 m ruts, berms and takeoff displacement over unchanged 2 m survey data.';sc['Rider']='Weighted skeleton and separate bike assemblies from Rider.blend.'
 for image in bpy.data.images:
  if image.source=='FILE' and image.has_data:
   try:image.pack()
   except:pass
 bpy.ops.outliner.orphans_purge(do_local_ids=True,do_linked_ids=True,do_recursive=True);bpy.ops.wm.save_as_mainfile(filepath=str(R/source),compress=True);print(name,'V3 world ready',flush=True)
