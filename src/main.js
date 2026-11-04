import './style.css';
import { version as ASSET_VERSION } from '../package.json';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { REGIONS, getSelection, assetPath, recordKeys, selectionUrl } from './core/regions.mjs';
import { storage } from './core/storage.mjs';
import { $, show, toast, setLoading, dialog, closePanel } from './core/dom.mjs';
import { isTouchDevice, QUALITY_PROFILES } from './core/quality.mjs';
import { InputController } from './core/input.mjs';
import { FrameBudget } from './core/performance.mjs';
import { saveOffline } from './core/offline.mjs';
import { HeightField, BikePhysics, TrailTracker, surfaceDetails, formatTime } from './sim/physics.mjs';
import { ObstacleWorld } from './sim/collisions.mjs';
import { normalizeSetup, SETUP_PRESETS, setupLabel, setupSignature } from './sim/setup.mjs';
import { createRenderer, createScene } from './render/scene.mjs';
import { PostFX } from './render/postfx.mjs';
import { createContactShadow, DustParticles } from './render/effects.mjs';
import { RideCamera, CAMERA_MODES } from './render/camera.mjs';
import { CrashTumble } from './render/ragdoll.mjs';
import { RiderAnimator } from './render/rider.mjs';
import { SkidMarks, RideFeedback } from './render/feedback.mjs';
import { finishBikeAndRider } from './render/visuals.mjs';
import { loadWorldV2 } from './render/world.js';
import { trailsideDecor } from './render/undergrowth.mjs';
import { buildCourse, Waypoint } from './gameplay/course.mjs';
import { GhostRider, ghostFrame } from './gameplay/ghost.mjs';
import { FlowMeter } from './gameplay/flow.mjs';
import { RideAudio } from './audio/audio.mjs';
import { updateHud, updateNavigation, showSplit, updateRideAids, callout } from './ui/hud.mjs';
import { Minimap } from './ui/minimap.mjs';
import * as panels from './ui/panels.mjs';

const PHYSICS_STEP = 1 / 120;
const base = import.meta.env.BASE_URL;
const touch = isTouchDevice();
if (touch) document.body.classList.add('touch-device');

const selected = getSelection(
  location.search,
  storage.get('selected-region', 'uetliberg'),
  storage.get('selected-line', 'flow')
);
const asset = name => base + assetPath(selected, name) + '?v=' + ASSET_VERSION;

// Settings
let quality = storage.get('quality', touch ? 'mobile' : 'high'),
  sensitivity = storage.get('sensitivity', 1),
  soundEnabled = storage.get('sound', false),
  autoPedal = storage.get('autoPedal', touch),
  showPerformance = storage.get('show-performance', false);
if (!QUALITY_PROFILES[quality]) quality = touch ? 'mobile' : 'high';
const profile = { ...QUALITY_PROFILES[quality] };

// Records
let bikeSetup = normalizeSetup(storage.get('bike-setup', {})),
  records = recordKeys(selected, bikeSetup),
  runBest = storage.get(records.best, null),
  ghostSaved = storage.get(records.ghost, null),
  bestSplits = storage.get(records.splits, []);

// World and rig
let renderer, baseDpr, scene, camera, sun, region, trail, terrain, bike, tracker, collisions, worldV2;
let player, rider, riderAnimator, frontWheel, rearWheel, frontFork, shadow;
let dust, skidMarks, waypoint, ghost, minimap, audio, postfx, tumble;
const input = new InputController(),
  rideView = new RideCamera(),
  feedback = new RideFeedback(),
  flow = new FlowMeter(),
  frameBudget = new FrameBudget(),
  heroTarget = new THREE.Vector3(),
  heroLook = new THREE.Vector3();

// Run state
let state = 'loading',
  mode = 'race',
  ready = false,
  cameraMode = CAMERA_MODES.includes(storage.get('camera-mode', 'near'))
    ? storage.get('camera-mode', 'near')
    : 'near',
  crashShown = false;
let elapsed = 0,
  accumulator = 0,
  lastTime = 0,
  heroTime = 0,
  rigAccumulator = 0,
  nearestIndex = 0,
  nearDistance = 0;
let lastLandingSerial = 0,
  lastPopSerial = 0,
  lastPumpSerial = 0,
  lastPumpCallout = -10,
  crashTimeout,
  runAir = 0,
  totalAir = 0,
  crashes = 0,
  ghostRecord = [],
  lastGhostT = 0,
  runSplits = [];
let frameCount = 0,
  frameTotal = 0;

function changeRegion(id, line = 'flow') {
  storage.set('selected-region', id);
  storage.set('selected-line', line);
  location.assign(selectionUrl(base, id, line));
}

