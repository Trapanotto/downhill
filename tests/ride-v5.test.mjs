import test from 'node:test';
import assert from 'node:assert/strict';
import { BikePhysics } from '../src/sim/physics.mjs';
import { FlowMeter } from '../src/gameplay/flow.mjs';

// Bikes start heading towards -z. Terrain functions take (x, z) and return height in metres.
const field = height => ({
  sample: height,
  gradient: (x, z) => ({
    x: (height(x + 0.8, z) - height(x - 0.8, z)) / 1.6,
    z: (height(x, z + 0.8) - height(x, z - 0.8)) / 1.6,
  }),
  contains: () => true,
});
const trail = {
  points: [
    [0, 0, 0],
    [0, 0, -200],
  ],
};
const rollers = field((x, z) => 0.6 * Math.cos((z * 2 * Math.PI) / 12)),
  slope = field((x, z) => z * 0.12),
  lip = field((x, z) => (z > -10 ? -(z * 0.35) : 3.5 - (-10 - z) * 0.6));

function ride(terrain, seconds, controls) {
  const bike = new BikePhysics(terrain, trail);
  bike.speed = 9;
  for (let i = 0; i < seconds * 120; i++) bike.step(1 / 120, controls(bike, i / 120));
  return bike;
}

test('timed pumping into troughs gains speed, random pumping does not', () => {
  // Troughs sit at z = -6 - 12k. Press once while the trough is just ahead.
  const timed = (b, t) => ({ pump: ((-b.z % 12) + 12) % 12 > 2.5 && ((-b.z % 12) + 12) % 12 < 4.5 ? 1 : 0 });
  const coast = ride(rollers, 4, () => ({})),
    pumped = ride(rollers, 4, timed),
    random = ride(rollers, 4, (b, t) => ({ pump: Math.floor(t / 0.23) % 2 === 0 ? 1 : 0 }));
  assert.ok(pumped.distance > coast.distance + 1.5, `${pumped.distance} vs ${coast.distance}`);
  assert.ok(pumped.distance > random.distance + 1, `${pumped.distance} vs random ${random.distance}`);
});

test('pumping on an even slope gives no free speed', () => {
  const coast = ride(slope, 3, () => ({})),
    pumped = ride(slope, 3, (b, t) => ({ pump: Math.floor(t / 0.2) % 2 === 0 ? 1 : 0 }));
  assert.ok(Math.abs(pumped.speed - coast.speed) < 0.2, `${pumped.speed} vs ${coast.speed}`);
});

test('releasing the preload at the lip pops higher than a flat bunnyhop', () => {
  const lipBike = new BikePhysics(lip, trail);
  lipBike.speed = 12;
  let popped = null;
  for (let i = 0; i < 400 && !popped; i++) {
    const ready = lipBike.lipAhead > 0.6;
    lipBike.step(1 / 120, { jumpHeld: !ready });
    if (lipBike.popSerial) popped = { pop: lipBike.lastPop, vy: lipBike.vy };
  }
  const flatBike = new BikePhysics(
    field(() => 0),
    trail
  );
  flatBike.speed = 12;
  for (let i = 0; i < 90; i++) flatBike.step(1 / 120, { jumpHeld: true });
  flatBike.step(1 / 120, {});
  assert.equal(popped?.pop, 'perfect');
  assert.equal(flatBike.lastPop, 'flat');
  assert.ok(popped.vy > flatBike.vy + 1);
});

test('a manual lifts the front, reduces drag and times out', () => {
  const flatField = field(() => 0),
    coast = ride(flatField, 2, () => ({})),
    manual = ride(flatField, 2, () => ({ weight: -1 }));
  assert.ok(manual.speed > coast.speed);
  assert.ok(manual.manual > 0.9 && manual.pitch > 0.2);
  const long = ride(flatField, 5, () => ({ weight: -1 }));
  assert.ok(long.manual < 0.2);
});

test('landing fully whipped crashes, a straightened whip lands', () => {
  const run = straighten => {
    const bike = new BikePhysics(
      field(() => 0),
      trail
    );
    bike.speed = 12;
    for (let i = 0; i < 80; i++) bike.step(1 / 120, { jumpHeld: true });
    for (let i = 0; i < 200 && !bike.crashed; i++) {
      const descending = bike.air && bike.vy < 0;
      bike.step(1 / 120, { steer: straighten && descending ? 0 : 1 });
      if (!bike.air && i > 10) break;
    }
    return bike;
  };
  assert.equal(run(false).crashed, true);
  const clean = run(true);
  assert.equal(clean.crashed, false);
  assert.ok(clean.landingWhip > 0.4);
});

test('flow meter rewards clean riding and grades the run', () => {
  const flow = new FlowMeter();
  const bike = { air: false, airtime: 0, speed: 12, slip: 0, brakePressure: 0, pumpGain: 3, manual: 0 };
  for (let i = 0; i < 300; i++) flow.update(bike, 1 / 60);
  flow.landing({ quality: 'smooth', airtime: 0.9, whip: 0.6 });
  flow.pop('perfect');
  assert.ok(flow.value > 70);
  assert.ok(['A', 'S'].includes(flow.grade()));
  const sloppy = new FlowMeter();
  for (let i = 0; i < 300; i++)
    sloppy.update({ ...bike, pumpGain: 0, slip: 0.4, brakePressure: 1, lipAhead: 0.8 }, 1 / 60);
  sloppy.landing({ quality: 'hard', airtime: 0.6, whip: 0 });
  sloppy.crash();
  assert.ok(sloppy.value < 40);
  assert.ok(sloppy.losses().length > 0);
});
