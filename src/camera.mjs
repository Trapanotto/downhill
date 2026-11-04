import * as THREE from 'three';
/** Rider-aligned third-person chase. Obstructions shorten the rear arm, never orbit it. */
export class RideCamera {
  constructor() {
    this.focus = new THREE.Vector3();
    this.position = new THREE.Vector3();
    this.vertical = null;
    this.shakeTime = 0;
  }
  update(camera, bike, trail, index, terrain, obstacles, dt, far = false, instant = false) {
    const forward = new THREE.Vector3(-Math.sin(bike.yaw), 0, -Math.cos(bike.yaw)),
      distance = far ? 9 : 6.4;
    if (instant || this.vertical === null) this.vertical = bike.y;
    else this.vertical += (bike.y - this.vertical) * (1 - Math.exp(-dt * (bike.air ? 5 : 8)));
    const focusY = this.vertical + 1.22,
      lookDistance = 1.4 + Math.min(1.3, bike.speed * 0.055);
    this.focus.set(bike.x, focusY, bike.z).addScaledVector(forward, lookDistance);
    const anchor = new THREE.Vector3(
      bike.x,
      Math.max(this.vertical + 1.28, terrain.sample(bike.x, bike.z) + 1.1),
      bike.z
    );
    this.position.set(bike.x, this.vertical + (far ? 4.1 : 2.7), bike.z).addScaledVector(forward, -distance);
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
    this.shakeTime += dt;
    const impulse = instant ? 0 : bike.visualImpact || 0;
    camera.position.y += Math.sin(this.shakeTime * 28) * impulse * 0.035;
    camera.lookAt(this.focus);
    camera.rotateX(impulse * 0.01);
    camera.rotateZ(-bike.lean * 0.012);
    camera.fov += (58 + bike.speed * 0.14 - camera.fov) * (instant ? 1 : 1 - Math.exp(-dt * 2));
    camera.updateProjectionMatrix();
  }
}
