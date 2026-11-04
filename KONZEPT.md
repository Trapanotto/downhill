# Trapanotto Downhill – Konzept V5 „Line“

Stand: 4. November 2026 · Basis: Repo `Trapanotto/downhill` V4.0.0 (Three.js 0.180, Vite, ~120 KB eigener Code, 170 MB Assets)

---

## 1. Ehrliche Bestandsaufnahme

Das Fundament ist stark und ungewöhnlich: echtes swissALTI3D/SWISSIMAGE-Terrain, 120-Hz-Physik, IK-Rider, Ghosts, LOD, Offline-Modus, Blender-Pipeline. Was fehlt, ist **Handschrift**: Das Spiel wirkt technisch vollständig, aber nicht *inszeniert*. Typische Symptome eines „von einer KI zu Ende gebauten“ Projekts:

### Grafik
| Beobachtung (live getestet) | Ursache im Code |
|---|---|
| Flaches, milchiges Licht, kein Tiefengefühl | Keine Post-Processing-Kette (kein AO, kein Bloom, kein Color Grading, kein AA außer MSAA). Nur `ACESFilmic` + dünner `FogExp2`. |
| Boden = eine braune Fläche mit Laub-Tiling | Trail und Umgebung haben fast dasselbe Material. Keine Verschleißspur, keine Bremswellen, keine Spurrillen-Decals, kein Höhen-Blending zwischen Erde/Wurzeln/Steinen. |
| Bäume wirken wie Blobs, die Welt steht still | Kein Wind, keine Transluzenz, kaum Unterholz direkt am Trail – genau dort, wo der Spieler hinschaut. |
| Startbogen = orange Boxen mit Text | Placeholder-Geometrie, die nie ersetzt wurde. |
| Rider „Low-Poly-Puppe“ | Einfache Proportionen, flaches Jersey, keine Sekundärbewegung (Stoff, Kopf, Arme). |
| Menü = generische KI-Landingpage | „DER BERG. DEINE LINIE.“, viele winzige gesperrte Labels, Koordinaten, Versionsnummern, Texte überlagern sich („DEINE LINIE IST BEREIT“ läuft über die Karte). |

### Gameplay
| Beobachtung | Folge |
|---|---|
| Kaum Speed-Gefühl | Kamera 6,4 m dahinter, FOV steigt nur 0,14°/m·s, kein Motion Blur, kein frequenzabhängiges Rütteln. |
| Trail ist breit und gleichförmig | 4 (Uetliberg) bzw. 8 (Lenzerheide) Kicker auf ~2–3 km. Kein Rhythmus, keine Linienwahl. |
| Einziges Ziel: Zeit | Kein Skill-Ausdruck (Pumpen, Whip, Scrub, Manual), kein Score, keine Progression. |
| Crash = Dialog | Kein Ragdoll, keine Komik, kein „nochmal!“-Impuls. |
| Audio prozedural | Klingt synthetisch; DH lebt von Freilauf-Rattern, Reifen auf Kies, Kettenschlag. |

### Code
- `main.js` ist 48 KB in ~200 Zeilen „Code-Golf“-Stil – kaum wartbar, keine Typen.
- Assets aus V1–V4 liegen parallel in `public/` (`tree-v2/v3/v4…`), 170 MB.
- 41 Tests vorhanden – gut, darauf aufbauen.

---

## 2. Vision

> **„Die Schweiz, so wie sie sich bei 50 km/h anfühlt.“**
> Ein Downhill-Spiel, das auf echtem Gelände spielt und sich anfühlt wie ein gutes Helmkamera-Video: laut, schnell, staubig, mit Momenten, in denen man die Luft anhält.

### Vier Design-Säulen
1. **Flow & Speed** – Jede Sekunde muss Tempo spürbar sein. Speed kommt aus Können (Pumpen, Linie), nicht nur aus Gefälle.
2. **Linienwahl** – Jede Sektion bietet mindestens zwei Wege: schnell+riskant vs. sicher. Das ist der Kern von Downhill.
3. **Echter Ort** – Swisstopo-Daten sind das Alleinstellungsmerkmal. Landmarken, Licht und Vegetation sollen die Region erkennbar machen.
4. **Browser & Handy zuerst** – Kein Install. 60 fps auf einem 3 Jahre alten Mittelklasse-Handy ist Pflicht, nicht Option.

