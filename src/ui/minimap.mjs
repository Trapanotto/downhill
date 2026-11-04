import { minimapTransform } from '../gameplay/race.mjs';

/** Route overview drawn into a 240 px canvas at 12.5 Hz. */
export class Minimap {
  constructor(canvas, trail) {
    this.ctx = canvas.getContext('2d');
    this.trail = trail;
    this.transform = minimapTransform(trail.points);
    this.last = -1000;
  }

  draw(bike, nearestIndex, nextCheckpoint) {
    const stamp = performance.now();
    if (stamp - this.last < 80) return;
    this.last = stamp;
    const { ctx, transform } = this,
      { points, checkpoints } = this.trail;
    const path = (from, to) => {
      ctx.beginPath();
      for (let i = from; i <= to; i++) {
        const [x, y] = transform(points[i]);
        i === from ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    ctx.clearRect(0, 0, 240, 240);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#dce5bd88';
    path(0, points.length - 1);
    ctx.strokeStyle = '#f38a59';
    path(0, nearestIndex);

    const [cx, cy] = transform(points[checkpoints[Math.min(nextCheckpoint, checkpoints.length - 1)]]);
    ctx.fillStyle = '#f27344';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();

    const [x, y] = transform([bike.x, 0, bike.z]);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-bike.yaw);
    ctx.fillStyle = '#f2f4dd';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
