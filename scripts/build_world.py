"""blender --background --python scripts/build_world.py
Builds the complete local Uetliberg scene from the frozen swisstopo raster.
"""
import bpy, math, json, random
from pathlib import Path
import numpy as np
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]; A=ROOT/'public/assets'
meta=json.loads((A/'region.json').read_text()); h=np.fromfile(A/'height.bin',dtype='<f4').reshape(meta['height'],meta['width'])
W,S,E,N=meta['bounds']; OE,ON=meta['origin']; H0=meta['heightOrigin']
random.seed(381)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def height(x,z):
 u=max(0,min(h.shape[1]-1.001,(x+OE-W)/4));v=max(0,min(h.shape[0]-1.001,(z+N-ON)/4));i=int(u);j=int(v);a=u-i;b=v-j
 return float((h[j,i]*(1-a)+h[j,i+1]*a)*(1-b)+(h[j+1,i]*(1-a)+h[j+1,i+1]*a)*b)-H0

def mat(name,col,metal=0,rough=.8):
 m=bpy.data.materials.new(name);m.diffuse_color=(*col,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*col,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
soil=mat('Earth',(0.32,.25,.15));bark=mat('Rough bark',(.16,.115,.07));leaf=mat('Beech leaves',(.12,.23,.055));leaf2=mat('Sunlit leaves',(.22,.32,.075))
def mesh(name,vs,fs,material,uvs=None):
 m=bpy.data.meshes.new(name);m.from_pydata(vs,[],fs);m.update();o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);o.data.materials.append(material)
 for p in m.polygons:p.use_smooth=True
 if uvs:
  layer=m.uv_layers.new(name='UVMap')
  for poly in m.polygons:
   for li in poly.loop_indices:layer.data[li].uv=uvs[m.loops[li].vertex_index]
 return o

def select(objs):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.select_set(True)
 bpy.context.view_layer.objects.active=objs[0]
def export(name,objs):
 select(objs);bpy.ops.export_scene.gltf(filepath=str(A/name),use_selection=True,export_format='GLB',export_yup=True,export_materials='EXPORT',export_extras=True)
def terrain(step,name):
 rows=list(range(0,h.shape[0],step));cols=list(range(0,h.shape[1],step))
 if rows[-1]!=h.shape[0]-1:rows.append(h.shape[0]-1)
 if cols[-1]!=h.shape[1]-1:cols.append(h.shape[1]-1)
 vs=[];uv=[]
 for j in rows:
  for i in cols:
   x=W+i*4-OE;z=N-j*4-ON
   vs.append((x,z,float(h[j,i])-H0));uv.append((i/(h.shape[1]-1),1-j/(h.shape[0]-1)))
 fs=[];nw=len(cols)
 for j in range(len(rows)-1):
  for i in range(nw-1):
   a=j*nw+i;fs.append((a,a+nw,a+nw+1,a+1))
 return mesh(name,vs,fs,soil,uv)
print('Building actual terrain',flush=True)
th=terrain(1,'Uetliberg_4m');export('terrain-high.glb',[th]);th.hide_set(True)
tl=terrain(2,'Uetliberg_8m');export('terrain-mobile.glb',[tl]);tl.hide_set(True)
# Designed trail, with coordinates in metres east / south relative to the local LV95 origin.
controls=[[45,170],[30,130],[15,80],[20,25],[0,-30],[25,-80],[50,-110],[40,-170],[80,-220],[110,-250],[60,-300],[115,-350],[150,-400],[120,-470],[180,-520],[260,-570],[300,-640],[260,-710],[320,-770],[400,-820],[390,-900],[480,-960],[550,-1010],[520,-1090],[620,-1190]]
points=[]
for k in range(len(controls)-1):
 p0=np.array(controls[max(0,k-1)]);p1=np.array(controls[k]);p2=np.array(controls[k+1]);p3=np.array(controls[min(k+2,len(controls)-1)])
 for t in np.linspace(0,1,max(8,int(np.linalg.norm(p2-p1))),endpoint=False):
  q=.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)
  points.append([float(q[0]),height(q[0],q[1])+.09,float(q[1])])