**Referenzen (nur Inspiration):** Lonely Mountains: Downhill (Lesbarkeit, Linien), Descenders (Pumpen, Flow), Riders Republic (Speed-Inszenierung), Red-Bull-Helmkamera-Videos (Look & Sound).

---

## 3. Gameplay-Konzept

### 3.1 Neue Kernmechaniken (Priorität absteigend)
| Mechanik | Beschreibung | Steuerung Desktop / Touch |
|---|---|---|
| **Pumpen** | In Senken/Rückseiten von Wellen Gewicht nach unten → Geschwindigkeitsgewinn. Falsches Timing bremst. Das wird der wichtigste Skill. | Shift (halten) / Daumen nach unten |
| **Preload-Sprung** | Ersetzt den „aufgeladenen Bunnyhop“: vor der Kante komprimieren, an der Kante loslassen. Timing bestimmt Höhe. Ein Timing-Ring am Bike zeigt das optimale Fenster (abschaltbar). | Space / Sprungknopf |
| **Scrub & Whip** | In der Luft Bike seitlich drücken: Scrub = flacher und schneller, Whip = Style. Landung muss gerade sein. | A/D in der Luft |
| **Manual** | Hinterrad-Balance über Wellen hält Speed. Balance-Anzeige subtil am Rand. | X halten |
| **Driften in Anliegern** | Hinterrad-Slip (existiert schon) bewusst auslösbar, mit Staubfahne und Sound. | V + Lenken |
| **Ragdoll-Crash** | Physikbasierter Sturz (Rider vom Bike getrennt, 1–2 s), kurzer Replay-Clip, Sofort-Respawn mit einer Taste. | automatisch |

### 3.2 Trail-Design: „Feature-Kit“
Die Routen werden nicht mehr nur als Spline über das Terrain gelegt, sondern in **Sektionen von 150–300 m** mit bewusstem Rhythmus gebaut:

- **Bausteine:** Anlieger (3 Radien), Tables, Doubles, Step-downs, Drops (0,5/1,5/3 m), Steinfelder, Wurzelteppiche, Holz-Northshore, Rollers (zum Pumpen), Off-Camber-Passagen.
- **Jede Sektion hat eine A-Linie (schnell, riskant) und eine B-Linie (sicher).** Ghosts zeigen, welche Linie die Bestzeit nahm.
- **Rhythmus-Regel:** nach jeder Intensitätsspitze eine kurze Erholung. Etwa alle 20–30 Sekunden ein „Signature Moment“ (großer Sprung mit Aussicht, Waldeinfahrt, Brücke).
- Werkzeug: Blender-Geometry-Nodes-Kit, das Bausteine auf den Spline setzt und die Höhen-Deltas (`surface-details.bin`) automatisch erzeugt. Die bestehende Pipeline wird dafür erweitert, nicht ersetzt.

**Ziel-Dichte:** ≥ 1 Feature pro 40 m statt heute ~1 pro 300 m.

### 3.3 Spielmodi & Progression
| Modus | Inhalt |
|---|---|
| **Karriere „Swiss Tour“** | 3–4 Regionen × 4–6 Events (Zeitfahren, Style-Run, Checkpoint-Jagd, Bedingungen wie Nässe). Sterne schalten Regionen und Teile frei. |
| **Zeitfahren** | bleibt, plus Entwickler-Zeit als „Trapanotto-Medaille“ über Gold. |
| **Tages-Challenge** | Jeden Tag eine Route + Bedingung (z. B. „Nass, kein Hinterradbremse“). Ghost-Code zum Teilen als URL – kein Server nötig. |
| **Freeride** | bleibt; mit versteckten Sammelobjekten (z. B. verlorene Trailmarker) zum Erkunden des echten Geländes. |

