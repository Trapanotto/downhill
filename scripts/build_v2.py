"""Offline V2 landscape authoring. Run after prepare_terrain_v2.py.
Imports CC0 vegetation, bakes distant-tree impostors and builds a detailed
trail corridor. Every instance and decorative object is retained in Blender.
"""
import bpy,math,json,random
from pathlib import Path
import numpy as np
from mathutils import Vector,Matrix
R=Path(__file__).resolve().parents[1];A=R/'public/assets';C=R.parent/'geodata/v2'
bpy.ops.wm.open_mainfile(filepath=str(R/'Uetliberg.blend'))
m=json.loads((A/'region.json').read_text());h=np.fromfile(A/'height.bin',dtype='<f4').reshape(m['height'],m['width']);trail=json.loads((A/'trail.json').read_text());pts=trail['points'];forest=json.loads((A/'forest.json').read_text());random.seed(221)
W,S,E,N=m['bounds'];OE,ON=m['origin'];H0=m['heightOrigin'];STEP=m['step']
def height(x,z):
 u=max(0,min(h.shape[1]-1.001,(x+OE-W)/STEP));v=max(0,min(h.shape[0]-1.001,(z+N-ON)/STEP));i=int(u);j=int(v);a=u-i;b=v-j
 return float((h[j,i]*(1-a)+h[j,i+1]*a)*(1-b)+(h[j+1,i]*(1-a)+h[j+1,i+1]*a)*b)-H0

def select(objs):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=objs[0]
def export(name,objs):
 select(objs);bpy.ops.export_scene.gltf(filepath=str(A/name),use_selection=True,export_format='GLB',export_yup=True,export_materials='EXPORT',export_extras=True)
def material(name,color):
 p=bpy.data.materials.new(name);p.use_nodes=True;p.diffuse_color=(*color,1);p.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*color,1);return p

def mesh(name,vs,fs,mat,uv=None):
 d=bpy.data.meshes.new(name);d.from_pydata(vs,[],fs);d.update();o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.data.materials.append(mat)
 for p in d.polygons:p.use_smooth=True
 if uv is not None:
  layer=d.uv_layers.new()
  for p in d.polygons:
   for l in p.loop_indices:layer.data[l].uv=uv[d.loops[l].vertex_index]
 return o

def join(objs,name):
 select(objs);bpy.ops.object.join();o=bpy.context.object;o.name=name;bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');return o

def pbr(name,prefix):
 ma=material(name,(1,1,1));nt=ma.node_tree;pr=nt.nodes.get('Principled BSDF')
 for suffix,socket in [('color','Base Color'),('normal','Normal')]:
  im=bpy.data.images.load(str(A/f'{prefix}-{suffix}.webp'),check_existing=True);im.pack();tex=nt.nodes.new('ShaderNodeTexImage');tex.image=im
  if suffix=='normal':
   im.colorspace_settings.name='Non-Color';normal=nt.nodes.new('ShaderNodeNormalMap');nt.links.new(tex.outputs['Color'],normal.inputs['Color']);nt.links.new(normal.outputs['Normal'],pr.inputs[socket])
  else:nt.links.new(tex.outputs['Color'],pr.inputs[socket])
 pr.inputs['Roughness'].default_value=.92
 return ma
# Keep the rebuilt bike and summit landmark. Replace the V1 forest and track.
keep=[]
for o in list(bpy.context.scene.objects):
 if o.name in ['BikeFrame','SuspensionFork','WheelFront','WheelRear','Rider','Summit landmark','Uetliberg_4m','Uetliberg_8m']:keep.append(o)
 else:bpy.data.objects.remove(o,do_unlink=True)
for o in keep:o.hide_render=True
print('Importing photographic tree source',flush=True)
before=set(bpy.context.scene.objects);bpy.ops.import_scene.gltf(filepath=str(C/'tree_small_02/tree_small_02.gltf'));sources=[o for o in bpy.context.scene.objects if o not in before and o.type=='MESH']
for o in sources:
 o.data.transform(o.matrix_world);o.matrix_world=Matrix.Identity(4);o.parent=None