points.append([controls[-1][0],height(*controls[-1])+.09,controls[-1][1]])
length=sum(math.dist(points[i],points[i-1]) for i in range(1,len(points)))
trail={'name':'Uetliberg / Skyline Run','points':points,'length':round(length),'drop':round(points[0][1]-points[-1][1]),'checkpoints':[0]+list(range(160,len(points)-80,160))+[len(points)-1],'width':3.2,'fictional':True}
(A/'trail.json').write_text(json.dumps(trail,separators=(',',':')))
vs=[];uv=[]
for i,p in enumerate(points):
 prev=points[max(0,i-1)];nxt=points[min(len(points)-1,i+1)];dx=nxt[0]-prev[0];dz=nxt[2]-prev[2];l=math.hypot(dx,dz);nx=-dz/l;nz=dx/l
 for side in [-1,1]:
  x=p[0]+nx*1.65*side;z=p[2]+nz*1.65*side
  vs.append((x,-z,height(x,z)+.11));uv.append(((side+1)/2,i/5))
path=mesh('Designed trail / not a navigation route',vs,[(i*2,i*2+1,i*2+3,i*2+2) for i in range(len(points)-1)],soil,uv);export('trail.glb',[path])
# Trees: smooth foliage clusters and branching trunks. Geometry is authored here, instances retained in the .blend scene.
def cylinder(name,a,b,r,material,vertices=10,r2=None):
 d=Vector(b)-Vector(a);mid=(Vector(a)+Vector(b))/2
 bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r if r2 is None else r2,depth=d.length,location=mid)
 o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(material)
 for p in o.data.polygons:p.use_smooth=True
 return o

def ball(name,p,sc,material,sub=2):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=p);o=bpy.context.object;o.name=name;o.scale=sc;o.data.materials.append(material)
 for f in o.data.polygons:f.use_smooth=True
 return o

def join(objs,name):
 select(objs);bpy.ops.object.join();o=bpy.context.object;o.name=name;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 # origin at scene origin
 bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');return o

def tree(low=False):
 parts=[cylinder('Trunk',(0,0,0),(0,0,11),.34,bark,6 if low else 10,.11)]
 for i in range(8 if low else 14):
  a=i*2.399;r=2.3+random.random()*1.5;z=6.2+(i%5)*1.1
  p=(math.cos(a)*r,math.sin(a)*r,z)
  if not low:parts.append(cylinder('Branch',(0,0,z-2),p,.1,bark,6,.025))
  parts.append(ball('Leaf cluster',p,(2.5+random.random(),2.3+random.random(),2.8+random.random()),leaf if i%3 else leaf2,1 if low else 2))
 return join(parts,'Beech_mobile' if low else 'Beech_high')
treeH=tree();export('tree-high.glb',[treeH]);treeH.hide_set(True)
treeL=tree(True);export('tree-mobile.glb',[treeL]);treeL.hide_set(True)
# Blender ships no PIL; read the already-prepared WebP through Blender's image API instead.
im=bpy.data.images.load(str(A/'uetliberg-2k.webp'));pix=np.array(im.pixels[:]).reshape(im.size[1],im.size[0],4)
positions=[];tries=0
while len(positions)<4200 and tries<60000:
 tries+=1
 if len(positions)<2600:
  anchor=random.choice(points);angle=random.uniform(0,math.tau);radius=random.uniform(8,105);x=anchor[0]+math.cos(angle)*radius;z=anchor[2]+math.sin(angle)*radius
 else:x=random.uniform(W-OE+12,E-OE-12);z=random.uniform(ON-N+12,ON-S-12)
 if not (W-OE+12<x<E-OE-12 and ON-N+12<z<ON-S-12):continue
 rgb=pix[int((ON-z-S)/(N-S)*(im.size[1]-1)),int((x+OE-W)/(E-W)*(im.size[0]-1)),:3]
 if rgb[1]<rgb[0]*.75 or rgb[1]<rgb[2]*.9 or rgb.mean()>.65:continue
 if min((x-p[0])**2+(z-p[2])**2 for p in points[::8])<49:continue
 y=height(x,z);scale=random.uniform(.65,1.3);rot=random.uniform(0,6.283)
 positions.append([round(x,2),round(y,2),round(z,2),round(scale,3),round(rot,3)])
 o=bpy.data.objects.new('Forest / linked beech',treeH.data);bpy.context.collection.objects.link(o);o.location=(x,-z,y);o.scale=(scale,scale,scale);o.rotation_euler.z=rot