**Freischaltbar:** Bikes (Enduro / DH / Hardtail mit spürbar anderem Fahrverhalten), Reifen, Rider-Outfits, Kamera-Modi. Kosmetik und Tuning trennen, damit Bestzeiten fair bleiben (Setup-Signatur gibt es schon).

### 3.4 Run-Bewertung
Neben der Zeit ein **Flow-Wert**: steigt durch saubere Landungen, gute Pumps, ohne Bremsen durch Anlieger; fällt durch Rutschen, harte Landungen, Bremsen vor Sprüngen. Ergebnis am Ende als Note (C → S) mit kurzer Aufschlüsselung „Was hat Zeit gekostet?“ – mit Hinweis auf die verpasste A-Linie.

### 3.5 Bedingungen
Tageszeit (Morgen, Mittag, goldene Stunde) und Wetter (trocken, feucht, nass). Nässe senkt Grip auf Wurzeln/Steinen deutlich, auf Erde wenig. Sichtbar durch glänzende Oberflächen, Schlammspritzer, Pfützen. Das bringt Wiederspielwert ohne neue Strecken.

---

## 4. Grafik-Konzept

### 4.1 Art Direction
**„Swiss Topo Cinematic“** – fotorealistisch-warm, aber leicht überhöht, wie ein Bike-Film. Klare Farbtrennung: **Trail warm** (Ocker, Rotbraun), **Wald kühl** (Blaugrün), **Ferne blau-dunstig**. Der Trail muss sich auf einen Blick vom Rest abheben – das ist gleichzeitig Lesbarkeit (Gameplay) und Look.

Jede Region bekommt eine eigene Farbpalette und LUT:
- **Uetliberg:** Herbst-Laubwald, tiefe Sonne durch Bäume, Blick auf Zürich und See.
- **Lenzerheide:** alpines Licht, hohe Kontraste, Fichten, Fels, Weite.

### 4.2 Render-Pipeline (größter Hebel)
| Baustein | Umsetzung | Tier |
|---|---|---|
| **WebGPU-Renderer** mit WebGL2-Fallback | `three/webgpu` + TSL (in r180 vorhanden). Ermöglicht Compute für Gras/Partikel. | alle |
| **AgX- oder Neutral-Tonemapping** + Color-Grading-LUT pro Region/Tageszeit | vorhanden in Three.js | alle |
| **Ambient Occlusion (GTAO)** | Bäume, Steine und Rider „stehen“ endlich auf dem Boden | High/Balanced |
| **Höhennebel + Luftperspektive** | Ferne Berge blaustichig, Täler mit Dunst – macht die echten Distanzen sichtbar | alle |
| **Cascaded Shadow Maps** | scharfe Schatten nah, weich fern; Sonnenflecken unter Bäumen | High |
| **Lichtstrahlen durch Kronen** | Screen-Space-God-Rays, nur bei tiefer Sonne | High |
| **Bloom (dezent) + Vignette + Speed-Motion-Blur** | Motion Blur nur radial ab ~35 km/h | alle (Mobile vereinfacht) |
| **TAA oder SMAA** | ersetzt flimmernde Grashalme und Zweige | High/Balanced |

### 4.3 Boden & Trail
- **Splat-Material mit Höhen-Blending:** 6 Layer (Erde fest, Erde lose, Laub, Wurzeln, Stein, Gras). Wurzeln/Steine schauen aus der Erde statt überblendet.
- **Verschleißmaske entlang der Ideallinie:** dunkler, verdichteter Streifen in der Mitte, Bremswellen vor Kurven, aufgeworfene Ränder an Anliegern.
- **Dynamische Reifenspuren** (Skidmarks gibt es schon) als echte Decals mit Normal-Map, die bei Nässe tiefer werden.
- **Texturen als KTX2/Basis** statt WebP: weniger GPU-Speicher, schnellere Ladezeit auf Handys.

### 4.4 Vegetation
- **Wind-Animation** (Vertex-Shader, Böen wandern als Welle durch den Wald).
- **Unterholz-Gürtel** 0–6 m neben dem Trail: Farne, Brombeeren, Jungbäume, hohe Gräser, die beim Durchfahren ausweichen (GPU-Interaktion). Hier schaut der Spieler 90 % der Zeit hin.
- **Transluzenz** an Blättern im Gegenlicht.
- **Oktaeder-Impostors** statt einfacher Billboards für Fernbäume – keine „Pappaufsteller“ mehr beim Drehen.

