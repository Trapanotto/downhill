"""Validate every standalone component and relative master link after relocation."""
from pathlib import Path
import bpy,json,sys
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
root=Path(args[0]).resolve() if args else Path(__file__).resolve().parents[1]/'blender'
m=json.loads((root/'manifest.json').read_text())
for region,record in m['regions'].items():
 for p in record['parts']:
  bpy.ops.wm.open_mainfile(filepath=str(root/p['file']));scene=bpy.context.scene;assert len(scene.objects)==p['objects'],p
  assert bpy.data.collections.get(p['collection']) is not None
  for image in bpy.data.images:
   if image.source=='FILE':assert image.packed_file is not None and image.size[0]>0,image.name
  for o in scene.objects:
   if o.hide_render:assert o.hide_get(view_layer=scene.view_layers[0]),o.name
 bpy.ops.wm.open_mainfile(filepath=str(root/record['master']));scene=bpy.context.scene
 assert len(scene.objects)==record['sourceObjects']-10+3,(region,len(scene.objects))
 assert len(bpy.data.libraries)==4
 for lib in bpy.data.libraries:
  assert lib.filepath.startswith('//'),lib.filepath
  assert Path(bpy.path.abspath(lib.filepath)).exists(),lib.filepath
 for o in scene.objects:
  if o.hide_render:assert o.hide_get(view_layer=scene.view_layers[0]),o.name
 rider=scene.objects['Shared rider and bike'];assert len(rider.instance_collection.all_objects)==10
 assert sum(o.type=='ARMATURE' for o in rider.instance_collection.all_objects)==1
 assert scene.camera is not None
 print('PORTABLE_MASTER_OK',region,len(scene.objects),[lib.filepath for lib in bpy.data.libraries],flush=True)
bpy.ops.wm.open_mainfile(filepath=str(root/m['rider']['file']));assert len(bpy.context.scene.objects)==10;rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');assert len(rig.data.bones)==16
print('SPLIT_PACKAGE_OK: all 9 Blender files, relative links, packed textures, LOD visibility and 16-bone rider.',flush=True)