function configureRegionMenu() {
  document.title = 'Trapanotto Downhill Biking — ' + selected.label;
  $('world').setAttribute('aria-label', '3D Downhill-Spiel in ' + selected.label);
  $('load-caption').textContent = selected.caption;
  $('location-name').textContent = selected.place;
  $('location-time').textContent = selected.id === 'lenzerheide' ? 'ALPINE FLOW' : 'GOLDEN HOUR';
  $('region-eyebrow').textContent = selected.number + ' / ' + selected.tagline;
  $('route-location').textContent = selected.location;
  $('route-title').textContent = selected.title;
  $('run-title').textContent = selected.title;
  $('route-number').textContent = selected.number;
  $('route-difficulty').textContent = selected.difficulty;
  $('start-coordinates').innerHTML = selected.coordinates;
  for (const option of Object.values(REGIONS)) {
    const button = document.createElement('button');
    button.textContent = option.number + ' / ' + option.label.toUpperCase();
    button.className = option.id === selected.id ? 'selected' : '';
    button.setAttribute('aria-pressed', String(option.id === selected.id));
    button.onclick = () => {
      if (option.id !== selected.id) changeRegion(option.id);
    };
    $('region-picker').append(button);
  }
  show('line-picker', selected.id === 'lenzerheide');
  for (const button of $('line-picker').querySelectorAll('button')) {
    const active = button.dataset.line === selected.line;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
    button.onclick = () => {
      if (!active) changeRegion('lenzerheide', button.dataset.line);
    };
  }
}

function refreshBest() {
  $('menu-best').textContent = runBest ? formatTime(runBest) : 'NOCH KEIN RUN';
}

function chooseMode(next) {
  mode = next;
  $('mode-race').classList.toggle('selected', mode === 'race');
  $('mode-free').classList.toggle('selected', mode === 'free');
  $('start').querySelector('span').textContent = mode === 'race' ? 'ABFAHRT STARTEN' : 'BERG ERKUNDEN';
}

function showMenu() {
  state = 'menu';
  clearTimeout(crashTimeout);
  tumble?.stop();
  show('performance-hud', false);
  input.clearKeys();
  show('menu', true);
  show('header', true);
  show('hud', false);
  show('touch', false);
  show('minimap', false);
  show('crash', false);
  show('countdown', false);
  $('vignette').style.opacity = '1';
  if (player) {
    bike.reset();
    syncPlayer();
  }
  ghost?.hide();
  if (waypoint) waypoint.visible = false;
  refreshBest();
}

// ---------------------------------------------------------------------------
// Loading

async function loadAssets(loader, texLoader) {
  const json = async name => {
    const r = await fetch(asset(name));
    if (!r.ok) throw Error(name + ': ' + r.status);
    return r.json();
  };
  const binary = (name, message) =>
    fetch(asset(name)).then(r => {
      if (!r.ok) throw Error(message);
      return r.arrayBuffer();
    });
  const glb = name => loader.loadAsync(asset(name));
  const [
    regionMeta,
    trailData,
    forest,
    heights,
    terrainModel,
    bikeModel,
    landmark,
    ortho,
    surface,
    decor,
    detailMeta,
    detailData,
    riderModel,
  ] = await Promise.all([
    json('region.json'),
    json('trail.json'),
    json('forest.json'),
    binary('height.bin', 'Höhendaten fehlen'),
    glb(`terrain-v4-${profile.terrain}.glb`),
    glb('bike-v4.glb'),
    glb('landmark.glb'),
    texLoader.loadAsync(asset(`${selected.ortho}-${profile.texture}.webp`)),
    binary('surface.bin', 'Fahrflächen fehlen'),
    json('decor.json'),
    json('surface-details.json'),
    binary('surface-details.bin', 'Streckendetails fehlen'),
    glb('rider-v4.glb'),
  ]);
  return {
    regionMeta,
    trailData,
    forest,
    heights,
    terrainModel,
    bikeModel,
    landmark,
    ortho,
    surface,
    decor,
    detailMeta,
    detailData,
    riderModel,
  };
}

const enableShadows = root =>
  root.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

