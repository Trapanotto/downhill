import * as THREE from 'three';

/** Checkpoint gates, start/finish banners and trail arrows for the selected route. */
export function buildCourse({ scene, terrain, collisions, trail, title }) {
  const last = trail.checkpoints.length - 1;
  const pole = (x, z, h, color) => {
    const o = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, h, 7),
      new THREE.MeshStandardMaterial({ color, roughness: 0.7 })
    );
    const bottom = terrain.sample(x, z);
    o.position.set(x, bottom + h / 2, z);
    o.castShadow = true;
    scene.add(o);
    collisions.add({ type: 'pole', x, z, bottom, top: bottom + h, radius: 0.045 });
    return o;
  };

  const gates = trail.checkpoints.map((index, n) => {
    const p = trail.points[index],
      q = trail.points[Math.min(index + 5, trail.points.length - 1)],
      prev = trail.points[Math.max(index - 5, 0)],
      dir = new THREE.Vector2(q[0] - prev[0], q[2] - prev[2]).normalize(),
      right = new THREE.Vector2(-dir.y, dir.x),
      facing = Math.atan2(-dir.x, -dir.y),
      endpoint = n === 0 || n === last;
    const group = [];
    for (const sign of [-1, 1]) {
      const x = p[0] + right.x * 2.6 * sign,
        z = p[2] + right.y * 2.6 * sign;
      group.push(pole(x, z, endpoint ? 3.7 : 2.25, n === last ? '#e6edcc' : '#ec774b'));
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.9),
        new THREE.MeshStandardMaterial({
          color: n === 0 ? '#ec774b' : '#dce6c3',
          side: THREE.DoubleSide,
          roughness: 0.8,
        })
      );
      flag.position.set(x, terrain.sample(x, z) + 1.6, z);
      flag.rotation.y = facing;
      scene.add(flag);
      group.push(flag);
    }
    if (endpoint) {
      const banner = createBanner(
        n === 0 ? 'TRAPANOTTO / START' : title.toUpperCase() + ' / FINISH',
        n === 0
      );
      banner.position.set(p[0], p[1] + 3.35, p[2]);
      banner.rotation.y = facing;
      scene.add(banner);
      group.push(banner);
    }
    return group;
  });
  buildTrailArrows(scene, trail);
  return { gates };
}

function createBanner(text, start) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 90;
  const ctx = c.getContext('2d');
  ctx.fillStyle = start ? '#ea7649' : '#e4eacb';
  ctx.fillRect(0, 0, 512, 90);
  ctx.fillStyle = '#183025';
  ctx.font = 'bold 32px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(text, 256, 55);
  return new THREE.Mesh(
    new THREE.PlaneGeometry(5.25, 0.85),
    new THREE.MeshStandardMaterial({
      map: Object.assign(new THREE.CanvasTexture(c), { colorSpace: THREE.SRGBColorSpace }),
      side: THREE.DoubleSide,
      roughness: 0.8,
    })
  );
}

function buildTrailArrows(scene, trail) {
  const mat = new THREE.MeshStandardMaterial({
    color: '#dfe8bb',
    roughness: 1,
    emissive: '#99ab72',
    emissiveIntensity: 0.08,
    side: THREE.DoubleSide,
  });
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.6);
  shape.lineTo(-0.48, -0.24);
  shape.lineTo(-0.29, -0.37);
  shape.lineTo(0, 0.13);
  shape.lineTo(0.29, -0.37);
  shape.lineTo(0.48, -0.24);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  for (let i = 28; i < trail.points.length - 10; i += 65) {
    const p = trail.points[i],
      q = trail.points[i + 4];
    const mark = new THREE.Mesh(geo, mat);
    mark.position.set(p[0], p[1] + 0.04, p[2]);
    mark.rotation.y = Math.atan2(q[0] - p[0], q[2] - p[2]);
    scene.add(mark);
  }
}

/** Light beam and ground ring marking the next checkpoint. */
export class Waypoint {
  constructor(scene) {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.65, 8, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: '#ff9764',
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.7, 0.065, 8, 40),
      new THREE.MeshBasicMaterial({ color: '#ffd6a0', transparent: true, opacity: 0.9, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    beam.position.y = 4;
    ring.position.y = 0.18;
    this.group = new THREE.Group();
    this.group.add(beam, ring);
    this.group.visible = false;
    scene.add(this.group);
  }

  set visible(value) {
    this.group.visible = value;
  }

  place(point, visible) {
    this.group.position.set(point[0], point[1], point[2]);
    this.group.visible = visible;
  }
}
