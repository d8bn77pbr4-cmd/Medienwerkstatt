# Medienwerkstatt – Design-Spezifikation

Stand: 2026-11-23 · Status: freigegeben · Arbeitstitel: **Medienwerkstatt**

## 1. Absicht und Warum

Die Nutzerin/der Nutzer (im Folgenden „du“) bewirbt sich gerade um eine Ausbildung als **Mediengestalter Bild und Ton**. Eine Adobe-Lizenz ist nicht bezahlbar. Ziel ist eine **installierbare Mac-Software**, die

1. die wichtigsten Kreativ-Programme **funktional** nachbildet (Schnitt, Ton, Bild, Motion) – mit eigenem Design,
2. **alle 3 Tage einen zufällig erzeugten Auftrag** stellt, den man mit diesen Werkzeugen selbst umsetzen muss,
3. jede Abgabe von einem **imaginären Chef** mit **Punkten und Abzügen** bewerten lässt – so, wie ein Producer oder Ausbilder auf Schnitt, Ton, Bildrate, Belichtung und die Erfüllung des Auftrags schaut.

Nebeneffekt, der zählt: Die besten Abgaben werden **Showreel-Material** für die Bewerbung. Die Begriffe der Branche (und wie die Funktion in Adobe-Programmen heißt) lernt man nebenbei, um im Vorstellungsgespräch mitreden zu können.

## 2. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**
- Drei Bereiche: **Werkstatt** (Werkzeuge), **Aufträge**, **Chefbüro** (Bewertung, Punktekonto).
- Werkzeuge mit den Kernfunktionen, die Profis täglich nutzen (siehe §4), mit branchenüblichen Tastenkürzeln (⌘ statt Strg).
- Die Werkzeuge sind **miteinander verbunden**: gemeinsame Medienbibliothek pro Auftrag; ein Bild aus dem Bild-Werkzeug oder ein Ton aus dem Ton-Werkzeug ist sofort im Schnitt verwendbar.
- Bewertung nachvollziehbar: Jeder Abzug nennt **Soll, Ist, Abzug und wie man es behebt**.
- Läuft kostenlos: keine bezahlten Dienste, keine Konten nötig.

**Nicht-Ziele (vorerst)**
- Vollständiger Funktionsumfang der Adobe-Programme; PSD/PRPROJ/AEP-Dateiformate.
- Musikproduktion (kein DAW-Nachbau).
- Mehrbenutzer, Cloud-Sync, Windows/Linux-Versionen (Linux-Build nur für Tests).
- Lokale KI (läuft auf dem Intel-Mac nicht).
- Apple-Signatur/Notarisierung (kein bezahltes Entwicklerkonto).

**Anti-Ziele (wäre ein Fehlschlag, selbst wenn es technisch läuft)**
- **Sieht aus wie Adobe**: keine Adobe-Namen, -Logos, -Icons oder nachgebaute Oberflächen. Eigene Gestaltung; Funktionen und Shortcuts sind Branchenstandard und dürfen gleich sein.
- **Willkürlicher Chef**: Abzüge ohne Messwert oder ohne Hinweis zur Behebung.
- **Videos verlassen ungefragt den Mac**: Ohne ausdrückliches Einschalten (Gemini) geht nichts ins Internet.
- **Werkzeug-Funktionen ohne Auftragsbezug**: Was kein Auftrag je verlangt, wird nicht gebaut.
- **Unbenutzbar langsam** auf dem Zielgerät (Vorschau ruckelt bei 1080p).

## 3. Rahmenbedingungen

| Thema | Vorgabe |
|---|---|
| Zielgerät | MacBook Pro 2019, **Intel**, 16 GB RAM. Mindestversion macOS 12 (Annahme, siehe §12). |
| Bauweise | **Tauri v2** (Rust-Hülle) + Web-Oberfläche (TypeScript). Build für `x86_64-apple-darwin`. |
| Medienverarbeitung | **ffmpeg/ffprobe** als mitgelieferte Programme (Sidecar). Vorschau über Proxies. |
| Build | **GitHub Actions** baut automatisch die `.dmg` bei jedem Push auf `main` und bei Tags (Release). |
| Installation | Unsigniert; erster Start per Rechtsklick → „Öffnen“. Anleitung im README. |
| KI | Nur optional: **Google Gemini** mit kostenlosem Schlüssel, in den Einstellungen **standardmäßig aus**. |
| Sprache | Oberfläche Deutsch. Fachbegriffe deutsch mit englischem Branchenbegriff in Klammern, z. B. „Rasierklinge (Razor)“. |
| Entwicklung | Entwickelt in einem Linux-Container: Web-Teil wird dort getestet (Chromium/Playwright), Rust-Teil kompiliert/getestet für Linux; der Mac-Build läuft nur in GitHub Actions. |

## 4. Zwei Perspektiven als Grundlage für den Umfang

