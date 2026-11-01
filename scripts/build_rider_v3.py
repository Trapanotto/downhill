"""Author a weighted rider skeleton and an articulated bike in Blender."""
import bpy,math
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1];A=R/'public/assets';C=R.parent/'geodata/v3'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def xyz(p):return Vector((p[0],-p[2],p[1]))
def mat(name,c,metal=0,rough=.65):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*c,1);p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
orange=mat('Anodized copper frame',(.83,.21,.055),.55,.29);carbon=mat('Carbon and protection',(.025,.038,.041),.22,.38);alloy=mat('Machined alloy',(.43,.48,.49),.85,.25);rubber=mat('Tyre rubber',(.018,.022,.022),0,.91);chrome=mat('Fork stanchion',(.66,.66,.56),.9,.17);cloth=mat('Woven technical jersey',(.77,.23,.07),0,.9);pants=mat('Reinforced charcoal trousers',(.045,.075,.070),0,.9);skin=mat('Skin',(.53,.32,.22),0,.77);white=mat('Jersey print',(.82,.86,.76),0,.8);lens=mat('Goggle lens',(.055,.17,.2),.65,.13)
def tube(name,a,b,r,ma,r2=None,verts=12):
 a=xyz(a);b=xyz(b);d=b-a;bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r,radius2=r if r2 is None else r2,depth=d.length,location=(a+b)/2);o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(ma)
 for p in o.data.polygons:p.use_smooth=True
 return o
def ellipsoid(name,p,scale,ma):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,radius=1,location=xyz(p));o=bpy.context.object;o.name=name;o.scale=(scale[0],scale[2],scale[1]);o.data.materials.append(ma)
 for f in o.data.polygons:f.use_smooth=True
 return o
def box(name,p,scale,ma):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(p));o=bpy.context.object;o.name=name;o.scale=(scale[0],scale[2],scale[1]);o.data.materials.append(ma);bevel=o.modifiers.new('Rounded corners','BEVEL');bevel.width=.03;bevel.segments=2;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=bevel.name);return o
def join(parts,name,origin=(0,0,0)):
 bpy.ops.object.select_all(action='DESELECT')
 for o in parts:o.select_set(True)
 bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=bpy.context.object;o.name=name;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);bpy.context.scene.cursor.location=xyz(origin);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');return o
def export(name,objects):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.export_scene.gltf(filepath=str(A/name),use_selection=True,export_format='GLB',export_yup=True,export_extras=True)
# Bike assemblies, each exported with a useful joint origin.
bike=[]
for z,name in [(-.72,'WheelFront'),(.72,'WheelRear')]:
 parts=[]
 for radius,minor,ma in [(.365,.057,rubber),(.326,.021,alloy)]:
  bpy.ops.mesh.primitive_torus_add(major_radius=radius,minor_radius=minor,major_segments=56,minor_segments=10,location=xyz((0,.42,z)),rotation=(0,math.pi/2,0));o=bpy.context.object;o.data.materials.append(ma);parts.append(o)
 parts.append(tube('Hub',(-.09,.42,z),(.09,.42,z),.036,alloy))
 for i in range(24):
  a=i/24*math.tau;parts.append(tube('Spoke',(((-1)**i)*.04,.42,z),(0,.42+math.sin(a)*.31,z+math.cos(a)*.31),.0028,alloy,verts=5))
 for i in range(40):
  a=i/40*math.tau
  for side in [-.03,.03]:parts.append(tube('Tread',(side-.016,.42+math.sin(a)*.412,z+math.cos(a)*.412),(side+.016,.42+math.sin(a)*.412,z+math.cos(a)*.412),.011,rubber,verts=5))
 bike.append(join(parts,name,(0,.42,z)))
frame=[];nodes={'bb':(0,.48,.18),'seat':(0,.98,.29),'head':(0,1.04,-.49),'rear':(0,.42,.72)}
for a,b,r in [('bb','seat',.044),('seat','head',.038),('head','bb',.060)]:frame.append(tube('Hydroformed frame',nodes[a],nodes[b],r,orange))
for x in [-.085,.085]:
 for a,b in [('rear','bb'),('rear','seat')]:frame.append(tube('Rear linkage',(x,*nodes[a][1:]),(x,*nodes[b][1:]),.026,orange))
