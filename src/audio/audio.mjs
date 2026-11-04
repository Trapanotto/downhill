import { clamp } from '../sim/physics.mjs';
/** Independent tyre, wind, brake and drivetrain layers; all synthesis stays local. */
export function rideMix(bike, throttle = 0) {
  const speed = clamp(bike.speed / 24, 0, 1),
    ground = bike.air ? 0 : 1,
    loose = bike.surface?.grip < 0.8 ? 1 : 0.45;
  return {
    tyres: ground * speed * (0.06 + loose * 0.055),
    wind: speed * speed * 0.075,
    brake: ground * speed * (bike.brakePressure || 0) * (0.025 + Math.abs(bike.slip || 0) * 0.06),
    chain: ground * clamp(throttle, 0, 1) * Math.min(1, bike.speed / 3) * 0.016,
    frequency: 160 + speed * 1100,
  };
}
export class RideAudio {
  constructor(Context = globalThis.AudioContext || globalThis.webkitAudioContext) {
    this.ctx = new Context();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.75;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 16;
    limiter.ratio.value = 5;
    this.master.connect(limiter).connect(c.destination);
    this.channels = {};
    this.lastLanding = -1;
    const buffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate),
      data = buffer.getChannelData(0);
    let seed = 731;
    for (let i = 0; i < data.length; i++) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      data[i] = seed / 2147483648 - 1;
    }
    this.noiseBuffer = buffer;
    for (const [name, type, freq] of [
      ['tyres', 'lowpass', 700],
      ['wind', 'lowpass', 220],
      ['brake', 'bandpass', 1900],
    ]) {
      const source = c.createBufferSource(),
        filter = c.createBiquadFilter(),
        gain = c.createGain();
      source.buffer = buffer;
      source.loop = true;
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = name === 'brake' ? 2.5 : 0.7;
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(this.master);
      source.start();
      this.channels[name] = { gain, filter, source };
    }
    const source = c.createOscillator(),
      gain = c.createGain();
    source.type = 'triangle';
    source.frequency.value = 85;
    gain.gain.value = 0;
    source.connect(gain).connect(this.master);
    source.start();
    this.channels.chain = { source, gain };
  }
  resume() {
    this.ctx.resume().catch(() => {});
  }
  mute() {
    for (const ch of Object.values(this.channels))
      ch.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.035);
  }
  update(bike, active, throttle = 0) {
    const mix = rideMix(bike, throttle),
      now = this.ctx.currentTime;
    for (const [name, ch] of Object.entries(this.channels))
      ch.gain.gain.setTargetAtTime(active ? mix[name] : 0, now, 0.06);
    this.channels.tyres.filter.frequency.setTargetAtTime(mix.frequency, now, 0.08);
    this.channels.chain.source.frequency.setTargetAtTime(55 + bike.speed * 7, now, 0.08);
    this.channels.brake.filter.frequency.setTargetAtTime(1200 + bike.speed * 35, now, 0.08);
  }
  impact(strength = 1, crash = false) {
    const c = this.ctx,
      now = c.currentTime,
      noise = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      gain = c.createGain();
    noise.buffer = this.noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.value = crash ? 750 : 320;
    gain.gain.setValueAtTime(Math.min(0.24, 0.025 + strength * 0.012), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start();
    noise.stop(now + 0.25);
    noise.onended = () => {
      noise.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }
  beep(freq, duration) {
    const c = this.ctx,
      o = c.createOscillator(),
      g = c.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.035, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(c.currentTime + duration);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
}