### 4.1 Chef-Sicht – was ein Ausbilder/Producer bei Bild und Ton erwartet
1. **Pünktlich und nach Vorgabe**: Format, Länge, Bildrate, Lautheit stimmen. Die technische Abnahme kommt vor der kreativen.
2. **Sauberer Ton**: Schlechtes Bild verzeiht man eher als schlechten Ton (Pegel, Rauschen, Übersteuerung, Klicks an Schnitten).
3. **Sauberes Bild**: richtige Belichtung, Weißabgleich, Einstellungsgrößen-Wechsel, Achsen beachten.
4. **Schnitt mit Rhythmus**: sinnvolle Einstellungslängen, saubere Anschlüsse, J/L-Cuts im Interview, keine ungewollten Jump Cuts.
5. **Ordnung**: Projektordner, Dateinamen nach Konvention, Datensicherung.
6. **Rechte**: Musik/Bilder lizenziert, Einverständnis gefilmter Personen.
7. **Briefing verstanden**: Zielgruppe, Kanal, Pflicht-Elemente (z. B. Bauchbinde, Logo am Ende).

### 4.2 Profi-Sicht – was täglich genutzt wird (Rangfolge)
1. **Schnitt** (≈ Premiere Pro): Import/Ordnen, J/K/L, In/Out, Rasierklinge, Ripple-Trimmen, Clip-Pegel, Export-Vorgaben.
2. **Ton** (≈ Audition): Lautheit normalisieren, Rauschminderung, EQ, Kompressor, Dialogpegel.
3. **Farbe** (≈ Lumetri, Teil des Schnitts): Belichtung/Weißabgleich korrigieren, Einstellungen angleichen, Scopes lesen.
4. **Titel/Grafik** (≈ Essential Graphics/After Effects): Bauchbinden, Titel, einfache Animationen.
5. **Bild** (≈ Photoshop): Thumbnails, Standbilder, Freisteller, Grafiken fürs Video.
6. **Export/Encoding** (≈ Media Encoder): Codecs (H.264, ProRes), Presets, Proxies.

Illustrator, InDesign, Lightroom sind bei Bild und Ton selten → nicht im Umfang.

**Folge für die Reihenfolge:** Phase 1 Schnitt inkl. Farbe, einfachen Titeln/Bauchbinden und Export (deckt Rang 1, 3, 6 und das Häufigste von 4) → Phase 2 Ton → Phase 3 Bild → Phase 4 Motion.

## 5. Ansätze (betrachtet und entschieden)

| Ansatz | Vorteile | Nachteile | Entscheidung |
|---|---|---|---|
| A – Web-App als privater Link | sofort nutzbar, Chef-KI ohne Schlüssel | Export nur in Echtzeit, Browser-Grenzen, kein direkter Dateizugriff | verworfen: du willst ein installiertes Programm |
| **B – Mac-App (Tauri + ffmpeg)** | echte Dateien, echte Formate, schnell genug auf Intel, kostenlos | Mac-Build nur über GitHub Actions; unsigniert | **gewählt** |
| B mit Electron statt Tauri | Chromium-Engine, überall gleich | ~150 MB größer, mehr RAM (16 GB knapp beim Schneiden) | verworfen |
| Chef mit lokaler KI (Ollama) | privat, kostenlos | läuft nicht auf Intel-Macs | verworfen |
| **Chef = Regeln + optional Gemini** | Regeln immer verfügbar; Gemini für Gestaltung | Gemini-Gratis-Tarif: Google nutzt Eingaben zur Produktverbesserung, Menschen können sie lesen | **gewählt**, Gemini standardmäßig aus |

## 6. Architektur

```
┌──────────────── Tauri-Fenster (WKWebView) ────────────────┐
│  React + TypeScript + Vite · Zustand (State) · Canvas/WebGL │
│  Bereiche: Werkstatt │ Aufträge │ Chefbüro │ Einstellungen   │
└──────────────┬──────────────────────────────────────────────┘
               │ Tauri-Commands (typisierte Schnittstelle „Backend“)
┌──────────────▼──────────────────────────────────────────────┐
│ Rust: Projekte/Dateien · Job-Queue · ffmpeg/ffprobe-Sidecar  │
│ Analyse (ebur128, astats, signalstats, blackdetect, scdet,   │
│ freezedetect, silencedetect) · Export · Keychain · Gemini-   │
│ HTTP-Client                                                  │
└──────────────────────────────────────────────────────────────┘
```

