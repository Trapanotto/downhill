import * as THREE from 'three';
import { clamp } from './physics.mjs';
const UP = new THREE.Vector3(0, 1, 0);
/** Analytical two-bone IK, with an explicit elbow/knee bend direction. */
export function solveLimb(start, target, pole, l1, l2) {
  const direction = target.clone().sub(start),
    raw = direction.length();
  if (raw < 1e-7) direction.set(0, -1, 0);
  else direction.multiplyScalar(1 / raw);
  const distance = clamp(raw, Math.abs(l1 - l2) + 0.0001, l1 + l2 - 0.0001),
    bend = pole.clone().sub(start);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < 1e-9) bend.crossVectors(direction, new THREE.Vector3(1, 0, 0));
  if (bend.lengthSq() < 1e-9) bend.crossVectors(direction, UP);
  bend.normalize();
  const adjacent = (l1 * l1 + distance * distance - l2 * l2) / (2 * distance),
    height = Math.sqrt(Math.max(0, l1 * l1 - adjacent * adjacent));
  return {
    joint: start.clone().addScaledVector(direction, adjacent).addScaledVector(bend, height),
    end: start.clone().addScaledVector(direction, distance),
  };
}
export class RiderAnimator {
  constructor(player, riderScene, { crank = null, pedalL = null, pedalR = null, handlebar = null } = {}) {
    this.player = player;
    this.scene = riderScene;
    this.crank = crank;
    this.pedals = [pedalL, pedalR];
    this.handlebar = handlebar;
    this.phase = 0;
    this.bones = {};
    this.rest = {};
    player.updateMatrixWorld(true);
    const inverse = player.getWorldQuaternion(new THREE.Quaternion()).invert();
    riderScene.traverse(o => {
      if (o.isSkinnedMesh) o.frustumCulled = false;
      if (o.isBone) {
        this.bones[o.name] = o;
        this.rest[o.name] = {
          position: o.position.clone(),
          quaternion: o.quaternion.clone(),
          world: o.getWorldQuaternion(new THREE.Quaternion()).premultiply(inverse),
          length: o.userData.length || o.children.find(c => c.isBone)?.position.length() || 0.1,
        };
      }
    });
  }
  point(name) {
    return this.player.worldToLocal(this.bones[name].getWorldPosition(new THREE.Vector3()));
  }
  orient(name, direction) {
    const bone = this.bones[name],
      rest = this.rest[name];
    if (!bone) return;
    bone.parent.updateWorldMatrix(true, false);
    const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion()),
      worldDirection = direction.clone().transformDirection(this.player.matrixWorld),
      localDirection = worldDirection.applyQuaternion(parent.invert()).normalize(),
      restDirection = UP.clone().applyQuaternion(rest.quaternion);
    bone.quaternion.copy(
      new THREE.Quaternion().setFromUnitVectors(restDirection, localDirection).multiply(rest.quaternion)
    );
    bone.updateWorldMatrix(false, true);
  }
  rotate(name, x = 0, y = 0, z = 0) {
    const bone = this.bones[name];
    if (!bone) return;
    bone.parent.updateWorldMatrix(true, false);
    const world = this.player
      .getWorldQuaternion(new THREE.Quaternion())
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)))
      .multiply(this.rest[name].world);
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
    bone.updateWorldMatrix(false, true);
  }
  limb(upper, lower, target, pole) {
    const start = this.point(upper),
      solution = solveLimb(start, target, pole, this.rest[upper].length, this.rest[lower].length);
    this.orient(upper, solution.joint.clone().sub(start));
    this.orient(lower, solution.end.clone().sub(this.point(lower)));
  }
  update(bike, dt, throttle = 0, overridePhase = null) {
    if (overridePhase !== null) this.phase = overridePhase;
    else if (throttle > 0 && !bike.air && bike.brakePressure < 0.05 && bike.speed > 0.3)
      this.phase = (this.phase + dt * Math.min(9, 4 + bike.speed * 0.22) * throttle) % (Math.PI * 2);
    for (const [name, bone] of Object.entries(this.bones)) {
      bone.position.copy(this.rest[name].position);
      bone.quaternion.copy(this.rest[name].quaternion);
    }
    const weight = bike.weight || 0,
      brake = bike.brakePressure || 0,
      impact = Math.min(0.08, (bike.landingImpact || 0) * 0.009),
      charge = bike.jumpCharge || 0;
    if (this.bones.Root) {
      this.bones.Root.position.y -= charge * 0.14 + impact + brake * 0.035;
      this.bones.Root.position.z -= weight * 0.08;
      this.bones.Root.position.x = Math.sin(bike.lean || 0) * 0.035;
    }
    this.scene.updateMatrixWorld(true);
    this.rotate('Hips', 0, 0, -(bike.lean || 0) * 0.18);
    this.rotate('Spine', -weight * 0.12 - brake * 0.07 - charge * 0.08, 0, -(bike.lean || 0) * 0.25);
    this.rotate('Head', -0.025, -(bike.steer || 0) * 0.08, -(bike.lean || 0) * 0.12);
    const steering = -(bike.steer || 0) * 0.23;
    if (this.handlebar) this.handlebar.rotation.y = steering;
    for (const [side, suffix] of [
      [-1, 'L'],
      [1, 'R'],
    ]) {
      const hand = new THREE.Vector3(side * 0.35, 1.18, -0.59)
        .sub(new THREE.Vector3(0, 1.07, -0.49))
        .applyAxisAngle(UP, steering)
        .add(new THREE.Vector3(0, 1.07, -0.49));
      this.limb('UpperArm' + suffix, 'Forearm' + suffix, hand, new THREE.Vector3(side * 0.57, 1.39, -0.21));
      this.rotate('Hand' + suffix, 0, steering, 0);
      const phase = this.phase + (side === 1 ? Math.PI : 0),
        pedal = new THREE.Vector3(side * 0.18, 0.48 + Math.sin(phase) * 0.17, 0.18 + Math.cos(phase) * 0.17),
        ankle = pedal.clone().add(new THREE.Vector3(0, 0.12, 0.065));
      this.limb('Thigh' + suffix, 'Shin' + suffix, ankle, new THREE.Vector3(side * 0.35, 0.98, -0.3));
      this.orient('Foot' + suffix, new THREE.Vector3(0, -0.16, -1));
      const mesh = this.pedals[side === -1 ? 0 : 1];
      if (mesh) mesh.position.copy(pedal);
    }
    if (this.crank) this.crank.rotation.x = -this.phase;
    this.scene.updateMatrixWorld(true);
  }
}
