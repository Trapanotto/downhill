/**
 * Dense, deterministic undergrowth in a 2.5–7 m belt beside the trail, where the player looks
 * most of the time. Purely visual: these plants are not colliders.
 */
export function trailsideDecor(trail, terrain, { alpine = false, step = 2 } = {}) {
  let seed = 9173;
  const random = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
  const grass = [],
    ferns = [],
    points = trail.points;
  for (let i = 4; i < points.length - 4; i += step) {
    const p = points[i],
      q = points[i + 2],
      dx = q[0] - p[0],
      dz = q[2] - p[2],
      length = Math.hypot(dx, dz) || 1,
      nx = -dz / length,
      nz = dx / length;
    for (const side of [-1, 1]) {
      const lateral = 2.5 + random() ** 1.6 * 4.5,
        along = (random() - 0.5) * 1.6,
        x = p[0] + nx * lateral * side + (dx / length) * along,
        z = p[2] + nz * lateral * side + (dz / length) * along;
      if (terrain.surfaceAt && terrain.surfaceAt(x, z).distance < 2.3) continue;
      const y = terrain.sample(x, z),
        rotation = random() * Math.PI * 2,
        fernChance = alpine ? 0.12 : 0.42;
      if (random() < fernChance) ferns.push([x, y, z, 0.55 + random() * 0.6, rotation]);
      else grass.push([x, y, z, 0.7 + random() * 0.9, rotation]);
      // A second, smaller clump fills gaps right at the trail edge.
      if (lateral < 4 && random() < 0.6) {
        const ex = x + (random() - 0.5) * 1.2,
          ez = z + (random() - 0.5) * 1.2;
        if (!terrain.surfaceAt || terrain.surfaceAt(ex, ez).distance >= 2.3)
          grass.push([ex, terrain.sample(ex, ez), ez, 0.5 + random() * 0.6, random() * Math.PI * 2]);
      }
    }
  }
  return { grass, ferns };
}
