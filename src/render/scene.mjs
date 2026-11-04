import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.enabled = quality !== 'mobile';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return { renderer, baseDpr };
}

/** Scene, sky, image-based light and the rider-following sun for one region. */
export function createScene(renderer, regionId, profile) {
  const alpine = regionId === 'lenzerheide';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(alpine ? '#c7dbe8' : '#c5d6d0');
  scene.fog = new THREE.FogExp2(alpine ? '#c8dae4' : '#bfcfbd', alpine ? 0.00024 : 0.00065);
  const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.12, 6500);

  const sky = new Sky();
  sky.scale.setScalar(6000);
  const skyU = sky.material.uniforms;
  skyU.turbidity.value = 3;
  skyU.rayleigh.value = 1.7;
  skyU.mieCoefficient.value = 0.003;
  skyU.mieDirectionalG.value = 0.8;
  skyU.sunPosition.value.set(-1600, alpine ? 2200 : 1350, 800);
  scene.add(sky);

  const environmentScene = new THREE.Scene();
  environmentScene.add(sky.clone());
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(environmentScene, 0.04).texture;
  scene.environmentIntensity = 0.45;
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight('#e0edff', '#526047', 1.0));
  const sun = new THREE.DirectionalLight(alpine ? '#fff0df' : '#ffe0b4', 2.8);
  sun.position.set(-90, 160, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(profile.shadow);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 350 });
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.08;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  return { scene, camera, sun };
}
