# Trapanotto Downhill Biking – aufgeteilte Blender-Dateien

Blender 4.5 LTS. Das ganze Verzeichnis gemeinsam entpacken und seine Struktur beibehalten.

**Gesamtszene öffnen:** `Uetliberg.blend` oder `Lenzerheide.blend` in diesem Ordner. Diese kleinen Hauptdateien verknüpfen die folgenden Bibliotheken über relative Pfade:

| Datei je Region | Inhalt |
| --- | --- |
| `Terrain.blend` | Gelände, detaillierter Trail mit Spurrillen, Kurvenüberhöhungen und Absprüngen; Desktop- und mobile Geometrie. Lenzerheide enthält auch das Bergpanorama. |
| `Vegetation.blend` | Verknüpfte Bauminstanzen, Gräser, Farne und Baum-LOD-Vorlagen. |
| `Props.blend` | Steine, Wurzeln und vereinfachte Gebäude/Landmarken. |
| `shared/Rider-Bike.blend` | Gemeinsamer Fahrer mit 16 Knochen und gewichteter Haut sowie separate Bike-, Federungs-, Rad-, Lenker-, Kurbel- und Pedalgruppen. |

**Bearbeiten:** Die jeweilige Bibliotheksdatei direkt öffnen, Änderungen speichern und die Hauptdatei erneut öffnen. Verknüpfte Teile in der Hauptdatei sind absichtlich zentral verwaltet; der Fahrer wird von beiden Regionen gemeinsam verwendet. Änderungen an der Instanzposition des Fahrers und an Kamera/Licht erfolgen in der Hauptdatei. Jede Bibliothek lässt sich auch für sich alleine öffnen.

Alle benötigten Texturen sind in den Bibliotheken gepackt. Ausgeblendete mobile Geometrie und Vorlagen bleiben für den Export enthalten. Die vollständigen, unabhängigen Original-Szenen liegen zusätzlich im Wurzelverzeichnis des GitHub-Repositories.

Die Aufteilung verändert die veröffentlichten Spielmodelle nicht automatisch. Für Änderungen am Spiel müssen die betroffenen GLB-Modelle und gegebenenfalls Höhen-/Kollisionsdaten erneut exportiert werden. Eine Einheit entspricht einem Meter; Blender verwendet Z als Höhe. Ursprünge und Angaben zur eingefrorenen swisstopo-Datenbasis stehen in der Haupt-README des Repositories.

Geodaten: ©swisstopo. Künstlerische Vegetation und Materialien basieren teilweise auf CC0-Quellen von Poly Haven; Quellenmanifeste und weitere Lizenzen stehen im Repository. Die Trails und Gebäude sind künstlerisch gestaltet, keine Navigations- oder Vermessungsgrundlage.

Reproduzieren:

```sh
blender --background --python-exit-code 1 --python scripts/split_blender_sources.py
.venv/bin/python scripts/compress_blends.py blender/*.blend blender/*/*.blend
blender --background --python-exit-code 1 --python scripts/validate_blender_split.py
```