### 4.5 Rider & Bike
- **Neuer Hero-Rider** (~35k Tris High, 8k Mobile): realistische Proportionen, Fullface-Helm, Goggles, Knieschoner, Jersey mit Stoff-Normalmap und Sekundärbewegung (Jersey flattert, Kopf schaut in die Kurve).
- **Animationsschicht über IK:** Kurven-Körperhaltung, Aufstehen vor Sprüngen, „Attack Position“ in Steinfeldern, Celebration im Ziel.
- **Bike:** echte Federweg-Animation, drehende Bremsscheiben, Schmutz-Shader (wird während des Runs dreckiger).

### 4.6 Partikel & Details
Staubfahne (abhängig von Boden und Speed), fliegende Erdbrocken in Kurven, aufgewirbeltes Laub, Schlammspritzer auf der Kamera bei Nässe, Insekten/Pollen im Licht, Vögel, die beim Vorbeifahren auffliegen.

### 4.7 Kamera
| Modus | Detail |
|---|---|
| **Chase (Standard)** | Abstand zieht sich mit Speed zusammen, FOV 60 → 80°, tieferer Blickwinkel, Kamera-Lag in Kurven, Rütteln abhängig von Bodenfrequenz (Steine = hochfrequent, Wellen = niederfrequent). |
| **Helmkamera (POV)** | Der Modus, der Downhill am besten verkauft. Leichter Fisheye, Lenker sichtbar. |
| **Drohne / Replay** | Kinematische Wiederholung des Runs mit automatischen Schnitten an Sprüngen + **Fotomodus**. Teilen = Wachstum. |

### 4.8 Menü & HUD
- **Weg vom KI-Landingpage-Look:** keine Slogans, keine Koordinaten-Deko, keine Versionsnummern im Hauptmenü. Stattdessen: die Region als 3D-Karte mit Höhenlinien (Swisstopo-Ästhetik), Route leuchtet beim Auswählen auf, Kamera fliegt die Strecke ab.
- Typografie: eine Grotesk (z. B. Inter Tight oder eine echte Swiss Grotesk), eine Akzentfarbe (Signal-Rot), große Zahlen, wenig Text.
- **HUD minimal:** Zeit + Differenz zur Bestzeit, nächster Checkpoint als dezenter Marker in der Welt. Speed und Minimap optional. Alles andere nur kontextuell (z. B. Pump-Feedback als kurzer Puls am Rand).
- **Startbogen, Checkpoints, Zielbereich** als echte Props: Holzrahmen mit Bannern, Zeitmesser-Kabine, Zuschauer-Silhouetten, Absperrband.

### 4.9 Audio
Gesampelte Ebenen statt rein prozedural: Freilauf-Ratter (Speed-abhängig), Reifen auf Erde/Kies/Laub/Wurzeln/Holz, Federgabel-Schläge, Kettenschlag auf Steinen, Bremsquietschen bei Nässe, Atmen des Riders bei Anstrengung, Wind ab 40 km/h, Umgebung pro Region (Kuhglocken in Lenzerheide, entfernte Stadt am Uetliberg). Dezente Musik im Menü, im Run optional.

---

## 5. Technik-Konzept

### 5.1 Code-Struktur
`main.js` (48 KB) wird aufgeteilt in Systeme mit klaren Zuständigkeiten:

```
src/
  core/        game-loop, input, state-machine, settings, storage
  render/      renderer (WebGPU/WebGL), postfx, materials, lod, vegetation
  sim/         physics, bike, rider-ragdoll, surfaces, collisions
  gameplay/    trail-features, scoring, flow, events, progression
  ui/          menu, hud, results, photo-mode
  audio/       mixer, layers, samples
```

