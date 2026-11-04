import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0),
  turn = new THREE.Quaternion(),
  axis = new THREE.Vector3();

/** A tumbling rigid body pivoting around its centre of mass, bouncing on the heightfield. */
class Body {
  constructor(scene, object, centreHeight, radius) {
    this.object = object;
    this.parent = object.parent;
    this.local = {
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      scale: object.scale.clone(),
    };
    object.updateWorldMatrix(true, false);
    this.pivot = new THREE.Group();
    this.pivot.position.copy(object.getWorldPosition(new THREE.Vector3())).addScaledVector(UP, centreHeight);
    scene.add(this.pivot);
    this.pivot.attach(object);
    this.radius = radius;
    this.velocity = new THREE.Vector3();
    this.spin = new THREE.Vector3();
  }

  step(dt, terrain) {
    const p = this.pivot.position;
    this.velocity.y -= 9.81 * dt;
    p.addScaledVector(this.velocity, dt);
    const ground = terrain.sample(p.x, p.z) + this.radius;
    if (p.y < ground) {
      p.y = ground;
      if (this.velocity.y < 0) this.velocity.y *= -0.32;
      this.velocity.x *= 0.62;
      this.velocity.z *= 0.62;
      this.spin.multiplyScalar(0.62);
    }
    const rate = this.spin.length();
    if (rate > 1e-4) {
      turn.setFromAxisAngle(axis.copy(this.spin).divideScalar(rate), rate * dt);
      this.pivot.quaternion.premultiply(turn);
    }
  }

  /** Returns the object to its original parent and local pose. */
  restore(scene) {
    this.parent.attach(this.object);
    this.object.position.copy(this.local.position);
    this.object.quaternion.copy(this.local.quaternion);
    this.object.scale.copy(this.local.scale);
    scene.remove(this.pivot);
  }
}

/** Crash presentation: rider and bike separate and tumble for a moment. Physics is unaffected. */
export class CrashTumble {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.bodies = [];
    this.focus = new THREE.Vector3();
  }

  get active() {
    return this.bodies.length > 0;
  }

  start(player, rider, bike) {
    this.stop();
    const forward = new THREE.Vector3(-Math.sin(bike.yaw), 0, -Math.cos(bike.yaw)),
      right = new THREE.Vector3(Math.cos(bike.yaw), 0, -Math.sin(bike.yaw)),
      speed = Math.max(3, bike.speed),
      side = bike.lean >= 0 ? 1 : -1;
    // Rider first: it must leave the bike before the bike itself is re-parented.
    const body = new Body(this.scene, rider, 1.0, 0.42);
    body.velocity
      .copy(forward)
      .multiplyScalar(speed * 0.85)
      .addScaledVector(UP, 2.2 + speed * 0.12)
      .addScaledVector(right, side * 0.8);
    body.spin
      .copy(right)
      .multiplyScalar(-(3 + speed * 0.35))
      .addScaledVector(forward, side * 2.2);
    const frame = new Body(this.scene, player, 0.55, 0.38);
    frame.velocity
      .copy(forward)
      .multiplyScalar(speed * 0.45)
      .addScaledVector(UP, 1.2)
      .addScaledVector(right, -side * 0.6);
    frame.spin
      .copy(forward)
      .multiplyScalar(side * (4 + speed * 0.25))
      .addScaledVector(UP, side * 2.5);
    this.bodies = [body, frame];
    this.focus.copy(body.pivot.position);
  }

  update(dt) {
    for (const b of this.bodies) b.step(Math.min(dt, 1 / 30), this.terrain);
    if (this.bodies[0]) this.focus.lerp(this.bodies[0].pivot.position, 1 - Math.exp(-dt * 6));
  }

  stop() {
    // Restore in reverse order so the rider goes back into the bike group.
    for (const b of this.bodies.reverse()) b.restore(this.scene);
    this.bodies = [];
  }
}
