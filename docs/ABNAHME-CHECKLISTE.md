# Abnahme-Checkliste (Mac-Build)

Prüfung der Phase 1 auf dem Zielgerät (MacBook Pro 2019, Intel) mit der `.dmg` aus GitHub Actions. Die Kriterien 1–9 entsprechen Spec §12. Abhaken, Abweichungen unten notieren.

## 1. Installieren und starten
Kriterium: Die `.dmg` aus GitHub Actions lässt sich auf dem MacBook Pro 2019 installieren und starten.
- [ ] App gebaut (GitHub-Artefakt oder `scripts/build-mac-local.sh`) und installiert
- [ ] Actions → Lauf „build-mac“ → Artefakt „Medienwerkstatt-…“ laden, entpacken: `.dmg` ist größer als 60 MB (ffmpeg enthalten).
- [ ] `.dmg` öffnen, App nach „Programme“ ziehen: kopiert ohne Fehler.
- [ ] Erster Start per Rechtsklick → „Öffnen“ (bzw. „Trotzdem öffnen“): Fenster erscheint, Menüleiste „Medienwerkstatt“, kein Absturz.
- [ ] Zweiter Start per Doppelklick: öffnet ohne Meldung.
- [ ] Symbol im Dock und im Finder ist die blaue Kachel mit Klappe und Wellenform.

## 2. Erster Auftrag und 72-h-Takt
Kriterium: Beim ersten Start erscheint Auftrag #1 (Video oder Recherche) mit Frist; nach 72 h kommt der nächste (über Entwickler-Zeitsimulation testbar).
- [ ] Frisch gestartet (Ordner `~/Library/Application Support/Medienwerkstatt/` vorher entfernt): unter „Aufträge“ steht Auftrag #1 mit Kunde, Briefing und Frist (18:00 Ortszeit).
- [ ] Mit der Entwickler-Zeitsimulation 72 h vorspulen: Auftrag #2 erscheint; vorher nicht.
- [ ] App beenden und neu starten: Aufträge und Fristen bleiben erhalten.

## 3. Import, Proxies, Vorschau
Kriterium: iPhone-Clips (HEVC/H.264, auch HDR) lassen sich importieren; Proxies werden erzeugt; Vorschau 1080p läuft flüssig (≥ 25 fps).
- [ ] iPhone-Clip (HEVC, 1080p 25 fps) importieren: erscheint in der Medienbibliothek mit Dauer und Auflösung.
- [ ] H.264-Clip („Kompatibel“-Aufnahme) importieren: gleiches Ergebnis.
- [ ] HDR-Clip importieren: Hinweis „Am Handy HDR-Video ausschalten“; Proxy sieht nicht ausgewaschen aus (SDR-Tonemapping).
- [ ] Proxy-Fortschritt wird angezeigt und endet; `Proxies/` im Projektordner enthält 720p-Dateien.
- [ ] Ein 30-fps-Clip in einer 25-fps-Sequenz: Bildraten-Warnung erscheint.
- [ ] 1080p-Material auf der Zeitleiste abspielen (Proxies aus und an): Wiedergabe flüssig, Bild und Ton synchron, keine Aussetzer über 30 s.

## 4. Schnittfunktionen und Kürzel
Kriterium: Alle in §7.1 „Muss“ genannten Schnittfunktionen und Shortcuts funktionieren.
- [ ] J/K/L (rückwärts, Stopp, vorwärts; mehrfaches L/J beschleunigt).
- [ ] I/O setzen Einblenden-/Ausblendmarke; Einfügen/Überschreiben aus dem Quelle-Monitor.
- [ ] Rasierklinge (Razor) teilt den Clip an der Abspielkopf-Position; Auswahl, Verschieben, Löschen, Lücke schließen (Ripple).
- [ ] Ripple-Trimmen an Clip-Kanten; Rückgängig/Wiederholen (⌘Z, ⇧⌘Z) über mehr als 20 Schritte.
- [ ] Clip-Pegel ändern; Ton-Blende (Audio-Fade) und Überblendung (⌘D) setzen.
- [ ] Farbe: Belichtung, Weißabgleich, Kurve wirken im Programm-Monitor sichtbar.
- [ ] Titel/Bauchbinde anlegen, Text, Schrift, Farbe, Position, Ein-/Ausblendung einstellen.
- [ ] Autosave: nach einer Änderung 2 s warten, App hart beenden (Aktivitätsanzeige), neu starten: Änderung ist da.

## 5. Export mit allen vier Presets
Kriterium: Export mit allen vier Presets erzeugt abspielbare Dateien mit korrekten Werten.
- [ ] Jedes der vier Presets (⌘M) exportieren; Fortschritt läuft bis 100 %.
- [ ] Jede Datei öffnet in QuickTime und läuft mit Bild und Ton.
- [ ] Werte prüfen (QuickTime → Fenster → Film-Informationen oder `ffprobe` im Terminal): Auflösung, Bildrate, Codec und Länge entsprechen dem Preset.
- [ ] Lautheit des Exports liegt im Zielbereich des Presets.

## 6. Abgabe und Abnahmeprotokoll
Kriterium: Abgabe → Abnahmeprotokoll in < 60 s (60-s-Film); jeder Abzug nennt Soll, Ist, Abzug, Behebung.
- [ ] 60-s-Film exportieren, abgeben, Stoppuhr: Abnahmeprotokoll erscheint in unter 60 s.
- [ ] Protokoll zeigt Gesamtpunkte, Abzüge nach Kategorie und einen Satz des Chefs.
- [ ] Jeder Abzug nennt Soll, Ist, Abzug und Behebung.
- [ ] Absichtlich zu lauter Film (Pegel +12 dB): Abzüge für Lautheit, True Peak, Clipping erscheinen mit den richtigen Werten.