- **TypeScript** schrittweise (zuerst `sim/` – dort zahlen Typen sich am meisten aus).
- **Normale Formatierung** (Prettier) – der aktuelle Einzeiler-Stil ist das größte Wartungsrisiko.
- Physik-Tests behalten und um „Golden Runs“ erweitern: aufgezeichnete Eingaben müssen nach Physik-Änderungen dieselbe Zeit ±1 % ergeben.

### 5.2 Assets
- Alte Versionen (`*-v2`, `*-v3`, `tree-high.glb` usw.) aus `public/` entfernen, nur in Git-Historie behalten. Ziel: < 60 MB pro Region auf Desktop, < 25 MB auf Mobile.
- Region-Streaming in Sektionen (128-m-Zellen gibt es schon) statt alles vorab laden → Startzeit < 8 s auf 4G.

### 5.3 Performance-Budget
| Tier | Ziel | Auflösung | Draw Calls | Dreiecke |
|---|---|---|---|---|
| Ultra (Desktop dGPU) | 120 fps | nativ | < 1500 | < 4 M |
| Balanced (Laptop iGPU) | 60 fps | 0,8× | < 800 | < 1,5 M |
| Mobile (Mittelklasse 2023) | 60 fps | 0,7× + Upscaling | < 300 | < 500 k |

Der vorhandene `FrameBudget` bleibt und wird um GPU-Timing (`timestamp-query` bei WebGPU) ergänzt.

---

## 6. Roadmap

Grundprinzip wie in großen Studios: **erst ein Vertical Slice in Endqualität**, dann skalieren. Lieber 400 m, die umwerfend aussehen und sich toll fahren, als 5 km, die okay sind.

| Phase | Dauer* | Inhalt | Abnahmekriterium |
|---|---|---|---|
| **0 – Aufräumen** | 2 Wo. | `main.js` aufteilen, Prettier, alte Assets raus, Golden-Run-Tests | alle 41 Tests grün, Bundle −50 % |
| **1 – Vertical Slice** | 6–8 Wo. | **eine 400-m-Sektion Lenzerheide** komplett neu: Feature-Kit, A/B-Linie, Post-FX-Kette, neues Bodenmaterial, Unterholz + Wind, neue Kamera, Pumpen + Preload | 5 Testspieler fahren freiwillig ≥ 10 Runs; Screenshot ist von einem kommerziellen Indie-Titel nicht zu unterscheiden |
| **2 – Fahrgefühl** | 4 Wo. | Scrub/Whip, Manual, Ragdoll, Flow-Wert, gesampeltes Audio, Helmkamera | Run-Bewertung verständlich ohne Tutorial-Text |
| **3 – Inhalt** | 8 Wo. | beide Routen komplett im neuen Standard, neuer Rider, Startbogen/Ziel-Props, Menü mit 3D-Karte | volle Routen in 60 fps auf Mobile-Referenzgerät |
| **4 – Tiefe** | 6 Wo. | Karriere, Tages-Challenge mit teilbarem Ghost-Link, Bedingungen (Nässe, Tageszeit), Replay & Fotomodus | Spieler kommen an mehreren Tagen zurück |
| **5 – Neue Region** | offen | z. B. Flims/Laax oder Verbier – die Pipeline macht das jetzt reproduzierbar | – |

\* Richtwerte für eine Person mit KI-Unterstützung.

---

## 7. Was bewusst *nicht* gemacht wird
- **Kein Multiplayer-Server** – Ghost-Links reichen und halten das Projekt serverlos.
- **Keine riesige offene Welt** – Qualität pro Meter vor Fläche.
- **Keine Mikrotransaktionen, kein Tracking** – das bleibt ein Merkmal des Projekts.
- **Kein Wechsel der Engine** (Unity/Unreal) – der Browser ist der Vorteil: Link anklicken, fahren.

---

## 8. Nächster konkreter Schritt
Phase 0 starten und parallel die **Referenz-Sektion für den Vertical Slice** auswählen: ein Abschnitt in Lenzerheide mit Waldeinfahrt, einem Anlieger-Paar, einem Steinfeld und einem großen Sprung mit Aussicht. Dafür ein Moodboard (10–15 Bilder: Helmkamera-Stills, Licht, Boden) festlegen – das ist die Messlatte für alle weiteren Entscheidungen.
