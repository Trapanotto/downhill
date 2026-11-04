import { PlacementIndex } from './performance.mjs';
import * as THREE from 'three';

/** All geometry, instance positions and photographic maps are loaded up front. */
export async function loadWorldV2({
  scene,
  renderer,
  loader,
  textures,
  asset,
  meta,
  forest,
  decor,
  profile,
  baseTerrain,
}) {
  const names = [
    'floor-color.webp',
    'floor-normal.webp',
    'floor-arm.webp',
    'trail-color.webp',
    'trail-normal.webp',
    'trail-arm.webp',
    'surface-mask.png',
    'tree-impostor-v4.webp',
  ];
  const maps = Object.fromEntries(
    await Promise.all(names.map(async n => [n, await textures.loadAsync(asset(n))]))
  );
  const [tree, corridor, fern, rock, root, grass] = await Promise.all(
    [
      'tree-v4-' + profile.tree + '.glb',
      'corridor-v4-' + profile.terrain + '.glb',
      'fern.glb',
      'rock.glb',
      'root.glb',
      'grass.glb',
    ].map(n => loader.loadAsync(asset(n)))
  );
  for (const [name, map] of Object.entries(maps)) {
    map.colorSpace =
      name.includes('color') || name.includes('impostor') ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (name.includes('mask')) {
      map.flipY = false;
      map.minFilter = THREE.LinearFilter;
      map.generateMipmaps = false;
    } else if (!name.includes('impostor')) {
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
  }
  const extent = new THREE.Vector4(
    meta.bounds[0] - meta.origin[0],
    meta.origin[1] - meta.bounds[3],
    meta.bounds[2] - meta.bounds[0],
    meta.bounds[3] - meta.bounds[1]
  );
  const uniforms = {
    floorColor: { value: maps['floor-color.webp'] },
    floorNormal: { value: maps['floor-normal.webp'] },
    floorARM: { value: maps['floor-arm.webp'] },
    trailColor: { value: maps['trail-color.webp'] },
    trailNormal: { value: maps['trail-normal.webp'] },
    trailARM: { value: maps['trail-arm.webp'] },
    surfaceMask: { value: maps['surface-mask.png'] },
    worldExtent: { value: extent },
  };
  const lodUniforms = {
    riderXZ: { value: new THREE.Vector2() },
    lodXZ: { value: new THREE.Vector2() },
    tileOrigin: { value: new THREE.Vector2(extent.x, extent.y) },
    farStart: { value: 500 },
    corridorRange: { value: profile.terrain === 'high' ? 200 : 135 },
  };
  const surfaceMaterial = (ortho, inset, far = false) => {
    const material = new THREE.MeshStandardMaterial({
      map: ortho,
      normalMap: maps['floor-normal.webp'],
      roughness: 0.94,
      polygonOffset: inset,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    material.customProgramCacheKey = () => `trail-v4-${inset}-${far}`;
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms, lodUniforms);
      if (inset) shader.vertexShader = 'attribute vec2 trackUv; varying vec2 vTrack;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSurfaceWorld;')
        .replace(
          '#include <worldpos_vertex>',
          '#include <worldpos_vertex>\nvSurfaceWorld=(modelMatrix*vec4(transformed,1.0)).xyz;' +
            (inset ? '\nvTrack=trackUv;' : '')
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
    varying vec3 vSurfaceWorld;
    ${inset ? 'varying vec2 vTrack;' : ''}
    uniform sampler2D floorColor, floorNormal, floorARM, trailColor, trailNormal, trailARM, surfaceMask;
    uniform vec4 worldExtent; uniform vec2 riderXZ,lodXZ,tileOrigin; uniform float farStart,corridorRange;
   `
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
    vec2 surfaceUv=(vSurfaceWorld.xz-worldExtent.xy)/worldExtent.zw;
    vec3 mask=texture2D(surfaceMask,surfaceUv).rgb;
    float surfaceDistance=distance(riderXZ,vSurfaceWorld.xz);
    float corridorBlend=1.0-smoothstep(corridorRange-28.0,corridorRange,surfaceDistance);
    float stipple=fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(.06711056,.00583715))));
    ${far ? 'vec2 tileCenter=floor((vSurfaceWorld.xz-tileOrigin)/128.0)*128.0+tileOrigin+64.0; if(distance(tileCenter,lodXZ)<farStart) discard;' : ''}
    ${inset ? 'if(mask.g<.005||corridorBlend<=stipple) discard;' : 'if(mask.g>.45&&corridorBlend>stipple) discard;'}
    vec2 floorUv=vSurfaceWorld.xz/3.2;
    vec2 trailUv=vSurfaceWorld.xz/2.7;
    float nearSurface=1.0-smoothstep(110.0,260.0,distance(cameraPosition,vSurfaceWorld));
    ${meta.biome === 'alpine' ? 'nearSurface*=mask.b;' : ''}
    vec3 groundColor=texture2D(floorColor,floorUv).rgb;
    vec3 pathColor=texture2D(trailColor,trailUv).rgb;
    vec3 localColor=mix(groundColor*.86,pathColor*vec3(.62,.51,.39),mask.r);
    ${inset ? 'float lateral=(vTrack.x-.5)*12.0; float rut=exp(-pow((abs(lateral)-.55)/.19,2.0)); localColor*=1.0-.24*rut*mask.r;' : ''}
    diffuseColor.rgb=mix(diffuseColor.rgb,localColor,nearSurface);
   `
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
    vec3 packedSurface=mix(texture2D(floorARM,floorUv).rgb,texture2D(trailARM,trailUv).rgb,mask.r);
    roughnessFactor=mix(.96,clamp(packedSurface.g,.6,1.0),nearSurface);
   `
        )
        .replace(
          '#include <normal_fragment_maps>',
          `
    vec3 detailNormal=mix(texture2D(floorNormal,floorUv).xyz,texture2D(trailNormal,trailUv).xyz,mask.r)*2.0-1.0;
    detailNormal.xy*=.55*nearSurface;
    normal=normalize(getTangentFrame(-vViewPosition,normal,floorUv)*normalize(detailNormal));
   `
        )
        .replace(
          '#include <aomap_fragment>',
          `#include <aomap_fragment>
    reflectedLight.indirectDiffuse*=mix(1.0,packedSurface.r,.42*nearSurface);
   `
        );
    };
    return material;
  };
  // Use the same orthophoto base for both meshes. Close-up detail is in world metres.
  let ortho;
  baseTerrain.traverse(o => {
    if (o.isMesh && o.material.map) ortho = o.material.map;
  });
  const baseMat = surfaceMaterial(ortho, false),
    farMat = surfaceMaterial(ortho, false, true),
    insetMat = surfaceMaterial(ortho, true),
    terrainChunks = [],
    trailChunks = [];
  baseTerrain.traverse(o => {
    if (o.isMesh) {
      o.material = o.userData.terrainTier === 2 ? farMat : baseMat;
      terrainChunks.push(o);
      o.receiveShadow = true;
      o.geometry.deleteAttribute('tangent');
    }
  });
  corridor.scene.traverse(o => {
    if (o.isMesh) {
      o.material = insetMat;
      trailChunks.push(o);
      o.receiveShadow = true;
      o.geometry.deleteAttribute('tangent');
      o.geometry.setAttribute('trackUv', o.geometry.getAttribute('uv1'));
    }
  });
  scene.add(corridor.scene);
  baseTerrain.updateMatrixWorld(true);
  corridor.scene.updateMatrixWorld(true);
  for (const o of [...terrainChunks, ...trailChunks]) {
    o.matrixAutoUpdate = false;
    o.matrixWorldAutoUpdate = false;
    o.geometry.computeBoundingSphere();
    o.frustumCulled = true;
  }
  const time = { value: 0 },
    dummy = new THREE.Object3D();
  const nearFade = new THREE.InstancedBufferAttribute(new Float32Array(profile.detailedTrees), 1),
    farFade = new THREE.InstancedBufferAttribute(new Float32Array(forest.length).fill(1), 1);
  const bakeGeometry = o => {
    const geometry = o.geometry.clone(),
      position = geometry.getAttribute('position'),
      data = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      data[i * 3] = position.getX(i);
      data[i * 3 + 1] = position.getY(i);
      data[i * 3 + 2] = position.getZ(i);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(data, 3));
    geometry.applyMatrix4(o.matrixWorld);
    return geometry;
  };
  function instances(model, capacity, { wind = false, grass = false, shadow = true, tree = false } = {}) {
    model.updateMatrixWorld(true);
    const batches = [];
    model.traverse(o => {
      if (!o.isMesh) return;
      const mat = o.material.clone();
      const leafy = /leaf|leaves|cluster/i.test(mat.name);
      if (leafy) {
        mat.transparent = false;
        mat.alphaTest = 0.38;
        mat.side = THREE.DoubleSide;
        mat.color.multiplyScalar(1.12);
        mat.emissive = new THREE.Color('#5d7350');
        mat.emissiveMap = mat.map;
        mat.emissiveIntensity = 0.26;
        mat.forceSinglePass = true;
      }
      if (grass) {
        mat.side = THREE.DoubleSide;
        mat.roughness = 0.95;
        mat.color.set('#8b9a4f');
      }
      if (wind || grass)
        mat.onBeforeCompile = shader => {
          shader.uniforms.windTime = time;
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float windTime;')
            .replace(
              '#include <begin_vertex>',
              `#include <begin_vertex>
    float phase=instanceMatrix[3].x*.12+instanceMatrix[3].z*.09;
    float flex=${grass ? 'pow(clamp(position.y/.45,0.0,1.0),2.0)' : 'pow(clamp(position.y/14.0,0.0,1.0),2.0)'};
    transformed.x+=sin(windTime*1.1+phase+position.y)*flex*${grass ? '.045' : '.075'};
   `
            );
        };
      const geometry = bakeGeometry(o);
      if (tree) {
        geometry.setAttribute('detailFade', nearFade);
        const before = mat.onBeforeCompile;
        mat.onBeforeCompile = shader => {
          before?.(shader);
          fadeShader(shader);
        };
      }
      const batch = new THREE.InstancedMesh(geometry, mat, capacity);
      batch.count = 0;
      batch.castShadow = shadow;
      batch.receiveShadow = true;
      batch.frustumCulled = false;
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(batch);
      batches.push(batch);
    });
    return batches;
  }
  function populate(batches, positions, { root = false } = {}) {
    for (const batch of batches) {
      batch.count = positions.length;
      positions.forEach((p, i) => {
        dummy.position.set(p[0], p[1], p[2]);
        dummy.rotation.set(0, root ? -p[4] : p[4], 0);
        dummy.scale.set(root ? p[3] : p[3], root ? 1 : p[3], root ? 1 : p[3]);
        dummy.updateMatrix();
        batch.setMatrixAt(i, dummy.matrix);
      });
      batch.instanceMatrix.needsUpdate = true;
    }
  }
  function fadeShader(shader, inverse = false) {
    shader.vertexShader = 'attribute float detailFade; varying float vDetailFade;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvDetailFade=detailFade;'
    );
    shader.fragmentShader = 'varying float vDetailFade;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <alphatest_fragment>',
      '#include <alphatest_fragment>\nfloat dither=fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(.06711056,.00583715)))); if(vDetailFade<=' +
        (inverse ? '1.0-dither' : 'dither') +
        ') discard;'
    );
  }
  const treeCapacity = profile.detailedTrees;
  const treeBatches = instances(tree.scene, treeCapacity, {
    wind: true,
    tree: true,
    shadow: profile.tree === 'high',
  });
  const billboardGeometry = new THREE.PlaneGeometry((15.5 * 1024) / 1536, 15.5);
  billboardGeometry.translate(0, 7, 0);
  const billboardMat = new THREE.MeshBasicMaterial({
    map: maps['tree-impostor-v4.webp'],
    alphaTest: 0.3,
    side: THREE.DoubleSide,
    color: '#e8f1e5',
    fog: true,
  });
  billboardGeometry.setAttribute('detailFade', farFade);
  billboardMat.onBeforeCompile = shader => {
    fadeShader(shader, true);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `
vec3 center=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
vec3 right=normalize(vec3(viewMatrix[0][0],0.0,viewMatrix[2][0]));
float treeScale=length(instanceMatrix[0].xyz);
vec4 mvPosition=viewMatrix*vec4(center+right*position.x*treeScale+vec3(0.0,position.y*treeScale,0.0),1.0);
gl_Position=projectionMatrix*mvPosition;`
    );
  };
  const distant = new THREE.InstancedMesh(billboardGeometry, billboardMat, forest.length);
  distant.frustumCulled = false;
  distant.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(distant);
  forest.forEach((p, i) => {
    dummy.position.set(p[0], p[1], p[2]);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(p[3]);
    dummy.updateMatrix();
    distant.setMatrixAt(i, dummy.matrix);
  });
  distant.instanceMatrix.needsUpdate = true;
  const decoration = [
    {
      data: decor.grass,
      batches: instances(grass.scene, profile.grassCount, { grass: true, shadow: false }),
      max: profile.grassCount,
      radius: profile.detailRadius * 0.7,
    },
    {
      data: decor.ferns,
      batches: instances(fern.scene, profile.fernCount, { wind: false, shadow: profile.tree === 'high' }),
      max: profile.fernCount,
      radius: profile.detailRadius * 0.85,
    },
    { data: decor.rocks, batches: instances(rock.scene, 260), max: 260, radius: profile.detailRadius },
    {
      data: decor.roots,
      batches: instances(root.scene, 60),
      max: 60,
      radius: profile.detailRadius,
      root: true,
    },
  ];
  let lastUpdate = -100,
    budgetLevel = 0;
  const indexCache = new Map(),
    frustum = new THREE.Frustum(),
    projection = new THREE.Matrix4(),
    sphere = new THREE.Sphere();
  const near = (data, x, z, radius, max, visible = null) => {
    if (!indexCache.has(data)) indexCache.set(data, new PlacementIndex(data));
    return indexCache.get(data).near(x, z, radius, max, visible);
  };

  return {
    setBudget(level) {
      budgetLevel = level;
      lastUpdate = -100;
      for (const b of treeBatches) b.castShadow = profile.tree === 'high' && level < 3;
    },
    update(camera, position, seconds, force = false) {
      time.value = seconds;
      lodUniforms.riderXZ.value.set(position.x, position.z);
      if (!force && seconds - lastUpdate < (profile.tree === 'mobile' ? 0.48 : 0.28)) return;
      lastUpdate = seconds;
      lodUniforms.lodXZ.value.set(position.x, position.z);
      const nearDistance = profile.terrain === 'high' ? 240 : 190;
      for (const o of terrainChunks) {
        const tier = o.userData.terrainTier;
        if (tier === 2) {
          o.visible = true;
          continue;
        }
        const distance = Math.hypot(o.userData.centerX - position.x, o.userData.centerZ - position.z);
        o.visible = tier === 0 ? distance < nearDistance : distance >= nearDistance && distance < 500;
      }
      for (const o of trailChunks)
        o.visible =
          Math.hypot(o.userData.centerX - position.x, o.userData.centerZ - position.z) <
          lodUniforms.corridorRange.value + 100;
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(
        projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      );
      const radius = profile.detailRadius * Math.pow(0.88, budgetLevel),
        capacity = Math.max(24, Math.floor(treeCapacity * Math.pow(0.72, budgetLevel)));
      const visible = p => {
        if ((p[0] - camera.position.x) ** 2 + (p[2] - camera.position.z) ** 2 < 144) return true;
        sphere.center.set(p[0], p[1] + 7 * p[3], p[2]);
        sphere.radius = 9 * p[3];
        return frustum.intersectsSphere(sphere);
      };
      const selected = near(forest, position.x, position.z, radius, capacity, visible),
        ids = new Map();
      const limit = selected.length === capacity ? Math.min(radius, Math.sqrt(selected.at(-1).d)) : radius;
      selected.forEach((a, i) => {
        const t = THREE.MathUtils.clamp((limit - Math.sqrt(a.d)) / 12, 0, 1),
          fade = t * t * (3 - 2 * t);
        nearFade.array[i] = fade;
        ids.set(a.index, fade);
      });
      nearFade.needsUpdate = true;
      populate(
        treeBatches,
        selected.map(a => a.p)
      );
      forest.forEach((p, i) => {
        farFade.array[i] = 1 - (ids.get(i) || 0);
      });
      farFade.needsUpdate = true;
      for (const d of decoration)
        populate(
          d.batches,
          near(
            d.data,
            position.x,
            position.z,
            d.radius * Math.pow(0.9, budgetLevel),
            Math.max(12, Math.floor(d.max * Math.pow(0.72, budgetLevel))),
            visible
          ).map(a => a.p),
          d
        );
    },
  };
}