allcoords=np.concatenate([np.array([v.co[:] for v in o.data.vertices]) for o in sources]);lo=allcoords.min(axis=0);hi=allcoords.max(axis=0);factor=14/(hi[2]-lo[2]);center=(hi+lo)/2
transform=Matrix.Diagonal((factor,factor,factor,1))@Matrix.Translation((-center[0],-center[1],-lo[2]))
for o in sources:o.data.transform(transform);o.hide_render=False
# Render the full original tree once for the distant LOD. No runtime image service.
sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=12;sc.cycles.use_denoising=True;sc.render.film_transparent=True;sc.render.image_settings.file_format='PNG';sc.render.image_settings.color_mode='RGBA';sc.render.resolution_percentage=100
sc.world.use_nodes=True;sc.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.65,.76,.92,1);sc.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.6
light=bpy.data.lights.new('Tree bake sun','SUN');light.energy=2.4;light.angle=.15;sun=bpy.data.objects.new('Tree bake sun',light);sc.collection.objects.link(sun);sun.rotation_euler=(math.radians(30),math.radians(-20),math.radians(-30))
camd=bpy.data.cameras.new('Tree bake');cam=bpy.data.objects.new('Tree bake',camd);sc.collection.objects.link(cam);camd.type='ORTHO';sc.camera=cam
cam.location=(0,-35,7);cam.rotation_euler=(Vector((0,0,7))-cam.location).to_track_quat('-Z','Y').to_euler();camd.ortho_scale=15.5;sc.render.resolution_x=1024;sc.render.resolution_y=1536;sc.render.filepath=str(C/'tree-impostor.png')
bpy.ops.render.render(write_still=True)
# A real leafy branch swatch, baked from the original detailed tree canopy.
cam.location=(3.4,-35,9.8);cam.rotation_euler=(Vector((3.4,0,9.8))-cam.location).to_track_quat('-Z','Y').to_euler();camd.ortho_scale=3.4;sc.render.resolution_x=sc.render.resolution_y=512;sc.render.filepath=str(C/'leaf-cluster.png');bpy.ops.render.render(write_still=True)
(C/'leaf-cluster-raw.png').write_bytes((C/'leaf-cluster.png').read_bytes())
print('Tree impostors baked',flush=True)
# Separate wood and leaves; retain the real branching silhouette in close LODs.
select(sources);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
parts=[o for o in bpy.context.scene.objects if o.type=='MESH' and o not in keep]
wood=[o for o in parts if not any('leaves' in ma.name for ma in o.data.materials if ma)]
leaves=[o for o in parts if o not in wood]
leafcoords=np.concatenate([np.array([v.co[:] for v in o.data.vertices]) for o in leaves]);rng=np.random.default_rng(42)
fol=material('Photographic leaf clusters',(1,1,1));nt=fol.node_tree;im=bpy.data.images.load(str(C/'leaf-cluster.png'));im.pack();tx=nt.nodes.new('ShaderNodeTexImage');tx.image=im;pr=nt.nodes.get('Principled BSDF');nt.links.new(tx.outputs['Color'],pr.inputs['Base Color']);nt.links.new(tx.outputs['Alpha'],pr.inputs['Alpha']);pr.inputs['Roughness'].default_value=.95;fol.use_backface_culling=False
# Detailed wood mesh, collapsed separately from the leaf card representation.
woodbase=join(wood,'Scanned wood source');leafcandidates=leafcoords[rng.choice(len(leafcoords),700,replace=False)]
for o in leaves:bpy.data.objects.remove(o,do_unlink=True)
def tree_lod(name,tri_budget,clusters):
 o=woodbase.copy();o.data=woodbase.data.copy();sc.collection.objects.link(o);select([o]);modifier=o.modifiers.new('Branch LOD','DECIMATE');modifier.ratio=min(1,tri_budget/max(1,sum(len(p.vertices)-2 for p in o.data.polygons)));bpy.ops.object.modifier_apply(modifier=modifier.name)
 # The positions come from the original canopy; avoid regular spherical crowns.
 vs=[];fs=[];uv=[]
 for i in range(clusters):
  p=leafcandidates[i];size=random.uniform(1.25,2.05) if clusters>100 else random.uniform(1.7,2.4)
  for k in range(3):
   yaw=random.uniform(0,math.tau)+k*math.pi/3;tilt=random.uniform(-.35,.35);right=Vector((math.cos(yaw),math.sin(yaw),0))*size/2;up=Vector((math.sin(yaw)*tilt,math.cos(yaw)*tilt,1))*size/2;c=Vector(p);start=len(vs)
   vs.extend([c-right-up,c+right-up,c+right+up,c-right+up]);fs.append((start,start+1,start+2,start+3));uv.extend([(0,0),(1,0),(1,1),(0,1)])
 cards=mesh('Branch cluster cards',[tuple(v) for v in vs],fs,fol,uv);obj=join([o,cards],name);export(name+'.glb',[obj]);obj.hide_set(True);obj.hide_render=True;return obj
