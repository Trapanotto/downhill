/** Rolling frame measurements use un-clamped wall time, excluding hidden/paused frames. */
export class FrameBudget {
  constructor() {
    this.samples = [];
    this.total = 0;
    this.level = 0;
    this.cooldown = 0;
    this.fastWindows = 0;
    this.last = null;
  }
  push(seconds, active = true) {
    if (!active || !Number.isFinite(seconds) || seconds <= 0) return null;
    this.samples.push(seconds * 1000);
    this.total += seconds;
    if (this.total < 3) return null;
    const sorted = this.samples.slice().sort((a, b) => a - b),
      mean = sorted.reduce((a, b) => a + b, 0) / sorted.length,
      p95 = sorted[Math.floor((sorted.length - 1) * 0.95)];
    this.last = {
      fps: Math.round(1000 / mean),
      meanMs: +mean.toFixed(1),
      p95Ms: +p95.toFixed(1),
      frames: sorted.length,
      level: this.level,
    };
    this.samples = [];
    this.total = 0;
    this.cooldown = Math.max(0, this.cooldown - 3);
    let change = 0;
    if (!this.cooldown && mean > 23 && p95 > 29 && this.level < 3) {
      this.level++;
      this.cooldown = 6;
      this.fastWindows = 0;
      change = 1;
    } else if (mean < 18 && p95 < 22) {
      this.fastWindows++;
      if (!this.cooldown && this.fastWindows >= 5 && this.level > 0) {
        this.level--;
        this.cooldown = 9;
        this.fastWindows = 0;
        change = -1;
      }
    } else this.fastWindows = 0;
    return { ...this.last, level: this.level, change };
  }
}
/** Stable buckets avoid scanning/sorting the whole forest for every near-detail update. */
export class PlacementIndex {
  constructor(points, cell = 32) {
    this.points = points;
    this.cell = cell;
    this.cells = new Map();
    points.forEach((p, index) => {
      const key = Math.floor(p[0] / cell) + ',' + Math.floor(p[2] / cell);
      if (!this.cells.has(key)) this.cells.set(key, []);
      this.cells.get(key).push({ p, index });
    });
  }
  near(x, z, radius, max = Infinity, visible = null) {
    const out = [];
    for (let i = Math.floor((x - radius) / this.cell); i <= Math.floor((x + radius) / this.cell); i++)
      for (let j = Math.floor((z - radius) / this.cell); j <= Math.floor((z + radius) / this.cell); j++)
        for (const item of this.cells.get(i + ',' + j) || []) {
          const d = (item.p[0] - x) ** 2 + (item.p[2] - z) ** 2;
          if (d < radius * radius && (!visible || visible(item.p))) out.push({ ...item, d });
        }
    return out.sort((a, b) => a.d - b.d || a.index - b.index).slice(0, max);
  }
}
