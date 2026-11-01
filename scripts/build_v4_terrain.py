"""Offline Blender terrain LODs and spatial trail chunks; no embedded duplicate ortho maps."""
from pathlib import Path
import bpy,numpy as np,json,math,sys
R=Path(__file__).resolve().parents[1]
def export(path,objects):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.export_scene.gltf(filepath=str(path),use_selection=True,export_format='GLB',export_yup=True,export_extras=True)
for region,source,folder in [('uetliberg','Uetliberg.blend',R/'public/assets'),('lenzerheide','Lenzerheide.blend',R/'public/assets/lenzerheide')]:
 if '--panorama-only' in sys.argv and region!='lenzerheide':continue
 bpy.ops.wm.open_mainfile(filepath=str(R/source));sc=bpy.context.scene;meta=json.loads((folder/'region.json').read_text());h=np.fromfile(folder/'height.bin',dtype='<f4').reshape(meta['height'],meta['width']);xmin=meta['bounds'][0]-meta['origin'][0];zmin=meta['origin'][1]-meta['bounds'][3];xmax=xmin+(meta['width']-1)*meta['step'];zmax=zmin+(meta['height']-1)*meta['step'];mat=bpy.data.materials.new('Runtime terrain / external shared orthophoto');mat.diffuse_color=(.4,.5,.3,1)
 def height(x,z):
  u=np.clip((np.asarray(x)-xmin)/meta['step'],0,h.shape[1]-1.00001);v=np.clip((np.asarray(z)-zmin)/meta['step'],0,h.shape[0]-1.00001);i=u.astype(int);j=v.astype(int);a=u-i;b=v-j;return h[j,i]*(1-a)*(1-b)+h[j,i+1]*a*(1-b)+h[j+1,i]*(1-a)*b+h[j+1,i+1]*a*b-meta['heightOrigin']
 def grid(name,x0,z0,x1,z1,res,extras,skirts=True):
  xs=np.r_[np.arange(x0,x1,res),x1];zs=np.r_[np.arange(z0,z1,res),z1];x,z=np.meshgrid(xs,zs);y=height(x,z);vertices=np.c_[x.ravel(),-z.ravel(),y.ravel()].tolist();uv=np.c_[(x.ravel()-xmin)/(xmax-xmin),1-(z.ravel()-zmin)/(zmax-zmin)].tolist();w=len(xs);n=len(zs);faces=[(j*w+i,(j+1)*w+i,(j+1)*w+i+1,j*w+i+1) for j in range(n-1) for i in range(w-1)]
  if skirts:
   border=list(range(w))+[j*w+w-1 for j in range(1,n)]+list(range((n-1)*w+w-2,(n-1)*w-1,-1))+[j*w for j in range(n-2,0,-1)];lower=[]
   for i in border:lower.append(len(vertices));p=vertices[i].copy();p[2]-=8;vertices.append(p);uv.append(uv[i])
   for i in range(len(border)):j=(i+1)%len(border);faces.append((border[i],lower[i],lower[j],border[j]))
  mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update();obj=bpy.data.objects.new(name,mesh);sc.collection.objects.link(obj);mesh.materials.append(mat);layer=mesh.uv_layers.new()
  for face in mesh.polygons:
   face.use_smooth=True
   for li in face.loop_indices:layer.data[li].uv=uv[mesh.loops[li].vertex_index]
  for k,v in extras.items():obj[k]=v
  return obj
 for profile,nearRes,midRes in ([] if '--panorama-only' in sys.argv else [('high',4,8),('mobile',4,16)]):
  objects=[]
  for i,x in enumerate(np.arange(xmin,xmax,128)):
   for j,z in enumerate(np.arange(zmin,zmax,128)):
    for tier,res in [(0,nearRes),(1,midRes)]:objects.append(grid(f'Terrain / {i} {j} / LOD {tier}',x,z,min(x+128,xmax),min(z+128,zmax),res,{'terrainTier':tier,'centerX':float(x+64),'centerZ':float(z+64)}))
  objects.append(grid('Terrain / far 32m',xmin,zmin,xmax,zmax,32,{'terrainTier':2,'centerX':0.,'centerZ':0.},False));export(folder/('terrain-v4-'+profile+'.glb'),objects)
  for o in objects:bpy.data.objects.remove(o,do_unlink=True)
  print('TERRAIN_CHUNKS_READY',region,profile,flush=True)
 # Preserve exact authored trail vertices, normals and both UV layers in local chunks.
 for profile in ([] if '--panorama-only' in sys.argv else ['high','mobile']):
  original=bpy.data.objects['V3 / ruts berms takeoffs / '+profile];me=original.data;groups={}
  for face in me.polygons:
   coords=[me.vertices[i].co for i in face.vertices];cx=sum(v.x for v in coords)/len(coords);cz=-sum(v.y for v in coords)/len(coords);groups.setdefault((math.floor((cx-xmin)/128),math.floor((cz-zmin)/128)),[]).append(face)
  objects=[]
  for (i,j),polygons in groups.items():
   ids={};vs=[];fs=[];uv={layer.name:[] for layer in me.uv_layers}
   for face in polygons:
    f=[]
    for li in face.loop_indices:
     vi=me.loops[li].vertex_index
     if vi not in ids:ids[vi]=len(vs);vs.append(me.vertices[vi].co[:])
     f.append(ids[vi])
     for layer in me.uv_layers:uv[layer.name].append(layer.data[li].uv[:])
    fs.append(f)
   mesh=bpy.data.meshes.new('Trail tile');mesh.from_pydata(vs,[],fs);mesh.update();obj=bpy.data.objects.new(f'Trail / {i} {j}',mesh);sc.collection.objects.link(obj);mesh.materials.append(mat)
   for face in mesh.polygons:face.use_smooth=True
   for name,values in uv.items():
    layer=mesh.uv_layers.new(name=name)
    for k,value in enumerate(values):layer.data[k].uv=value
   obj['centerX']=float(xmin+i*128+64);obj['centerZ']=float(zmin+j*128+64);objects.append(obj)
  export(folder/('corridor-v4-'+profile+'.glb'),objects)
  for o in objects:bpy.data.objects.remove(o,do_unlink=True)
  print('TRAIL_CHUNKS_READY',region,profile,flush=True)
 # The mountain panorama is spatially partitioned too; keep its one shared photo.
 if region=='lenzerheide':
  original=bpy.data.objects['Real mountain panorama / 32 m resampling'];me=original.data;groups={}
  for face in me.polygons:
   cx=sum(me.vertices[i].co.x for i in face.vertices)/len(face.vertices);cz=-sum(me.vertices[i].co.y for i in face.vertices)/len(face.vertices);groups.setdefault((math.floor(cx/512),math.floor(cz/512)),[]).append(face)
  objects=[]
  for (i,j),polygons in groups.items():
   ids={};vs=[];fs=[];uv=[]
   for face in polygons:
    f=[]
    for li in face.loop_indices:
     vi=me.loops[li].vertex_index
     if vi not in ids:ids[vi]=len(vs);vs.append(me.vertices[vi].co[:])
     f.append(ids[vi]);uv.append(me.uv_layers.active.data[li].uv[:])
    fs.append(f)
   mesh=bpy.data.meshes.new('Panorama tile');mesh.from_pydata(vs,[],fs);mesh.update();obj=bpy.data.objects.new(f'Panorama / {i} {j}',mesh);sc.collection.objects.link(obj);mesh.materials.append(me.materials[0]);layer=mesh.uv_layers.new()
   for face in mesh.polygons:face.use_smooth=True
   for k,value in enumerate(uv):layer.data[k].uv=value
   objects.append(obj)
  export(folder/'panorama-v4.glb',objects)
  print('PANORAMA_CHUNKS_READY',flush=True)
