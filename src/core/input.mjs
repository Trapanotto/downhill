import { clamp } from '../sim/physics.mjs';
import { $ } from './dom.mjs';

const held = (keys, ...codes) => codes.some(code => keys.has(code));

/** Merges keyboard, touch and gamepad into the input object consumed by BikePhysics. */
export class InputController {
  constructor() {
    this.keys = new Set();
    this.touchSteer = 0;
    this.touchWeight = 0;
    this.touchBrake = 0;
    this.touchJumpHeld = false;
    this.state = { steer: 0, throttle: false, brake: false, jump: false, sensitivity: 1 };
  }

  clearKeys() {
    this.keys.clear();
  }

  clearTouch() {
    this.touchSteer = 0;
    this.touchWeight = 0;
    this.touchBrake = 0;
    this.touchJumpHeld = false;
  }

  clear() {
    this.clearKeys();
    this.clearTouch();
  }

  read(bike, { autoPedal, sensitivity }) {
    const keys = this.keys,
      input = this.state;
    input.steer =
      this.touchSteer +
      (held(keys, 'KeyD', 'ArrowRight') ? 1 : 0) -
      (held(keys, 'KeyA', 'ArrowLeft') ? 1 : 0);
    input.throttle = (autoPedal && bike.speed < 8.5) || held(keys, 'KeyW', 'ArrowUp');
    input.brake = Math.max(this.touchBrake, held(keys, 'KeyS', 'ArrowDown') ? 1 : 0);
    input.rearBrake = keys.has('KeyV') ? 1 : 0;
    input.weight = clamp(
      this.touchWeight + (held(keys, 'ShiftLeft', 'ShiftRight') ? 1 : 0) - (keys.has('KeyX') ? 1 : 0),
      -1,
      1
    );
    input.jumpHeld = this.touchJumpHeld || keys.has('Space');
    input.jump = false;
    input.sensitivity = sensitivity;
    const pad = navigator.getGamepads?.()?.find(p => p?.connected);
    if (pad) {
      const axis = pad.axes[0] || 0;
      input.steer += Math.abs(axis) > 0.12 ? (Math.sign(axis) * (Math.abs(axis) - 0.12)) / 0.88 : 0;
      input.weight = clamp(input.weight - (pad.axes[1] || 0), -1, 1);
      input.throttle = Math.max(Number(input.throttle), pad.buttons[7]?.value || 0);
      input.brake = Math.max(input.brake, pad.buttons[6]?.value || 0);
      input.jumpHeld ||= !!pad.buttons[0]?.pressed;
    }
    return input;
  }

  /** Wires the on-screen steering pad, brake and jump buttons. */
  bindTouchControls() {
    const steerPad = $('steer-pad'),
      brake = $('touch-brake'),
      jump = $('touch-jump'),
      releaseEvents = ['pointerup', 'pointercancel', 'lostpointercapture'];
    let steerPointer = null,
      brakePointer = null,
      brakeOrigin = 0;
    const steerAt = e => {
      const b = steerPad.getBoundingClientRect();
      const raw = clamp((e.clientX - b.left - b.width / 2) / (b.width * 0.42), -1, 1);
      this.touchSteer =
        Math.abs(raw) < 0.06 ? 0 : Math.sign(raw) * Math.pow((Math.abs(raw) - 0.06) / 0.94, 1.22);
      this.touchWeight = clamp(-(e.clientY - b.top - b.height / 2) / (b.height * 0.55), -1, 1);
      $('steer-knob').style.transform = `translate(${this.touchSteer * 30}px,${-this.touchWeight * 24}px)`;
    };
    steerPad.addEventListener('pointerdown', e => {
      steerPointer = e.pointerId;
      steerPad.setPointerCapture(e.pointerId);
      steerAt(e);
    });
    steerPad.addEventListener('pointermove', e => {
      if (e.pointerId === steerPointer) steerAt(e);
    });
    for (const event of releaseEvents)
      steerPad.addEventListener(event, () => {
        steerPointer = null;
        this.touchSteer = 0;
        this.touchWeight = 0;
        $('steer-knob').style.transform = '';
      });

    brake.addEventListener('pointerdown', e => {
      this.touchBrake = 0.68;
      brakeOrigin = e.clientY;
      brakePointer = e.pointerId;
      brake.setPointerCapture(e.pointerId);
      brake.style.setProperty('--brake', '68%');
    });
    brake.addEventListener('pointermove', e => {
      if (e.pointerId === brakePointer) {
        this.touchBrake = clamp(0.68 + (brakeOrigin - e.clientY) / 90, 0.15, 1);
        brake.style.setProperty('--brake', this.touchBrake * 100 + '%');
      }
    });
    for (const event of releaseEvents)
      brake.addEventListener(event, () => {
        this.touchBrake = 0;
        brakePointer = null;
        brake.style.setProperty('--brake', '0%');
      });

    jump.addEventListener('pointerdown', e => {
      this.touchJumpHeld = true;
      jump.setPointerCapture(e.pointerId);
    });
    for (const event of releaseEvents) jump.addEventListener(event, () => (this.touchJumpHeld = false));
  }
}
