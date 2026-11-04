import { formatTime } from '../sim/physics.mjs';
import { SETUP_PRESETS } from '../sim/setup.mjs';

const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
const cta = (id, text, primary = false) =>
  `<button id="${id}" class="${primary ? 'primary' : 'secondary'}">${text}${primary ? ' <span>↗</span>' : ''}</button>`;
const km = trail => (Math.round(trail.length / 10) / 100).toFixed(2);

export function regionHtml({ selected, region, trail, asset }) {
  const alpine = selected.id === 'lenzerheide',
    area = (((region.bounds[2] - region.bounds[0]) * (region.bounds[3] - region.bounds[1])) / 1e6).toFixed(1);
  return `<span class="micro">SWISS TERRAIN SERIES / ${selected.number}</span>
<h2>${selected.label}.<br>Deine eigene Linie.</h2>
<p>${
    alpine
      ? 'Von Scharmoin hinunter Richtung Rothorn-Talstation. Alpine Flow führt über offene Hänge und durch Nadelwald; Roots Line nimmt die kürzere, technische Variante.'
      : 'Das Uetliberg-Massiv über Zürich, als vollständig vorbereitetes 3D-Gelände.'
  } ${area} km² befahrbares Gelände, Höhen aus swissALTI3D und Luftbilder aus SWISSIMAGE.${
    alpine ? ' Dazu kommt das vorab modellierte Bergpanorama.' : ''
  }</p>
<p>Die ${km(trail)} km lange ${selected.title}-Abfahrt ist für dieses Spiel gestaltet. Sie bildet keine offizielle Bikepark-Linie nach und dient nicht als reale Navigation.</p>
<p>Das Gelände wurde aus lokal heruntergeladenen Daten in Blender gebaut. Während deiner Fahrt werden keine Karten oder Geodaten gestreamt.</p>
<p>${link('https://www.swisstopo.admin.ch/de/hoehenmodell-swissalti3d', 'Höhendaten')} · ${link(
    'https://www.swisstopo.admin.ch/de/orthobilder-swissimage-10-cm',
    'Luftbilder'
  )} · ${link(asset('sources.json'), 'Datenstände und Quellen')}<br>©swisstopo · Lokaler Datenstand ${
    region.sourceSnapshot
  }</p>
<p>Vegetation und PBR-Materialien: ${link('https://polyhaven.com/', 'Poly Haven')} · CC0. ${link(
    asset('art-sources.json'),
    'Materialquellen'
  )}.</p>
<p>${link('https://github.com/Trapanotto/downhill', 'Spiel und Quellcode: Trapanotto/downhill')}</p>`;
}

export function controlsHtml(touch) {
  const keys = [
    ['W / ↑', 'Treten'],
    ['S / ↓', 'Bremsen'],
    ['A D / ← →', 'Lenken'],
    ['Leertaste', 'Halten: vorspannen · loslassen: springen'],
    ['R', 'Zum Checkpoint (+3 s)'],
    ['Shift / X', 'Gewicht vor / zurück'],
    ['V', 'Hinterradbremse'],
    ['C / P / M', 'Kamera / Pause / Sound'],
  ];
  return `<span class="micro">DEIN BIKE. DEINE KONTROLLE.</span><h2>Finde deinen Flow.</h2>
<div class="controls">${keys.map(([k, v]) => `<p><b>${k}</b>${v}</p>`).join('')}</div>
<p>Gamepad: linker Stick lenkt und verlagert das Gewicht, RT tritt, LT bremst dosiert. A halten und loslassen: springen. Auf dem Smartphone: links lenken; den Daumen vor/zurück bewegen für Gewichtsverlagerung. Rechts bremsen, für mehr Bremskraft nach oben ziehen. Sprung halten und loslassen. Autopedal lässt sich in den Optionen einstellen.</p>
<p>Du kannst die markierte Linie verlassen und das ganze vorbereitete Gebiet frei befahren. R setzt dich nur auf deinen Befehl zurück. Im Zeitfahren müssen die Checkpoints der Reihe nach passiert werden. Deine Bestzeit und dein Geist bleiben auf diesem Gerät gespeichert.</p>${
    touch
      ? '<span class="portrait-tip">Tipp: Drehe dein Smartphone ins Querformat für mehr Sicht auf die Strecke.</span>'
      : ''
  }`;
}

export function settingsHtml({ sensitivity, showPerformance, autoPedal, soundEnabled }) {
  const checked = on => (on ? 'checked' : '');
  return `<span class="micro">DEIN SETUP</span><h2>Bereit für den Berg.</h2>
<label>Grafik<select id="quality"><option value="high">Ultra · 4K-Texturen</option><option value="balanced">Ausgewogen</option><option value="mobile">Mobil · 2K-Texturen</option></select></label>
<label>Lenkempfindlichkeit<input id="sensitivity" type="range" min="0.5" max="1.5" value="${sensitivity}" step=".1"></label>
<label>Leistungsanzeige<input id="performance-setting" type="checkbox" ${checked(showPerformance)}></label>
<label>Automatisch treten<input id="autopedal" type="checkbox" ${checked(autoPedal)}></label>
<label>Natur- und Fahrgeräusche<input id="audio-setting" type="checkbox" ${checked(soundEnabled)}></label>
<p>Grafikwechsel lädt das vorbereitete Gebiet neu. Die Bildauflösung passt sich bei Bedarf automatisch an die Leistung deines Geräts an.</p>
${cta('performance-report', 'MESSWERTE ANZEIGEN')}${cta('offline-save', 'SPIEL OFFLINE SPEICHERN')}
<p id="offline-status" role="status"></p>${cta('apply', 'EINSTELLUNGEN ÜBERNEHMEN', true)}`;
}