function setupPlayer(bikeModel, riderModel) {
  player = bikeModel.scene;
  enableShadows(player);
  finishBikeAndRider(player);
  scene.add(player);
  player.updateMatrixWorld(true);
  const pivot = (name, x, y, z) => {
    const node = player.getObjectByName(name);
    if (!node) return null;
    const group = new THREE.Group();
    group.name = name + 'Pivot';
    group.position.set(x, y, z);
    player.add(group);
    group.attach(node);
    return group;
  };
  frontWheel = pivot('WheelFront', 0, 0.42, -0.72);
  rearWheel = pivot('WheelRear', 0, 0.42, 0.72);
  frontFork = pivot('SuspensionFork', 0, 0.8, -0.6);
  const handlebar = pivot('Handlebar', 0, 1.07, -0.49),
    crank = pivot('Crank', 0, 0.48, 0.18);
  rider = riderModel.scene;
  rider.name = 'RiderVisual';
  player.add(rider);
  player.updateMatrixWorld(true);
  ghost = new GhostRider(scene, cloneSkeleton(player));
  riderAnimator = new RiderAnimator(player, rider, {
    crank,
    pedalL: player.getObjectByName('PedalL'),
    pedalR: player.getObjectByName('PedalR'),
    handlebar,
  });
}

async function addPanorama(loader) {
  const panorama = await loader.loadAsync(asset('panorama-v4.glb'));
  panorama.scene.traverse(o => {
    if (o.isMesh) {
      o.material = new THREE.MeshStandardMaterial({
        map: o.material.map || null,
        vertexColors: !o.material.map,
        roughness: 1,
      });
      o.receiveShadow = false;
    }
  });
  scene.add(panorama.scene);
}

function exposeDebugHandle() {
  window.__TRAPANOTTO__ = {
    get state() {
      return state;
    },
    get bike() {
      return bike;
    },
    get terrain() {
      return terrain;
    },
    get trail() {
      return trail;
    },
    get tracker() {
      return tracker;
    },
    get renderer() {
      return renderer;
    },
    get profile() {
      return profile;
    },
    get scene() {
      return scene;
    },
    get postfx() {
      return postfx;
    },
    get sun() {
      return sun;
    },
    start: startRun,
    respawn,
    showMenu,
  };
}

async function init() {
  try {
    ({ renderer, baseDpr } = createRenderer($('world'), { touch, quality, profile }));
    ({ scene, camera, sun } = createScene(renderer, selected.id, profile));
    postfx = new PostFX(renderer, scene, camera, { tier: quality, region: selected.id });
    setLoading(0.08, 'DIE LANDSCHAFT LÄDT.');
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_, done, total) => setLoading(0.12 + 0.76 * (done / total));
    const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
    const texLoader = new THREE.TextureLoader(manager);
    const data = await loadAssets(loader, texLoader);

    region = data.regionMeta;
    trail = data.trailData;
    terrain = new HeightField(
      region,
      new Float32Array(data.heights),
      new Uint8Array(data.surface),
      data.decor.roots,
      surfaceDetails(data.detailMeta, new Int16Array(data.detailData))
    );
    bike = new BikePhysics(terrain, trail, bikeSetup);
    tracker = new TrailTracker(trail);
    collisions = new ObstacleWorld(data.forest, data.decor);
    minimap = new Minimap($('minimap'), trail);

    const ortho = data.ortho;
    ortho.colorSpace = THREE.SRGBColorSpace;
    ortho.flipY = false;
    ortho.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const groundMat = new THREE.MeshStandardMaterial({ map: ortho, roughness: 0.96 });
    data.terrainModel.scene.traverse(o => {
      if (o.isMesh) {
        o.material = groundMat;
        o.receiveShadow = true;
      }
    });
    scene.add(data.terrainModel.scene);

    setLoading(0.55, 'DER WALD WIRD BEREIT.');
    const trailside = trailsideDecor(trail, terrain, { alpine: region.biome === 'alpine' }),
      visualDecor = {
        ...data.decor,
        grass: [...data.decor.grass, ...trailside.grass],
        ferns: [...data.decor.ferns, ...trailside.ferns],
      };
    worldV2 = await loadWorldV2({
      scene,
      renderer,
      loader,
      textures: texLoader,
      asset,
      meta: region,
      forest: data.forest,
      decor: visualDecor,
      profile,
      baseTerrain: data.terrainModel.scene,
    });
    setupPlayer(data.bikeModel, data.riderModel);
    if (selected.id === 'lenzerheide') await addPanorama(loader);
    enableShadows(data.landmark.scene);
    scene.add(data.landmark.scene);
    shadow = createContactShadow(scene);
    buildCourse({ scene, terrain, collisions, trail, title: selected.title });
    waypoint = new Waypoint(scene);
    dust = new DustParticles(scene);
    ghost.load(ghostSaved);
    skidMarks = new SkidMarks(scene, terrain, touch ? 100 : 220);
    tumble = new CrashTumble(scene, terrain);

    $('route-length').textContent = (Math.round(trail.length / 10) / 100).toFixed(2);
    $('route-drop').textContent = trail.drop;
    $('summit-alt').innerHTML = Math.round(trail.points[0][1] + region.heightOrigin) + '<span>m</span>';
    setLoading(0.98, 'DEINE LINIE IST BEREIT.');
    syncPlayer();
    heroCamera(0, true);
    worldV2.update(camera, bike, 0, true);
    renderer.compile(scene, camera);
    postfx.render();
    await new Promise(r => requestAnimationFrame(r));
    ready = true;
    $('bike-setup-label').textContent = setupLabel(bikeSetup);
    $('loader').style.transition = 'opacity .6s';
    $('loader').style.opacity = '0';
    setTimeout(() => $('loader').remove(), 650);
    showMenu();
    lastTime = performance.now();
    requestAnimationFrame(animate);
    if (import.meta.env.PROD && 'serviceWorker' in navigator)
      navigator.serviceWorker.register(base + 'sw.js').catch(() => {});
    exposeDebugHandle();
  } catch (error) {
    console.error(error);
    setLoading(1, 'DAS LADEN WURDE UNTERBROCHEN.');
    $('load-caption').textContent =
      'Bitte Seite erneut laden. ' + (error?.message || 'Eine Spieldatei konnte nicht geladen werden.');
    $('retry').hidden = false;
    $('retry').onclick = () => location.reload();
  }
}

