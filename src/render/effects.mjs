import * as THREE from 'three';

/** Radial gradient used for the contact shadow and dust sprites. */
export function softDisc() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d'),
    g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(8,17,8,.8)');
  g.addColorStop(0.5, 'rgba(8,17,8,.3)');
  g.addColorStop(1, 'rgba(8,17,8,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createContactShadow(scene) {
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 3.2),
    new THREE.MeshBasicMaterial({
      map: softDisc(),
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);
  return shadow;
}

const LIFETIME = 1.2;

/** Small pool of dust puffs kicked up behind the rear wheel. */
export class DustParticles {
  constructor(scene, count = 130) {
    this.positions = new Float32Array(count * 3);
    this.velocity = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.colors = new Float32Array(count * 3);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.23,
        map: softDisc(),
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        vertexColors: true,
        color: '#dac2a1',
      })
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(dt, bike, riding) {
    const { positions, velocity, life, colors } = this;
    for (let i = 0; i < life.length; i++) {
      life[i] -= dt;
      const k = i * 3;
      if (life[i] > 0) {
        positions[k] += velocity[k] * dt;
        positions[k + 1] += velocity[k + 1] * dt;
        positions[k + 2] += velocity[k + 2] * dt;
        colors[k] = colors[k + 1] = colors[k + 2] = life[i] / LIFETIME;
      } else positions[k + 1] = -1000;
    }
    if (riding && !bike.air && bike.speed > 5) {
      const i = this.cursor++ % life.length,
        k = i * 3;
      life[i] = LIFETIME;
      positions[k] = bike.x + Math.sin(bike.yaw) * 0.7;
      positions[k + 1] = bike.y + 0.12;
      positions[k + 2] = bike.z + Math.cos(bike.yaw) * 0.7;
      velocity[k] = (Math.random() - 0.5) * 1.2;
      velocity[k + 1] = 0.4 + Math.random() * 0.5;
      velocity[k + 2] = (Math.random() - 0.5) * 1.2;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