high=tree_lod('tree-v2-high',2600,190);mobile=tree_lod('tree-v2-mobile',850,95)
bpy.data.objects.remove(woodbase,do_unlink=True)
# Hide bake-only camera / light, and restore authored landscape objects.
for o in [cam,sun]:bpy.data.objects.remove(o,do_unlink=True)
for o in keep:o.hide_render=False
# Rebuild forest instances from frozen positions, including the entire region.
for p in forest:
 o=bpy.data.objects.new('V2 / forest',high.data);sc.collection.objects.link(o);o.location=(p[0],-p[2],p[1]);o.rotation_euler.z=p[4];o.scale=(p[3],p[3],p[3])
# Inset a dense, textured, non-overlapping trail corridor.
packed=np.load(C/'corridor.npz');earth=pbr('Forest floor / Poly Haven','floor');corridor=mesh('V2 / graded trail corridor',packed['vertices'].tolist(),packed['faces'].tolist(),earth,packed['uv'].tolist());export('corridor.glb',[corridor])
# A small fern model from CC0 source, exported once and instanced in the scene.
before=set(sc.objects);bpy.ops.import_scene.gltf(filepath=str(C/'fern_02/fern_02.gltf'));ferns=[o for o in sc.objects if o not in before and o.type=='MESH']
for o in ferns:o.data.transform(o.matrix_world);o.matrix_world=Matrix.Identity(4);o.parent=None
fern=join(ferns,'V2 / fern source');export('fern.glb',[fern]);fern.hide_render=True;fern.hide_set(True)
# Sculpted stones, bent roots and grass clumps retain their source geometry.
rockmat=pbr('Weathered stone','trail');barkmat=pbr('Root bark','bark');grassmat=material('Meadow grass',(.23,.32,.08))
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1);rock=bpy.context.object;rock.name='V2 / rock source'
for v in rock.data.vertices:v.co*=random.uniform(.72,1.15);v.co.z*=.55
rock.data.materials.append(rockmat)
for p in rock.data.polygons:p.use_smooth=True
export('rock.glb',[rock]);rock.hide_render=True;rock.hide_set(True)
# Slightly curved root, unit length along Blender X, height tapering at the ends.
vs=[];uv=[];fs=[]
for i in range(17):
 x=(i/16-.5);r=.035*math.sin(math.pi*i/16)**.35+.008
 for k in range(8):
  a=k/8*math.tau;vs.append((x,math.sin(i*.35)*.025+math.cos(a)*r,math.sin(a)*r));uv.append((i/4,k/8))
for i in range(16):
 for k in range(8):a=i*8+k;b=i*8+(k+1)%8;fs.append((a,b,b+8,a+8))
