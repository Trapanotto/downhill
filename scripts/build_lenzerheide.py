"""Author the complete Lenzerheide landscape in Blender from frozen source data.
Bike/decor prototypes are reused from the existing editable Uetliberg source.
"""
import bpy,json,math,random
from pathlib import Path
import numpy as np
from mathutils import Vector
R=Path(__file__).resolve().parents[1];C=R.parent/'geodata/lenzerheide';A=R/'public/assets/lenzerheide';random.seed(405)
m=json.loads((A/'region.json').read_text());h=np.fromfile(A/'height.bin',dtype='<f4').reshape(m['height'],m['width']);W,S,E,N=m['bounds'];OE,ON=m['origin'];H0=m['heightOrigin'];step=m['step'];trails=[json.loads((A/n).read_text()) for n in ['trail.json','trail-technical.json']]
def height(x,z):
 u=max(0,min(h.shape[1]-1.001,(x+OE-W)/step));v=max(0,min(h.shape[0]-1.001,(z+N-ON)/step));i=int(u);j=int(v);a=u-i;b=v-j
 return float(h[j,i]*(1-a)*(1-b)+h[j,i+1]*a*(1-b)+h[j+1,i]*(1-a)*b+h[j+1,i+1]*a*b)-H0
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
sc=bpy.context.scene
with bpy.data.libraries.load(str(R/'Uetliberg.blend'),link=False) as (source,target):target.objects=[n for n in source.objects if n in ['BikeFrame','SuspensionFork','WheelFront','WheelRear','Rider','V2 / rock source','V2 / root source','V2 / grass source','V2 / fern source']]
for o in target.objects:
 if o:sc.collection.objects.link(o)
with bpy.data.libraries.load(str(C/'FirAssets.blend'),link=False) as (source,target):target.objects=['tree-v2-high','tree-v2-mobile']
for o in target.objects:
 sc.collection.objects.link(o);o.hide_set(True);o.hide_render=True
high=bpy.data.objects['tree-v2-high'];low=bpy.data.objects['tree-v2-mobile']
bikeDelta=Vector((trails[0]['points'][0][0],-trails[0]['points'][0][2],trails[0]['points'][0][1]))-bpy.data.objects['BikeFrame'].location
for n in ['BikeFrame','SuspensionFork','WheelFront','WheelRear','Rider']:
 o=bpy.data.objects[n];o.location+=bikeDelta
# Set bike assembly origin at the start without changing shared runtime GLBs.
def material(name,color):
 ma=bpy.data.materials.new(name);ma.use_nodes=True;ma.diffuse_color=(*color,1);ma.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*color,1);ma.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.92;return ma
aerial=material('SWISSIMAGE 2025 / ©swisstopo',(1,1,1));nt=aerial.node_tree;tex=nt.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(A/'ortho-2k.webp'));nt.links.new(tex.outputs['Color'],nt.nodes.get('Principled BSDF').inputs['Base Color']);tex.image.pack()
def mesh(name,vs,fs,ma,uv=None):
 d=bpy.data.meshes.new(name);d.from_pydata(vs,[],fs);d.update();o=bpy.data.objects.new(name,d);sc.collection.objects.link(o);d.materials.append(ma)
 for p in d.polygons:p.use_smooth=True
 if uv is not None:
  layer=d.uv_layers.new()
  for p in d.polygons:
   for li in p.loop_indices:layer.data[li].uv=uv[d.loops[li].vertex_index]
 return o
def export(name,objects):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.export_scene.gltf(filepath=str(A/name),use_selection=True,export_format='GLB',export_yup=True,export_extras=True)
for stride,name in [(2,'high'),(4,'mobile')]:
 rows=list(range(0,h.shape[0],stride));cols=list(range(0,h.shape[1],stride))
 if rows[-1]!=h.shape[0]-1:rows.append(h.shape[0]-1)
 if cols[-1]!=h.shape[1]-1:cols.append(h.shape[1]-1)
 vs=[];uv=[]
 for j in rows:
  for i in cols:vs.append((W+i*step-OE,N-j*step-ON,float(h[j,i])-H0));uv.append((i/(h.shape[1]-1),1-j/(h.shape[0]-1)))
 nw=len(cols);fs=[(j*nw+i,(j+1)*nw+i,(j+1)*nw+i+1,j*nw+i+1) for j in range(len(rows)-1) for i in range(nw-1)];obj=mesh('Lenzerheide terrain '+name,vs,fs,aerial,uv);export('terrain-'+name+'.glb',[obj]);obj.hide_set(name=='mobile');obj.hide_render=name=='mobile'
# Detail corridor: baked mesh, with material assignments retained for editing.
p=np.load(C/'corridor.npz');corridor=mesh('Graded Alpine Flow and Roots Line',p['vertices'].tolist(),p['faces'].tolist(),aerial,p['uv'].tolist());export('corridor.glb',[corridor])
# A real, coarse panorama ring around the complete playable field.
pan=np.load(C/'panorama.npz');ph=pan['height'];PW,PS,PE,PN=pan['bounds'];pstep=float(pan['step']);vs=[];colors=[]
for j in range(ph.shape[0]):
 for i in range(ph.shape[1]):
  alt=float(ph[j,i]);vs.append((PW+i*pstep-OE,PN-j*pstep-ON,alt-H0));t=max(0,min(1,(alt-1900)/750));base=np.array([.21,.29,.145])*(1-t)+np.array([.39,.40,.36])*t;colors.append((*base,1))
nw=ph.shape[1];fs=[]
for j in range(ph.shape[0]-1):
 for i in range(ph.shape[1]-1):
  x=PW+(i+.5)*pstep;z=PN-(j+.5)*pstep
  if W+16<x<E-16 and S+16<z<N-16:continue
  a=j*nw+i;fs.append((a,a+nw,a+nw+1,a+1))