- **Frontend spricht nur mit einer Schnittstelle `Backend`** (TypeScript-Interface). Zwei Implementierungen: `TauriBackend` (echt) und `MockBackend` (für Tests im Browser mit Fixture-Daten). So ist die gesamte Oberfläche im Linux-Container per Playwright testbar.
- **Medienwiedergabe**: lokale Dateien über das Tauri-Asset-Protokoll in `<video>`/`<audio>`. Risiko: Spulen (HTTP-Range) über das Asset-Protokoll auf macOS. Fallback: kleiner lokaler HTTP-Server in Rust auf `127.0.0.1` (zufälliger Port, Token).
- **Proxies**: Beim Import erzeugt ffmpeg 720p-H.264-Proxies (iPhone-HEVC/HDR wird dabei nach SDR tonemapped). Vorschau nutzt Proxies, Export die Originale. Umschalter „Proxies an/aus“ wie im Profi-Programm.
- **Export**: Rust baut aus dem Timeline-Modell einen ffmpeg-`filter_complex` (trim, setpts, concat/overlay, xfade, Farbfilter `eq`/`colortemperature`/`curves`, `volume`, `afade`, `amix`; Titel als vorgerenderte PNG-Overlays). H.264 über `h264_videotoolbox` (Hardware, keine x264-Abhängigkeit), ProRes über `prores_ks`.
- **Undo/Redo**: Befehlsmuster mit Immer-Patches, mindestens 100 Schritte, pro Werkzeug.
- **Speichern**: Autosave (entprellt, 2 s nach Änderung) + die letzten 10 Versionen als Backup.

### 6.1 Ablage auf dem Mac
```
~/Library/Application Support/Medienwerkstatt/
    state.json          Aufträge, Bewertungen, Punktekonto, Einstellungen (ohne Schlüssel)
~/Movies/Medienwerkstatt/
    A07_Baeckerei-Korn-und-Kruste/
        projekt.mwp     Projektdatei (JSON): Medien, Timelines, Bilddokumente, Ton-Sessions
        Medien/         importierte Originale (kopiert oder verlinkt, Wahl beim Import)
        Proxies/  Cache/  Export/  Recherche/
```
Gemini-Schlüssel liegt im **macOS-Schlüsselbund** (Rust-Crate `keyring`), nie in Dateien oder im Repo.

## 7. Bereich 1 – Werkstatt

Gemeinsam für alle Werkzeuge: **Medienbibliothek** des aktiven Auftrags (links), Arbeitsfläche (Mitte), Eigenschaften (rechts), **Tastenkürzel-Übersicht** (⌘/), Hinweise „So heißt das bei Adobe: …“ als Tooltip. Neutrales Dunkelgrau als Arbeitsfläche (für Farbbeurteilung, nicht als Adobe-Optik).

### 7.1 Schnitt (Phase 1)
**Muss**
- Sequenz-Einstellungen: Auflösung (1920×1080, 1080×1920, 1080×1080, 3840×2160), Bildrate (25, 50, 30, 24 fps). Warnung bei abweichender Clip-Bildrate.
- Quell- und Programm-Monitor; In/Out (I/O), J/K/L (mehrfach drücken = schneller), Pfeiltasten = Einzelbild, ⇧-Pfeil = 5 Bilder.
- Timeline: 2 Video- + 4 Audiospuren, Spuren sperren/stummschalten, Zoom (+/−, \ = ganze Sequenz), Einrasten (S), Marker (M).
- Werkzeuge: Auswahl (V), Rasierklinge (C), Ripple-Trim (B), Rollen (N), Hand (H). Einfügen (,) und Überschreiben (.), ⌘K Schnitt an Abspielposition, Q/W Ripple-Trim zum Kopf, ⇧⌫ Ripple-Löschen, ⌘L Bild/Ton verknüpfen/lösen, ⌥-Ziehen für J/L-Cuts.
- Übergänge: Überblendung Bild (⌘D), Ton-Blende (⇧⌘D); Dauer per Ziehen.
- Clip-Ton: Pegel in dB, Ein-/Ausblende-Griffe, Pegelanzeige (Peak + Kurzzeit-Lautheit), Master-Lautheitsmesser (integriert, LUFS).
- Farbe (Grundkorrektur): Belichtung, Kontrast, Lichter, Tiefen, Weißabgleich (Temperatur/Tönung), Sättigung; Scopes: Waveform (Luma) + Histogramm; Vorher/Nachher.
- Titel/Bauchbinde: Vorlagen (Bauchbinde, Titel, Abspann), Schrift/Größe/Farbe/Position, Ein-/Ausblendung, sichere Bereiche einblendbar.
- Export (⌘M): Presets „Social 16:9 1080p25“, „Social 9:16“, „Rundfunk 1080p25 (−23 LUFS)“, „Master ProRes 422“. Dateiname nach Auftragskonvention vorbelegt.

**Später (nicht Phase 1)**: Geschwindigkeit, Keyframes, Verschachteln, Multicam.

### 7.2 Ton (Phase 2)
Wellenform-Editor + einfache Mehrspur-Mischung: Schneiden, Gain, **Normalisieren auf LUFS-Ziel**, Fades, EQ (Hochpass + 3 Bänder parametrisch), Kompressor, Rauschminderung (ffmpeg `afftdn` mit Rauschprofil), Spektralansicht, Aufnahme übers Mikrofon (macOS-Mikrofonberechtigung), Export WAV 48 kHz/24 bit und AAC. Ergebnis landet in der Medienbibliothek.

