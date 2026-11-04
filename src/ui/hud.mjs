import { formatTime, wrapAngle } from '../sim/physics.mjs';
import { $, show } from '../core/dom.mjs';

const pad2 = n => n.toString().padStart(2, '0');
const signed = seconds => (seconds >= 0 ? '+' : '−') + Math.abs(seconds).toFixed(2) + ' s';

/** Speed, timer, progress, airtime and jump-charge readouts. */
export function updateHud({ bike, region, trail, tracker, elapsed, nearestIndex }) {
  $('speed').textContent = pad2(Math.round(bike.speed * 3.6));
  $('altitude').textContent = Math.round(bike.y + region.heightOrigin) + ' M';
  $('timer').textContent = formatTime(elapsed);
  $('progress').style.width = (nearestIndex / (trail.points.length - 1)) * 100 + '%';
  $('checkpoint-label').textContent =
    `CHECKPOINT ${pad2(Math.min(tracker.next, trail.checkpoints.length))} / ${pad2(trail.checkpoints.length)}`;
  show('airtime', bike.air && bike.airtime > 0.25);
  if (bike.air) $('airtime').querySelector('b').textContent = bike.airtime.toFixed(1);
  $('surface-label').textContent = bike.surface.name.toUpperCase();
  $('surface-label').dataset.loose = bike.surface.grip < 0.8 ? 'yes' : 'no';
  show('hop-charge', bike.jumpCharge > 0.04 && !bike.air);
  $('hop-fill').style.width = bike.jumpCharge * 100 + '%';
  $('touch-jump').style.setProperty('--charge', bike.jumpCharge * 100 + '%');
}

/** Heading arrow to the next checkpoint, world beacon and live ghost gap. */
export function updateNavigation({ bike, trail, tracker, waypoint, ghostTrace, elapsed, nearestIndex }) {
  const p = trail.points[trail.checkpoints[Math.min(tracker.next, trail.checkpoints.length - 1)]],
    distance = Math.hypot(p[0] - bike.x, p[2] - bike.z),
    bearing = Math.atan2(-(p[0] - bike.x), -(p[2] - bike.z));
  $('waypoint-arrow').style.transform = `rotate(${(-wrapAngle(bearing - bike.yaw) * 180) / Math.PI}deg)`;
  $('waypoint-distance').textContent =
    `CP ${pad2(Math.min(tracker.next + 1, trail.checkpoints.length))} · ${Math.round(distance)} m`;
  waypoint.place(p, !tracker.complete);
  const reference = ghostTrace.timeAtProgress(nearestIndex / (trail.points.length - 1));
  $('ghost-gap').textContent =
    reference === null ? 'GEIST · ERSTER RUN' : 'GEIST ' + signed(elapsed - reference);
  $('ghost-gap').dataset.ahead = reference !== null && elapsed < reference ? 'yes' : 'no';
}

let splitTimeout;
export function showSplit(elapsed, reference) {
  const difference = reference === undefined ? null : elapsed - reference;
  $('split-time').textContent = formatTime(elapsed);
  $('split-gap').textContent =
    difference === null ? 'ERSTE ZWISCHENZEIT' : signed(difference) + ' ZUM BESTEN RUN';
  $('split-feedback').dataset.ahead = difference !== null && difference < 0 ? 'yes' : 'no';
  show('split-feedback', true);
  clearTimeout(splitTimeout);
  splitTimeout = setTimeout(() => show('split-feedback', false), 4200);
}

/** Flow bar and the take-off timing ring shown while preloading towards a lip. */
export function updateRideAids({ bike, flow }) {
  $('flow-fill').style.width = flow.value.toFixed(1) + '%';
  $('flow-grade').textContent = flow.grade();
  const ring = $('pop-ring'),
    preloading = !bike.air && bike.jumpCharge > 0.08 && bike.lipAhead > 0.02;
  show('pop-ring', preloading);
  if (preloading) {
    // The target ring closes in as the lip approaches; release when it turns green.
    $('pop-target').style.setProperty('--t', (1.6 - bike.lipAhead * 0.6).toFixed(3));
    $('pop-target').style.setProperty('--o', (0.4 + bike.lipAhead * 0.6).toFixed(3));
    ring.dataset.ready = bike.lipAhead > 0.6 ? 'yes' : 'no';
  }
}

let calloutTimeout;
export function callout(text, detail = '', duration = 1100) {
  const el = $('trick-callout');
  el.innerHTML = text + (detail ? `<small>${detail}</small>` : '');
  el.classList.add('show');
  clearTimeout(calloutTimeout);
  calloutTimeout = setTimeout(() => el.classList.remove('show'), duration);
}
