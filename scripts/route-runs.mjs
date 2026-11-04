import fs from 'node:fs';
import {
  HeightField,
  BikePhysics,
  TrailTracker,
  surfaceDetails,
  clamp,
  wrapAngle,
} from '../src/sim/physics.mjs';
import { SETUP_PRESETS } from '../src/sim/setup.mjs';
import { ObstacleWorld } from '../src/sim/collisions.mjs';

export const ROUTES = [
  { directory: 'public/assets/', file: 'trail.json' },
  { directory: 'public/assets/lenzerheide/', file: 'trail.json' },
  { directory: 'public/assets/lenzerheide/', file: 'trail-technical.json' },
];

const readJson = file => JSON.parse(fs.readFileSync(file));

export function loadRoute({ directory: a, file }) {
  const meta = readJson(a + 'region.json'),
    buf = fs.readFileSync(a + 'height.bin'),
    decor = readJson(a + 'decor.json'),
    terrain = new HeightField(
      meta,
      new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4),
      new Uint8Array(fs.readFileSync(a + 'surface.bin')),
      decor.roots,
      surfaceDetails(
        readJson(a + 'surface-details.json'),
        new Int16Array(Uint8Array.from(fs.readFileSync(a + 'surface-details.bin')).buffer)
      )
    );
  return { terrain, trail: readJson(a + file), forest: readJson(a + 'forest.json'), decor };
}

/** Adds the same checkpoint poles the game places, so the autopilot meets every obstacle type. */
function addCheckpointPoles(collisions, terrain, trail) {
  for (const [n, index] of trail.checkpoints.entries()) {
    const p = trail.points[index],
      q = trail.points[Math.min(index + 5, trail.points.length - 1)],
      prev = trail.points[Math.max(index - 5, 0)],
      dx = q[0] - prev[0],
      dz = q[2] - prev[2],
      length = Math.hypot(dx, dz);
    for (const sign of [-1, 1]) {
      const x = p[0] - (dz / length) * 2.6 * sign,
        z = p[2] + (dx / length) * 2.6 * sign,
        y = terrain.sample(x, z);
      collisions.add({
        type: 'pole',
        x,
        z,
        bottom: y,
        top: y + (n === 0 || n === trail.checkpoints.length - 1 ? 3.7 : 2.25),
        radius: 0.045,
      });
    }
  }
}

/** Deterministic autopilot: follows the route at a cautious speed until the finish or a crash. */
export function runRoute(route, setupName) {
  const { terrain, trail, forest, decor } = loadRoute(route),
    b = new BikePhysics(terrain, trail, SETUP_PRESETS[setupName]),
    t = new TrailTracker(trail),
    collisions = new ObstacleWorld(forest, decor);
  addCheckpointPoles(collisions, terrain, trail);
  let worst = 0,
    elapsed = 0;
  for (let i = 0; i < 120 * 800; i++) {
    const pr = t.update(b.x, b.z);
    worst = Math.max(worst, pr.distance);
    const look =
        trail.points[Math.min(trail.points.length - 1, pr.index + Math.max(7, Math.floor(b.speed * 0.7)))],
      angle = Math.atan2(-(look[0] - b.x), -(look[2] - b.z)),
      err = wrapAngle(angle - b.yaw),
      input = { steer: clamp(-err * 3, -1, 1), throttle: b.speed < 6, brake: b.speed > 8, jump: false };
    b.step(1 / 120, input);
    collisions.collideBike(b);
    elapsed += 1 / 120;
    if (t.complete || b.crashed) break;
  }
  return {
    route: trail.name,
    setup: setupName,
    complete: t.complete,
    seconds: +elapsed.toFixed(2),
    maxOffTrack: +worst.toFixed(3),
    crashed: b.crashed,
    reason: b.crashReason,
    position: [b.x, b.y, b.z],
    nearest: t.nearest,
  };
}

export function* allRuns() {
  for (const route of ROUTES)
    for (const setupName of Object.keys(SETUP_PRESETS)) yield runRoute(route, setupName);
}