### 7.3 Bild (Phase 3)
Ebenen (Pixel, Text, Form, Einstellungsebene), Deckkraft, Mischmodi (Normal, Multiplizieren, Negativ multiplizieren, Ineinanderkopieren, Weiches Licht), Ebenenmasken, Auswahlen (Rechteck, Ellipse, Lasso, Zauberstab), Pinsel/Radierer, Kopierstempel, Freistellen, Transformieren, Tonwertkorrektur, Gradationskurven, Farbton/Sättigung, Histogramm, Export PNG/JPG; Standbild aus dem Schnitt übernehmen.

### 7.4 Motion (Phase 4)
Kompositionen mit Ebenen (Text, Form, Bild, Video), Keyframes für Position/Skalierung/Drehung/Deckkraft/Ankerpunkt, Easing („weich ein/aus“), Kurveneditor einfach, Vorlagen (Bauchbinde, Logo-Animation), Ausgabe als Clip mit Transparenz direkt in der Schnitt-Timeline (Verknüpfung statt Export).

## 8. Bereich 2 – Aufträge

### 8.1 Rhythmus und Fristen
- Erster Auftrag beim ersten Start. Danach **alle 72 Stunden** ein neuer, unabhängig davon, ob der alte fertig ist (wie im Betrieb).
- **Frist** = Ausgabezeit + 72 h, aufgerundet auf 18:00 Uhr Ortszeit.
- Zeit wird beim Start der App nachgerechnet: Aufträge, die während der Abwesenheit fällig wurden, erscheinen nachträglich mit ihrer ursprünglichen Frist.
- **Urlaub**: bis 14 Tage pro Kalenderjahr im Voraus eintragbar (nicht rückwirkend); in dieser Zeit kommen keine Aufträge und laufen keine Fristen.
- Höchstens **3 offene Aufträge**; ist das Limit erreicht, verfällt der älteste (siehe §9.4).

### 8.2 Zufallsgenerator
Deterministisch: `seed = Installations-ID + Auftragsnummer` → derselbe Auftrag bleibt beim Neustart gleich. Bausteine (als JSON-Kataloge im Repo, leicht erweiterbar):

| Baustein | Beispiele |
|---|---|
| Kunde (fiktiv) | Bäckerei, Sportverein, Stadtbibliothek, Fahrradladen, Lokalsender-Redaktion, Start-up, Musikschule |
| Anlass/Kanal | Instagram-Reel, YouTube-Video, Lokal-TV-Beitrag, Website-Header, Podcast, Messe-Loop |
| Format | 16:9, 9:16, 1:1; 1080p/4K; 25/50 fps |
| Länge | 15 s – 3 min, Toleranz ±10 % (Stufe 1) bis ±2 % (Stufe 5) |
| Technik | Lautheit −14 LUFS (Social) oder −23 LUFS (Rundfunk, EBU R128), True Peak ≤ −1 dBTP, Codec, Dateiname |
| Gestaltung | Mindestzahl Einstellungen, Pflicht-Einstellungsgrößen (Totale, Halbnah, Detail), J-Cut, Bauchbinde, Logo am Ende, Farbstimmung |
| Haken | „ohne gesprochenen Text“, „nur Tageslicht“, „eine Einstellung ≥ 8 s“, „Ton nur aus Atmo“, „Kunde will Hochformat UND Querformat“ |
| Material | selbst drehen (Handy/Kamera) mit Drehhinweis (z. B. „HDR aus, 25 fps“) oder: ohne Dreh (Recherche, Bild aus eigenen Fotos) |

**Auftragstypen** (nur Typen, deren Werkzeuge schon gebaut sind, werden gezogen):
- **Video** (Schnitt): Imagefilm, Interview mit Zwischenschnitten, Nachrichtenbeitrag 1:30, Tutorial, Veranstaltungs-Clip.
- **Ton** (ab Phase 2): Interview säubern, Sprecheraufnahme, Podcast-Intro, Atmo-Collage.
- **Bild** (ab Phase 3): Thumbnail, Plakat, Retusche, Composing, Standbild-Serie.
- **Motion** (ab Phase 4): Bauchbinde animiert, Logo-Animation, Infografik.
- **Recherche** (immer): Exposé, Drehplan, Shotlist, Rechte-Recherche (Musik/Bild), Technik-Kaufberatung mit Budget, Formatvergleich (Codecs).
- **Kombi** (ab Stufe 2): mehrere Abgaben in einem Auftrag, z. B. Film + Thumbnail + Shotlist.

**Stufen 1–5** steigen mit dem Punktekonto: strengere Toleranzen, mehr Pflicht-Elemente, mehr Kombi-Aufträge. Verhältnis Typen (Richtwert, sobald alle Werkzeuge da sind): Video 40 %, Ton 15 %, Bild 15 %, Motion 10 %, Recherche 20 %.

### 8.3 Auftragsansicht
Eine Hauptaufgabe pro Ansicht (deine Gestaltungsregel aus dem Bewerbungsradar): Briefing oben (Kunde, Aufgabe, Frist mit Countdown), darunter **Vorgaben als Checkliste**, Drehhinweise, Abgaben. Primärbutton: „In der Werkstatt öffnen“ (legt Projektordner an), später „Abgeben“.