// ---------------------------------------------------------------------------
// Per-frame presentation

function syncPlayer(dt = 0, throttle = 0) {
  if (!player) return;
  const heave = (bike.frontCompression + bike.rearCompression) * 0.5;
  player.position.set(bike.x, bike.y - heave, bike.z);
  player.rotation.set(0, bike.yaw, 0);
  player.rotateX(bike.pitch + (bike.rearCompression - bike.frontCompression) * 0.5);
  player.rotateZ(bike.lean);
  // Whip: the bike is thrown sideways under the rider in the air.
  player.rotateY(bike.whip * 0.9);
  player.rotateZ(bike.whip * 0.3);
  if (rider) rider.visible = cameraMode !== 'helmet' || state === 'menu';
  if (frontWheel) {
    frontWheel.position.y = 0.42 + heave;
    rearWheel.position.y = 0.42 + heave;
    frontWheel.rotation.y = -bike.steer * 0.23;
  }
  if (frontFork) {
    frontFork.scale.y = 1 - bike.frontCompression * 0.65;
    frontFork.rotation.y = -bike.steer * 0.1;
  }
  rigAccumulator += dt;
  if (!touch || dt === 0 || rigAccumulator >= 1 / 30) {
    riderAnimator?.update(bike, rigAccumulator, Number(throttle));
    rigAccumulator = 0;
  }
  if (shadow) {
    const ground = terrain.sample(bike.x, bike.z);
    shadow.position.set(bike.x, ground + 0.13, bike.z);
    shadow.rotation.z = -bike.yaw;
    shadow.material.opacity = Math.max(0, 0.45 - (bike.y - ground) * 0.12);
  }
  sun.position.set(bike.x, bike.y, bike.z).add(sun.userData.offset);
  sun.target.position.set(bike.x, bike.y, bike.z);
  sun.target.updateMatrixWorld();
}

function heroCamera(dt, instant = false) {
  heroTime += dt;
  const angle = 0.55 + Math.sin(heroTime * 0.07) * 0.11,
    dist = 8.1;
  heroTarget.set(bike.x + Math.sin(angle) * dist, bike.y + 2.65, bike.z + Math.cos(angle) * dist);
  heroTarget.y = Math.max(heroTarget.y, terrain.sample(heroTarget.x, heroTarget.z) + 1.8);
  if (instant) camera.position.copy(heroTarget);
  else camera.position.lerp(heroTarget, 1 - Math.exp(-dt * 2));
  heroLook.set(bike.x - 2.6, bike.y + 1.2, bike.z - 1);
  camera.lookAt(heroLook);
}

function rideCamera(dt, instant = false) {
  rideView.update(camera, bike, trail, nearestIndex, terrain, collisions, dt, cameraMode, instant);
}

function refreshHud() {
  const context = { bike, region, trail, tracker, elapsed, nearestIndex };
  updateHud(context);
  minimap.draw(bike, nearestIndex, tracker.next);
  updateNavigation({ ...context, waypoint, ghostTrace: ghost.trace });
}

function recordGhost() {
  ghostRecord.push(
    ghostFrame({
      elapsed,
      bike,
      progress: nearestIndex / (trail.points.length - 1),
      pedalPhase: riderAnimator.phase,
      wheelRotation: frontWheel?.rotation.x || 0,
    })
  );
  lastGhostT = elapsed;
}