root=mesh('V2 / root source',vs,fs,barkmat,uv);export('root.glb',[root]);root.hide_render=True;root.hide_set(True)
vs=[];fs=[];uv=[]
for j in range(24):
 angle=random.uniform(0,math.tau);x=random.uniform(-.18,.18);y=random.uniform(-.18,.18);heightBlade=random.uniform(.17,.46);width=random.uniform(.008,.018);s=len(vs)
 for k in range(4):
  t=k/3;bend=t*t*.14;center=Vector((x+math.cos(angle)*bend,y+math.sin(angle)*bend,heightBlade*t));right=Vector((-math.sin(angle),math.cos(angle),0))*width*(1-t*.95)
  vs.extend([center-right,center+right]);uv.extend([(0,t),(1,t)])
 for k in range(3):a=s+k*2;fs.append((a,a+1,a+3,a+2))
grass=mesh('V2 / grass source',[tuple(v) for v in vs],fs,grassmat,uv);export('grass.glb',[grass]);grass.hide_render=True;grass.hide_set(True)
# Deterministic authored decoration. Nothing is generated or downloaded while riding.
decor={'rocks':[],'ferns':[],'grass':[],'roots':[]}
for i in range(22,len(pts)-22,3):
 p=pts[i];prev=pts[i-2];nxt=pts[i+2];dx=nxt[0]-prev[0];dz=nxt[2]-prev[2];l=math.hypot(dx,dz);nx=-dz/l;nz=dx/l
 for side in [-1,1]:
  for k in range(2):
   offset=side*random.uniform(2.05,6.5);x=p[0]+nx*offset+random.uniform(-.8,.8);z=p[2]+nz*offset+random.uniform(-.8,.8);scale=random.uniform(.6,1.5);record=[round(x,3),round(height(x,z),3),round(z,3),round(scale,3),random.uniform(0,math.tau)];decor['grass'].append(record)
  if i%9==4:
   off=side*random.uniform(3.4,8);x=p[0]+nx*off;z=p[2]+nz*off;decor['ferns'].append([x,height(x,z),z,random.uniform(.45,.9),random.uniform(0,math.tau)])
  if i%6==4:
   off=side*random.uniform(2.0,4.5);x=p[0]+nx*off;z=p[2]+nz*off;decor['rocks'].append([x,height(x,z)-.08,z,random.uniform(.12,.44),random.uniform(0,math.tau)])
 if i%51==22:
  # A root crosses the riding line, with small branches near the shoulder.
  angle=math.atan2(nz,nx)+random.uniform(-.24,.24);decor['roots'].append([p[0],height(p[0],p[2])+.012,p[2],random.uniform(2.8,3.6),angle,.048])
# Explicit geometry placements are retained in Blender as linked data instances.
for key,proto in [('grass',grass),('ferns',fern),('rocks',rock),('roots',root)]:
 for p in decor[key]:
  o=bpy.data.objects.new('V2 / '+key,proto.data);sc.collection.objects.link(o);o.location=(p[0],-p[2],p[1]);o.rotation_euler.z=-p[4]
  if key=='roots':o.scale=(p[3],1,1)
  else:o.scale=(p[3],p[3],p[3])
(A/'decor.json').write_text(json.dumps(decor,separators=(',',':')))
# Remove the old floating ribbon. The new riding surface is part of the corridor.
sc['Version']='2.0 / Trail & Flow';sc['Art']='Tree Small 02, Fern 02 and PBR materials © Poly Haven / CC0';sc['Terrain']='©swisstopo; local 2 m raster; graded fictional trail corridor.'
for im in bpy.data.images:
 if im.source=='FILE' and im.has_data:
  try:im.pack()
  except:pass
sc.render.engine='CYCLES';sc.cycles.samples=32
bpy.ops.wm.save_as_mainfile(filepath=str(R/'Uetliberg.blend'),compress=True)
print('V2 READY', {k:len(v) for k,v in decor.items()},flush=True)
