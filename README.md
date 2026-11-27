# Medienwerkstatt

Eine Mac-App zum Üben des Videohandwerks: Du bekommst Aufträge von fiktiven Kunden, schneidest in der **Werkstatt** (Schnitt, Farbe, Titel, Export), gibst ab und der **Chef** nimmt das Ergebnis ab – mit Punkten, Fristen und Stufen. Ohne Cloud-Konto, alles läuft lokal auf dem Mac. Optional kann Gemini die Gestaltung zusätzlich bewerten.

## Download

- **Aktueller Stand:** Auf GitHub im Reiter **Actions** den neuesten Lauf „build-mac“ öffnen → unten bei **Artefakte** „Medienwerkstatt-…“ herunterladen → die Zip-Datei entpacken → darin liegt die `.dmg`.
- **Releases:** Sobald ein Tag `v…` gesetzt ist, hängt die `.dmg` zusätzlich unter **Releases**.
- Zeigt der Actions-Lauf „abgebrochen“ ohne Protokoll, hat GitHub keinen Mac-Rechner zugewiesen – dann den Abschnitt „Selbst bauen auf dem Mac“ nutzen.

## Installation

1. `.dmg` öffnen und **Medienwerkstatt** in den Ordner **Programme** ziehen.
2. **Erster Start**, je nach macOS-Version:
   - **macOS 12–14:** Rechtsklick auf die App → **„Öffnen“** → im Dialog nochmals **„Öffnen“**.
   - **macOS 15 (Sequoia) und neuer:** Der Rechtsklick-Weg umgeht Gatekeeper bei unsignierten Apps nicht mehr. Die App einmal normal öffnen (die Meldung erscheint, **„Fertig“** wählen), dann **Systemeinstellungen → Datenschutz & Sicherheit** → ganz unten **„Trotzdem öffnen“** → mit Passwort/Touch ID bestätigen.
3. Das ist nur beim ersten Start nötig.

**Warum diese Meldung?** Die App ist nicht signiert und nicht von Apple beglaubigt – das setzt ein bezahltes Apple-Entwicklerkonto voraus, das für dieses Projekt nicht existiert. macOS warnt deshalb bei jeder unsignierten App. Der Quelltext liegt offen in diesem Repository.

## Selbst bauen auf dem Mac (falls der GitHub-Build nicht läuft)

1. **Terminal** öffnen (Programme → Dienstprogramme → Terminal).
2. Quelltext holen:
   ```sh
   git clone https://github.com/d8bn77pbr4-cmd/Medienwerkstatt.git
   cd Medienwerkstatt
   git checkout claude/adobe-cloud-replica-go3c54   # nur nötig, bis der Stand in main ist
   ```
3. Bauen:
   ```sh
   bash scripts/build-mac-local.sh
   ```
   Das Skript prüft Xcode-Befehlszeilentools, Node (ab 20) und Rust und nennt Installationshinweise, falls etwas fehlt. Beim ersten Mal fragt es nach der Prüfsumme für ffmpeg („Prüfsummen übernehmen? (j/n)“). Dauer beim ersten Mal ca. 10–20 Minuten.
4. Am Ende öffnet sich der Ordner mit der `.dmg`; weiter wie unter „Installation“.

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
- Zusätzlich legt die App alle 5, 10 (Standard), 15 oder 30 Minuten eine Sicherungsversion an, wenn sich etwas geändert hat, und bei ⌘S sofort: `Auto-Save/<JJJJ-MM-TT HH-MM-SS>.json` im Projektordner (die neuesten 20) bzw. im Ordner von `state.json` für den App-Zustand (ebenfalls 20). Ein älterer Projektstand lässt sich in der Werkstatt über „Ältere Version …“ zurückholen. Den App-Zustand holst du von Hand zurück: App beenden, die gewünschte Datei aus `Auto-Save/` neben `state.json` nach `state.json` kopieren (die aktuelle Datei vorher beiseitelegen) und die App wieder öffnen.

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