function checkpointSplit() {
  const slot = tracker.next - 2;
  showSplit(elapsed, bestSplits[slot]);
  runSplits[slot] = elapsed;
}

// ---------------------------------------------------------------------------
// Run lifecycle

function enterRiding() {
  input.clear();
  syncPlayer();
  rideCamera(0, true);
}

function startRun() {
  if (!ready) return;
  closePanel();
  bike.reset();
  tracker.reset();
  ghostRecord = [];
  runSplits = [];
  nearestIndex = 0;
  riderAnimator.phase = 0;
  skidMarks?.reset();
  feedback.reset();
  flow.reset();
  tumble?.stop();
  lastLandingSerial = 0;
  lastPopSerial = 0;
  lastPumpSerial = 0;
  show('performance-hud', showPerformance);
  show('split-feedback', false);
  lastGhostT = -1;
  crashes = 0;
  elapsed = 0;
  runAir = 0;
  totalAir = 0;
  crashShown = false;
  input.clear();
  show('crash', false);
  show('menu', false);
  show('header', false);
  show('hud', true);
  show('minimap', true);
  show('touch', touch);
  $('run-mode').textContent =
    mode === 'race' ? 'ZEITFAHREN / ' + selected.number : 'FREIE FAHRT / ' + selected.label.toUpperCase();
  $('vignette').style.opacity = '.17';
  state = 'countdown';
  accumulator = 0;
  syncPlayer();
  rideCamera(0, true);
  refreshHud();
  ghost.hide();
  if (soundEnabled) ensureAudio();
  countdown(3);
}

function countdown(n) {
  $('countdown').textContent = n;
  show('countdown', true);
  const interval = setInterval(() => {
    if (state !== 'countdown') {
      clearInterval(interval);
      return;
    }
    n--;
    if (n > 0) {
      $('countdown').textContent = n;
      beep(370, 0.07);
    } else {
      clearInterval(interval);
      show('countdown', false);
      state = 'riding';
      beep(740, 0.15);
      toast(touch ? 'LENKEN LINKS · SPRUNG HALTEN & LOSLASSEN' : 'RIDE V4 · SPACE HALTEN & LOSLASSEN');
      lastTime = performance.now();
    }
  }, 800);
}

function respawn() {
  clearTimeout(crashTimeout);
  tumble.stop();
  bike.reset(tracker.respawnIndex);
  lastLandingSerial = 0;
  lastPopSerial = 0;
  lastPumpSerial = 0;
  feedback.reset();
  skidMarks.previous = null;
  tracker.nearest = tracker.respawnIndex;
  nearestIndex = tracker.respawnIndex;
  crashes++;
  elapsed += mode === 'race' ? 3 : 0;
  show('crash', false);
  state = 'riding';
  crashShown = false;
  enterRiding();
  toast(mode === 'race' ? '+3 SEKUNDEN · WEITER GEHT’S' : 'ZURÜCK AM CHECKPOINT');
}

function respawnFromUi() {
  respawn();
  show('touch', touch);
}

function crash() {
  if (crashShown) return;
  crashShown = true;
  state = 'crashed';
  input.clearKeys();
  show('hop-charge', false);
  show('pop-ring', false);
  show('touch', false);
  flow.crash();
  rider.visible = true;
  tumble.start(player, rider, bike);
  // Let the tumble play before the respawn prompt appears.
  clearTimeout(crashTimeout);
  crashTimeout = setTimeout(() => {
    if (state === 'crashed') show('crash', true);
  }, 1100);
  if (audio) {
    audio.mute();
    if (soundEnabled) audio.impact(10, true);
  }
}

function pause() {
  if (state !== 'riding' && state !== 'paused') return;
  if (state === 'paused') {
    closePanel();
    return;
  }
  state = 'paused';
  input.clear();
  bike.jumpCharge = 0;
  bike._jumpHeld = false;
  show('touch', false);
  dialog(panels.pauseHtml(), () => {
    if (state === 'paused') {
      state = 'riding';
      show('touch', touch);
      lastTime = performance.now();
    }
  });
  $('resume').onclick = closePanel;
  $('restart').onclick = startRun;
  $('exit-run').onclick = () => {
    state = 'menu';
    closePanel();
    showMenu();
  };
}

