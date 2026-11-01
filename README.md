# Trapanotto Downhill Biking

A playable Three.js downhill biking game on **real Swiss terrain at Uetliberg and Lenzerheide**, for desktop and smartphones.

**Play:** https://trapanotto.github.io/downhill/

## Ride

- Select **Uetliberg / Skyline Run** (1.89 km, 371 m descent) or **Lenzerheide / Alpine Flow** (2.89 km, 402 m descent).
- Lenzerheide also includes **Roots Line**, a shorter technical alternative (1.84 km), with its own checkpoints, times and ghost.
- 7 km² at Uetliberg; 5.29 km² playable Lenzerheide terrain plus a prebuilt surrounding mountain panorama. Only the selected region is loaded before riding.
- Time trial with ordered checkpoints, medals, a saved personal best and a local ghost; free ride mode.
- 120 Hz bicycle handling with filtered steering, progressive brakes, rear-wheel slip, rider weight shift, charged bunnyhops, damped suspension, classified landings, trunk collisions and checkpoint respawn.
- Animated full-suspension bike and rider; 4,200 broadleaf trees with photographic branch cards nearby and prebaked tree views in the distance. PBR ground, 572 rocks, 382 ferns, 2,288 grass clumps, 34 roots, shadows and dust.
- Desktop / balanced / mobile graphics, automatic render-resolution adjustment and smartphone touch controls.
- Optional procedural riding audio. All game libraries and art ship with the build. No analytics, accounts or external runtime services.

### Controls

| Action | Desktop | Smartphone / gamepad |
|---|---|---|
| Pedal | W / Up | Autopedal option / RT |
| Brake | S / Down; V rear brake | Hold brake, drag up for more force / LT |
| Steer | A D / Left Right | Left thumb pad / left stick |
| Bunnyhop | Hold and release Space | Hold and release jump / A |
| Weight shift | Shift forward / X back | Thumb pad up/down / left stick up/down |
| Respawn | R | Crash dialog; +3 seconds in a time trial |
| Camera / pause / sound | C / P or Escape / M | On-screen buttons |

Landscape orientation is recommended on a phone; portrait is supported. Actual speed and graphical fidelity depend on device/browser capabilities. There is no multiplayer server. Regions and lines have independent local best times and ghosts. Existing Uetliberg V2 records are retained. Selection is shareable through `?region=uetliberg`, `?region=lenzerheide` and `?region=lenzerheide&line=technical`.

## Local development

Requires Node.js 22+.

```sh
npm ci
npm run dev
npm test
node scripts/check_run.mjs
npm run build
node scripts/check_offline.mjs
npm run preview
```

Vite's base is `/downhill/`, matching the repository's GitHub Pages URL. `.github/workflows/pages.yml` tests, builds and publishes `dist/` on pushes to `main`. In repository Settings → Pages select **GitHub Actions** as the source. Only static game assets are published; Blender and source rasters are not loaded by the game.

## Real geodata → Blender → static assets

`Uetliberg.blend` is the editable, self-contained Blender source: terrain, designed trail, linked tree instances, bike, rider and a simplified summit landmark. The terrain's horizontal origin is **LV95 E 2,679,500 / N 1,245,000**; vertical origin **400 m LN02**. One game unit is one metre. In Three.js, +X is east, +Y is elevation, +Z is south.

- Extent: E 2,678,500–2,681,000; N 1,243,800–1,246,600 (2.5 × 2.8 km).
- Source terrain: **swissALTI3D 2026**, 2 m GeoTIFF, downloaded once. Physics sampling: 2 m. Base meshes: 4 m desktop / 8 m mobile. A 1 m inset corridor mesh is interpolated from that 2 m source, not additional measured detail. The fictional trail is graded locally with earthworks capped at ±1.6 m. Dataset resolution is not equivalent to vertical accuracy.
- Aerial source: **SWISSIMAGE 2025**, 10 cm GeoTIFF tiles, locally mosaicked and resampled to a 4096 px desktop / 2048 px mobile texture.
- Source dates, download URLs, SHA-256 hashes and sizes: [`public/assets/sources.json`](public/assets/sources.json).
- `.blend` includes the prepared terrain and aerial texture; no Blender addon is needed.
- Bike, rider, trail, rocks, grass, roots and the simplified landmark are authored assets. Tree/fern sources and ground materials are CC0 Poly Haven assets, reduced/baked offline; see `public/assets/art-sources.json`. Vegetation is an artistic reconstruction informed by aerial imagery, not a tree inventory. The Skyline Run is a **fictional game route**, not a navigation aid or claim about permitted real-world biking trails.

To reproduce the source processing (Python 3.9+, Blender 4.5 LTS):

