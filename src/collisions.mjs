import { clamp } from './physics.mjs';
/** Spatially indexed swept collisions, shared by rider and camera. Units: metres. */
export class ObstacleWorld {
  constructor(forest = [], decor = {}) {
    this.cells = new Map();
    this.objects = [];
    for (const p of forest)
      this.add({
        type: 'tree',
        x: p[0],
        z: p[2],
        bottom: p[1] - 0.15,
        top: p[1] + 14 * p[3],
        radius: 0.34 * p[3],
      });
    for (const p of decor.rocks || [])
      this.add({
        type: 'rock',
        x: p[0],
        z: p[2],
        bottom: p[1] - 0.55 * p[3],
        top: p[1] + 0.63 * p[3],
        radius: p[3] * 0.95,
      });
    for (const p of decor.colliders || []) this.add(p);
  }
  add(o) {
    o = { ...o, id: this.objects.length };
    this.objects.push(o);
    const r = o.radius || Math.hypot(o.halfX, o.halfZ);
    for (let x = Math.floor((o.x - r) / 12); x <= Math.floor((o.x + r) / 12); x++)
      for (let z = Math.floor((o.z - r) / 12); z <= Math.floor((o.z + r) / 12); z++) {
        const key = x + ',' + z;
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(o);
      }
    return o;
  }
  sweep(a, b, radius = 0.28, height = 1.75) {
    const found = new Set();
    let first = null;
    for (
      let x = Math.floor((Math.min(a.x, b.x) - radius) / 12);
      x <= Math.floor((Math.max(a.x, b.x) + radius) / 12);
      x++
    )
      for (
        let z = Math.floor((Math.min(a.z, b.z) - radius) / 12);
        z <= Math.floor((Math.max(a.z, b.z) + radius) / 12);
        z++
      )
        for (const o of this.cells.get(x + ',' + z) || []) {
          if (found.has(o.id)) continue;
          found.add(o.id);
          let lo = 0,
            hi = 1;
          const slab = (start, delta, min, max) => {
            if (Math.abs(delta) < 1e-9) return start >= min && start <= max;
            let t0 = (min - start) / delta,
              t1 = (max - start) / delta;
            if (t0 > t1) [t0, t1] = [t1, t0];
            lo = Math.max(lo, t0);
            hi = Math.min(hi, t1);
            return lo <= hi;
          };
          if (!slab(a.y, b.y - a.y, o.bottom - height - radius, o.top + radius)) continue;
          const dx = b.x - a.x,
            dz = b.z - a.z,
            px = a.x - o.x,
            pz = a.z - o.z;
          if (o.radius) {
            const rr = o.radius + radius,
              A = dx * dx + dz * dz,
              B = 2 * (px * dx + pz * dz),
              C = px * px + pz * pz - rr * rr;
            if (A < 1e-12) {
              if (C > 0) continue;
            } else {
              const D = B * B - 4 * A * C;
              if (D < 0) continue;
              const root = Math.sqrt(D);
              lo = Math.max(lo, (-B - root) / (2 * A));
              hi = Math.min(hi, (-B + root) / (2 * A));
              if (lo > hi) continue;
            }
          } else {
            const c = Math.cos(o.yaw || 0),
              s = Math.sin(o.yaw || 0);
            if (
              !slab(px * c + pz * s, dx * c + dz * s, -o.halfX - radius, o.halfX + radius) ||
              !slab(-px * s + pz * c, -dx * s + dz * c, -o.halfZ - radius, o.halfZ + radius)
            )
              continue;
          }
          if (lo >= 0 && lo <= 1 && (!first || lo < first.fraction)) first = { fraction: lo, object: o };
        }
    return first;
  }
  cameraFraction(a, b, radius = 0.28) {
    const hit = this.sweep(a, b, radius, 0);
    return hit ? clamp(hit.fraction - 0.055, 0, 1) : 1;
  }
  collideBike(bike) {
    const a = { x: bike.previousX ?? bike.x, y: bike.previousY ?? bike.y, z: bike.previousZ ?? bike.z },
      b = { x: bike.x, y: bike.y, z: bike.z };
    const hit = this.sweep(a, b, 0.3, 1.7);
    if (!hit) return null;
    const t = Math.max(0, hit.fraction - 0.03);
    bike.x = a.x + (b.x - a.x) * t;
    bike.z = a.z + (b.z - a.z) * t;
    bike.y = a.y + (b.y - a.y) * t;
    bike.crashReason =
      hit.object.type === 'rock' ? 'STEIN' : hit.object.type === 'tree' ? 'BAUM' : 'HINDERNIS';
    if (bike.speed > 4) {
      bike.crashed = true;
    } else {
      bike.speed = 0;
      bike.travelYaw = bike.yaw;
      bike.vy = 0;
    }
    return hit;
  }
}
