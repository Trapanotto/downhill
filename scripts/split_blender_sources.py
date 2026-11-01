"""Make standalone editable libraries and portable linked regional assemblies."""
from pathlib import Path
import bpy,json,math
from mathutils import Vector
R=Path(__file__).resolve().parents[1];OUT=R/'blender';OUT.mkdir(exist_ok=True)
RIDER={'BikeFrame','SuspensionFork','WheelFront','WheelRear','Handlebar','Crank','PedalL','PedalR','RiderRig','RiderSkin'}
manifest={'version':3,'regions':{}}
def library(file,label,objects,world):
 scene=bpy.data.scenes.new(label+' / edit');scene.world=world;group=bpy.data.collections.new(label);scene.collection.children.link(group)
 for o in objects:group.objects.link(o)
 scene.view_layers[0].update()
 for o in objects:
  if o.hide_render:o.hide_set(True,view_layer=scene.view_layers[0])
 scene['Instructions']='Edit this standalone library, save, then reopen the regional master to refresh its links.'
 file.parent.mkdir(parents=True,exist_ok=True);bpy.data.libraries.write(str(file),{scene},path_remap='RELATIVE_ALL',compress=True)
 return {'file':str(file.relative_to(OUT)),'collection':group.name,'objects':len(objects)}
bpy.ops.wm.open_mainfile(filepath=str(R/'Rider.blend'));source=bpy.context.scene
manifest['rider']=library(OUT/'shared/Rider-Bike.blend','Rider_Bike',list(source.objects),source.world)
for region,sourceFile in [('uetliberg','Uetliberg.blend'),('lenzerheide','Lenzerheide.blend')]:
 bpy.ops.wm.open_mainfile(filepath=str(R/sourceFile));source=bpy.context.scene;groups={'Terrain':[],'Vegetation':[],'Props':[]};riders=[]
 for o in source.objects:
  n=o.name.lower()
  if o.name in RIDER:riders.append(o);continue
  if any(t in n for t in ['terrain','uetliberg_','panorama','ruts berms takeoffs']):key='Terrain'
  elif any(t in n for t in ['forest','tree-v3','/ grass','/ fern']):key='Vegetation'
  else:key='Props'
  groups[key].append(o)
 assert len(riders)==10,(region,[o.name for o in riders])
 parts=[library(OUT/region/(key+'.blend'),region+'_'+key,objects,source.world) for key,objects in groups.items()]
 assert sum(p['objects'] for p in parts)+len(riders)==len(source.objects)
 master=bpy.data.scenes.new(region+' / linked assembly');master.world=source.world;master.render.engine='CYCLES';master['Version']='3.0 / linked Blender sources';master['Instructions']='Edit the individual regional libraries; keep this folder structure together. Rider and bike are shared by both regions.'
 for part in parts+[manifest['rider']]:
  with bpy.data.libraries.load(str(OUT/part['file']),link=True) as (available,target):target.collections=[part['collection']]
  col=target.collections[0]
  if part is manifest['rider']:
   inst=bpy.data.objects.new('Shared rider and bike',None);inst.instance_type='COLLECTION';inst.instance_collection=col;master.collection.objects.link(inst);trailFile=R/'public/assets'/('lenzerheide' if region=='lenzerheide' else '')/'trail.json';points=json.loads(trailFile.read_text())['points'];p,q=points[0],points[8];inst.location=(p[0],-p[2],p[1]);inst.rotation_euler.z=math.atan2(-(q[0]-p[0]),-(q[2]-p[2]))
  else:master.collection.children.link(col)
 setup=bpy.data.collections.new('Scene setup');master.collection.children.link(setup);sunData=bpy.data.lights.new('Daylight','SUN');sunData.energy=2.5;sunData.angle=.12;sun=bpy.data.objects.new('Daylight',sunData);sun.rotation_euler=(math.radians(25),math.radians(-20),math.radians(-30));setup.objects.link(sun)
 camData=bpy.data.cameras.new('Trail start');cam=bpy.data.objects.new('Trail start',camData);setup.objects.link(cam);cam.location=inst.location+Vector((7,-9,5));cam.rotation_euler=(inst.location+Vector((0,0,1))-cam.location).to_track_quat('-Z','Y').to_euler();camData.clip_end=10000;master.camera=cam;master.render.resolution_x=1280;master.render.resolution_y=720
 master.view_layers[0].update()
 for o in master.objects:
  if o.hide_render:o.hide_set(True,view_layer=master.view_layers[0])
 file=OUT/sourceFile;bpy.data.libraries.write(str(file),{master},path_remap='RELATIVE_ALL',compress=True)
 manifest['regions'][region]={'master':sourceFile,'sourceObjects':len(source.objects),'parts':parts};print(region,[(p['file'],p['objects']) for p in parts],flush=True)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
# Save ordinary project files with a workspace, not just Blender library data.
# This ensures each component opens directly with a useful viewport.
for file in sorted(OUT.rglob('*.blend')):
 bpy.ops.wm.open_mainfile(filepath=str(file));scene=max(bpy.data.scenes,key=lambda s:len(s.objects))
 for window in bpy.context.window_manager.windows:window.scene=scene
 for other in list(bpy.data.scenes):
  if other!=scene:bpy.data.scenes.remove(other)
 if file.parent==OUT:
  center=scene.objects['Shared rider and bike'].location+Vector((0,0,1));distance=14;rotation=scene.camera.rotation_euler.to_quaternion()
 else:
  objects=[o for o in scene.objects if o.type=='MESH' and not o.hide_render];corners=[o.matrix_world@Vector(v) for o in objects for v in o.bound_box];low=Vector(tuple(min(v[i] for v in corners) for i in range(3)));high=Vector(tuple(max(v[i] for v in corners) for i in range(3)));center=(low+high)*.5;distance=max(4,(high-low).length*.65);rotation=Vector((3,-4,3)).to_track_quat('Z','Y')
 for screen in bpy.data.screens:
  for area in screen.areas:
   if area.type=='VIEW_3D':
    view=area.spaces.active.region_3d;view.view_location=center;view.view_distance=distance;view.view_rotation=rotation;view.view_perspective='PERSP'
 bpy.ops.wm.save_as_mainfile(filepath=str(file),compress=True,check_existing=False)

for backup in OUT.rglob('*.blend1'):backup.unlink()
