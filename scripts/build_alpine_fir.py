"""Bake and reduce one CC0 scanned fir variation entirely offline in Blender."""
import bpy,json,math,random
from pathlib import Path
import numpy as np
from mathutils import Vector,Matrix
R=Path(__file__).resolve().parents[1];C=R.parent/'geodata/lenzerheide';A=R/'public/assets/lenzerheide';random.seed(78)
# Select the smaller C variation. Keep the original buffer untouched and hashed.
p=C/'fir_tree_01/fir_tree_01.gltf';d=json.loads(p.read_text());d['meshes']=[d['meshes'][2]];d['nodes']=[dict(d['nodes'][2],mesh=0)];d['scenes']=[{'nodes':[0]}];d['scene']=0;(p.parent/'fir-c.gltf').write_text(json.dumps(d))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(p.parent/'fir-c.gltf'));parts=[o for o in bpy.context.scene.objects if o.type=='MESH']
for o in parts:o.data.transform(o.matrix_world);o.matrix_world=Matrix.Identity(4);o.parent=None
coords=np.concatenate([np.array([v.co[:] for v in o.data.vertices]) for o in parts]);lo=coords.min(axis=0);hi=coords.max(axis=0);center=(hi+lo)/2;f=14/(hi[2]-lo[2]);transform=Matrix.Diagonal((f,f,f,1))@Matrix.Translation((-center[0],-center[1],-lo[2]))
for o in parts:o.data.transform(transform)
def select(objs):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=objs[0]
def join(objs,name):
 select(objs);bpy.ops.object.join();o=bpy.context.object;o.name=name;bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');return o
sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=12;sc.cycles.use_denoising=True;sc.render.film_transparent=True;sc.render.image_settings.file_format='PNG';sc.render.image_settings.color_mode='RGBA';sc.render.resolution_percentage=100
sc.world.use_nodes=True;sc.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.65,.76,.92,1);sc.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.6
light=bpy.data.lights.new('Bake sun','SUN');light.energy=2.4;light.angle=.15;sun=bpy.data.objects.new('Bake sun',light);sc.collection.objects.link(sun);sun.rotation_euler=(.5,-.35,-.5)
camd=bpy.data.cameras.new('Fir bake');cam=bpy.data.objects.new('Fir bake',camd);sc.collection.objects.link(cam);camd.type='ORTHO';sc.camera=cam;cam.location=(0,-35,7);cam.rotation_euler=(Vector((0,0,7))-cam.location).to_track_quat('-Z','Y').to_euler();camd.ortho_scale=15.5;sc.render.resolution_x=1024;sc.render.resolution_y=1536;sc.render.filepath=str(C/'fir-impostor.png');bpy.ops.render.render(write_still=True)
cam.location=(1.25,-35,9);cam.rotation_euler=(Vector((1.25,0,9))-cam.location).to_track_quat('-Z','Y').to_euler();camd.ortho_scale=2.9;sc.render.resolution_x=sc.render.resolution_y=512;sc.render.filepath=str(C/'fir-branch.png');bpy.ops.render.render(write_still=True)
image=bpy.data.images.load(str(C/'fir-branch.png'));pixels=np.array(image.pixels[:]).reshape(512,512,4);y,x=np.mgrid[:512,:512];radius=np.sqrt(((x+.5)/256-1)**2+((y+.5)/256-1)**2);mask=np.clip((1.03-radius)/.27,0,1);pixels[:,:,3]*=mask*mask*(3-2*mask);image.pixels[:]=pixels.ravel();image.filepath_raw=str(C/'fir-branch.png');image.save();image.pack()
select(parts);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT');parts=[o for o in sc.objects if o.type=='MESH'];leaves=[o for o in parts if any('twig' in m.name for m in o.data.materials if m)];wood=[o for o in parts if o not in leaves];leafcoords=np.concatenate([np.array([v.co[:] for v in o.data.vertices]) for o in leaves]);rng=np.random.default_rng(8);candidates=leafcoords[rng.choice(len(leafcoords),500,replace=False)];woodbase=join(wood,'Fir scanned wood')
for o in leaves:bpy.data.objects.remove(o,do_unlink=True)
fol=bpy.data.materials.new('Alpine needle clusters');fol.use_nodes=True;nt=fol.node_tree;pr=nt.nodes.get('Principled BSDF');tx=nt.nodes.new('ShaderNodeTexImage');tx.image=image;nt.links.new(tx.outputs['Color'],pr.inputs['Base Color']);nt.links.new(tx.outputs['Alpha'],pr.inputs['Alpha']);pr.inputs['Roughness'].default_value=.95
for name,budget,count in [('tree-v2-high',2000,280),('tree-v2-mobile',700,140)]:
 o=woodbase.copy();o.data=woodbase.data.copy();sc.collection.objects.link(o);select([o]);modifier=o.modifiers.new('Wood LOD','DECIMATE');modifier.ratio=min(1,budget/max(1,sum(len(p.vertices)-2 for p in o.data.polygons)));bpy.ops.object.modifier_apply(modifier=modifier.name);vs=[];fs=[];uv=[]
 for p in candidates[:count]:
  size=random.uniform(.8,1.35) if count>200 else random.uniform(1.05,1.6)
  for k in range(3):
   a=random.uniform(0,math.tau);right=Vector((math.cos(a),math.sin(a),0))*size*.5;up=Vector((0,0,1))*size*.22;c=Vector(p);s=len(vs);vs.extend([c-right-up,c+right-up,c+right+up,c-right+up]);fs.append((s,s+1,s+2,s+3));uv.extend([(0,0),(1,0),(1,1),(0,1)])
 me=bpy.data.meshes.new('Needle cards');me.from_pydata(vs,[],fs);me.update();cards=bpy.data.objects.new('Needle cards',me);sc.collection.objects.link(cards);me.materials.append(fol);layer=me.uv_layers.new()
 for poly in me.polygons:
  for li in poly.loop_indices:layer.data[li].uv=uv[me.loops[li].vertex_index]
 obj=join([o,cards],name);select([obj]);bpy.ops.export_scene.gltf(filepath=str(A/(name+'.glb')),use_selection=True,export_format='GLB');obj.hide_set(True);obj.hide_render=True
for o in [woodbase,cam,sun]:bpy.data.objects.remove(o,do_unlink=True)
for im in bpy.data.images:
 if im.source=='FILE' and im.has_data:
  try:im.pack()
  except:pass
bpy.ops.wm.save_as_mainfile(filepath=str(C/'FirAssets.blend'),compress=True);print('Alpine fir assets ready',flush=True)
