import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

/** Uetliberg: low warm evening sun through beech forest. Lenzerheide: crisp, high alpine light. */
export const LIGHTING = {
  // Low side light from the west: long shadows across the trail, warm highlights, cool shade.
  uetliberg: {
    sun: new THREE.Vector3(-170, 75, -20),
    sunColor: '#ffcf96',
    sunIntensity: 4.2,
    sky: '#d6e4ff',
    ground: '#4d5034',
    hemisphere: 0.45,
    environment: 0.3,
    fog: '#b9c9cf',
    fogDensity: 0.0007,
    exposure: 0.95,
    turbidity: 2.2,
    rayleigh: 2.6,
  },
  lenzerheide: {
    sun: new THREE.Vector3(-80, 170, 120),
    sunColor: '#fff2e2',
    sunIntensity: 4.0,
    sky: '#dbe9ff',
    ground: '#566047',
    hemisphere: 0.55,
    environment: 0.35,
    fog: '#a9c2da',
    fogDensity: 0.00016,
    exposure: 0.82,
    turbidity: 2.0,
    rayleigh: 2.2,
  },
};

export function createRenderer(canvas, { touch, quality, profile }) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !touch,
    powerPreference: 'high-performance',
  });
  const baseDpr = Math.min(devicePixelRatio, profile.dpr);
  renderer.setPixelRatio(baseDpr);
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.enabled = quality !== 'mobile';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return { renderer, baseDpr };
}

/** Scene, sky, image-based light and the rider-following sun for one region. */
export function createScene(renderer, regionId, profile) {
  const alpine = regionId === 'lenzerheide',
    light = alpine ? LIGHTING.lenzerheide : LIGHTING.uetliberg;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(light.fog);
  // Distance haze in the sky's horizon colour makes the real valley distances readable.
  scene.fog = new THREE.FogExp2(light.fog, light.fogDensity);
  renderer.toneMappingExposure = light.exposure;
  const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.12, 6500);

  const sky = new Sky();
  sky.scale.setScalar(6000);
  const skyU = sky.material.uniforms;
  skyU.rayleigh.value = light.rayleigh;
  skyU.mieCoefficient.value = 0.003;
  skyU.mieDirectionalG.value = 0.8;
  skyU.turbidity.value = light.turbidity;
  skyU.sunPosition.value.copy(light.sun).multiplyScalar(10);
  scene.add(sky);

  const environmentScene = new THREE.Scene();
  environmentScene.add(sky.clone());
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(environmentScene, 0.04).texture;
  scene.environmentIntensity = light.environment;
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(light.sky, light.ground, light.hemisphere));
  const sun = new THREE.DirectionalLight(light.sunColor, light.sunIntensity);
  sun.position.copy(light.sun);
  sun.userData.offset = light.sun.clone();
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(profile.shadow);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 350 });
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.08;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  return { scene, camera, sun };
}
