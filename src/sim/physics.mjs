import { normalizeSetup, setupParameters } from './setup.mjs';
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
const approach = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
const amount = value => clamp(Number(value) || 0, 0, 1);
export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const cs = Math.floor(Math.max(0, seconds) * 100);
  return `${Math.floor(cs / 6000)
    .toString()
    .padStart(
      2,
      '0'
    )}:${Math.floor(cs / 100) % 60 < 10 ? '0' : ''}${Math.floor(cs / 100) % 60}.${(cs % 100).toString().padStart(2, '0')}`;
}

export class HeightField {
  constructor(meta, data, surfaceData = null, roots = [], details = null) {
    this.meta = meta;
    this.data = data;
    this.surfaceData = surfaceData;
    this.details = details;
    this.minX = meta.bounds[0] - meta.origin[0];
    this.minZ = meta.origin[1] - meta.bounds[3];
    this.maxX = this.minX + (meta.width - 1) * meta.step;
    this.maxZ = this.minZ + (meta.height - 1) * meta.step;
    this.rootBuckets = new Map();
    for (const root of roots) {
      const key = this.rootKey(root[0], root[2]);
      if (!this.rootBuckets.has(key)) this.rootBuckets.set(key, []);
      this.rootBuckets.get(key).push(root);
    }
  }
  coordinates(x, z) {
    const m = this.meta,
      u = clamp((x - this.minX) / m.step, 0, m.width - 1.001),
      v = clamp((z - this.minZ) / m.step, 0, m.height - 1.001);
    return { i: Math.floor(u), j: Math.floor(v), a: u - Math.floor(u), b: v - Math.floor(v) };
  }
  interpolate(data, x, z) {
    const { i, j, a, b } = this.coordinates(x, z),
      w = this.meta.width;
    return (
      (data[j * w + i] * (1 - a) + data[j * w + i + 1] * a) * (1 - b) +
      (data[(j + 1) * w + i] * (1 - a) + data[(j + 1) * w + i + 1] * a) * b
    );
  }
  baseSample(x, z) {
    return this.interpolate(this.data, x, z) - this.meta.heightOrigin;
  }
  detailAt(x, z) {
    if (!this.details) return 0;
    const d = this.details,
      tx = Math.floor(x / d.tileSize),
      tz = Math.floor(z / d.tileSize),
      offset = d.index.get(tx + ',' + tz);
    if (offset === undefined) return 0;
    const u = clamp((x - tx * d.tileSize) / d.step, 0, d.size - 1.00001),
      v = clamp((z - tz * d.tileSize) / d.step, 0, d.size - 1.00001),
      i = Math.floor(u),
      j = Math.floor(v),
      a = u - i,
      b = v - j,
      w = d.size,
      data = d.data;
    return (
      ((data[offset + j * w + i] * (1 - a) + data[offset + j * w + i + 1] * a) * (1 - b) +
        (data[offset + (j + 1) * w + i] * (1 - a) + data[offset + (j + 1) * w + i + 1] * a) * b) *
      d.scale
    );
  }
  sample(x, z) {
    return this.baseSample(x, z) + this.detailAt(x, z);
  }
  gradient(x, z) {
    return {
      x: (this.sample(x + 0.8, z) - this.sample(x - 0.8, z)) / 1.6,
      z: (this.sample(x, z + 0.8) - this.sample(x, z - 0.8)) / 1.6,
    };
  }
  surfaceAt(x, z) {
    if (!this.surfaceData) return { name: 'Trail', grip: 1, resistance: 0.09, distance: 0 };
    const distance = (this.interpolate(this.surfaceData, x, z) * 32) / 255;
    if (distance < 1.7) return { name: 'Trail', grip: 1, resistance: 0.09, distance };
    if (distance < 3.2) return { name: 'Trailrand', grip: 0.85, resistance: 0.14, distance };
    return {
      name: this.meta.biome === 'alpine' ? 'Alpwiese' : 'Waldboden',
      grip: 0.68,
      resistance: 0.25,
      distance,
    };
  }
  rootKey(x, z) {
    return `${Math.floor(x / 8)},${Math.floor(z / 8)}`;
  }
  contactHeight(x, z) {
    let y = this.sample(x, z);
    const ix = Math.floor(x / 8),
      iz = Math.floor(z / 8);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const r of this.rootBuckets.get(`${ix + i},${iz + j}`) || []) {
          const dx = x - r[0],
            dz = z - r[2],
            along = dx * Math.cos(r[4]) + dz * Math.sin(r[4]),
            across = -dx * Math.sin(r[4]) + dz * Math.cos(r[4]);
          if (Math.abs(along) < r[3] / 2 && Math.abs(across) < 0.17) {
            const envelope = Math.cos((along / r[3]) * Math.PI);
            y += r[5] * Math.exp(-((across / 0.1) ** 2)) * envelope;
          }
        }
    return y;
  }
  contains(x, z, margin = 4) {
    return (
      x > this.minX + margin && x < this.maxX - margin && z > this.minZ + margin && z < this.maxZ - margin
    );
  }
}