function finish() {
  state = 'finished';
  show('touch', false);
  recordGhost();
  const isBest = mode === 'race' && (!runBest || elapsed < runBest);
  if (isBest) {
    runBest = elapsed;
    storage.set(records.best, elapsed);
    ghostSaved = ghostRecord;
    bestSplits = runSplits.slice();
    storage.set(records.splits, bestSplits);
    storage.set(records.ghost, ghostSaved);
    ghost.load(ghostSaved);
  }
  const [gold, silver] = trail.medals || [145, 200];
  const medal = elapsed < gold ? 'GOLD' : elapsed < silver ? 'SILBER' : 'BRONZE';
  dialog(
    panels.finishHtml({
      title: selected.title,
      elapsed,
      race: mode === 'race',
      isBest,
      medal,
      maxSpeed: bike.maxSpeed,
      flowScore: flow.score(),
      flowGrade: flow.grade(),
      flowLosses: flow.losses(),
      totalAir,
      crashes,
    }),
    () => {
      if (state === 'finished') showMenu();
    }
  );
  $('again').onclick = startRun;
  $('back-menu').onclick = () => {
    closePanel();
    showMenu();
  };
}

// ---------------------------------------------------------------------------
// Audio

function ensureAudio() {
  if (audio) {
    audio.resume();
    return;
  }
  try {
    audio = new RideAudio();
    audio.resume();
  } catch {
    soundEnabled = false;
  }
}

function beep(freq, duration) {
  if (!soundEnabled) return;
  ensureAudio();
  audio?.beep(freq, duration);
}

function setSoundLabel() {
  $('sound-toggle').textContent = soundEnabled ? 'TON AN' : 'TON AUS';
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  storage.set('sound', soundEnabled);
  if (soundEnabled) ensureAudio();
  setSoundLabel();
  toast(soundEnabled ? 'SOUND AN' : 'SOUND AUS');
}

// ---------------------------------------------------------------------------
// Main loop

/** Flow scoring and trick callouts from this frame's bike state. */
function rideEvents(dt) {
  flow.update(bike, dt);
  if (bike.landingSerial !== lastLandingSerial) {
    lastLandingSerial = bike.landingSerial;
    const airtime = bike.lastAirtime || 0;
    flow.landing({ quality: bike.landingQuality, airtime, whip: bike.landingWhip || 0 });
    if (bike.landingQuality === 'smooth' && bike.landingWhip > 0.4)
      callout('WHIP', airtime.toFixed(1) + ' s');
    else if (bike.landingQuality === 'smooth' && airtime > 0.45)
      callout('SAUBER', airtime.toFixed(1) + ' s AIR');
    else if (bike.landingQuality === 'hard') callout('HART GELANDET');
  }
  if (bike.pumpSerial !== lastPumpSerial) {
    lastPumpSerial = bike.pumpSerial;
    if (soundEnabled) audio?.impact(1.2);
  }
  if (bike.popSerial !== lastPopSerial) {
    lastPopSerial = bike.popSerial;
    if (soundEnabled) audio?.impact(2.5);
    flow.pop(bike.lastPop);
    if (bike.lastPop === 'perfect') callout('PERFEKTER ABSPRUNG');
    else if (bike.lastPop === 'good') callout('GUTER ABSPRUNG');
  }
  if (bike.pumpGain > 2 && elapsed - lastPumpCallout > 1.5) {
    lastPumpCallout = elapsed;
    callout('PUMP', '+' + (bike.pumpGain * 0.4 * 3.6).toFixed(1) + ' km/h', 700);
  }
  if (bike.manual > 0.5 && bike.manualTime > 0.6) callout('MANUAL', bike.manualTime.toFixed(1) + ' s', 400);
  if (bike.scrub > 0.5 && bike.airtime < 0.12) callout('SCRUB', '', 700);
  updateRideAids({ bike, flow });
}

function crashCamera(dt) {
  if (!tumble.active) return;
  tumble.update(dt);
  heroLook.copy(tumble.focus);
  const behind = heroTarget.copy(camera.position).sub(heroLook).setY(0).normalize().multiplyScalar(5.5);
  behind.add(heroLook);
  behind.y = Math.max(heroLook.y + 2, terrain.sample(behind.x, behind.z) + 1.2);
  camera.position.lerp(behind, 1 - Math.exp(-dt * 2.5));
  camera.lookAt(heroLook);
}

