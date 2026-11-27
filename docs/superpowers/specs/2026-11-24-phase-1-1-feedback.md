# Phase 1.1: Freie Werkstatt, Auto-Speichern, strengere Recherche

Stand 2026-11-24. Diese Runde setzt das Feedback des Nutzers nach dem ersten Mac-Build um.
Reihenfolge = Priorität. Das Wochenlimit ist knapp, deshalb wird strikt der Reihe nach gebaut.

Entscheidungen des Nutzers:
- Der Chef darf freie Projekte begutachten, vergibt dafür aber keine Punkte.
- Quellen-Links werden beim Abgeben online geprüft.
- Themen kommen jetzt aus einem festen Katalog. Gemini-Themen folgen später.

## 1 Werkstatt immer offen (Hauptfunktion), Aufträge als Add-on

Problem: Die Werkstatt öffnet heute nur das Projekt des aktiven Auftrags. Bei Recherche-Aufträgen
zeigt sie „Dieser Auftrag braucht keine Werkstatt.“

Neu:
- **Projektübersicht** auf `/`, wenn kein Projekt offen ist (und über die Schaltfläche „Projekte“ im Werkstatt-Kopf).
  - „Neues Projekt“ fragt Name und Format-Vorlage ab: 16:9 1920×1080 25p, 16:9 1920×1080 30p, 9:16 1080×1920 30p,
    1:1 1080×1080 30p und 4K 3840×2160 25p.
  - Die Liste enthält **alle** Projekte, sortiert nach „zuletzt geöffnet“: freie Projekte und Auftragsprojekte.
    Auftragsprojekte tragen die Marke „Auftrag #n“ und ihre Frist.
  - Ein Projekt lässt sich öffnen und umbenennen (nur freie Projekte).
  - Löschen gehört nicht in diese Runde, weil es Dateien vernichten kann.
- **Start:** Das zuletzt geöffnete Projekt geht wieder auf. Gibt es keines, erscheint die Übersicht.
  Ein neuer Auftrag öffnet sich nicht mehr von selbst. „In der Werkstatt öffnen“ in der Auftragsansicht funktioniert weiter wie bisher.
- **Daten:**
  - `AppState.projects: FreeProject[]`. Ein Eintrag hat `{ id: 'p-…', name, createdAt, openedAt, format: { width, height, fps } }`.
    Im Schema ist das Feld optional, Standard `[]`, damit alte Stände weiter laden.
  - `AppState.lastOpened?: { kind: 'free' | 'assignment'; id }`, ebenfalls optional.
  - `Project` bekommt `freeProjectId?`. `assignmentId` wird optional, genau eines von beiden ist gesetzt.
  - Ordner: `Frei – <Name-Slug> – <Kurz-ID>`, über das bestehende `project_dir` mit `validate_folder`.
    Es braucht keine neue Rust-Funktion.
- **projectStore:** Aus `open(assignment)` wird `open(target)` mit
  `target = { kind: 'assignment', assignment } | { kind: 'free', project }`.
  Das bisherige Verhalten bleibt gleich: vor dem Wechsel sichern, `switchError` setzen und veraltete Öffnungen verwerfen.
- **Export in freien Projekten:**
  - Die Vorlage ist frei wählbar und startet mit dem Projektformat.
  - Der Dateiname lautet `<Name-Slug>_v<n>.mp4`.
  - Es gibt kein „Abgeben“. Stattdessen gibt es „Chef ansehen lassen (ohne Punkte)“, siehe 1b.
- **Recherche-Aufträge** sperren die Werkstatt nie mehr.

### 1b Chef-Feedback ohne Punkte
- Der Ablauf nach einem Export in einem freien Projekt:
  1. Die Datei wird wie bei Abgaben analysiert.
  2. Der Chef bewertet nur die Kategorien Technik und Gestaltung.
     Die Vorgaben leiten sich aus dem Projektformat ab: Lautheit −14 LUFS, kein Dauer-Soll, keine Pflicht-Einstellungsgrößen.
  3. Es gibt keine Frist und keine Abzüge in der Kategorie Auftrag.
- Das Ergebnis ist eine `Evaluation` mit `practice: true`, gespeichert in `evaluations`.
  - Sie zählt nicht fürs Punktekonto, nicht für den Rang und nicht für das Showreel.
  - Das Chefbüro zeigt sie im eigenen Abschnitt „Übungen“ mit der Marke „Übung – zählt nicht“.
  - Das Protokoll wird wiederverwendet.

## 2 Auto-Speichern mit Sicherungsversionen

Schon vorhanden:
- Das Projekt wird 2 s nach jeder Änderung gespeichert und noch einmal beim Verlassen.
- Jeder Schreibvorgang ist atomar und legt `.bak1–10` an.

Diese Backups decken aber nur die letzten Sekunden ab.

Neu (an Premieres „Automatisch speichern“ angelehnt):
- **Sicherungsversion alle 10 Minuten.** Einstellbar sind 5, 10, 15 oder 30 min, Standard 10.
  - Eine Version entsteht nur, wenn sich das Projekt seit der letzten Version geändert hat.
  - Sie landet in `Auto-Save/<YYYY-MM-DD HH-MM-SS>.json` im Projektordner. Die neuesten 20 bleiben erhalten.
  - Der App-Zustand (Aufträge und Recherche-Entwürfe) bekommt im selben Takt eine Version im App-Datenordner `Auto-Save/`, ebenfalls die neuesten 20.