export function surfaceDetails(meta, data) {
  return { ...meta, data, index: new Map(meta.tiles.map(t => [t.x + ',' + t.z, t.offset])) };
}

export class TrailTracker {
  constructor(trail) {
    this.trail = trail;
    this.reset();
  }
  reset() {
    this.next = 1;
    this.nearest = 0;
    this.complete = false;
  }
  update(x, z) {
    const p = this.trail.points;
    let best = Infinity,
      index = this.nearest;
    for (let i = Math.max(0, this.nearest - 70); i < Math.min(p.length, this.nearest + 110); i += 2) {
      const d = (p[i][0] - x) ** 2 + (p[i][2] - z) ** 2;
      if (d < best) {
        best = d;
        index = i;
      }
    }
    this.nearest = index;
    const cp = p[this.trail.checkpoints[this.next]];
    let crossed = false;
    if (cp && Math.hypot(cp[0] - x, cp[2] - z) < 11) {
      this.next++;
      crossed = true;
      if (this.next >= this.trail.checkpoints.length) this.complete = true;
    }
    return {
      distance: Math.sqrt(best),
      index,
      crossed,
      complete: this.complete,
      progress: clamp(index / (p.length - 1), 0, 1),
    };
  }
  get respawnIndex() {
    return this.trail.checkpoints[Math.max(0, this.next - 1)];
  }
}

