import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { RiderAnimator } from '../render/rider.mjs';
import { ReplayTrack } from './race.mjs';

/** One replay sample. Index order is part of the saved ghost format; do not reorder. */
export function ghostFrame({ elapsed, bike, progress, pedalPhase, wheelRotation }) {
  return [
    +elapsed.toFixed(3),
    +bike.x.toFixed(3),
    +bike.y.toFixed(3),
    +bike.z.toFixed(3),
    bike.yaw,
    bike.pitch,
    bike.lean,
    progress,
    pedalPhase,
    bike.weight,
    bike.frontCompression,
    bike.rearCompression,
    bike.steer,
    bike.brakePressure,
    bike.jumpCharge,
    wheelRotation,
    bike.landingImpact,
  ];
}

/** Translucent replay of the best run, sharing the player's rig. */
export class GhostRider {
  constructor(scene, template) {
    this.scene = scene;
    this.template = template;
    this.mesh = null;
    this.trace = new ReplayTrack([]);
  }

  load(frames) {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.traverse(o => {
        if (o.isMesh) o.material.dispose();
      });
      this.mesh = null;
    }
    this.trace = new ReplayTrack(frames || []);
    if (!frames?.length) return;
    const mesh = cloneSkeleton(this.template);
    mesh.traverse(o => {
      if (o.isMesh) {
        o.material = new THREE.MeshBasicMaterial({
          color: '#d9edce',
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
        });
        o.castShadow = false;
        o.frustumCulled = false;
      }
    });
    this.parts = {
      front: mesh.getObjectByName('WheelFrontPivot'),
      rear: mesh.getObjectByName('WheelRearPivot'),
      fork: mesh.getObjectByName('SuspensionForkPivot'),
    };
    this.animator = new RiderAnimator(mesh, mesh.getObjectByName('RiderVisual'), {
      crank: mesh.getObjectByName('CrankPivot'),
      pedalL: mesh.getObjectByName('PedalL'),
      pedalR: mesh.getObjectByName('PedalR'),
      handlebar: mesh.getObjectByName('HandlebarPivot'),
    });
    mesh.visible = false;
    this.scene.add(mesh);
    this.mesh = mesh;
  }

  hide() {
    if (this.mesh) this.mesh.visible = false;
  }

  update(elapsed) {
    const mesh = this.mesh;
    if (!mesh) return;
    const g = this.trace.sample(elapsed);
    mesh.visible = !!g;
    if (!g) return;
    const heave = (g[10] + g[11]) * 0.5,
      { front, rear, fork } = this.parts;
    mesh.position.set(g[1], g[2] - heave, g[3]);
    mesh.rotation.set(0, g[4], 0);
    mesh.rotateX(g[5] + (g[11] - g[10]) * 0.5);
    mesh.rotateZ(g[6]);
    if (front) {
      front.position.y = rear.position.y = 0.42 + heave;
      front.rotation.y = -g[12] * 0.23;
      front.rotation.x = rear.rotation.x = g[15];
    }
    if (fork) {
      fork.scale.y = 1 - g[10] * 0.65;
      fork.rotation.y = -g[12] * 0.1;
    }
    this.animator.update(
      {
        speed: 0,
        weight: g[9],
        lean: g[6],
        frontCompression: g[10],
        rearCompression: g[11],
        steer: g[12],
        brakePressure: g[13],
        jumpCharge: g[14],
        landingImpact: g[16],
      },
      0,
      0,
      g[8]
    );
  }
}