panmat=material('Mountain vegetation and rock by source elevation',(1,1,1));color=panmat.node_tree.nodes.new('ShaderNodeVertexColor');color.layer_name='Elevation palette';panmat.node_tree.links.new(color.outputs['Color'],panmat.node_tree.nodes.get('Principled BSDF').inputs['Base Color']);texture=panmat.node_tree.nodes.new('ShaderNodeTexImage');texture.image=bpy.data.images.load(str(C/'panorama.webp'));texture.image.pack();panmat.node_tree.links.new(texture.outputs['Color'],panmat.node_tree.nodes.get('Principled BSDF').inputs['Base Color']);pUv=[(i/(ph.shape[1]-1),1-j/(ph.shape[0]-1)) for j in range(ph.shape[0]) for i in range(ph.shape[1])];obj=mesh('Real mountain panorama / 32 m resampling',vs,fs,panmat,pUv);attr=obj.data.color_attributes.new(name='Elevation palette',type='FLOAT_COLOR',domain='POINT')
for i,color in enumerate(colors):attr.data[i].color=color
export('panorama.glb',[obj])
forest=json.loads((A/'forest.json').read_text())
for p in forest:
 o=bpy.data.objects.new('Alpine forest / linked scanned fir',high.data);sc.collection.objects.link(o);o.location=(p[0],-p[2],p[1]);o.scale=(p[3],)*3;o.rotation_euler.z=-p[4]
# Ground detail placements for both lines; roots concentrate on the technical route.
decor={'grass':[],'ferns':[],'rocks':[],'roots':[]};protos={key:bpy.data.objects['V2 / '+name+' source'] for key,name in [('grass','grass'),('ferns','fern'),('rocks','rock'),('roots','root')]}
for routeIndex,route in enumerate(trails):
 pts=route['points']
 for i in range(20,len(pts)-20,5):
  p=pts[i];q=pts[i+3];prev=pts[i-3];dx=q[0]-prev[0];dz=q[2]-prev[2];l=math.hypot(dx,dz);nx=-dz/l;nz=dx/l
  for side in [-1,1]:
   for k in range(2):
    off=side*random.uniform(2.4,8);x=p[0]+nx*off+random.uniform(-.7,.7);z=p[2]+nz*off+random.uniform(-.7,.7);decor['grass'].append([x,height(x,z),z,random.uniform(.8,1.8),random.uniform(0,math.tau)])
   if i%15==5:
    off=side*random.uniform(2.2,5);x=p[0]+nx*off;z=p[2]+nz*off;decor['rocks'].append([x,height(x,z)-.06,z,random.uniform(.16,.5),random.uniform(0,math.tau)])
   if i%70==20 and p[1]+H0<1770:
    off=side*random.uniform(4,10);x=p[0]+nx*off;z=p[2]+nz*off;decor['ferns'].append([x,height(x,z),z,random.uniform(.4,.8),random.uniform(0,math.tau)])
  if routeIndex==1 and i%45==20:
   decor['roots'].append([p[0],height(p[0],p[2])+.012,p[2],random.uniform(2.5,3.1),math.atan2(nz,nx),.065])
for key,proto in protos.items():
 proto.hide_set(True);proto.hide_render=True
 for p in decor[key]:
  o=bpy.data.objects.new('Alpine / '+key,proto.data);sc.collection.objects.link(o);o.location=(p[0],-p[2],p[1]);o.rotation_euler.z=-p[4];o.scale=(p[3],1,1) if key=='roots' else (p[3],)*3
(A/'decor.json').write_text(json.dumps(decor,separators=(',',':')))
# Simplified Scharmoin station shelter: an authored landmark, not a building survey.
wood=material('Alpine station timber',(.21,.14,.085));metal=material('Station roofing',(.19,.23,.24));concrete=material('Station foundation',(.38,.39,.36));land=[];sx=600;sz=105;sy=height(sx,sz)
def cube(name,position,scale,ma):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(position[0],-position[2],position[1]));o=bpy.context.object;o.name=name;o.scale=(scale[0],scale[2],scale[1]);o.data.materials.append(ma);land.append(o)
cube('Scharmoin shelter / foundation',(sx,sy+.4,sz),(12,.8,7),concrete);cube('Scharmoin shelter / timber',(sx,sy+2.1,sz),(10,3,5.5),wood);cube('Scharmoin shelter / roof',(sx,sy+3.8,sz),(13,.4,8),metal)
for dx in [-5,5]:cube('Shelter column',(sx+dx,sy+1.9,sz+3),(0.25,3.5,.25),wood)
export('landmark.glb',land)
# Set a useful initial Blender view, pack dependencies and save the whole region.
for im in bpy.data.images:
 if im.source=='FILE' and im.has_data:
  try:im.pack()
  except:pass
sc['Name']='Trapanotto Downhill Biking / Alpine Flow';sc['Sources']='©swisstopo / public/assets/lenzerheide/sources.json';sc['Coordinate origin']='LV95 E 2762500 / N 1179200; height origin 1400 m LN02';sc['Trails']='Two fictional game routes, not official Bike Kingdom lines.';sc['Art']='Scanned Fir Tree 01, Leafy Grass and shared CC0 materials / Poly Haven';sc['Physics']='2 m heightfield with locally authored grading and rollers; 1 m corridor is interpolation.'
sc.render.engine='CYCLES';sc.cycles.samples=32
bpy.ops.outliner.orphans_purge(do_local_ids=True,do_linked_ids=True,do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=str(R/'Lenzerheide.blend'),compress=True);print('Lenzerheide Blender world ready', {key:len(v) for key,v in decor.items()},flush=True)
