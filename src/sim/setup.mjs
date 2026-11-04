const unit = x => Math.max(0, Math.min(1, Math.round((Number.isFinite(+x) ? +x : 0.5) * 20) / 20));
export const SETUP_PRESETS = Object.freeze({
  balanced: { label: 'Ausgewogen', suspension: 0.5, tyres: 0.5, brakes: 0.5 },
  flow: { label: 'Flow', suspension: 0.8, tyres: 0.35, brakes: 0.4 },
  technical: { label: 'Technik', suspension: 0.65, tyres: 0.9, brakes: 0.8 },
});
export function normalizeSetup(value = {}) {
  return {
    suspension: unit(value.suspension ?? 0.5),
    tyres: unit(value.tyres ?? 0.5),
    brakes: unit(value.brakes ?? 0.5),
  };
}
export function setupSignature(value) {
  const s = normalizeSetup(value);
  return [s.suspension, s.tyres, s.brakes].map(x => Math.round(x * 100)).join('-');
}
export function setupLabel(value) {
  const key = setupSignature(value);
  return Object.values(SETUP_PRESETS).find(p => setupSignature(p) === key)?.label || 'Individuell';
}
export function setupParameters(value) {
  const s = normalizeSetup(value);
  return {
    stiffness: 220 - 100 * s.suspension,
    damping: 24,
    travel: 0.17 + 0.08 * s.suspension,
    compression: 0.8 + 0.4 * s.suspension,
    grip: 0.86 + 0.28 * s.tyres,
    rolling: 0.075 + 0.03 * s.tyres,
    brake: 0.72 + 0.56 * s.brakes,
    absorption: 0.9 + 0.2 * s.suspension,
  };
}
