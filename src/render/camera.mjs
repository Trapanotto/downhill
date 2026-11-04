import * as THREE from 'three';
import { clamp } from '../sim/physics.mjs';

export const CAMERA_MODES = ['near', 'far', 'helmet'];
const forwardOf = yaw => new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));

/**
 * Rider-aligned camera. The chase modes stay directly behind the heading; obstructions shorten
 * the rear arm and never orbit it. Speed pulls the camera lower and closer and widens the field
 * of view. Shake follows the ground: rough surfaces buzz, landings thump.
 */
export class RideCamera {
  constructor() {
    this.focus = new THREE.Vector3();
    this.position = new THREE.Vector3();
    this.vertical = null;
    this.shakeTime = 0;
    this.roll = 0;
  }

  update(camera, bike, trail, index, terrain, obstacles, dt, mode = 'near', instant = false) {
    if (mode === true) mode = 'far';
    if (!mode) mode = 'near';
    if (mode === 'helmet') return this.helmet(camera, bike, terrain, dt, instant);
    const far = mode === 'far',
      forward = forwardOf(bike.yaw),
      speed = clamp(bike.speed / 25, 0, 1),
      distance = (far ? 9 : 6.7) - speed * (far ? 1 : 0.8),
      height = (far ? 4.1 : 2.75) - speed * (far ? 0.6 : 0.55);
    if (instant || this.vertical === null) this.vertical = bike.y;
    else this.vertical += (bike.y - this.vertical) * (1 - Math.exp(-dt * (bike.air ? 5 : 8)));
    const lookDistance = 1.4 + Math.min(1.8, bike.speed * 0.075);
    this.focus
      .set(bike.x, this.vertical + 1.18 - speed * 0.12, bike.z)
      .addScaledVector(forward, lookDistance);
    const anchor = new THREE.Vector3(
      bike.x,
      Math.max(this.vertical + 1.28, terrain.sample(bike.x, bike.z) + 1.1),
      bike.z
    );
    this.position.set(bike.x, this.vertical + height, bike.z).addScaledVector(forward, -distance);
    this.position.y = Math.max(this.position.y, terrain.sample(this.position.x, this.position.z) + 0.65);
    let fraction = obstacles?.cameraFraction(anchor, this.position, 0.3) ?? 1;
    for (let i = 1; i <= 16; i++) {
      const t = i / 16,
        p = anchor.clone().lerp(this.position, t);
      if (p.y < terrain.sample(p.x, p.z) + 0.35) {
        fraction = Math.min(fraction, Math.max(0.04, t - 1 / 16));
        break;
      }
    }
    camera.position.copy(anchor).lerp(this.position, fraction);
    camera.position.y = Math.max(
      camera.position.y,
      terrain.sample(camera.position.x, camera.position.z) + 0.35
    );
    camera.position.y += this.shake(bike, dt, instant);
    camera.lookAt(this.focus);
    camera.rotateX((instant ? 0 : bike.visualImpact || 0) * 0.01);
    // Lean the horizon slightly into turns, with a little lag so it reads as weight, not tilt.
    this.roll = instant
      ? -bike.lean * 0.05
      : this.roll + (-bike.lean * 0.05 - this.roll) * (1 - Math.exp(-dt * 4));
    camera.rotateZ(this.roll);
    this.setFov(camera, 58 + speed * 20, dt, instant);
  }

  /** Vertical offset from landings and surface roughness. */
  shake(bike, dt, instant) {
    if (instant) return 0;
    this.shakeTime += dt;
    const t = this.shakeTime,
      impulse = bike.visualImpact || 0,
      rough = bike.air ? 0 : clamp(bike.speed / 20, 0, 1) * (bike.surface?.grip < 0.8 ? 1 : 0.35);
    return (
      Math.sin(t * 28) * impulse * 0.035 +
      (Math.sin(t * 47.1) * 0.6 + Math.sin(t * 71.3) * 0.4) * rough * 0.012
    );
  }

  setFov(camera, target, dt, instant) {
    camera.fov += (target - camera.fov) * (instant ? 1 : 1 - Math.exp(-dt * 2));
    camera.updateProjectionMatrix();
  }

  /** First-person view from the rider's helmet, following bike pitch and lean. */
  helmet(camera, bike, terrain, dt, instant) {
    const forward = forwardOf(bike.yaw),
      up = 1.62 - (bike.frontCompression + bike.rearCompression) * 0.5 - (bike.jumpCharge || 0) * 0.18;
    camera.position.set(bike.x, bike.y + up, bike.z).addScaledVector(forward, -0.05);
    camera.position.y = Math.max(
      camera.position.y,
      terrain.sample(camera.position.x, camera.position.z) + 0.5
    );
    camera.position.y += this.shake(bike, dt, instant) * 1.6;
    this.focus.copy(camera.position).addScaledVector(forward, 10);
    this.focus.y += Math.tan(bike.pitch) * 10 - 1.4;
    camera.lookAt(this.focus);
    camera.rotateZ(-bike.lean * 0.6);
    this.setFov(camera, 82 + clamp(bike.speed / 25, 0, 1) * 8, dt, instant);
  }
}