(A/'forest.json').write_text(json.dumps(positions,separators=(',',':')))
# Full-suspension bike, local Blender -Y forward, exported to Three.js -Z.
rubber=mat('Tyres',(.018,.022,.021),.02,.94);metal=mat('Brushed alloy',(.34,.38,.4),.8,.29);carbon=mat('Carbon',(.025,.033,.034),.35,.38);orange=mat('Burnt orange frame',(.88,.19,.045),.38,.3);chrome=mat('Fork stanchions',(.72,.7,.58),.85,.2);jersey=mat('Technical jersey',(.82,.22,.075),0,.75);pants=mat('Riding trousers',(.035,.065,.058));skin=mat('Skin',(.58,.36,.23));visor=mat('Goggle lens',(.07,.15,.16),.6,.14)
bikeparts=[];wheelgroups=[]
def xyz(x,y,z):return (x,-z,y)
def tube(a,b,r,ma=carbon,name='Frame',vertices=12):return cylinder(name,xyz(*a),xyz(*b),r,ma,vertices)
def sphere(p,sc,ma,name='Rider'):return ball(name,xyz(*p),(sc[0],sc[2],sc[1]),ma,3)
for z,name in [(-.72,'WheelFront'),(.72,'WheelRear')]:
 parts=[]
 for radius,minor,ma in [(.365,.057,rubber),(.326,.021,metal)]:
  bpy.ops.mesh.primitive_torus_add(major_radius=radius,minor_radius=minor,major_segments=48,minor_segments=10,location=xyz(0,.42,z),rotation=(0,math.pi/2,0));o=bpy.context.object;o.data.materials.append(ma)
  for p in o.data.polygons:p.use_smooth=True
  parts.append(o)
 parts.append(tube((-.09,.42,z),(.09,.42,z),.045,metal,'Hub'))
 for i in range(24):
  a=i/24*math.tau;parts.append(tube(((-1)**i*.045,.42,z),(0,.42+math.sin(a)*.31,z+math.cos(a)*.31),.003,metal,'Spoke',5))
 # disc rotor
 bpy.ops.mesh.primitive_torus_add(major_radius=.105,minor_radius=.011,major_segments=24,minor_segments=5,location=xyz(.075,.42,z),rotation=(0,math.pi/2,0));o=bpy.context.object;o.data.materials.append(metal);parts.append(o)
 # tread blocks provide a defined rubber silhouette
 for i in range(36):
  a=i/36*math.tau
  for side in [-.029,.029]:
   parts.append(tube((side-.016,.42+math.sin(a)*.412,z+math.cos(a)*.412),(side+.016,.42+math.sin(a)*.412,z+math.cos(a)*.412),.012,rubber,'Tread',5))
 o=join(parts,name);bpy.context.scene.cursor.location=xyz(0,.42,z);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');wheelgroups.append(o)
# Frame triangles and suspension
nodes={'bb':(0,.48,.18),'seat':(0,.98,.29),'head':(0,1.04,-.49),'rear':(0,.42,.72),'front':(0,.42,-.72)}
for a,b,r in [('bb','seat',.046),('seat','head',.04),('head','bb',.065),('rear','bb',.03),('rear','seat',.027)]:
 if a=='rear':
  for x in [-.085,.085]:bikeparts.append(tube((x,*nodes[a][1:]),(x,*nodes[b][1:]),r,orange))
 else:bikeparts.append(tube(nodes[a],nodes[b],r,orange))
for x in [-.092,.092]:
 bikeparts += [tube((x,.43,-.72),(x,.77,-.59),.028,chrome,'Fork'),tube((x,.72,-.61),(x,1.1,-.46),.044,carbon,'Fork')]