### 8.4 Recherche-Abgaben
Formular-Vorlagen in der App (z. B. Exposé: Arbeitstitel, Logline, Zielgruppe, Inhalt, Gestaltungsidee, Länge; Drehplan: Datum, Ort, Motive, Personen, Technikliste, Zeitplan; Rechte: Quelle, Lizenz, Link, Bedingungen). Quellen als URL-Liste.

## 9. Bereich 3 – Chefbüro

### 9.1 Ablauf der Abnahme
1. „Abgeben“ → App prüft, ob alle Abgaben vorhanden sind.
2. **Messen** (Rust + ffmpeg, auf dem Mac): ffprobe (Auflösung, fps, Länge, Codec), `ebur128` (integrierte Lautheit, True Peak), `astats` (Clipping), `silencedetect`, `blackdetect`, `freezedetect`, `signalstats` pro Einstellung (Luma-Mittel, Anteil ausgefressener Lichter/abgesoffener Tiefen), Schnitterkennung aus dem **Projektmodell** (genauer als Bilderkennung) plus `scdet` als Kontrolle.
3. **Projekt auslesen**: Anzahl/Längen der Einstellungen, J/L-Cuts vorhanden, Übergänge, Bauchbinde vorhanden, Ton-Schnitte ohne Blende (Klick-Risiko), Bildraten-Mischung.
4. **Regel-Chef** wendet die Regeln an (§9.2) → Punkte + Kommentare.
5. **Optional Gemini** (§9.5) ergänzt die Gestaltungsbewertung.
6. Ergebnis als **Abnahmeprotokoll**: Gesamtpunkte, Abzüge nach Kategorie, Satz des Chefs, „Nachbessern“-Button.

Ziel: Abnahme eines 60-s-Films in unter 60 s auf dem Zielgerät.

### 9.2 Punkte (max. 100 pro Auftrag)

| Kategorie | Max | Regeln (Beispiele, Schwellen nach Stufe) |
|---|---|---|
| **Technik** | 40 | Auflösung/Seitenverhältnis falsch −10 · Bildrate falsch −8 · Bildraten gemischt ohne Anpassung −4 · Länge außerhalb Toleranz −2 pro angefangene Sekunde (max −10) · Lautheit > ±1 LU daneben −2 pro LU (max −10) · True Peak > −1 dBTP −5 · Clipping −5 · unbeabsichtigtes Schwarzbild/Standbild −3 je Fund · falscher Codec/Dateiname −2 |
| **Gestaltung** | 35 | Einstellung überbelichtet (> 5 % Lichter ausgefressen) −3 je Einstellung (max −9) · unterbelichtet analog · Einstellungslänge außerhalb Rhythmus-Rahmen (z. B. < 0,5 s oder > 10 s ohne Vorgabe) −2 je · Pflicht-Einstellungsgröße fehlt −4 je (geprüft über **Clip-Etiketten**: Jeder Clip in der Medienbibliothek bekommt eine Einstellungsgröße – Totale, Halbtotale, Halbnah, Nah, Groß, Detail –, wie Profis ihr Material beschriften; mit Gemini zusätzlich am Bild gegengeprüft) · Farbsprung zwischen aufeinanderfolgenden Einstellungen (Luma-/Farbmittel-Abweichung über Schwelle) −2 je · Tonschnitt ohne Blende −1 je (max −5) |
| **Auftrag** | 25 | Abgabe fehlt −15 je · Pflicht-Element fehlt (Bauchbinde, Logo, J-Cut) −5 je · Haken nicht umgesetzt −8 · Recherche: Pflichtfeld leer −3 je, weniger als 2 Quellen −5, Text außerhalb Längenrahmen −3 |
| **Frist** | – | −10 pro angefangenem Tag Verspätung (vom Ergebnis), max 3 Tage |
| **Bonus** | +5 | Abgabe ≥ 24 h vor Frist +3 · alle Technikwerte perfekt +2 |

Berechnung: `Ergebnis = min(100, Technik + Gestaltung + Auftrag + Bonus) − Verspätung`, nie unter 0. Schwellen liegen in einer Regeldatei (`rules.json`), damit man sie ohne Code-Änderung anpassen kann.

### 9.3 Nachbessern
Eine **Korrekturschleife** pro Auftrag innerhalb von 24 h nach der Abnahme (wie eine Kundenkorrektur): neue Abnahme, Ergebnis gedeckelt auf 90 Punkte. Zählt die bessere Bewertung.

