import { setupSignature } from '../sim/setup.mjs';
/** Explicit local asset routing. Geodata is never queried from the game. */
export const REGIONS = Object.freeze({
  uetliberg: {
    id: 'uetliberg',
    number: '01',
    label: 'Uetliberg',
    location: 'ZÜRICH / UETLIBERG',
    place: 'UETLIBERG, CH',
    caption: 'Uetliberg · Zürich · Schweiz',
    coordinates: '47°20′58″ N<br>8°29′29″ E',
    ortho: 'uetliberg',
    title: 'Skyline Run',
    difficulty: 'TECHNISCH',
    tagline: 'TRAIL & FLOW',
    lines: ['flow'],
  },
  lenzerheide: {
    id: 'lenzerheide',
    number: '02',
    label: 'Lenzerheide',
    location: 'GRAUBÜNDEN / LENZERHEIDE',
    place: 'LENZERHEIDE, CH',
    caption: 'Scharmoin · Lenzerheide · Schweiz',
    coordinates: '46°44′33″ N<br>9°34′23″ E',
    ortho: 'ortho',
    title: 'Alpine Flow',
    difficulty: 'FLOW',
    tagline: 'ALPINE FLOW',
    lines: ['flow', 'technical'],
  },
});
const localFiles = new Set([
  'region.json',
  'trail.json',
  'forest.json',
  'decor.json',
  'height.bin',
  'surface.bin',
  'sources.json',
  'art-sources.json',
  'surface-mask.png',
  'panorama-v4.glb',
  'landmark.glb',
  'ortho-4k.webp',
  'ortho-2k.webp',
  'floor-color.webp',
  'floor-normal.webp',
  'floor-arm.webp',
  'surface-details.json',
  'surface-details.bin',
  'terrain-v4-high.glb',
  'terrain-v4-mobile.glb',
  'corridor-v4-high.glb',
  'corridor-v4-mobile.glb',
  'tree-v4-high.glb',
  'tree-v4-mobile.glb',
  'tree-impostor-v4.webp',
]);
export function getSelection(search = '', preferred = 'uetliberg', preferredLine = 'flow') {
  const params = new URLSearchParams(search),
    id = params.has('region') ? params.get('region') : preferred;
  const region = REGIONS[id] || REGIONS.uetliberg,
    requested = params.get('line') || (params.has('region') ? 'flow' : preferredLine);
  const line = region.lines.includes(requested) ? requested : 'flow';
  return {
    ...region,
    line,
    title: line === 'technical' ? 'Roots Line' : region.title,
    difficulty: line === 'technical' ? 'TECHNISCH' : region.difficulty,
  };
}
export function assetPath(selection, name) {
  if (selection.id !== 'lenzerheide' || !localFiles.has(name)) return 'assets/' + name;
  if (name === 'trail.json' && selection.line === 'technical') name = 'trail-technical.json';
  return 'assets/lenzerheide/' + name;
}
export function recordKeys(selection, setup = {}) {
  const suffix = `${selection.id}.${selection.line}.v4.${setupSignature(setup)}`;
  return { best: 'best.' + suffix, ghost: 'ghost.' + suffix, splits: 'splits.' + suffix };
}
export function selectionUrl(base, id, line = 'flow') {
  const selection = getSelection('?region=' + encodeURIComponent(id) + '&line=' + encodeURIComponent(line));
  return base + '?region=' + selection.id + (selection.line === 'technical' ? '&line=technical' : '');
}
