import { clamp } from '../sim/physics.mjs';

const LOSS_LABELS = {
  brakeBeforeJump: 'Gebremst vor Absprüngen',
  slide: 'Gerutscht',
  brake: 'Hart gebremst',
  hardLanding: 'Harte Landungen',
  crash: 'Stürze',
};

/**
 * Flow rating (0–100) for one run. Clean speed, pumping, manuals, good take-offs and landings
 * raise it; braking into jumps, sliding, hard landings and crashes lower it.
 */
export class FlowMeter {
  constructor() {
    this.reset();
  }

  reset() {
    this.value = 50;
    this.sum = 0;
    this.time = 0;
    this.lossTime = {};
    this.lossCount = {};
  }

  lose(key, seconds = 0) {
    this.lossTime[key] = (this.lossTime[key] || 0) + seconds;
    if (!seconds) this.lossCount[key] = (this.lossCount[key] || 0) + 1;
  }

  update(bike, dt) {
    let delta = -0.4;
    if (!bike.air) {
      if ((bike.pumpGain || 0) > 0.5) delta += bike.pumpGain * 1.0;
      if ((bike.manual || 0) > 0.5) delta += 3;
      const braking = bike.brakePressure || 0,
        sliding = Math.abs(bike.slip || 0) > 0.3;
      if (bike.speed > 8 && braking < 0.05 && !sliding) delta += 1.6;
      if (braking > 0.4 && (bike.lipAhead || 0) > 0.4) {
        delta -= 12;
        this.lose('brakeBeforeJump', dt);
      } else if (braking > 0.6 && bike.speed > 6) {
        delta -= 2;
        this.lose('brake', dt);
      }
      if (sliding) {
        delta -= 6;
        this.lose('slide', dt);
      }
    }
    this.value = clamp(this.value + delta * dt, 0, 100);
    this.sum += this.value * dt;
    this.time += dt;
  }

  landing({ quality, airtime = 0, whip = 0 }) {
    if (quality === 'smooth') this.value = clamp(this.value + 4 + airtime * 4 + whip * 8, 0, 100);
    else if (quality === 'hard') {
      this.value = clamp(this.value - 8, 0, 100);
      this.lose('hardLanding');
    }
  }

  pop(kind) {
    if (kind === 'perfect') this.value = clamp(this.value + 5, 0, 100);
    else if (kind === 'good') this.value = clamp(this.value + 2, 0, 100);
  }

  crash() {
    this.value = clamp(this.value - 25, 0, 100);
    this.lose('crash');
  }

  /** Blends the run average with the final value, so a strong finish counts but cannot hide a messy run. */
  score() {
    const average = this.time > 0 ? this.sum / this.time : this.value;
    return Math.round(average * 0.35 + this.value * 0.65);
  }

  grade() {
    const s = this.score();
    return s >= 85 ? 'S' : s >= 70 ? 'A' : s >= 55 ? 'B' : 'C';
  }

  /** Biggest flow costs first, for the results screen. */
  losses() {
    const keys = new Set([...Object.keys(this.lossTime), ...Object.keys(this.lossCount)]);
    return [...keys]
      .map(key => ({
        key,
        label: LOSS_LABELS[key],
        seconds: +(this.lossTime[key] || 0).toFixed(1),
        count: this.lossCount[key] || 0,
        weight: (this.lossTime[key] || 0) * 4 + (this.lossCount[key] || 0),
      }))
      .filter(l => l.weight > 0.2)
      .sort((a, b) => b.weight - a.weight);
  }
}