/** A deterministic 120 Hz bicycle controller. Rendering never changes physics. */
export class BikePhysics {
  constructor(terrain, trail, setup = {}) {
    this.terrain = terrain;
    this.trail = trail;
    this.setSetup(setup);
    this.reset();
  }
  setSetup(value) {
    this.setup = normalizeSetup(value);
    this.tune = setupParameters(value);
  }
  reset(index = 0) {
    const p = this.trail.points[index],
      q = this.trail.points[Math.min(index + 8, this.trail.points.length - 1)];
    this.x = p[0];
    this.z = p[2];
    this.y = this.terrain.sample(this.x, this.z) + 0.03;
    this.yaw = Math.atan2(-(q[0] - p[0]), -(q[2] - p[2]));
    this.travelYaw = this.yaw;
    Object.assign(this, {
      speed: 0,
      vy: 0,
      air: false,
      airtime: 0,
      maxSpeed: 0,
      distance: 0,
      pitch: 0,
      lean: 0,
      steer: 0,
      weight: 0,
      crashed: false,
      jumpCooldown: 0,
      jumpCharge: 0,
      landingImpact: 0,
      landingSerial: 0,
      landingQuality: '',
      frontCompression: 0.025,
      rearCompression: 0.025,
      frontSpringVelocity: 0,
      rearSpringVelocity: 0,
      slip: 0,
      frontContact: 0,
      rearContact: 0,
      _jumpHeld: false,
      _lastGroundV: 0,
      acceleration: 0,
      brakePressure: 0,
      frontLoad: 0.52,
      rearSlip: 0,
      previousX: this.x,
      previousY: this.y,
      previousZ: this.z,
      crashReason: '',
      atBoundary: false,
    });
    this.surface = this.terrain.surfaceAt?.(this.x, this.z) || { name: 'Trail', grip: 1, resistance: 0.09 };
    this._groundHeight =
      (this.contact(this.x - Math.sin(this.yaw) * 0.72, this.z - Math.cos(this.yaw) * 0.72) +
        this.contact(this.x + Math.sin(this.yaw) * 0.72, this.z + Math.cos(this.yaw) * 0.72)) *
      0.5;
    this.y = this._groundHeight + 0.03;
  }
  contact(x, z) {
    return this.terrain.contactHeight?.(x, z) ?? this.terrain.sample(x, z);
  }
  spring(which, target, dt) {
    const key = which + 'Compression',
      velocity = which + 'SpringVelocity';
    this[velocity] +=
      ((target * this.tune.compression - this[key]) * this.tune.stiffness -
        this[velocity] * this.tune.damping) *
      dt;
    this[key] = clamp(this[key] + this[velocity] * dt, 0, this.tune.travel);
  }
  step(dt, input) {
    if (this.crashed) return;
    this.atBoundary = false;
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    this.steer = approach(this.steer, clamp(input.steer || 0, -1, 1) * (input.sensitivity ?? 1), 13, dt);
    this.weight = approach(this.weight, clamp(input.weight || 0, -1, 1), 7, dt);
    this.surface = this.terrain.surfaceAt?.(this.x, this.z) || { name: 'Trail', grip: 1, resistance: 0.09 };
    this.previousX = this.x;
    this.previousY = this.y;
    this.previousZ = this.z;
    const braking = amount(input.brake),
      frontBrake = Math.max(braking, amount(input.frontBrake)),
      rearBrake = Math.max(braking * 0.85, amount(input.rearBrake));
    const fx = -Math.sin(this.travelYaw),
      fz = -Math.cos(this.travelYaw),
      gradient = this.terrain.gradient(this.x, this.z),
      slope = gradient.x * fx + gradient.z * fz;
    const oldSpeed = this.speed,
      drive =
        amount(input.throttle) > 0 && frontBrake + rearBrake < 0.03
          ? (8 * amount(input.throttle)) / (1 + this.speed * 0.05)
          : 0;
    const gravity = (-9.81 * slope) / Math.sqrt(1 + slope * slope);
    const resistance =
      (this.surface.resistance + this.tune.rolling - 0.09) * this.speed + 0.006 * this.speed * this.speed;
    this.frontLoad = clamp(0.52 + frontBrake * 0.15 + this.weight * 0.13 - slope * 0.04, 0.28, 0.8);
    this.brakePressure = Math.max(frontBrake, rearBrake);
    const traction = (13.5 * this.surface.grip * this.tune.grip) / Math.sqrt(1 + slope * slope);
    const frontForce = Math.min(frontBrake * 11.5 * this.tune.brake, traction * this.frontLoad),
      rearForce = Math.min(rearBrake * 7.2 * this.tune.brake, traction * (1 - this.frontLoad));
    const brakingForce = frontForce + rearForce;
    this.rearSlip = clamp((rearBrake * 7.2 * this.tune.brake - rearForce) / 7.2, 0, 1);
    this.speed = clamp(
      this.speed + (drive + gravity - resistance - (this.air ? 0 : brakingForce)) * dt,
      0,
      27
    );
    // Steering response softens at speed; tyre grip controls how quickly momentum follows.
    const t = this.terrain,
      nearEdge =
        Number.isFinite(t.minX) &&
        Math.min(this.x - t.minX, t.maxX - this.x, this.z - t.minZ, t.maxZ - this.z) < 4.5;
    if (nearEdge && this.speed < 1 && Math.abs(this.steer) > 0.05) {
      this.yaw -= this.steer * dt * 1.3;
      this.travelYaw = this.yaw;
    }
    const steeringGain = (this.speed * 0.153) / (1 + this.speed * 0.029);
    this.yaw -= this.steer * steeringGain * (this.air ? 0.18 : 1) * dt;
    const grip = this.surface.grip * this.tune.grip * (1 - this.rearSlip * 0.28) * (1 + this.weight * 0.06);
    const remaining = Math.sqrt(Math.max(0.12, 1 - (brakingForce / Math.max(1, traction)) ** 2));
    const maxTurn =
      (traction * remaining +
        Math.abs(gradient.x * Math.cos(this.yaw) - gradient.z * Math.sin(this.yaw)) * 1.8) /
      Math.max(2, this.speed);
    const wanted = wrapAngle(this.yaw - this.travelYaw) * (this.air ? 1.3 : 22 * grip);
    const turnRate = this.air ? wanted : clamp(wanted, -maxTurn, maxTurn);
    this.travelYaw += turnRate * dt;
    this.slip = wrapAngle(this.yaw - this.travelYaw);
    if (!this.air && Math.abs(this.slip) > 0.5) this.yaw = this.travelYaw + clamp(this.slip, -0.5, 0.5);
    this.speed = Math.max(0, this.speed - Math.abs(this.slip) * this.speed * 0.22 * dt);
    this.lean = approach(this.lean, clamp(Math.atan2(this.speed * turnRate, 9.81), -0.7, 0.7), 8, dt);
    // Hold / release compresses the bike. Legacy jump:true remains a medium hop.
    const held = !!input.jumpHeld;
    if (held && !this.air) this.jumpCharge = clamp(this.jumpCharge + dt / 0.72, 0, 1);
    const release = this._jumpHeld && !held;
    if ((release || input.jump) && !this.air && this.speed > 1 && this.jumpCooldown <= 0) {
      const charge = release ? this.jumpCharge : 0.5;
      this.vy = 3.1 + charge * 2.5 + this.speed * 0.025;
      this.air = true;
      this.airtime = 0;
      this.jumpCooldown = 0.65;
      this.pitch -= this.weight * 0.08;
      this.jumpCharge = 0;
    }
    this._jumpHeld = held;
    if (!held && !this.air) this.jumpCharge = Math.max(0, this.jumpCharge - dt * 3);
    const oldX = this.x,
      oldZ = this.z,
      oldY = this.y,
      oldVy = this.vy,
      oldGround = this._groundHeight;
    this.x -= Math.sin(this.travelYaw) * this.speed * dt;
    this.z -= Math.cos(this.travelYaw) * this.speed * dt;
    const front = this.contact(this.x - Math.sin(this.yaw) * 0.72, this.z - Math.cos(this.yaw) * 0.72),
      rear = this.contact(this.x + Math.sin(this.yaw) * 0.72, this.z + Math.cos(this.yaw) * 0.72);
    const ground = (front + rear) * 0.5,
      groundV = (ground - oldGround) / dt;
    this._groundHeight = ground;
    this.frontContact = front - ground;
    this.rearContact = rear - ground;
    this.distance += Math.hypot(this.x - oldX, this.z - oldZ);
    this.maxSpeed = Math.max(this.maxSpeed, this.speed * 3.6);
    const groundPitch = Math.atan2(front - rear, 1.44);
    let landing = 0;
    if (this.air) {
      this.vy -= 9.81 * dt;
      this.y += this.vy * dt;
      this.airtime += dt;
      if (this.y <= ground + 0.03) {
        landing = Math.max(0, (groundV - this.vy) / Math.sqrt(1 + slope * slope));
        this.landingImpact = landing;
        this.landingSerial++;
        const alignment = Math.abs(this.pitch - groundPitch),
          absorption = this.tune.absorption + Math.max(0, -this.weight) * 0.25;
        this.landingQuality = landing < 8 && alignment < 0.45 ? 'smooth' : 'hard';
        if (landing / absorption > 23 || (alignment > 0.95 && landing > 11)) {
          this.crashed = true;
          this.landingQuality = 'crash';
        }
        this.y = ground + 0.03;
        this.vy = 0;
        this.air = false;
        this.speed *= 1 - clamp(landing * 0.003, 0, 0.1);
        this.frontSpringVelocity += landing * 0.12;
        this.rearSpringVelocity += landing * 0.1;
      }
    } else {
      const predicted = oldY + oldVy * dt - 0.5 * 9.81 * dt * dt;
      if (this.speed > 10 && predicted > ground + 0.12 && oldVy > groundV + 1.2) {
        this.air = true;
        this.y = predicted;
        this.vy = oldVy - 9.81 * dt;
        this.airtime = 0;
      } else {
        this.y = ground + 0.03;
        this.vy = groundV;
      }
    }
    const acceleration = (this.speed - oldSpeed) / dt;
    this.acceleration = acceleration;
    const verticalAcceleration = clamp((groundV - this._lastGroundV) / dt, -25, 25);
    this._lastGroundV = groundV;
    const frontTarget =
      0.025 +
      frontBrake * 0.065 +
      Math.max(0, this.weight) * 0.025 +
      this.jumpCharge * 0.1 +
      Math.max(0, verticalAcceleration) * 0.0018;
    const rearTarget =
      0.025 +
      Math.max(0, acceleration) * 0.003 +
      Math.max(0, -this.weight) * 0.025 +
      this.jumpCharge * 0.1 +
      Math.max(0, verticalAcceleration) * 0.0015;
    this.spring('front', this.air ? 0.009 : frontTarget, dt);
    this.spring('rear', this.air ? 0.009 : rearTarget, dt);
    const targetPitch = this.air ? clamp(this.vy / 24 - this.weight * 0.25, -0.6, 0.6) : groundPitch;
    this.pitch = approach(this.pitch, targetPitch, this.air ? 3.5 : 15, dt);
    this.landingImpact = approach(this.landingImpact, 0, 5, dt);
    if (!this.terrain.contains(this.x, this.z)) {
      this.atBoundary = true;
      const t = this.terrain;
      this.x = Number.isFinite(t.minX) ? clamp(this.x, t.minX + 4.1, t.maxX - 4.1) : this.previousX;
      this.z = Number.isFinite(t.minZ) ? clamp(this.z, t.minZ + 4.1, t.maxZ - 4.1) : this.previousZ;
      this.speed = 0;
      this.vy = 0;
      this.air = false;
      this.y = this.contact(this.x, this.z) + 0.03;
    }
  }
}

export class TreeCollisions {
  constructor(trees) {
    this.buckets = new Map();
    for (const t of trees) {
      const k = this.key(t[0], t[2]);
      if (!this.buckets.has(k)) this.buckets.set(k, []);
      this.buckets.get(k).push(t);
    }
  }
  key(x, z) {
    return `${Math.floor(x / 12)},${Math.floor(z / 12)}`;
  }
  hits(x, z, y) {
    const ix = Math.floor(x / 12),
      iz = Math.floor(z / 12);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const t of this.buckets.get(`${ix + i},${iz + j}`) || []) {
          if (y < t[1] + 7 && Math.hypot(t[0] - x, t[2] - z) < 0.38 * t[3] + 0.22) return true;
        }
    return false;
  }
}