function stepRide(dt) {
  const controls = input.read(bike, { autoPedal, sensitivity });
  accumulator += dt;
  let iterations = 0;
  while (accumulator >= PHYSICS_STEP && iterations++ < 9) {
    bike.step(PHYSICS_STEP, controls);
    elapsed += PHYSICS_STEP;
    accumulator -= PHYSICS_STEP;
    collisions.collideBike(bike);
    if (bike.crashed) {
      crash();
      break;
    }
  }
  const progress = tracker.update(bike.x, bike.z);
  nearestIndex = progress.index;
  nearDistance = progress.distance;
  if (progress.crossed) {
    checkpointSplit();
    beep(620, 0.08);
    toast(progress.complete ? 'FINISH' : 'CHECKPOINT ' + (tracker.next - 1).toString().padStart(2, '0'));
    if (progress.complete && state === 'riding' && mode === 'race') finish();
  }
  if (bike.air) runAir = bike.airtime;
  else if (runAir) {
    totalAir += runAir;
    runAir = 0;
  }
  if (state === 'riding') rideEvents(dt);
  if (bike.atBoundary && frameCount % 180 === 0) toast('GEBIETSGRENZE · WENDE DEIN BIKE');
  if (state === 'riding' && elapsed - lastGhostT > 0.1) recordGhost();
  if (mode === 'race') ghost.update(elapsed);
  if (frontWheel) {
    const roll = (bike.speed * dt) / 0.42;
    frontWheel.rotation.x -= roll;
    rearWheel.rotation.x -= roll * (1 - controls.rearBrake * 0.85);
  }
  bike.visualImpact = feedback.update(bike, dt, soundEnabled ? audio : null);
  skidMarks.update(bike, elapsed);
  syncPlayer(dt, controls.throttle);
  rideCamera(dt);
  refreshHud();
}

/** Exposes run metrics on <html data-*> for automated browser checks. */
function publishDiagnostics() {
  Object.assign(document.documentElement.dataset, {
    version: ASSET_VERSION,
    region: selected.id,
    line: selected.line,
    sourceStep: String(region.step),
    rigged: 'true',
    setup: setupSignature(bikeSetup),
    x: bike.x.toFixed(1),
    z: bike.z.toFixed(1),
    offTrail: nearDistance.toFixed(1),
    skidMarks: String(skidMarks?.count || 0),
    audio: audio ? audio.ctx.state : 'off',
    detailVersion: '3',
    colliders: String(collisions.objects.length),
    fps: String(frameBudget.last?.fps || Math.round(60 / frameTotal)),
    triangles: String(renderer.info.render.triangles),
  });
}

function applyFrameBudget(rawDt) {
  const measured = frameBudget.push(rawDt, state === 'riding' && !document.hidden);
  if (!measured) return;
  if (measured.change) {
    renderer.setPixelRatio(Math.max(0.7, baseDpr * Math.pow(0.84, measured.level)));
    renderer.setSize(innerWidth, innerHeight);
    postfx.resize();
    worldV2.setBudget(measured.level);
  }
  storage.set('performance.' + selected.id + '.' + quality, {
    ...measured,
    quality,
    region: selected.id,
    line: selected.line,
    triangles: renderer.info.render.triangles,
    drawCalls: renderer.info.render.calls,
    dpr: +renderer.getPixelRatio().toFixed(2),
  });
  $('performance-hud').textContent = `${measured.fps} FPS · P95 ${measured.p95Ms} ms`;
  Object.assign(document.documentElement.dataset, {
    fps: String(measured.fps),
    p95: String(measured.p95Ms),
    budget: String(measured.level),
  });
}

function animate(now) {
  requestAnimationFrame(animate);
  const rawDt = (now - lastTime) / 1000 || 0;
  lastTime = now;
  if (document.hidden) return;
  const dt = Math.min(0.06, rawDt);
  if (state === 'riding') stepRide(dt);
  else if (state === 'menu') heroCamera(dt);
  else if (state === 'countdown') rideCamera(dt);
  else if (state === 'crashed') crashCamera(dt);
  worldV2?.update(camera, bike, now / 1000);
  dust.update(dt, bike, state === 'riding');
  audio?.update(bike, state === 'riding' && soundEnabled, Number(input.state.throttle));
  renderer.shadowMap.needsUpdate = frameCount % (touch || frameBudget.level > 1 ? 2 : 1) === 0;
  postfx.render(bike.speed, state === 'riding');
  frameCount++;
  frameTotal += dt;
  if (frameCount % 60 === 0) {
    publishDiagnostics();
    frameTotal = 0;
  }
  applyFrameBudget(rawDt);
}

// ---------------------------------------------------------------------------
// Panels

function settingsPanel() {
  dialog(panels.settingsHtml({ sensitivity, showPerformance, autoPedal, soundEnabled }));
  $('quality').value = quality;
  $('apply').onclick = () => {
    const next = $('quality').value;
    storage.set('quality', next);
    sensitivity = +$('sensitivity').value;
    storage.set('sensitivity', sensitivity);
    showPerformance = $('performance-setting').checked;
    storage.set('show-performance', showPerformance);
    autoPedal = $('autopedal').checked;
    storage.set('autoPedal', autoPedal);
    soundEnabled = $('audio-setting').checked;
    storage.set('sound', soundEnabled);
    if (soundEnabled) ensureAudio();
    setSoundLabel();
    if (next !== quality) location.reload();
    else closePanel();
  };
  $('offline-save').onclick = () => saveOffline(base);
  $('performance-report').onclick = performancePanel;
}