```sh
python -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/prepare_geodata.py
.venv/bin/python scripts/prepare_materials_v2.py
.venv/bin/python scripts/prepare_terrain_v2.py
blender --background --python scripts/build_world.py
# The base authoring pass regenerates its trail; restore the V2 graded surface.
.venv/bin/python scripts/prepare_terrain_v2.py
blender --background --python scripts/build_v2.py
blender --background --python scripts/polish_vegetation_v2.py
.venv/bin/python scripts/finalize_v2_assets.py
node scripts/optimize_models.mjs
```

The preparation script downloads source tiles to a sibling `geodata/` cache. The game uses only the derived static files in `public/assets/`. Raw source tiles are intentionally excluded from Git. No swisstopo, map tile or elevation API is called while playing. Model geometry uses Meshopt compression, decoded locally by the bundled Three.js decoder.

## Lenzerheide / Alpine Flow

`Lenzerheide.blend` contains the complete editable second region: both graded routes, linked conifers, grass, ferns, stones, technical-route roots, bike/rider and a simplified Scharmoin shelter. The shelter is artistic geometry, not a building survey. The routes are fictional gameplay designs inspired by the landscape; they do not reproduce official Bike Kingdom lines.

- Playable extent: **E 2,761,400–2,763,700 / N 1,178,200–1,180,500**. Local origin: **E 2,762,500 / N 1,179,200**, vertical origin **1,400 m LN02**.
- Surrounding mountain extent: E 2,760,000–2,766,000 / N 1,176,000–1,182,000; geometry resampled offline at 32 m and textured with a fixed 2048 px aerial mosaic.
- Frozen sources: **swissALTI3D 2023, 2 m**, and **SWISSIMAGE 2025, 10 cm**. Thirty-six elevation tiles and thirty-six aerial tiles are documented with URLs, byte sizes and SHA-256 hashes in `public/assets/lenzerheide/sources.json`.
- Collision heightfield: 2 m; near terrain meshes: 4 m desktop / 8 m mobile. The 1 m route corridor is interpolated from the 2 m source. Both routes are locally graded; berms and five small rounded rollers are authored additions.
- 2,700 conifers, 3,464 grass clumps, 578 stones, 72 ferns and 38 technical-route roots are stored as fixed placements. Tree geometry derives from the smaller C variation of Poly Haven's CC0 `fir_tree_01`, reduced and baked in Blender. Meadow maps derive from CC0 `leafy_grass`. Source records: `public/assets/lenzerheide/art-sources.json`; shared art retains the root art manifest.

Rebuild the second region after preparing the existing Uetliberg source and shared art:

```sh
.venv/bin/python scripts/download_lenzerheide.py
.venv/bin/python scripts/prepare_alpine_art.py
.venv/bin/python scripts/prepare_lenzerheide.py
blender --background --python-exit-code 1 --python scripts/build_alpine_fir.py
blender --background --python-exit-code 1 --python scripts/build_lenzerheide.py
.venv/bin/python scripts/finalize_alpine_art.py
node scripts/optimize_models.mjs public/assets/lenzerheide
```

The source downloader replays the tracked frozen manifest and checks hashes by default. `--refresh` explicitly selects a new catalog snapshot. Downloads and authoring intermediates live in the sibling `geodata/lenzerheide/` cache, excluded from the repository and the published game. Runtime region changes reload only local, prebuilt assets; they never call swisstopo or Poly Haven. **Spiel offline speichern** stores both regions and both Alpine lines, so selection also works offline after saving.

## Offline

Options → **Spiel offline speichern** caches the complete published game package on that device. Open the game online once and wait for the explicit confirmation. Storage availability and eviction are controlled by the browser. The service worker is generated at build time; it never fetches new terrain while riding. A newly deployed version requires connectivity to update the shell and models. Asset URLs carry the package version to avoid mixing old heightfields/models with a new game shell. V2 best times and ghosts use separate local storage keys because its riding surface and handling changed.

## Attribution and rights

Geodata: **©swisstopo**. [swisstopo OGD terms](https://www.swisstopo.admin.ch/de/nutzungsbedingungen-kostenlose-geodaten-und-geodienste), [swissALTI3D](https://www.swisstopo.admin.ch/de/hoehenmodell-swissalti3d), [SWISSIMAGE](https://www.swisstopo.admin.ch/de/orthobilder-swissimage-10-cm), [geo.admin.ch STAC documentation](https://docs.geo.admin.ch/download-data/stac-api/overview.html).

Art: [Poly Haven CC0](https://polyhaven.com/license), powered by Poly Haven during one-time source preparation. Frozen URLs, hashes and derivative details are recorded in `public/assets/art-sources.json`. The game makes no live Poly Haven requests.

Manrope font: SIL Open Font License, included in `public/assets/manrope-OFL.txt`. Three.js: MIT; Meshoptimizer: MIT. Third-party components retain their own licences. The referenced commercial games supplied inspiration only; their artwork, audio and trademarks are not incorporated.