### 9.4 Punktekonto, Stufen, Folgen
- Konto = Summe aller Auftragspunkte. **Verfallener Auftrag** (nicht abgegeben bis 3 Tage nach Frist, oder vom Limit verdrängt): **−20** aufs Konto.
- Stufen über Konto-Schwellen (Startwerte in `rules.json`: 0 / 300 / 800 / 1500 / 2500 Punkte): Probetag → Praktikum → 1. Lehrjahr → 2. Lehrjahr → 3. Lehrjahr (Stufe 1–5). Abstieg möglich, wenn das Konto fällt.
- Chefbüro zeigt: Konto, Stufe, Verlauf der letzten 10 Abgaben (Punkte je Kategorie), **häufigste Abzüge** („Dein Dauerbrenner: Ton zu laut“) mit Link zur passenden Werkzeugfunktion.
- **Showreel-Merkliste**: Abgaben ≥ 80 Punkte kann man fürs Showreel markieren.

### 9.5 Gemini (optional, standardmäßig aus)
- Einstellungen: Schalter „Gestaltung von Gemini begutachten lassen“, Schlüssel-Feld (→ Schlüsselbund), Modellauswahl (Liste wird über die Modell-Abfrage der Gemini-API geholt, nicht fest im Code; Standard: das neueste Flash-Modell der Liste), Link zur Anleitung „Gratis-Schlüssel holen“.
- **Datenschutz-Hinweis** beim Einschalten und bei jeder Abnahme: Im Gratis-Tarif nutzt Google Eingaben zur Produktverbesserung, Menschen können sie lesen. Vor jedem Senden: Vorschau der Standbilder (8–12 Bilder, max. 768 px, JPEG) und Pflicht-Häkchen „Alle erkennbaren Personen haben zugestimmt“. Ohne Häkchen: nur Regel-Chef.
- Gesendet werden: Briefing, Messwerte, Standbilder bzw. Bild-Abgaben oder Recherche-Text. **Nie** das Video selbst.
- Antwort im festen JSON-Schema: je Kriterium (Bildaufbau, Einstellungsgrößen, Licht, Farbe, Briefing-Treue, bei Recherche: Inhalt/Logik) Urteil + Begründung + Punktanpassung. Gemini darf nur die **Gestaltungs- und Auftragskategorie um höchstens ±10 Punkte** verschieben; Technik bleibt allein beim Regel-Chef.
- Fehler, Limit erreicht oder offline → Abnahme läuft nur mit Regeln, Hinweis im Protokoll.

### 9.6 Ton des Chefs
Sachlich-direkt wie ein Producer, kurz, ohne Beleidigungen. Satzbausteine je Ergebnisbereich (z. B. < 50: „So geht das nicht raus.“, 50–79: „Brauchbar, aber …“, ≥ 80: „Kann so zum Kunden.“) plus die wichtigsten zwei Abzüge in Klartext.

## 10. Gestaltung der Oberfläche

**Quellen (verbindlich):** das Design-System der Sparplan-Kompass-App (`sparplan-kompass/docs/DESIGN.md`, Stand „Look v4 / Aufbau v5“ über „Apple-Look v3“), der Skill *ultimate-design-engineer* (Apples „Designing Fluid Interfaces“, Animations-Entscheidungsraster) und Apples Human Interface Guidelines für macOS. Wo sie sich widersprechen, gilt: HIG macOS für Bedienelemente und Fenster, Sparplan-Tokens für Farben/Schrift/Form, Skill für Bewegung.

### 10.1 Tokens (aus dem Sparplan übernommen)
| Gruppe | Hell | Dunkel |
|---|---|---|
| Flächen `--bg` `--surface` `--surface-2` `--surface-3` | #ffffff (Grund), #ffffff, #f2f2f7, #e5e5ea | #000000, #1c1c1e, #2c2c2e, #3a3a3c |
| Text `--ink` `--ink-2` `--muted` | #1d1d1f, #424245, #66666b | #f5f5f7, #d1d1d6, #98989d |
| Linien `--line` `--line-strong` | #e5e5ea, #d2d2d7 | #38383a, #48484a |
| Akzent `--accent` (einzige Akzentfarbe) | #1a4fd0 | #7aa2ff |
| Gut/Schlecht `--good` `--bad` (nur für Punkte gut / Abzug) | #248a3d, #d70015 | #30d158, #ff453a |
| Hinweise `--sig-warn/care/tip/info/date` | rot, gelb, grün, blau, violett (wie Sparplan) | |
| Form | `--radius` 20, `--r-sm` 12, `--r-lg` 24, Pillen 999 | |
| Tiefe | Karten mit 1-px-Haarlinie statt Schatten (v4) | Linien, keine Schatten |
| Bewegung | `--dur-1` 0,12 s · `--dur-2` 0,24 s · `--dur-3` 0,42 s · `--ease-out-fast: cubic-bezier(0.23,1,0.32,1)` · `--ease-out-smooth: cubic-bezier(0.16,1,0.3,1)` | |
| Schrift | Systemschrift (SF Pro, optische Größen), Fließtext 16 · Nebentext 14 · Caption 13 · Title3 20 · Title2 22 · Title1 28 · Large Title 34; **alle Zahlen in Tabellenziffern**; Laufweite Titel −0,02 em, Fließtext 1,47 Zeilenabstand | |

