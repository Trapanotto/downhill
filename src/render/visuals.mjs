import * as THREE from 'three';
/** Local shader detail preserves the compact authored meshes and shared materials. */
export function finishBikeAndRider(player) {
  const materials = new Map();
  player.traverse(o => {
    if (!o.isMesh) return;
    const original = o.material;
    if (materials.has(original)) {
      o.material = materials.get(original);
      return;
    }
    const n = original.name.toLowerCase();
    let material = original;
    if (/copper frame|machined alloy|stanchion|goggle/.test(n)) {
      material = new THREE.MeshPhysicalMaterial();
      THREE.MeshStandardMaterial.prototype.copy.call(material, original);
      material.clearcoat = n.includes('frame') ? 0.45 : 0.12;
      material.clearcoatRoughness = 0.22;
      material.envMapIntensity = 1.1;
      material.roughness = Math.max(0.18, original.roughness);
    }
    if (/jersey|trousers/.test(n)) {
      material = original.clone();
      material.roughness = 0.94;
      material.onBeforeCompile = shader => {
        shader.vertexShader = 'varying vec3 vClothPosition;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvClothPosition=position;'
        );
        shader.fragmentShader = 'varying vec3 vClothPosition;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>\nfloat weave=sin(vClothPosition.x*430.0)*sin(vClothPosition.y*430.0);\nfloat weaveFade=1.0-smoothstep(5.0,12.0,length(vViewPosition));\nroughnessFactor=clamp(roughnessFactor+weave*.035*weaveFade,.7,1.0);\ndiffuseColor.rgb*=1.0+weave*.025*weaveFade;`
        );
      };
      material.customProgramCacheKey = () => 'woven-v4';
    }
    materials.set(original, material);
    o.material = material;
  });
}
