import * as THREE from 'three';
import { clamp } from '../sim/physics.mjs';
/** A fixed-size decal ring: skid marks have bounded GPU and memory cost. */
export class SkidMarks {
  constructor(scene, terrain, capacity = 180) {
    this.terrain = terrain;
    this.capacity = capacity;
    this.cursor = 0;
    this.previous = null;
    this.count = 0;
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.115, 1),
      new THREE.MeshBasicMaterial({
        color: '#352e23',
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
      }),
      capacity
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
    this.samples = new Float32Array(capacity);
  }
  reset() {
    this.mesh.count = 0;
    this.count = 0;
    this.cursor = 0;
    this.previous = null;
  }
  update(bike, seconds) {
    const skidding =
      !bike.air &&
      bike.speed > 3 &&
      ((bike.rearSlip > 0.12 && bike.brakePressure > 0.18) || Math.abs(bike.slip) > 0.16);
    const x = bike.x + Math.sin(bike.yaw) * 0.65,
      z = bike.z + Math.cos(bike.yaw) * 0.65;
    if (!skidding) {
      this.previous = null;
      return;
    }
    const p = { x, z };
    if (!this.previous) {
      this.previous = p;
      return;
    }
    const old = this.previous,
      length = Math.hypot(x - old.x, z - old.z);
    if (length < 0.22) return;
    if (length > 1.5) {
      this.previous = p;
      return;
    }
    const mx = (old.x + x) / 2,
      mz = (old.z + z) / 2,
      g = this.terrain.gradient(mx, mz),
      normal = new THREE.Vector3(-g.x, 1, -g.z).normalize(),
      along = new THREE.Vector3(x - old.x, 0, z - old.z);
    along.y = g.x * along.x + g.z * along.z;
    along.normalize();
    const right = new THREE.Vector3().crossVectors(along, normal).normalize();
    this.dummy.position.set(mx, this.terrain.sample(mx, mz) + 0.035, mz);
    this.dummy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, along, normal));
    this.dummy.scale.set(1, length * 1.08, 1);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(this.cursor, this.dummy.matrix);
    this.samples[this.cursor] = seconds;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.previous = p;
  }
}
export class RideFeedback {
  constructor() {
    this.impact = 0;
    this.serial = 0;
    this.crashSerial = 0;
  }
  reset(serial = 0) {
    this.impact = 0;
    this.serial = serial;
  }
  update(bike, dt, audio = null) {
    if (bike.landingSerial !== this.serial) {
      this.serial = bike.landingSerial;
      this.impact = clamp(bike.landingImpact / 13, 0, 0.85);
      audio?.impact(bike.landingImpact);
    }
    this.impact *= Math.exp(-dt * 10);
    return this.impact;
  }
}