frame+=[tube('Rear shock',(0,.64,.43),(0,.9,.06),.039,chrome),tube('Seat post',(0,.96,.29),(0,1.1,.32),.025,alloy),ellipsoid('Saddle',(0,1.11,.34),(.12,.035,.18),carbon),tube('Brake hose',(.07,1.13,-.51),(.08,.48,-.71),.005,rubber,verts=6)]
bike.append(join(frame,'BikeFrame'))
fork=[]
for x in [-.095,.095]:fork+=[tube('Stanchion',(x,.43,-.72),(x,.79,-.585),.025,chrome),tube('Fork lower',(x,.73,-.61),(x,1.10,-.46),.041,carbon)]
bike.append(join(fork,'SuspensionFork'))
bar=[tube('Stem',(0,1.08,-.48),(0,1.18,-.59),.026,carbon),tube('Handlebar',(-.39,1.18,-.59),(.39,1.18,-.59),.017,carbon)]
for x in [-.35,.35]:bar.append(tube('Grip',(x-.055,1.18,-.59),(x+.055,1.18,-.59),.026,rubber))
bike.append(join(bar,'Handlebar'))
cranks=[tube('Axle',(-.16,.48,.18),(.16,.48,.18),.027,alloy),tube('Left crank',(-.16,.48,.18),(-.16,.48,.35),.022,carbon),tube('Right crank',(.16,.48,.18),(.16,.48,.01),.022,carbon)]
bike.append(join(cranks,'Crank',(0,.48,.18)))
for side,name,z in [(-1,'PedalL',.35),(1,'PedalR',.01)]:bike.append(join([box(name,(side*.18,.48,z),(.13,.026,.09),alloy)],name,(side*.18,.48,z)))
export('bike-v3.glb',bike)
for o in bike:o.hide_set(True);o.hide_render=True
# Armature rest pose, in game coordinates (+Y up / -Z forward).
bones={'Root':((0,0,0),(0,.2,0),None),'Hips':((0,1.3,.25),(0,1.46,.15),'Root'),'Spine':((0,1.46,.15),(0,1.78,-.12),'Hips'),'Head':((0,1.78,-.12),(0,2.03,-.34),'Spine')}
for side,suffix in [(-1,'L'),(1,'R')]:
 shoulder=(side*.21,1.72,-.12);elbow=(side*.38,1.41,-.25);hand=(side*.35,1.18,-.59);hip=(side*.17,1.30,.25);knee=(side*.27,.94,-.08);ankle=(side*.17,.60,.27)
 bones.update({'UpperArm'+suffix:(shoulder,elbow,'Spine'),'Forearm'+suffix:(elbow,hand,'UpperArm'+suffix),'Hand'+suffix:(hand,(side*.35,1.17,-.69),'Forearm'+suffix),'Thigh'+suffix:(hip,knee,'Hips'),'Shin'+suffix:(knee,ankle,'Thigh'+suffix),'Foot'+suffix:(ankle,(side*.17,.55,.07),'Shin'+suffix)})
arm=bpy.data.armatures.new('Downhill rider skeleton');rig=bpy.data.objects.new('RiderRig',arm);bpy.context.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
for name,(a,b,parent) in bones.items():bone=arm.edit_bones.new(name);bone.head=xyz(a);bone.tail=xyz(b)
for name,(a,b,parent) in bones.items():
 if parent:arm.edit_bones[name].parent=arm.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
for name,(a,b,parent) in bones.items():arm.bones[name]['length']=(xyz(b)-xyz(a)).length
parts=[]
def weighted(obj,bone):
 g=obj.vertex_groups.new(name=bone);g.add(list(range(len(obj.data.vertices))),1,'REPLACE');parts.append(obj);return obj
weighted(ellipsoid('Pelvis',(0,1.32,.24),(.23,.17,.18),pants),'Hips')
weighted(tube('Jersey torso',(0,1.39,.17),(0,1.76,-.11),.19,cloth,r2=.24,verts=24),'Spine')
weighted(ellipsoid('Shoulder fabric',(0,1.73,-.11),(.25,.16,.18),cloth),'Spine')
weighted(ellipsoid('Neck',(0,1.87,-.23),(.08,.1,.075),skin),'Head')
weighted(ellipsoid('Full face shell',(0,2.04,-.34),(.19,.23,.22),carbon),'Head')
weighted(ellipsoid('Goggles',(0,2.06,-.52),(.171,.085,.034),lens),'Head')
weighted(box('Helmet visor',(0,2.19,-.48),(.39,.025,.25),orange),'Head')
for side in [-1,1]:
 weighted(tube('Chin side',(side*.16,1.99,-.43),(side*.12,1.9,-.61),.028,carbon),'Head')
 weighted(tube('Helmet stripe',(side*.10,2.22,-.37),(side*.11,2.13,-.48),.014,orange),'Head')
weighted(tube('Chin guard',(-.12,1.9,-.61),(.12,1.9,-.61),.03,carbon),'Head')
# Printed chest detail and reflective piping make torso movement readable.
weighted(box('Chest mark',(0,1.7,-.294),(.13,.10,.007),white),'Spine')
for side,suffix in [(-1,'L'),(1,'R')]:
 for name,r,ma,r2 in [('UpperArm'+suffix,.084,cloth,.070),('Forearm'+suffix,.064,skin,.046),('Thigh'+suffix,.116,pants,.092),('Shin'+suffix,.079,pants,.057)]:
  a,b,_=bones[name];weighted(tube(name+' skin',a,b,r,ma,r2=r2,verts=20),name)
 elbow=bones['Forearm'+suffix][0];knee=bones['Shin'+suffix][0];hand=bones['Hand'+suffix][0];ankle=bones['Foot'+suffix][0]
 weighted(ellipsoid('Elbow protection',elbow,(.082,.082,.08),carbon),'Forearm'+suffix);weighted(ellipsoid('Knee pad',knee,(.105,.095,.11),carbon),'Shin'+suffix);weighted(ellipsoid('Glove',hand,(.066,.062,.085),carbon),'Hand'+suffix)
 weighted(ellipsoid('Riding shoe',(ankle[0],ankle[1]-.05,ankle[2]-.06),(.088,.065,.16),carbon),'Foot'+suffix);weighted(box('Shoe sole',(ankle[0],ankle[1]-.095,ankle[2]-.05),(.16,.025,.28),rubber),'Foot'+suffix)
body=join(parts,'RiderSkin');modifier=body.modifiers.new('Weighted skeleton','ARMATURE');modifier.object=rig;body.parent=rig;rig['rigVersion']=3;rig['Description']='Weighted rider; runtime two-bone limb IK, pedal cadence and weight transfer.'
export('rider-v3.glb',[rig,body]);
for o in bike:o.hide_set(False);o.hide_render=False
bpy.context.scene['Name']='Trapanotto / V3 articulated bike and weighted rider';bpy.ops.wm.save_as_mainfile(filepath=str(R/'Rider.blend'),compress=True);print('V3 bike and skeleton ready',flush=True)
