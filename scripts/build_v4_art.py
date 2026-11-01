"""Refine rider proportions, bike finish and branch crowns from frozen V3 sources."""
from pathlib import Path
import bpy,subprocess,math,random
from mathutils import Vector
R=Path(__file__).resolve().parents[1];C=R.parent/'geodata/v4';C.mkdir(exist_ok=True);A=R/'public/assets'
BASE='c84bee2d1319e57966147f1a96877e1e6837a364'
for name in ['Rider.blend','Uetliberg.blend','Lenzerheide.blend']:
 p=C/('base-'+name)
 if not p.exists():p.write_bytes(subprocess.check_output(['git','show',BASE+':'+name],cwd=R))
def repair_images():
 for image in bpy.data.images:
  if image.source!='FILE':continue
  if not image.packed_file:
   path=Path(bpy.path.abspath(image.filepath,start=str(R)))
   if not path.exists() and '/public/assets/' in image.filepath:path=A/image.filepath.rsplit('/public/assets/',1)[1]
   if not path.exists() and '/geodata/' in image.filepath:path=R.parent/'geodata'/image.filepath.rsplit('/geodata/',1)[1]
   if path.exists():image.filepath=str(path);image.reload()
   else:raise FileNotFoundError('Frozen texture not found: '+image.filepath)
  if image.size[0]>0 and not image.packed_file:
   try:image.pack()
   except RuntimeError:pass
 # Blender's imported generated roughness channel can have no pixels after reload.
 for material in bpy.data.materials:
  if not material.use_nodes:continue
  for node in material.node_tree.nodes:
   if node.type=='TEX_IMAGE' and node.image and node.image.size[0]==0:
    for output in node.outputs:
     for link in list(output.links):material.node_tree.links.remove(link)
def select(objects):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
def export(path,objects):
 select(objects);bpy.ops.export_scene.gltf(filepath=str(path),use_selection=True,export_format='GLB',export_yup=True,export_extras=True)
bpy.ops.wm.open_mainfile(filepath=str(C/'base-Rider.blend'));repair_images();rig=bpy.data.objects['RiderRig'];body=bpy.data.objects['RiderSkin']
def proportion(v):
 v=v.copy();z=v.z;v.z=1.2+(z-1.2)*.82 if z>1.2 else z;v.x*=.86 if z>1.9 else (.93 if z>1.3 else 1);return v
for v in body.data.vertices:v.co=proportion(v.co)
body.data.update();select([rig]);bpy.ops.object.mode_set(mode='EDIT')
for b in rig.data.edit_bones:b.head=proportion(b.head);b.tail=proportion(b.tail)
bpy.ops.object.mode_set(mode='OBJECT')
for b in rig.data.bones:b['length']=b.length
for material in bpy.data.materials:
 pr=material.node_tree.nodes.get('Principled BSDF') if material.use_nodes else None
 if not pr:continue
 if 'copper frame' in material.name.lower():pr.inputs['Roughness'].default_value=.24;pr.inputs['Coat Weight'].default_value=.4;pr.inputs['Coat Roughness'].default_value=.23
 if 'carbon' in material.name.lower():pr.inputs['Roughness'].default_value=.44
 if 'technical jersey' in material.name.lower():pr.inputs['Sheen Weight'].default_value=.25