Hell/Dunkel folgt dem System (`prefers-color-scheme`), Umschalter automatisch → hell → dunkel in den Einstellungen.

### 10.2 Zwei Gesichter einer App
- **Aufträge, Chefbüro, Einstellungen** = Sparplan-Look v4/v5: weißer Grund (dunkel: schwarz), Karten mit Haarlinie, Radius 20, Innenabstand 26/28 px, großer Titel ohne Kasten mit Zeile „Bereich · Reiter“ darüber, Inhalt höchstens 1120 px breit. **Eine Hauptaktion pro Ansicht.** Drei Stufen je Seite wie im Sparplan: *Kurz gesagt* (immer sichtbar) · *Verstehen* · *Für Profis* (aufklappbar, wird gemerkt) – z. B. Abnahmeprotokoll: Punkte + Chef-Satz → Kategorien → Einzelmesswerte.
- **Werkstatt** = immer dunkel, wie Apples eigene Profi-Programme. Grund #1c1c1e, Bedienfelder #2c2c2e, Felder #3a3a3c, **Vorschau-Monitor auf neutralem Grau (#1e1e1e, ohne Blaustich)** für die Farbbeurteilung. Dichte nach macOS-HIG: Grundschrift 13 px, nie unter 12 px (Zeitcode, Lineal); Zeitcodes in Tabellenziffern. Bedienelemente in macOS-Größen (regulär 28 px, klein 22 px); Akzentfarbe dunkel #7aa2ff für Auswahl, Abspielkopf und aktive Werkzeuge.

### 10.3 Navigation (Mac-Layout aus Sparplan v5)
Feste Seitenleiste links: Marke, die drei Bereiche (Werkstatt · Aufträge · Chefbüro) mit Symbol und gleitender Markierung, darunter Einstellungen. ⌘1/⌘2/⌘3 wechseln die Bereiche. Über dem Inhalt eine schmale Leiste: links Unterreiter (Segmentsteuerung mit gleitendem Daumen), rechts Status (aktiver Auftrag + Countdown, Punktekonto). In der Werkstatt klappt die Seitenleiste auf Symbole zusammen, um Platz zu sparen.

### 10.4 Bewegung (Skill + Sparplan)
- **Entscheidungsraster:** Was 100+ Mal am Tag passiert, wird **nie animiert** – alle Tastenkürzel, Schnitte, Trimmen, Abspielkopf, Werkzeugwechsel. Hover, Reiterwechsel, Listen: 120–160 ms. Dialoge, Blätter, Aufklapper: 200–350 ms. Seltenes (Abnahme-Ergebnis, Stufenaufstieg): bis 600 ms, einmalig.
- **Federn statt fester Dauer** für Blätter/Dialoge (Dämpfung 1, Antwort 0,38 s öffnen / 0,3 s schließen); unterbrechbar, laufen vom aktuellen Wert weiter; keine Eingabe wird während einer Bewegung gesperrt.
- **Rückmeldung beim Drücken** sofort auf pointer-down: `scale(0.97)` bei Knöpfen, Karten, Reitern (nicht bei Werkstatt-Werkzeugleisten).
- **Direkte Manipulation:** Clips, Trimm-Griffe, Keyframes und Regler folgen dem Zeiger 1:1 mit Greif-Versatz; Einrasten ohne Verzögerung.
- Nie aus `scale(0)`; nur `transform`/`opacity` animieren; nie `transition: all`.
- Punktestand zählt im Chefbüro beim ersten Öffnen nach einer Abnahme einmal hoch (Anzeige darüber, echter Text bleibt).
- **Material:** Glas (Unschärfe 20 px, Sättigung 180 %) nur für Seitenleiste, Kopfleiste und Hintergrund von Blättern – nie in der Werkstatt-Arbeitsfläche.
- **Barrierefrei:** „Bewegung reduzieren“ → kurze Überblendungen (150 ms); „Transparenz reduzieren“ → feste Flächen; „Mehr Kontrast“ → stärkere Linien.

### 10.5 Weitere Regeln
- **Status dreifach codiert** (Farbe + Symbol + Text): Auftrag offen (blau, Uhr + „noch 2 T. 4 Std.“) · bald fällig ≤ 24 h (gelb, Ausrufezeichen) · verspätet (rot, Kreuz-Uhr) · abgegeben (grau, Haken) · bewertet (grün/rot nach Ergebnis, Zahl).
- **Symbole:** Bereichs-Symbole als App-Icon-Kacheln wie im Sparplan (weißes Zeichen auf Kachel mit Verlauf in Akzentfarbe, Radius 22,5 %); Werkzeug-Symbole aus Lucide (ISC-Lizenz).
- **Kontrast** nach WCAG 2.1 AA in beiden Modi und in der Werkstatt; Fokus immer sichtbar; alles per Tastatur bedienbar; axe-core-Prüfung in den E2E-Tests.
- **Eigene Marke:** keine Adobe-Optik, -Farben (kein Rot-Verlauf als Markenfarbe), -Icons oder -Logos.