function performancePanel() {
  const record = storage.get('performance.' + selected.id + '.' + quality, null);
  dialog(panels.performanceHtml(record, { label: selected.label, quality }));
  $('back-settings').onclick = settingsPanel;
}

function bikePanel() {
  if (state !== 'menu') return;
  let draft = { ...bikeSetup };
  const keys = ['suspension', 'tyres', 'brakes'];
  dialog(panels.bikeSetupHtml(draft));
  const refresh = () => {
    for (const key of keys) {
      $('setup-' + key).value = draft[key] * 100;
      $(key + '-value').textContent = Math.round(draft[key] * 100) + ' %';
    }
    for (const button of $('panel-content').querySelectorAll('[data-preset]')) {
      const active = setupSignature(SETUP_PRESETS[button.dataset.preset]) === setupSignature(draft);
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    }
    $('setup-description').textContent = setupLabel(draft) + ' · ' + panels.setupDescription(draft);
  };
  for (const key of keys)
    $('setup-' + key).oninput = () => {
      draft[key] = +$('setup-' + key).value / 100;
      refresh();
    };
  for (const button of $('panel-content').querySelectorAll('[data-preset]'))
    button.onclick = () => {
      draft = normalizeSetup(SETUP_PRESETS[button.dataset.preset]);
      refresh();
    };
  refresh();
  $('save-bike').onclick = () => {
    bikeSetup = normalizeSetup(draft);
    storage.set('bike-setup', bikeSetup);
    records = recordKeys(selected, bikeSetup);
    runBest = storage.get(records.best, null);
    ghostSaved = storage.get(records.ghost, null);
    bestSplits = storage.get(records.splits, []);
    bike.setSetup(bikeSetup);
    bike.reset();
    tracker.reset();
    nearestIndex = 0;
    feedback.reset();
    syncPlayer();
    ghost.load(ghostSaved);
    refreshBest();
    $('bike-setup-label').textContent = setupLabel(bikeSetup);
    closePanel();
  };
}

// ---------------------------------------------------------------------------
// UI and keyboard bindings

function bindUi() {
  $('panel-close').onclick = closePanel;
  $('panel').addEventListener('click', e => {
    if (e.target !== $('panel')) return;
    const b = $('panel').getBoundingClientRect();
    if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) closePanel();
  });
  $('bike-setup').onclick = bikePanel;
  $('nav-ride').onclick = () => {
    closePanel();
    if (state === 'menu') chooseMode('race');
  };
  $('nav-region').onclick = () => dialog(panels.regionHtml({ selected, region, trail, asset }));
  $('nav-settings').onclick = settingsPanel;
  $('help-open').onclick = () => dialog(panels.controlsHtml(touch));
  $('home').onclick = () => {
    closePanel();
    showMenu();
  };
  $('start').onclick = startRun;
  $('mode-race').onclick = () => chooseMode('race');
  $('mode-free').onclick = () => chooseMode('free');
  $('pause').onclick = pause;
  $('camera').onclick = () => {
    cameraMode = CAMERA_MODES[(CAMERA_MODES.indexOf(cameraMode) + 1) % CAMERA_MODES.length];
    storage.set('camera-mode', cameraMode);
    toast({ near: 'KAMERA · NAH', far: 'KAMERA · WEIT', helmet: 'KAMERA · HELM' }[cameraMode]);
  };
  $('sound-toggle').onclick = toggleSound;
  setSoundLabel();
  $('respawn').onclick = respawnFromUi;

  window.addEventListener('keydown', e => {
    if (['Space', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
      e.preventDefault();
    if (e.repeat) return;
    if (state === 'riding') {
      input.keys.add(e.code);
      if (e.code === 'KeyR') respawnFromUi();
      if (e.code === 'KeyC') $('camera').click();
      if (e.code === 'KeyM') toggleSound();
      if (e.code === 'KeyP' || e.code === 'Escape') pause();
    } else if (state === 'crashed' && ['KeyR', 'Enter', 'Space'].includes(e.code)) respawnFromUi();
    else if (state === 'menu' && e.code === 'Enter' && !$('panel').open) startRun();
  });
  window.addEventListener('keyup', e => input.keys.delete(e.code));
  window.addEventListener('blur', () => {
    input.clear();
    if (state === 'riding') pause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'riding') pause();
  });
  window.addEventListener('resize', () => {
    if (!renderer) return;
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    postfx.resize();
  });
  input.bindTouchControls();
}

configureRegionMenu();
bindUi();
init();
