# Medienwerkstatt

Eine Mac-App zum Üben des Videohandwerks: Du bekommst Aufträge von fiktiven Kunden, schneidest in der **Werkstatt** (Schnitt, Farbe, Titel, Export), gibst ab und der **Chef** nimmt das Ergebnis ab – mit Punkten, Fristen und Stufen. Ohne Cloud-Konto, alles läuft lokal auf dem Mac. Optional kann Gemini die Gestaltung zusätzlich bewerten.

## Download

- **Aktueller Stand:** Auf GitHub im Reiter **Actions** den neuesten Lauf „build-mac“ öffnen → unten bei **Artefakte** „Medienwerkstatt-…“ herunterladen → die Zip-Datei entpacken → darin liegt die `.dmg`.
- **Releases:** Sobald ein Tag `v…` gesetzt ist, hängt die `.dmg` zusätzlich unter **Releases**.

## Installation

1. `.dmg` öffnen und **Medienwerkstatt** in den Ordner **Programme** ziehen.
2. **Erster Start:** Rechtsklick auf die App → **„Öffnen“** → im Dialog nochmals **„Öffnen“**.
   Alternativ: Doppelklick (die Meldung erscheint), dann **Systemeinstellungen → Datenschutz & Sicherheit** → ganz unten **„Trotzdem öffnen“**.
3. Das ist nur beim ersten Start nötig.

**Warum diese Meldung?** Die App ist nicht signiert und nicht von Apple beglaubigt – das setzt ein bezahltes Apple-Entwicklerkonto voraus, das für dieses Projekt nicht existiert. macOS warnt deshalb bei jeder unsignierten App. Der Quelltext liegt offen in diesem Repository.

## Systemvoraussetzungen

- Intel-Mac, macOS 12 oder neuer (getestet als Ziel: MacBook Pro 2019).
- Auf Apple-Silicon-Macs (M1 und neuer) sollte die App über Rosetta 2 laufen; getestet ist das nicht.

## iPhone-Einstellungen

Für möglichst reibungsloses Material:

- **Einstellungen → Kamera → Formate → „Kompatibel“** (optional; H.264/JPEG statt HEVC/HEIF). Die App kann auch HEVC, „Kompatibel“ macht Import und Proxies schneller.
- **Einstellungen → Kamera → Video aufnehmen → 1080p HD bei 25 fps.**
- **HDR-Video ausschalten** (Kamera → Video aufnehmen → „HDR-Video“ aus). Die App warnt beim Import mit „Am Handy HDR-Video ausschalten“.

## Erste Schritte

**Aufträge → Werkstatt → Export → Abgabe → Chefbüro**

1. **Aufträge:** Den aktuellen Auftrag öffnen, Briefing und Frist lesen (Fristen enden um 18:00 Uhr). Ein neuer Auftrag kommt nach 72 Stunden.
2. **Werkstatt:** Material importieren (Dateien ins Fenster ziehen oder über den Import-Knopf), Clips mit Einstellungsgröße beschriften, schneiden, Überblendungen, Farbe, Titel.
3. **Export:** Mit einer der vier Vorgaben exportieren.
4. **Abgabe:** Export beim Auftrag abgeben; die App misst Technik (Auflösung, Bildrate, Länge, Lautheit, Clipping …).
5. **Chefbüro:** Abnahmeprotokoll mit Punkten; jeder Abzug nennt Soll, Ist, Abzug und Behebung. Einmal innerhalb von 24 h nachbessern ist erlaubt.

## Gemini (optional)

Standardmäßig **aus**: ohne eingeschaltetes Gemini sendet die App keine Netzwerkanfrage.

1. Gratis-Schlüssel bei **Google AI Studio** holen (https://aistudio.google.com/, „API-Schlüssel“). In den Einstellungen gibt es dafür einen Link.
2. Schlüssel in den **Einstellungen** eintragen; er liegt ausschließlich im macOS-Schlüsselbund (Dienst „Medienwerkstatt“, Konto „gemini“), nicht in Dateien.
3. **Datenschutz:** Beim Gratis-Tarif darf Google Eingaben zur Produktverbesserung nutzen, und Menschen können sie lesen. Gesendet werden Standbilder aus Deinem Film. Die App zeigt vorab eine Vorschau und fragt um Zustimmung. Nur Material ohne fremde Personen bzw. mit deren Zustimmung verwenden. Fällt Gemini aus, bewertet der Chef allein nach den Regeln.

## Datenablage

- `~/Library/Application Support/Medienwerkstatt/state.json` – Aufträge, Bewertungen, Punktekonto, Einstellungen (ohne Schlüssel).
- `~/Movies/Medienwerkstatt/A{NN}_{Kunde}/` – ein Ordner je Auftrag mit `projekt.mwp`, `Medien/`, `Proxies/`, `Cache/`, `Export/`, `Recherche/`.
- Gesichert werden die letzten 10 Versionen von `projekt.mwp` und `state.json` als `.bak1` … `.bak10`.

## Entwickeln

```sh
npm ci
npm run dev          # Oberfläche im Browser (MockBackend), http://127.0.0.1:1420
npm test             # Unit- und Integrationstests (Integration braucht ffmpeg)
npm run lint && npm run typecheck
bash scripts/make-fixtures.sh   # Testmedien (braucht ffmpeg)
npm run e2e          # Playwright (Chromium)
cargo test -p mw-media
```

Rust-App unter Linux prüfen: `bash scripts/link-dev-ffmpeg.sh` legt die Sidecar-Namen auf die System-ffmpeg-Programme, dann `cargo check -p medienwerkstatt`. Der echte Mac-Build (`npx tauri build --target x86_64-apple-darwin --bundles dmg`) läuft über den Workflow `build-mac` und lädt ffmpeg/ffprobe mit `scripts/fetch-ffmpeg-mac.sh` (Prüfsummen in `scripts/ffmpeg-mac.sha256`). Der Abnahmetest auf dem Mac steht in `docs/ABNAHME-CHECKLISTE.md`.

## Lizenzhinweise

- Die App bündelt **ffmpeg** und **ffprobe** (Build von evermeet.cx, Version 9.1) als eigenständige Programme. Diese stehen unter der **GPL**; sie werden als getrennte Programme aufgerufen, nicht eingebunden. Quellen und Lizenztext: https://ffmpeg.org/ und https://evermeet.cx/ffmpeg/.
- Symbole: **Lucide** (ISC-Lizenz).
- Das App-Symbol ist eigens gezeichnet (`src-tauri/icons/icon.svg`).
- Produktnamen anderer Hersteller werden nur beschreibend genannt (z. B. „So heißt das bei …“); es gibt keine Verbindung zu diesen Herstellern.