## 7. Verspätung, Verfall, Bonus, Korrektur, Urlaub, Punktekonto
Kriterium: Verspätung, Verfall, Bonus, Korrekturschleife, Urlaub und Punktekonto funktionieren laut §8–9.
- [ ] Abgabe nach der Frist (Zeitsimulation): −10 pro angefangenem Tag, höchstens 3 Tage.
- [ ] Abgabe mehr als 24 h vor der Frist: Bonus +3; alle Technikwerte perfekt: +2.
- [ ] Nicht abgegebener Auftrag 3 Tage nach der Frist: verfällt, Konto −20.
- [ ] Korrekturschleife: „Nachbessern“ innerhalb von 24 h, Ergebnis höchstens 90; nach 24 h nicht mehr möglich; die bessere Bewertung zählt.
- [ ] Urlaub (Einstellungen): höchstens 14 Tage pro Kalenderjahr, nur im Voraus eintragbar (rückwirkend nicht möglich, Eingabe wird abgelehnt).
- [ ] Während des Urlaubs kommen keine neuen Aufträge, und es laufen keine Fristen (laufende Fristen verlängern sich um die Überschneidung mit dem Urlaub).
- [ ] Punktekonto und Stufe ändern sich mit der Summe (Aufstieg und Abstieg).

## 8. Recherche-Aufträge
Kriterium: Recherche-Aufträge sind in der App bearbeitbar und werden nach Regeln bewertet.
- [ ] Recherche-Auftrag öffnen: Felder und Quellen sind bearbeitbar und werden gespeichert.
- [ ] Abgabe mit leerem Pflichtfeld: −3 je Feld; weniger als 2 Quellen: −5; Text außerhalb des Längenrahmens: −3.
- [ ] Vollständige Recherche: Punkte ohne Abzug, Protokoll nennt Soll/Ist.

## 9. Gemini
Kriterium: Gemini: aus = keine Netzwerkverbindung; an = Vorschau + Zustimmung + Bewertung; Fehlerfall fällt sauber auf Regeln zurück.
- [ ] Gemini aus (Standard): während Abgabe und Abnahme besteht keine Netzwerkverbindung (z. B. WLAN aus: alles funktioniert; optional Little Snitch/Aktivitätsanzeige → Netzwerk).
- [ ] Gemini an, Schlüssel eingetragen: vor der Bewertung zeigt die App die Standbilder-Vorschau und fragt um Zustimmung.
- [ ] Ohne Zustimmung wird nichts gesendet; mit Zustimmung erscheint die Gestaltungsbewertung im Protokoll.
- [ ] Fehlerfall (falscher Schlüssel oder WLAN aus): Hinweis, Bewertung nach Regeln, kein Absturz, kein Punkteverlust durch den Fehler.

## Plattform-Punkte

Nur auf dem Mac prüfbar (im Linux-Container und in Playwright nicht abgedeckt):

- [ ] Vorschau zeigt Bild und Ton aus dem Projektordner (Asset-Protokoll, CORS)
- [ ] Werkstatt: Dateien aus dem Finder auf das Fenster ziehen importiert sie (Drag & Drop nur im Tauri-Fenster)
- [ ] Werkstatt: ⌘M (Export), ⌘D (Überblendung), ⌘L und ⌘K erreichen die Werkstatt und werden nicht vom macOS-Menü (Fenster minimieren, Lesezeichen) abgefangen
- [ ] Werkstatt: Import eines iPhone-Clips zeigt Proxy-Fortschritt, HDR-Hinweis „Am Handy HDR-Video ausschalten“ und die Bildraten-Warnung bei 30 fps in einer 25-fps-Sequenz
- [ ] Werkstatt: Pegelanzeige schlägt beim Abspielen aus (WebAudio-Analyser am Asset-Protokoll)
- [ ] Spulen im Vorschau-Monitor funktioniert (Asset-Protokoll): Klick in die Zeitleiste und Ziehen des Abspielkopfs springt sofort an die Stelle, Bild und Ton folgen (HTTP-Range). Fällt das aus: Rückfall auf lokalen HTTP-Server (Spec §6).
- [ ] Datei-Dialog: „Importieren“ öffnet den macOS-Dialog, mehrere Clips auswählbar, Abbrechen ändert nichts.
- [ ] „Im Finder zeigen“ öffnet den Finder mit markierter Datei bzw. dem Projektordner.
- [ ] Schlüsselbund: Gemini-Schlüssel speichern → Eintrag „Medienwerkstatt / gemini“ in der Schlüsselbundverwaltung; entfernen → Eintrag weg.
- [ ] Schlüsselbund: Solange Gemini aus ist, erscheint keine Schlüsselbund-Abfrage (weder beim Start noch bei Abgabe).
- [ ] Link zum Gratis-Schlüssel in den Einstellungen öffnet aistudio.google.com im Standardbrowser (Opener-Berechtigung); andere Adressen öffnen sich nicht.
- [ ] Echter Export mit Titel-PNG, LUT und `h264_videotoolbox`: Datei öffnet in QuickTime, Titel und Farblook sichtbar, Ton vorhanden.
- [ ] Fenster: Titelleiste (Overlay) lässt sich greifen, Ampelknöpfe überdecken keine Bedienelemente; Mindestgröße 1200×760 wird gehalten.
- [ ] Beenden mit ⌘Q während eines Exports oder Imports: keine halbfertigen Dateien im Projektordner.

## Ergebnis

Datum: ________  Build (Commit): ________  Abweichungen:
