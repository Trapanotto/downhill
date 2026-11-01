"""Feather the baked branch atlas, update the editable Blender prototype and export.
The radial envelope prevents the edge of a baked camera crop showing as a square.
"""
import bpy,numpy as np
from pathlib import Path
R=Path(__file__).resolve().parents[1];C=R.parent/'geodata/v2';A=R/'public/assets'
bpy.ops.wm.open_mainfile(filepath=str(R/'Uetliberg.blend'))
image=bpy.data.images.get('leaf-cluster.png')
if image is None:image=next(im for im in bpy.data.images if 'leaf-cluster' in im.name)
# The baked original is retained separately to make this step repeatable.
raw=C/'leaf-cluster-raw.png'
if not raw.exists():raw.write_bytes((C/'leaf-cluster.png').read_bytes())
source=bpy.data.images.load(str(raw),check_existing=False);pixels=np.array(source.pixels[:]).reshape(source.size[1],source.size[0],4)
y,x=np.mgrid[0:source.size[1],0:source.size[0]];radius=np.sqrt(((x+.5)/source.size[0]*2-1)**2+((y+.5)/source.size[1]*2-1)**2)
mask=np.clip((1.03-radius)/.27,0,1);mask=mask*mask*(3-2*mask);pixels[:,:,3]*=mask
image.pixels[:]=pixels.ravel();image.filepath_raw=str(C/'leaf-cluster.png');image.file_format='PNG';image.save();image.pack()
for name in ['tree-v2-high','tree-v2-mobile']:
 bpy.ops.object.select_all(action='DESELECT');o=bpy.data.objects[name];o.hide_set(False);o.select_set(True);bpy.context.view_layer.objects.active=o
 bpy.ops.export_scene.gltf(filepath=str(A/(name+'.glb')),use_selection=True,export_format='GLB',export_yup=True,export_materials='EXPORT')
 o.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(R/'Uetliberg.blend'),compress=True)
print('Branch atlas edge feathering complete',flush=True)
