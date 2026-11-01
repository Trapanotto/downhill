# Trapanotto Downhill Biking

A playable Three.js downhill biking game on **real Uetliberg terrain above Zürich**, for desktop and smartphones.

**Play:** https://trapanotto.github.io/downhill/

## Ride

- 7 km² of prebuilt Swiss terrain; a designed **1.91 km Skyline Run** with **371 m descent**.
- Time trial with ordered checkpoints, medals, a saved personal best and a local ghost; free ride mode.
- Custom fixed-step bicycle handling, slope gravity, braking, steering, bunnyhops, airborne landings, trunk collisions and checkpoint respawn.
- Full-suspension bike and rider model; 4,200 instanced broadleaf trees, aerial terrain textures, foliage cutouts, shadows, dust and atmospheric lighting.
- Desktop / balanced / mobile graphics, automatic render-resolution adjustment and smartphone touch controls.
- Optional procedural riding audio. All game libraries and art ship with the build. No analytics, accounts or external runtime services.

### Controls

| Action | Desktop | Smartphone / gamepad |
|---|---|---|
| Pedal | W / Up | Autopedal option / RT |
| Brake | S / Down | Hold brake / LT |
| Steer | A D / Left Right | Left thumb pad / left stick |
| Bunnyhop | Space | Jump / A |
| Respawn | R | Crash dialog; +3 seconds in a time trial |
| Camera / pause / sound | C / P or Escape / M | On-screen buttons |

Landscape orientation is recommended on a phone; portrait is supported. Actual speed and graphical fidelity depend on device/browser capabilities. There is no multiplayer server.

## Local development

Requires Node.js 22+.

```sh
npm ci
npm run dev
npm test
node scripts/check_run.mjs
npm run build
npm run preview
```

Vite's base is `/downhill/`, matching the repository's GitHub Pages URL. `.github/workflows/pages.yml` tests, builds and publishes `dist/` on pushes to `main`. In repository Settings → Pages select **GitHub Actions** as the source. Only static game assets are published; Blender and source rasters are not loaded by the game.

## Real geodata → Blender → static assets

`Uetliberg.blend` is the editable, self-contained Blender source: terrain, designed trail, linked tree instances, bike, rider and a simplified summit landmark. The terrain's horizontal origin is **LV95 E 2,679,500 / N 1,245,000**; vertical origin **400 m LN02**. One game unit is one metre. In Three.js, +X is east, +Y is elevation, +Z is south.

- Extent: E 2,678,500–2,681,000; N 1,243,800–1,246,600 (2.5 × 2.8 km).
- Source terrain: **swissALTI3D 2026**, 2 m GeoTIFF, downloaded once. Desktop mesh / physics sampling: 4 m; mobile mesh: 8 m. Dataset resolution is not equivalent to vertical accuracy.
- Aerial source: **SWISSIMAGE 2025**, 10 cm GeoTIFF tiles, locally mosaicked and resampled to a 4096 px desktop / 2048 px mobile texture.
- Source dates, download URLs, SHA-256 hashes and sizes: [`public/assets/sources.json`](public/assets/sources.json).
- `.blend` includes the prepared terrain and aerial texture; no Blender addon is needed.
- Trees, bike, rider, trail and the simplified landmark are authored assets. Vegetation is an artistic reconstruction informed by aerial imagery, not a tree inventory. The Skyline Run is a **fictional game route**, not a navigation aid or claim about permitted real-world biking trails.

To reproduce the source processing (Python 3.9+, Blender 4.5 LTS):

```sh
python -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/prepare_geodata.py
blender --background --python scripts/build_world.py
node scripts/optimize_models.mjs
```

The preparation script downloads source tiles to a sibling `geodata/` cache. The game uses only the derived static files in `public/assets/`. Raw source tiles are intentionally excluded from Git. No swisstopo, map tile or elevation API is called while playing. Model geometry uses Meshopt compression, decoded locally by the bundled Three.js decoder.

## Offline

Options → **Spiel offline speichern** caches the complete published game package on that device. Open the game online once and wait for the explicit confirmation. Storage availability and eviction are controlled by the browser. The service worker is generated at build time; it never fetches new terrain while riding. A newly deployed version requires connectivity to update the shell and models.

## Attribution and rights

Geodata: **©swisstopo**. [swisstopo OGD terms](https://www.swisstopo.admin.ch/de/nutzungsbedingungen-kostenlose-geodaten-und-geodienste), [swissALTI3D](https://www.swisstopo.admin.ch/de/hoehenmodell-swissalti3d), [SWISSIMAGE](https://www.swisstopo.admin.ch/de/orthobilder-swissimage-10-cm), [geo.admin.ch STAC documentation](https://docs.geo.admin.ch/download-data/stac-api/overview.html).

Manrope font: SIL Open Font License, included in `public/assets/manrope-OFL.txt`. Three.js: MIT; Meshoptimizer: MIT. Third-party components retain their own licences. The referenced commercial games supplied inspiration only; their artwork, audio and trademarks are not incorporated.