- **⌘S** speichert sofort und legt zusätzlich eine Version an.
- **Anzeige** im Werkstatt-Kopf: „Gespeichert · 18:42“, „Speichert …“ oder „Nicht gespeichert – neuer Versuch läuft“.
  Die letzte Anzeige nutzt das bestehende `saveError`. Die Anzeige erfolgt über `aria-live="polite"`.
- **„Ältere Version …“** im Werkstatt-Kopf öffnet eine Liste mit Zeit und Größe.
  - Beim Wiederherstellen wird der aktuelle Stand zuerst selbst als Version gesichert und dann die gewählte geladen. Das lässt sich also umkehren.
- **Rust:**
  - `save_project_version(dir) -> name`
  - `list_project_versions(dir) -> [{ name, savedAt, bytes }]`
  - `restore_project_version(dir, name) -> Project`
  - `save_state_version()`
  - Die Pfade prüft die bestehende Validierung. `name` muss dem Muster `^\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.json$` entsprechen.

## 3 Recherche: ehrlich bewerten, vielfältige Themen

Problem: Ein Exposé aus reinem Tastatursalat bekam 88 von 100 Punkten. Geprüft wurden nur leere Felder, Wortzahl und die Form der Links.

### 3a Strengere Bewertung (feste Regeln, Werte in `rules.json`)
- **Tastatursalat und Unsinn je Feld:**
  - Anteil echter Wörter, gemessen an einer deutschen Grundwortliste (rund 1500 häufige Wörter) plus einer Fachwortliste.
  - Vokalanteil, Zeichenketten aus vier oder mehr gleichen Zeichen, Anteil sehr langer „Wörter“.
  - Hohe Wiederholung (Verhältnis verschiedener Wörter zu allen Wörtern).
  - Ein unsinniges Pflichtfeld zählt wie ein leeres.
  - Sind mindestens die Hälfte der Pflichtfelder Unsinn, wird die Recherche auf höchstens 15 Punkte gedeckelt.
    Dazu kommt ein klarer Chef-Satz.
- **Kopien:** Gleiche oder fast gleiche Texte in mehreren Feldern kosten Punkte.
- **Themenbezug:** Schlagwörter aus dem Auftrag (Kunde, Branche, Anlass und Themen-Schlagwörter) müssen in
  Logline oder Inhalt vorkommen, sonst gibt es einen Abzug.
- **Feldplausibilität:**
  - „Länge“ enthält eine Dauer.
  - „Zielgruppe“ nennt eine Personengruppe oder ein Alter.
  - „Gestaltungsidee“ enthält mindestens drei Fachbegriffe (Kamera, Licht, Einstellungsgrößen, Schnitt, Ton, Musik, Farbe …).
  - Die Logline ist ein ganzer Satz.
  - Die neuen Vorlagen bekommen passende Regeln, zum Beispiel enthält eine Zeitleiste mindestens drei Jahreszahlen.
- **Quellen:**
  - Die Domains müssen verschieden sein. Platzhalter wie `example.*`, `test.*`, `localhost` und IP-Adressen gelten nicht.
  - **Online-Prüfung beim Abgeben** über das Rust-Kommando `check_urls`:
    - nur http(s), höchstens 6 Links, 6 s Zeitlimit, höchstens 3 Weiterleitungen;
    - keine Loopback-, privaten oder link-lokalen Adressen;
    - zuerst HEAD, bei 405 GET.
  - Ein nicht erreichbarer Link oder ein 404 kostet Punkte.
  - Ohne Netz gibt es keinen Abzug, nur einen Hinweis im Protokoll.

### 3b Vielfältige Aufträge und genug Informationen
- **Neue Recherche-Vorlagen:**
  - `meinung` (Kommentar): These, Argumente dafür, Argumente dagegen, eigene Meinung und Fazit.
  - `geschichte` (Dossier): Ereignis, Zeitleiste, Ursachen, Folgen, Bedeutung heute.
  - `erklaer` (Erklärvideo-Konzept): Kernfrage, Zielgruppe, drei Kernaussagen, Skript-Entwurf, Visualisierung.
- **Kombi „Erklärvideo“:** erst das Konzept, dann ein Video von 60–90 s.
- **Themenkatalog `catalogs/themen.json`** mit mindestens 60 Themen in vielen Nischen:
  - Gesellschaft und Meinung, Geschichte, Wissen und Erklären, Medien und Technik, Nischen und Szenen.
  - Jedes Thema hat Kurz-Hintergrund, Leitfragen, Schlagwörter für den Themenbezug und Hinweise zum Recherche-Einstieg (Quellenarten).
  - Der Katalog enthält nur neutrale Rahmung und keine erfundenen Fakten. Wo sich ein Stand ändert, heißt es: „Recherchiere den aktuellen Stand.“
- **Kunden-Steckbrief:** Die erfundenen Betriebe bekommen gegründet, Mitarbeitende, Ort, Angebot, Werte, Zielgruppe, Ansprechperson und Besonderheit.
  - Die Auftragsansicht zeigt das als „Steckbrief“.
  - Der Hinweis dazu lautet: „Der Betrieb ist erfunden – alles Wichtige steht hier. Recherchiere Branche und Thema.“
- **Generator:** Er mischt die Auftragsarten nach Gewichten, deterministisch wie bisher.
  Etwa 40 % Betriebe, 20 % Gesellschaft und Meinung, 15 % Geschichte, 25 % Wissen und Erklären.
  Dieselbe Themenkategorie kommt höchstens zweimal hintereinander.