const SETUP_SLIDERS = [
  ['suspension', 'Federung', 'Straff / direkt', 'Weich / komfortabel'],
  ['tyres', 'Reifengrip', 'Leicht rollend', 'Griffig / mehr Widerstand'],
  ['brakes', 'Bremskraft', 'Sanft dosiert', 'Kräftig / schneller am Griplimit'],
];

export function bikeSetupHtml(draft) {
  const presets = Object.entries(SETUP_PRESETS)
    .map(([id, p]) => `<button data-preset="${id}">${p.label}</button>`)
    .join('');
  const sliders = SETUP_SLIDERS.map(
    ([key, label, low, high]) =>
      `<label>${label} <output id="${key}-value"></output><input id="setup-${key}" type="range" min="0" max="100" step="5" value="${draft[key] * 100}" aria-label="${label}"></label><small class="setup-scale">${low} <span>${high}</span></small>`
  ).join('');
  return `<span class="micro">DEIN BIKE</span><h2>Stimme deinen Ride ab.</h2>
<div class="setup-presets">${presets}</div><p id="setup-description"></p>${sliders}
<p>Mehr Grip erhöht auch den Rollwiderstand. Eine weichere Federung federt stärker ein. Bestzeit und Geist werden für jede Abstimmung separat geführt.</p>
${cta('save-bike', 'ABSTIMMUNG SPEICHERN', true)}`;
}

export function setupDescription(draft) {
  if (draft.suspension > 0.6) return 'Komfort auf Wurzeln und Landungen.';
  if (draft.suspension < 0.4) return 'Direkte Rückmeldung und straffe Federung.';
  return 'Vielseitige Abstimmung für alle drei Routen.';
}

const QUALITY_LABELS = { high: 'Ultra', mobile: 'Mobil', balanced: 'Ausgewogen' };

export function performanceHtml(record, { label, quality }) {
  const body = record
    ? `<div class="performance-stats"><div><strong>${record.fps}</strong><span>FPS IM MITTEL</span></div><div><strong>${record.p95Ms}<small> ms</small></strong><span>95 % DER FRAMES</span></div></div>
<p>${label} · ${QUALITY_LABELS[quality] || 'Ausgewogen'}<br>${Math.round(record.triangles / 1000)} Tausend Dreiecke · ${record.drawCalls} Zeichenaufrufe<br>Renderfaktor ${record.dpr} · Anpassungsstufe ${record.level}/3</p>
<p>Gemessen während der Fahrt auf diesem Gerät. P95 zeigt die langsameren Frames: kleinere Werte bedeuten gleichmässigere Darstellung. Die Automatik reduziert bei längerer hoher Last Auflösung und Vegetationsdetails.</p>`
    : '<p>Fahre mindestens drei Sekunden, um Messwerte für dieses Grafikprofil zu sammeln. Unter Optionen kannst du die Leistungsanzeige während der Fahrt einschalten.</p>';
  return `<span class="micro">DEIN GERÄT / AKTUELLES GRAFIKPROFIL</span><h2>So läuft dein Ride.</h2>${body}${cta(
    'back-settings',
    'ZURÜCK ZU OPTIONEN',
    true
  )}`;
}

export function pauseHtml() {
  return `<span class="micro">DURCHATMEN</span><h2>Der Berg wartet.</h2><p>Dein Run ist pausiert. Gleich geht es auf deiner Linie weiter.</p>${cta(
    'resume',
    'WEITERFAHREN',
    true
  )}${cta('restart', 'RUN NEU STARTEN')}${cta('exit-run', 'ZUM HAUPTMENÜ')}`;
}

export function finishHtml({ title, elapsed, race, isBest, medal, maxSpeed, totalAir, crashes }) {
  const badge = race ? (isBest ? 'NEUE BESTZEIT · ' : '') + medal : 'FREIE FAHRT';
  return `<span class="micro">${title.toUpperCase()} / GESCHAFFT</span><h2>Unten angekommen.</h2>
<div class="finish-time">${formatTime(elapsed)}</div><span class="medal">${badge}</span>
<div class="finish-stats"><div><b>${Math.round(maxSpeed)}</b><span>KM/H MAX</span></div><div><b>${totalAir.toFixed(1)} s</b><span>AIR TIME</span></div><div><b>${crashes}</b><span>NEUSTARTS</span></div></div>
${cta('again', 'NOCH EINE ABFAHRT', true)}${cta('back-menu', 'ZUM HAUPTMENÜ')}`;
}