rig['rigVersion']=4;rig['Description']='V4: shorter upper body, narrower shoulders and helmet; compatible 16-bone IK.'
bike=[bpy.data.objects[n] for n in ['BikeFrame','SuspensionFork','WheelFront','WheelRear','Handlebar','Crank','PedalL','PedalR']]
export(A/'bike-v4.glb',bike);export(A/'rider-v4.glb',[rig,body]);bpy.context.scene['Name']='Trapanotto / V4 rider and bike';bpy.ops.wm.save_as_mainfile(filepath=str(R/'Rider.blend'),compress=True)
for region,source,folder in [('uetliberg','Uetliberg.blend',A),('lenzerheide','Lenzerheide.blend',A/'lenzerheide')]:
 bpy.ops.wm.open_mainfile(filepath=str(C/('base-'+source)));repair_images();sc=bpy.context.scene;random.seed(415 if region=='uetliberg' else 416)
 prototypes=[]
 for level in ['high','mobile']:
  obj=bpy.data.objects['tree-v3-'+level];old=obj.data;me=old.copy();leaf=next(i for i,m in enumerate(me.materials) if m and any(t in m.name.lower() for t in ['leaf','leaves','cluster']));vs=[v.co[:] for v in me.vertices];faces=[tuple(p.vertices) for p in me.polygons];materials=[p.material_index for p in me.polygons];uvLayers={u.name:[d.uv[:] for d in u.data] for u in me.uv_layers};extraUV=[]
  if region=='lenzerheide':
   # Irregular branch whorls fill crown gaps while retaining the scanned trunk.
   for j in range(13 if level=='high' else 9):
    height=4.1+j*(9.1/(12 if level=='high' else 8));radius=(14.1-height)*.24+.22
    for k in range(7 if level=='high' else 5):
     a=k*math.tau/(7 if level=='high' else 5)+random.uniform(-.3,.3)+j*.55;r=radius*random.uniform(.45,1.18);center=Vector((math.cos(a)*r*.60,math.sin(a)*r*.60,height+random.uniform(-.25,.25)));right=Vector((-math.sin(a),math.cos(a),0))*r*.40;up=Vector((math.cos(a)*r*.1,math.sin(a)*r*.1,random.uniform(.25,.45)+radius*.08));corners=[center-right-up,center+right-up,center+right+up,center-right+up];start=len(vs);vs.extend([v[:] for v in corners]);faces.append(tuple(range(start,start+4)));materials.append(leaf);extraUV.extend([(0,0),(1,0),(1,1),(0,1)])
  else:
   # Smaller irregular leaf groups soften the broadleaf silhouette.
   for j in range(38 if level=='high' else 20):
    a=random.uniform(0,math.tau);z=random.uniform(7.1,12.5);r=random.uniform(.8,2.5)*(1-abs(z-9.5)/8);center=Vector((math.cos(a)*r,math.sin(a)*r,z));right=Vector((-math.sin(a),math.cos(a),0))*random.uniform(.4,.65);up=Vector((0,0,random.uniform(.24,.4)));start=len(vs);vs.extend([v[:] for v in [center-right-up,center+right-up,center+right+up,center-right+up]]);faces.append(tuple(range(start,start+4)));materials.append(leaf);extraUV.extend([(0,0),(1,0),(1,1),(0,1)])
  mesh=bpy.data.meshes.new('V4 / irregular photographic crown '+level);mesh.from_pydata(vs,[],faces);mesh.update()
  for m in me.materials:mesh.materials.append(m)
  for layerName,baseValues in uvLayers.items():
   layer=mesh.uv_layers.new(name=layerName);values=baseValues+extraUV
   for p,mi in zip(mesh.polygons,materials):
    p.material_index=mi;p.use_smooth=True
    for li in p.loop_indices:layer.data[li].uv=values[li]

  for o in sc.objects:
   if o.type=='MESH' and o.data==old:o.data=mesh
  obj.name='tree-v4-'+level;export(folder/('tree-v4-'+level+'.glb'),[obj]);obj.hide_set(True);obj.hide_render=True;prototypes.append(obj)
 # Render the matching new crown under a neutral sky and soft fill lighting.
 visibility={o:o.hide_render for o in sc.objects}
 for o in sc.objects:o.hide_render=True
 tree=prototypes[0];tree.hide_render=False;tree.hide_set(False);tree.location=(0,0,0);tree.rotation_euler=(0,0,0);tree.scale=(1,1,1)
 sc.render.engine='CYCLES';sc.cycles.samples=24;sc.cycles.use_denoising=True;sc.render.film_transparent=True;sc.render.resolution_x=768;sc.render.resolution_y=1152;sc.render.resolution_percentage=100;sc.render.image_settings.file_format='PNG';sc.render.image_settings.color_mode='RGBA';sc.world.use_nodes=True;world=sc.world.node_tree.nodes.get('Background');world.inputs['Color'].default_value=(.72,.8,1,1);world.inputs['Strength'].default_value=1.1
 light=bpy.data.lights.new('V4 bake soft sun','SUN');light.energy=2.3;light.angle=.3;sun=bpy.data.objects.new('V4 bake soft sun',light);sc.collection.objects.link(sun);sun.rotation_euler=(.5,-.4,-.5)
 fillData=bpy.data.lights.new('V4 bake fill','AREA');fillData.energy=1600;fillData.size=14;fill=bpy.data.objects.new('V4 bake fill',fillData);sc.collection.objects.link(fill);fill.location=(0,-10,12);fill.rotation_euler=(Vector((0,0,8))-fill.location).to_track_quat('-Z','Y').to_euler()
 camData=bpy.data.cameras.new('V4 tree bake');cam=bpy.data.objects.new('V4 tree bake',camData);sc.collection.objects.link(cam);camData.type='ORTHO';camData.ortho_scale=15.5;cam.location=(0,-35,7);cam.rotation_euler=(Vector((0,0,7))-cam.location).to_track_quat('-Z','Y').to_euler();sc.camera=cam;sc.render.filepath=str(C/(region+'-tree.png'));bpy.ops.render.render(write_still=True)
 for o,hidden in visibility.items():o.hide_render=hidden
 tree.hide_set(True)
 for o in [sun,fill,cam]:bpy.data.objects.remove(o,do_unlink=True)
 sc.camera=None
 # Replace the static rider assemblies by the refined shared source.
 names=['BikeFrame','SuspensionFork','WheelFront','WheelRear','Handlebar','Crank','PedalL','PedalR','RiderRig','RiderSkin'];oldPosition=bpy.data.objects['RiderRig'].location.copy()
 for n in names:bpy.data.objects.remove(bpy.data.objects[n],do_unlink=True)
 with bpy.data.libraries.load(str(R/'Rider.blend'),link=False) as (available,target):target.objects=names
 for o in target.objects:
  sc.collection.objects.link(o)
  if o.parent is None:o.location+=oldPosition
 sc['Version']='4.0 / Feel and Performance';sc['Rider']='Refined 16-bone rider and coated bike finish';sc['Vegetation']='Irregular branch whorls with matching pre-rendered crown'
 bpy.ops.outliner.orphans_purge(do_local_ids=True,do_linked_ids=True,do_recursive=True);bpy.ops.wm.save_as_mainfile(filepath=str(R/source),compress=True);print('V4_ART_READY',region,flush=True)
