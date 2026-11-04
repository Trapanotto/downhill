export const isTouchDevice = () =>
  matchMedia('(pointer:coarse)').matches ||
  navigator.maxTouchPoints > 0 ||
  matchMedia('(max-width:900px)').matches;

/** Graphics presets selectable in the options panel. */
export const QUALITY_PROFILES = {
  high: {
    terrain: 'high',
    tree: 'high',
    texture: '4k',
    trees: 4200,
    detailedTrees: 220,
    detailRadius: 95,
    grassCount: 1100,
    fernCount: 240,
    dpr: 1.75,
    shadow: 2048,
  },
  balanced: {
    terrain: 'mobile',
    tree: 'mobile',
    texture: '2k',
    trees: 4200,
    detailedTrees: 130,
    detailRadius: 75,
    grassCount: 700,
    fernCount: 150,
    dpr: 1.35,
    shadow: 1024,
  },
  mobile: {
    terrain: 'mobile',
    tree: 'mobile',
    texture: '2k',
    trees: 4200,
    detailedTrees: 36,
    detailRadius: 43,
    grassCount: 260,
    fernCount: 40,
    dpr: 1.1,
    shadow: 512,
  },
};
