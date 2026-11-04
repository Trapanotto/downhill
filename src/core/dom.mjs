import { clamp } from '../sim/physics.mjs';

export const $ = id => document.getElementById(id);

export function show(id, visible) {
  $(id).classList.toggle('hidden', !visible);
}

let toastTimeout;
export function toast(message, duration = 2300) {
  $('toast').textContent = message;
  $('toast').style.opacity = '1';
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => ($('toast').style.opacity = '0'), duration);
}

export function setLoading(ratio, message) {
  $('load-bar').style.width = Math.round(clamp(ratio, 0, 1) * 100) + '%';
  if (message) $('load-text').textContent = message;
}

export function dialog(html, onClose) {
  $('panel-content').innerHTML = html;
  $('panel').showModal();
  $('panel').onclose = () => {
    if (onClose) onClose();
  };
}

export function closePanel() {
  $('panel').close();
}