## 11. Build, Verteilung, Tests

- **Repo-Struktur**: `src/` (Frontend), `src-tauri/` (Rust), `catalogs/` (Auftragsbausteine), `rules.json`, `docs/`.
- **GitHub Actions**
  - `test.yml` (Ubuntu, bei jedem Push): Lint, Typprüfung, Vitest, Playwright gegen `MockBackend`, `cargo test`.
  - `build-mac.yml` (macOS-Runner, Push auf `main` + Tags): Tauri-Build für `x86_64-apple-darwin`, lädt ffmpeg/ffprobe-x86_64 (feste Version, Prüfsumme) als Sidecar, erzeugt `.dmg` als Download-Artefakt; bei Tag `v*` zusätzlich GitHub-Release.
  - Öffentliches Repo: Builds kostenlos. Privates Repo: begrenztes Freikontingent (macOS-Minuten zählen mehrfach).
- **Lizenzen**: ffmpeg als separates Programm mitgeliefert, Lizenzhinweis in „Über“; keine Adobe-Assets.
- **Tests**
  - Unit (Vitest): Zufallsgenerator (Determinismus, Stufen, Typ-Gating), Regel-Chef (jede Regel mit Fixture-Messwerten), Timeline-Operationen (Trim, Ripple, Einfügen/Überschreiben, Undo), Filtergraph-Bau.
  - Rust: Parser für ffmpeg-Ausgaben (ebur128, signalstats, blackdetect …) mit echten Ausgabe-Fixtures; Analyse gegen synthetische Testclips (ffmpeg `testsrc`, `sine`, bewusst zu laut/überbelichtet erzeugt).
  - E2E (Playwright, Web-Build + MockBackend): Auftrag erscheint → Projekt öffnen → schneiden → abgeben → Protokoll zeigt erwartete Abzüge.
  - Manuelle Abnahme auf dem Mac nach jedem Phasen-Release (Checkliste im Repo).

## 12. Phase 1 – Abnahmekriterien
1. Die `.dmg` aus GitHub Actions lässt sich auf dem MacBook Pro 2019 installieren und starten.
2. Beim ersten Start erscheint Auftrag #1 (Video oder Recherche) mit Frist; nach 72 h kommt der nächste (über eine Entwickler-Zeitsimulation testbar).
3. iPhone-Clips (HEVC/H.264, auch HDR) lassen sich importieren; Proxies werden erzeugt; Vorschau 1080p läuft flüssig (≥ 25 fps) auf dem Zielgerät.
4. Alle in §7.1 „Muss“ genannten Schnittfunktionen und Shortcuts funktionieren.
5. Export mit allen vier Presets erzeugt abspielbare Dateien mit korrekten Werten.
6. Abgabe → Abnahmeprotokoll in < 60 s (60-s-Film); jeder Abzug nennt Soll, Ist, Abzug, Behebung.
7. Verspätung, Verfall, Bonus, Korrekturschleife, Urlaub und Punktekonto funktionieren laut §8–9.
8. Recherche-Aufträge sind in der App bearbeitbar und werden nach Regeln bewertet.
9. Gemini: aus = keine Netzwerkverbindung; an = Vorschau + Zustimmung + Bewertung; Fehlerfall fällt sauber auf Regeln zurück.

## 13. Dem Builder überlassen
Konkrete Bibliotheken (außer den oben festgelegten), Komponentenstruktur, Canvas- vs. DOM-Rendering der Timeline, Proxy-Parameter, genaue Schwellwerte innerhalb der Regeldatei, Texte der Chef-Satzbausteine, Inhalt der Bausteinkataloge (Grundstock ≥ 20 Kunden, ≥ 15 Haken), Icon-Auswahl, Aussehen im Detail innerhalb von §10.

## 14. Offene Punkte
- ~~Repo~~ erledigt: `d8bn77pbr4-cmd/Medienwerkstatt` (öffentlich). Entwicklung auf dem Branch `claude/adobe-cloud-replica-go3c54`; die Mac-Builds laufen auch auf diesem Branch.
- Freigegeben am 2026-11-23 mit der Ergänzung „Design-Vorgaben aus der Sparplan-App“ (§10).

## 15. Meine Annahmen (bitte prüfen)
- macOS 12 oder neuer auf dem MacBook.
- Gedreht wird mit dem Handy (iPhone oder Android) oder einer Kamera, die MP4/MOV liefert.
- Gemini ist eingebaut, aber aus. Empfehlung: erst nach ein paar Aufträgen einschalten, wenn die Technik sitzt und du Feedback zur Gestaltung willst – und nur mit Material ohne fremde Personen bzw. mit deren Zustimmung.
- Reihenfolge Bild vor Motion, weil Bauchbinden/Titel (das Häufigste aus Motion) schon in Phase 1 im Schnitt stecken.
- Punkteregeln und Schwellen wie in §9.2 (über `rules.json` jederzeit änderbar).
