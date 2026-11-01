import * as THREE from 'three';

/** All geometry, instance positions and photographic maps are loaded up front. */
export async function loadWorldV2({scene,renderer,loader,textures,asset,meta,forest,decor,profile,baseTerrain}){
 const names=['floor-color.webp','floor-normal.webp','floor-arm.webp','trail-color.webp','trail-normal.webp','trail-arm.webp','surface-mask.png','tree-impostor.webp'];
 const maps=Object.fromEntries(await Promise.all(names.map(async n=>[n,await textures.loadAsync(asset(n))])));
 const [tree,corridor,fern,rock,root,grass]=await Promise.all(['tree-v2-'+profile.tree+'.glb','corridor.glb','fern.glb','rock.glb','root.glb','grass.glb'].map(n=>loader.loadAsync(asset(n))));
 for(const [name,map] of Object.entries(maps)){
  map.colorSpace=name.includes('color')||name.includes('impostor')?THREE.SRGBColorSpace:THREE.NoColorSpace;
  if(name.includes('mask')){map.flipY=false;map.minFilter=THREE.LinearFilter;map.generateMipmaps=false}
  else if(!name.includes('impostor')){map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy())}
 }
 const extent=new THREE.Vector4(meta.bounds[0]-meta.origin[0],meta.origin[1]-meta.bounds[3],meta.bounds[2]-meta.bounds[0],meta.bounds[3]-meta.bounds[1]);
 const uniforms={floorColor:{value:maps['floor-color.webp']},floorNormal:{value:maps['floor-normal.webp']},floorARM:{value:maps['floor-arm.webp']},trailColor:{value:maps['trail-color.webp']},trailNormal:{value:maps['trail-normal.webp']},trailARM:{value:maps['trail-arm.webp']},surfaceMask:{value:maps['surface-mask.png']},worldExtent:{value:extent}};
 const surfaceMaterial=(ortho,inset)=>{
  const material=new THREE.MeshStandardMaterial({map:ortho,normalMap:maps['floor-normal.webp'],roughness:.94,polygonOffset:inset,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  material.customProgramCacheKey=()=>`uetliberg-v2-${inset}`;
  material.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,uniforms);
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSurfaceWorld;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvSurfaceWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    varying vec3 vSurfaceWorld;
    uniform sampler2D floorColor, floorNormal, floorARM, trailColor, trailNormal, trailARM, surfaceMask;
    uniform vec4 worldExtent;
   `).replace('#include <map_fragment>',`#include <map_fragment>
    vec2 surfaceUv=(vSurfaceWorld.xz-worldExtent.xy)/worldExtent.zw;
    vec3 mask=texture2D(surfaceMask,surfaceUv).rgb;
    ${inset?'if(mask.g<.005) discard;':'if(mask.g>.45) discard;'}
    vec2 floorUv=vSurfaceWorld.xz/3.2;
    vec2 trailUv=vSurfaceWorld.xz/2.7;
    float nearSurface=1.0-smoothstep(110.0,260.0,distance(cameraPosition,vSurfaceWorld));
    ${meta.biome==='alpine'?'nearSurface*=mask.b;':''}
    vec3 groundColor=texture2D(floorColor,floorUv).rgb;
    vec3 pathColor=texture2D(trailColor,trailUv).rgb;
    vec3 localColor=mix(groundColor*.86,pathColor*vec3(.62,.51,.39),mask.r);
    diffuseColor.rgb=mix(diffuseColor.rgb,localColor,nearSurface);
   `).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
    vec3 packedSurface=mix(texture2D(floorARM,floorUv).rgb,texture2D(trailARM,trailUv).rgb,mask.r);
    roughnessFactor=mix(.96,clamp(packedSurface.g,.6,1.0),nearSurface);
   `).replace('#include <normal_fragment_maps>',`
    vec3 detailNormal=mix(texture2D(floorNormal,floorUv).xyz,texture2D(trailNormal,trailUv).xyz,mask.r)*2.0-1.0;
    detailNormal.xy*=.55*nearSurface;
    normal=normalize(getTangentFrame(-vViewPosition,normal,floorUv)*normalize(detailNormal));
   `).replace('#include <aomap_fragment>',`#include <aomap_fragment>
    reflectedLight.indirectDiffuse*=mix(1.0,packedSurface.r,.42*nearSurface);
   `);
  };
  return material;
 };
 // Use the same orthophoto base for both meshes. Close-up detail is in world metres.
 let ortho;
 baseTerrain.traverse(o=>{if(o.isMesh&&o.material.map)ortho=o.material.map});
 const baseMat=surfaceMaterial(ortho,false),insetMat=surfaceMaterial(ortho,true);
 baseTerrain.traverse(o=>{if(o.isMesh){o.material=baseMat;o.receiveShadow=true;o.geometry.deleteAttribute('tangent')}});
 corridor.scene.traverse(o=>{if(o.isMesh){o.material=insetMat;o.receiveShadow=true;o.geometry.deleteAttribute('tangent')}});scene.add(corridor.scene);
 const time={value:0},dummy=new THREE.Object3D();
 const bakeGeometry=o=>{
  const geometry=o.geometry.clone(),position=geometry.getAttribute('position'),data=new Float32Array(position.count*3);
  for(let i=0;i<position.count;i++){data[i*3]=position.getX(i);data[i*3+1]=position.getY(i);data[i*3+2]=position.getZ(i)}
  geometry.setAttribute('position',new THREE.BufferAttribute(data,3));geometry.applyMatrix4(o.matrixWorld);return geometry;
 };
 function instances(model,capacity,{wind=false,grass=false,shadow=true}={}){
  model.updateMatrixWorld(true);const batches=[];
  model.traverse(o=>{if(!o.isMesh)return;const mat=o.material.clone();
   const leafy=/leaf|leaves|cluster/i.test(mat.name);
   if(leafy){mat.transparent=false;mat.alphaTest=.38;mat.side=THREE.DoubleSide;mat.color.multiplyScalar(1.20);mat.emissive=new THREE.Color('#26351c');mat.emissiveIntensity=.16;mat.forceSinglePass=true;}
   if(grass){mat.side=THREE.DoubleSide;mat.roughness=.95;mat.color.set('#8b9a4f')}
   if(wind||grass)mat.onBeforeCompile=shader=>{shader.uniforms.windTime=time;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float windTime;').replace('#include <begin_vertex>',`#include <begin_vertex>
    float phase=instanceMatrix[3].x*.12+instanceMatrix[3].z*.09;
    float flex=${grass?'pow(clamp(position.y/.45,0.0,1.0),2.0)':'pow(clamp(position.y/14.0,0.0,1.0),2.0)'};
    transformed.x+=sin(windTime*1.1+phase+position.y)*flex*${grass?'.045':'.075'};
   `)};
   const batch=new THREE.InstancedMesh(bakeGeometry(o),mat,capacity);batch.count=0;batch.castShadow=shadow;batch.receiveShadow=true;batch.frustumCulled=false;batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(batch);batches.push(batch);
  });return batches;
 }
 function populate(batches,positions,{root=false}={}){
  for(const batch of batches){batch.count=positions.length;positions.forEach((p,i)=>{dummy.position.set(p[0],p[1],p[2]);dummy.rotation.set(0,root?-p[4]:p[4],0);dummy.scale.set(root?p[3]:p[3],root?1:p[3],root?1:p[3]);dummy.updateMatrix();batch.setMatrixAt(i,dummy.matrix)});batch.instanceMatrix.needsUpdate=true}
 }
 const treeCapacity=profile.detailedTrees;
 const treeBatches=instances(tree.scene,treeCapacity,{wind:true});
 const billboardGeometry=new THREE.PlaneGeometry(15.5*1024/1536,15.5);billboardGeometry.translate(0,7,0);
 const billboardMat=new THREE.MeshBasicMaterial({map:maps['tree-impostor.webp'],alphaTest:.3,side:THREE.DoubleSide,color:'#e8f1e5',fog:true});
 const distant=new THREE.InstancedMesh(billboardGeometry,billboardMat,forest.length);distant.frustumCulled=false;distant.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(distant);
 const decoration=[
  {data:decor.grass,batches:instances(grass.scene,profile.grassCount,{grass:true,shadow:false}),max:profile.grassCount,radius:profile.detailRadius*.7},
  {data:decor.ferns,batches:instances(fern.scene,profile.fernCount,{wind:false}),max:profile.fernCount,radius:profile.detailRadius*.85},
  {data:decor.rocks,batches:instances(rock.scene,260),max:260,radius:profile.detailRadius},
  {data:decor.roots,batches:instances(root.scene,60),max:60,radius:profile.detailRadius,root:true}
 ];
 let lastUpdate=-100;
 const near=(data,x,z,radius,max)=>data.map((p,index)=>({p,index,d:(p[0]-x)**2+(p[2]-z)**2})).filter(a=>a.d<radius*radius).sort((a,b)=>a.d-b.d).slice(0,max);
 return {
  update(camera,position,seconds,force=false){
   time.value=seconds;
   if(!force&&seconds-lastUpdate<(profile.tree==='mobile'?.48:.28))return;lastUpdate=seconds;
   const selected=near(forest,position.x,position.z,profile.detailRadius,treeCapacity),ids=new Set(selected.map(a=>a.index));populate(treeBatches,selected.map(a=>a.p));
   forest.forEach((p,i)=>{dummy.position.set(p[0],p[1],p[2]);dummy.rotation.set(0,Math.atan2(camera.position.x-p[0],camera.position.z-p[2]),0);dummy.scale.setScalar(ids.has(i)?0:p[3]);dummy.updateMatrix();distant.setMatrixAt(i,dummy.matrix)});distant.instanceMatrix.needsUpdate=true;
   for(const d of decoration)populate(d.batches,near(d.data,position.x,position.z,d.radius,d.max).map(a=>a.p),d);
  }
 };
}