bikeparts += [tube((0,.64,.43),(0,.9,.06),.046,chrome,'Rear shock'),tube((0,.96,.29),(0,1.12,.32),.025,metal,'Seat post'),sphere((0,1.12,.34),(.13,.04,.2),carbon,'Saddle'),tube((0,1.1,-.46),(0,1.18,-.59),.026,carbon,'Stem'),tube((-.39,1.18,-.59),(.39,1.18,-.59),.019,carbon,'Handlebar')]
for x in [-.35,.35]:bikeparts.append(tube((x-.05,1.18,-.59),(x+.05,1.18,-.59),.028,rubber,'Grip'))
bikeparts += [tube((-.14,.48,.18),(.14,.48,.18),.028,metal,'Crank'),tube((-.14,.48,.18),(-.14,.34,.27),.022,carbon,'Crank'),tube((.14,.48,.18),(.14,.62,.09),.022,carbon,'Crank')]
frame=join(bikeparts,'BikeFrame')
# Anatomical riding posture, clothing and full-face helmet.
body=[sphere((0,1.4,.29),(.22,.2,.18),pants),tube((0,1.4,.25),(0,1.88,-.12),.23,jersey,'Torso',20),sphere((0,1.92,-.17),(.22,.18,.2),jersey)]
for side in [-1,1]:
 x=side*.19;hand=side*.34
 body += [tube((x,1.84,-.14),(side*.36,1.53,-.27),.084,jersey,'Upper arm',16),tube((side*.36,1.53,-.27),(hand,1.22,-.57),.064,skin,'Forearm',16),sphere((hand,1.21,-.58),(.068,.07,.075),carbon,'Glove'),tube((x,1.42,.27),(side*.27,1.02,-.1),.115,pants,'Thigh',16),tube((side*.27,1.02,-.1),(side*.16,.59,.14),.083,pants,'Shin',16),sphere((side*.16,.55,.05),(.09,.065,.17),carbon,'Shoe'),sphere((side*.27,1.01,-.1),(.11,.105,.11),carbon,'Knee pad')]
body += [sphere((0,2.12,-.37),(.2,.24,.23),carbon,'Full face helmet'),sphere((0,2.14,-.52),(.18,.105,.055),visor,'Goggles'),tube((-.17,2.04,-.45),(-.12,1.96,-.64),.035,carbon,'Chin guard'),tube((.17,2.04,-.45),(.12,1.96,-.64),.035,carbon,'Chin guard'),tube((-.12,1.96,-.64),(.12,1.96,-.64),.035,carbon,'Chin guard')]
rider=join(body,'Rider');export('bike.glb',[frame,rider]+wheelgroups)
# Landmark at the summit, deliberately simplified architectural geometry.
land=[];tx=-8;tz=198;ty=height(tx,tz)
for dx in [-2,2]:
 for dz in [-2,2]:land.append(tube((tx+dx,ty,tz+dz),(tx+dx*.65,ty+29,tz+dz*.65),.14,metal,'Observation tower'))
for level in range(7):
 y=ty+level*4
 for axis in [0,1]:
  for side in [-2,2]:
   a=(tx-2,y,tz+side) if axis==0 else (tx+side,y,tz-2)
   b=(tx+2,y+4,tz+side) if axis==0 else (tx+side,y+4,tz+2)
   land.append(tube(a,b,.065,metal,'Tower bracing'))
bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(tx,ty+28.8,tz));deck=bpy.context.object;deck.scale=(6,6,.25);deck.data.materials.append(metal);land.append(deck)
landmark=join(land,'Summit landmark');export('landmark.glb',[landmark])
# Preserve the complete authored scene for editing, with packed aerial imagery.
terrainmat=mat('swisstopo aerial terrain',(1,1,1));nt=terrainmat.node_tree;tex=nt.nodes.new('ShaderNodeTexImage');tex.image=im;nt.links.new(tex.outputs['Color'],nt.nodes.get('Principled BSDF').inputs['Base Color']);th.data.materials.clear();th.data.materials.append(terrainmat);th.hide_set(False)
for o in [frame,rider]+wheelgroups:o.location+=Vector((45,-170,height(45,170)))
# All instance positions are in the file; external texture packed for a self-contained source.
im.pack();bpy.context.scene['Sources']='©swisstopo; see public/assets/sources.json';bpy.context.scene['Coordinate origin']='LV95 2679500 / 1245000, height 400 m LN02';bpy.context.scene['Trail']='Fictional gameplay trail on real Uetliberg terrain.'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'Uetliberg.blend'),compress=True)
print('WORLD READY:',len(positions),'trees;',len(points),'trail samples;',round(length),'metres',flush=True)
