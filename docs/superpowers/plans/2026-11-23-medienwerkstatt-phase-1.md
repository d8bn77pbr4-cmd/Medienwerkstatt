# Medienwerkstatt Phase 1 – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine installierbare Mac-App (Intel) mit Aufträgen alle 72 h, Schnitt-Werkzeug (inkl. Farbe, Titel, Export) und Regel-Chef mit Punktekonto; optional Gemini; automatischer `.dmg`-Build über GitHub Actions.

**Architecture:** Tauri v2 (Rust) + React/TypeScript. Die gesamte Fachlogik (Aufträge, Regeln, Timeline, Filtergraph, Gemini-Prompt) ist reines TypeScript in `src/domain/` und wird mit Vitest getestet. Medienarbeit (ffprobe/ffmpeg, Analyse, Dateien) liegt in der reinen Rust-Bibliothek `crates/mw-media` (mit echtem ffmpeg im Container getestet). `src-tauri` ist nur Kleber. Die Oberfläche spricht nur mit dem Interface `Backend`; ohne Tauri (Browser, Playwright) läuft automatisch `MockBackend`.

**Tech Stack:** Tauri 2, Rust 1.97 (Edition 2021), React 18, TypeScript 5 (strict), Vite, Zustand, Immer, Zod, Lucide-React, Vitest, Playwright, ffmpeg/ffprobe 9.1 (evermeet.cx, x86_64) als Sidecar.

**Spec:** `docs/superpowers/specs/2026-11-23-medienwerkstatt-design.md`

## Global Constraints

- Ziel: `x86_64-apple-darwin`, `minimumSystemVersion` **"12.0"**; Bundle-ID `de.medienwerkstatt.app`; Produktname „Medienwerkstatt“.
- Oberfläche komplett Deutsch; Fachbegriffe „deutsch (englisch)“, z. B. „Rasierklinge (Razor)“. Adobe-Produktnamen nur beschreibend in Tooltips „So heißt das bei Adobe: …“; keine Adobe-Logos, -Icons, -Farben.
- Ohne eingeschaltetes Gemini **keine Netzwerkanfrage**. Gemini standardmäßig aus; Schlüssel nur im macOS-Schlüsselbund (Service `Medienwerkstatt`, Konto `gemini`).
- ffmpeg/ffprobe immer mit Argument-Arrays starten, nie über eine Shell.
- Zeiten intern als Epoch-ms (UTC), Anzeige in Ortszeit; Fristen enden um 18:00 Ortszeit.
- Ablage: `~/Library/Application Support/Medienwerkstatt/state.json`; Projekte `~/Movies/Medienwerkstatt/A{NN}_{Kunde-slug}/` mit `projekt.mwp`, `Medien/`, `Proxies/`, `Cache/`, `Export/`, `Recherche/`.
- Dateien atomar schreiben (Temp-Datei + rename), die letzten 10 Versionen von `projekt.mwp` und `state.json` als `.bak1…bak10`.
- Design: Tokens, Schriftstufen, Dauern, Kurven, Radien exakt nach Spec §10.1; Werkstatt immer dunkel (Grund #1c1c1e, Felder #2c2c2e/#3a3a3c, Monitor-Umfeld #1e1e1e); Schrift nie < 12 px (Werkstatt) bzw. < 13 px (sonst); Zahlen `font-variant-numeric: tabular-nums`.
- Bewegung nach Spec §10.4: Tastenkürzel/Schnitte/Abspielkopf nie animiert; nur `transform`/`opacity`; nie `transition: all`; nie `scale(0)`; Druck-Feedback `scale(0.97)` auf pointer-down; `prefers-reduced-motion` → 150-ms-Überblendung.
- Punkte- und Schwellwerte nur aus `rules.json` (Werte aus Spec §9.2–9.5), nie im Code.
- Commit-Nachrichten enden mit den Zeilen `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` und `Claude-Session: https://claude.ai/code/session_01NxRrmR7gQQCXMV769TLdBN`.

## Review Focus

1. **iPhone-Material**: HEVC 10 bit HDR, 30 fps, Hochformat über Rotations-Metadaten → `probe` meldet die *angezeigte* Größe (gedreht) und `hdr: true`; Proxy ist SDR und aufrecht. (Test in Task 6.)
2. **Pfade mit Leerzeichen und Umlauten** („Bäckerei Clip 1.MOV“) → Import, Proxy, Export und Asset-URL funktionieren. (Tests in Task 6 und Task 10.)
3. **Zeitumstellung und lange Abwesenheit**: App 10 Tage zu, Frist über den Wechsel Sommer-/Winterzeit → Aufträge werden nachträglich korrekt ausgegeben, Frist bleibt 18:00 Ortszeit, verfallene korrekt gebucht. (Tests in Task 2.)
4. **Timeline ohne Ton oder mit tonlosen Clips** → Export erzeugt eine stille Tonspur; Lautheit „−∞“ wird als `null` gemeldet und vom Chef als „kein Ton“ (−10, Lautheit max) bewertet, nicht als Absturz. (Tests in Task 7 und Task 4.)
5. **Abgebrochenes Schreiben/defekte Datei** → `state.json`/`projekt.mwp` unlesbar → letzte gültige Sicherung wird geladen und ein Hinweis gezeigt. (Tests in Task 6 und Task 5.)

---

## Dateistruktur

```
package.json · tsconfig.json · vite.config.ts · vitest.config.ts · playwright.config.ts · eslint.config.js · index.html
rules.json                         Punkte/Schwellen (Spec §9)
catalogs/{kunden,anlaesse,haken,recherche}.json
src/main.tsx · src/App.tsx
src/design/{tokens.css,base.css,werkstatt.css,spring.ts}
src/shell/{Sidebar.tsx,TopBar.tsx,useAreaShortcuts.ts}
src/backend/{Backend.ts,types.ts,TauriBackend.ts,MockBackend.ts,index.ts}
src/domain/time.ts · rng.ts
src/domain/assignments/{types.ts,schedule.ts,generator.ts,naming.ts}
src/domain/chef/{rules.ts,evaluate.ts,research.ts,account.ts,phrases.ts}
src/domain/timeline/{types.ts,ops.ts,history.ts,snap.ts,facts.ts,resolve.ts}
src/domain/render/{color.ts,lut.ts,titles.ts,filtergraph.ts,presets.ts}
src/domain/gemini/{prompt.ts,schema.ts,apply.ts}
src/state/{appStore.ts,projectStore.ts}
src/features/auftraege/{AuftraegeView.tsx,AuftragDetail.tsx,ResearchForm.tsx,StatusBadge.tsx}
src/features/chefbuero/{ChefbueroView.tsx,Protokoll.tsx,SubmitSheet.tsx}
src/features/einstellungen/{SettingsView.tsx,GeminiConsent.tsx}
src/features/werkstatt/{Werkstatt.tsx,MediaBin.tsx,Monitor.tsx,Timeline.tsx,Inspector.tsx,Scopes.tsx,ExportSheet.tsx,ShortcutOverlay.tsx,keymap.ts,playback.ts,glPreview.ts}
crates/mw-media/src/{lib.rs,probe.rs,fsx.rs,run.rs,proxy.rs,analyze.rs,frames.rs,gemini.rs}
src-tauri/{Cargo.toml,tauri.conf.json,build.rs,capabilities/default.json,src/main.rs,src/commands.rs,src/keychain.rs,icons/}
tests/unit/** · tests/e2e/** · tests/fixtures/** · scripts/{fetch-ffmpeg-mac.sh,make-fixtures.sh}
.github/workflows/{test.yml,build-mac.yml}
README.md · docs/ABNAHME-CHECKLISTE.md
```

---

### Task 1: Gerüst, Design-Tokens, Shell, Backend-Interface, Test-CI

**Files:** Create alles unter „Dateistruktur“ für: Projektkonfiguration, `src/design/*`, `src/shell/*`, `src/backend/{Backend.ts,types.ts,MockBackend.ts,index.ts}`, `src/App.tsx`, `src/main.tsx`, Cargo-Workspace (`Cargo.toml` im Root mit Mitgliedern `crates/mw-media`, `src-tauri`), leeres `crates/mw-media`, `src-tauri` (Tauri 2, Fenster 1440×900, min. 1200×760, `titleBarStyle: Overlay`), `.github/workflows/test.yml`, `tests/e2e/shell.spec.ts`, `tests/unit/smoke.test.ts`.

**Interfaces – Produces:**
- `type Area = 'werkstatt' | 'auftraege' | 'chefbuero' | 'einstellungen'`
- `interface Backend` in `src/backend/Backend.ts` mit genau diesen Methoden (Typen in `src/backend/types.ts`, in späteren Tasks gefüllt):
  `loadState(): Promise<LoadResult<AppState>>` · `saveState(s: AppState): Promise<void>` · `projectDir(a: Assignment): Promise<string>` · `loadProject(dir: string): Promise<LoadResult<Project>>` · `saveProject(dir: string, p: Project): Promise<void>` · `pickMediaFiles(): Promise<string[]>` · `importMedia(dir: string, paths: string[], mode: 'copy'|'link'): Promise<MediaItem[]>` · `createProxy(dir: string, m: MediaItem, onProgress: (p: number) => void): Promise<string>` · `mediaUrl(path: string): string` · `writeFile(dir: string, rel: string, bytes: Uint8Array): Promise<string>` · `runFfmpeg(args: string[], durationSec: number, onProgress: (p: number) => void): Promise<void>` · `analyze(path: string, segments: Segment[]): Promise<Measurements>` · `extractFrames(path: string, times: number[], maxWidth: number): Promise<string[]>` · `readFileBase64(path: string): Promise<string>` · `gemini: { hasKey(): Promise<boolean>; setKey(k: string | null): Promise<void>; listModels(): Promise<string[]>; generate(model: string, prompt: string, imagePaths: string[], schema: object): Promise<string> }` · `revealInFinder(path: string): Promise<void>`
- `type LoadResult<T> = { value: T | null; restoredFromBackup: boolean }`
- `getBackend(): Backend` in `src/backend/index.ts`: `TauriBackend` wenn `'__TAURI_INTERNALS__' in window`, sonst `MockBackend`.
- CSS-Variablen exakt nach Spec §10.1, `[data-theme]` und `prefers-color-scheme`; Klasse `.werkstatt` setzt die dunklen Werkstatt-Werte unabhängig vom Modus.
- `Spring` in `src/design/spring.ts`: `new Spring({ damping = 1, response = 0.38 })`, `.to(target, onFrame)`, unterbrechbar (läuft vom aktuellen Wert/Geschwindigkeit weiter).

- [ ] **Step 1: Failing tests**

```ts
// tests/e2e/shell.spec.ts
test('Seitenleiste wechselt Bereiche per Klick und ⌘1–3', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Bereiche' })).toBeVisible();
  await page.keyboard.press('Meta+2');
  await expect(page.getByRole('heading', { level: 1, name: 'Aufträge' })).toBeVisible();
  await page.keyboard.press('Meta+3');
  await expect(page.getByRole('heading', { level: 1, name: 'Chefbüro' })).toBeVisible();
  await page.getByRole('link', { name: 'Werkstatt' }).click();
  await expect(page.locator('.werkstatt')).toHaveCSS('background-color', 'rgb(28, 28, 30)');
});
test('keine axe-Verstöße in der Shell (hell und dunkel)', async ({ page }) => { /* @axe-core/playwright, beide colorScheme */ });
```
`tests/unit/smoke.test.ts`: `getBackend()` liefert im jsdom-Test eine `MockBackend`-Instanz.

- [ ] **Step 2:** `npm test` und `npx playwright test tests/e2e/shell.spec.ts` → FAIL (nichts vorhanden).
- [ ] **Step 3:** Gerüst anlegen (`npm create vite` nicht verwenden – Dateien direkt schreiben), Shell bauen: Seitenleiste mit Glas-Material, gleitender Markierung (Spring), Bereichs-Kacheln (App-Icon-Stil, Spec §10.5), Kopfleiste mit Platzhalter für Auftrag/Countdown/Konto. Playwright: `webServer: npm run dev`, Projekte `chromium` (lokal) und `webkit` (nur CI-macOS, Task 15).
- [ ] **Step 4:** Tests grün; zusätzlich `cargo test --workspace --exclude medienwerkstatt` grün (leere Bibliothek). In `test.yml` (ubuntu-24.04): `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, Playwright Chromium, `apt-get install ffmpeg libwebkit2gtk-4.1-dev librsvg2-dev libayatana-appindicator3-dev`, `cargo test -p mw-media`, `cargo check -p medienwerkstatt`.
- [ ] **Step 5: Commit** `feat: Gerüst, Design-Tokens, Shell und Test-CI`

### Task 2: Zeit, Zufall, Auftrags-Fahrplan

**Files:** Create `src/domain/time.ts`, `src/domain/rng.ts`, `src/domain/assignments/types.ts`, `src/domain/assignments/schedule.ts`, `rules.json` (vollständig mit allen Werten aus Spec §8.1, §8.2 und §9.2–9.5), `src/domain/chef/rules.ts`; Test `tests/unit/schedule.test.ts`, `tests/unit/rng.test.ts`.

**Interfaces – Produces:**
- `type Rules` (Zod-Schema + Typ) und `loadRules(): Rules` in `src/domain/chef/rules.ts` (importiert `rules.json`, validiert beim Start). Enthält u. a. `schedule: { intervalHours: 72, deadlineHour: 18, lateWindowHours: 72, maxOpen: 3, vacationDaysPerYear: 14 }`, `typeWeights`, `lengthTolerancePct: [10, 7.5, 5, 3, 2]`, `kombiShareFromLevel2: 0.3`, `levels: [{ min: 0, name: 'Probetag' }, { min: 300, name: 'Praktikum' }, { min: 800, name: '1. Lehrjahr' }, { min: 1500, name: '2. Lehrjahr' }, { min: 2500, name: '3. Lehrjahr' }]` sowie alle Abzüge aus §9.2 (Task 4 nutzt sie).
- `type Level = 1 | 2 | 3 | 4 | 5`
- `interface Clock { now(): number }`; `systemClock(offsetMs: () => number): Clock` (Entwickler-Zeitsimulation).
- `rng(seed: string): () => number` (FNV-1a-Hash → mulberry32), `pick<T>(r, items: T[]): T`, `weighted<T>(r, items: [T, number][]): T`.
- `const H = 3_600_000; ISSUE_INTERVAL = 72 * H`
- `roundUpTo18(ts: number): number` – 18:00 Ortszeit am selben Tag, wenn `ts` ≤ 18:00, sonst am Folgetag.
- `interface Vacation { start: number; end: number }`
- `interface ScheduleState { nextIssueAt: number; nextNumber: number; vacations: Vacation[] }`
- `tick(s: ScheduleState, assignments: Assignment[], now: number, issue: (number: number, issuedAt: number) => Assignment, rules: Rules): { schedule: ScheduleState; assignments: Assignment[]; events: ScheduleEvent[] }` – gibt alle fälligen Aufträge nach (catch-up), überspringt Urlaub (nextIssueAt im Urlaub → Urlaubsende), setzt `deadline = roundUpTo18(issuedAt + 72h) + Urlaubsüberlappung`, `expiresAt = deadline + 72h + Urlaubsüberlappung`, markiert abgelaufene als `expired`, beim 4. offenen Auftrag den ältesten als `expired` (Grund `'limit'`). `type ScheduleEvent = { kind: 'issued' | 'expired'; assignmentId: string; reason?: 'deadline' | 'limit' }`.
- `canAddVacation(vs: Vacation[], v: Vacation, now: number): { ok: true } | { ok: false; reason: 'past' | 'over14days' | 'overlap' }` – max 14 Tage je Kalenderjahr (Tage, die in das Jahr fallen).
- `Assignment.status: 'open' | 'submitted' | 'evaluated' | 'expired'`.

- [ ] **Step 1: Failing tests** (mit `process.env.TZ = 'Europe/Berlin'` in `vitest.config.ts`)

```ts
it('Frist 18:00 Ortszeit', () => {
  expect(roundUpTo18(Date.parse('2026-11-23T10:00:00+01:00'))).toBe(Date.parse('2026-11-23T18:00:00+01:00'));
  expect(roundUpTo18(Date.parse('2026-11-23T19:30:00+01:00'))).toBe(Date.parse('2026-11-24T18:00:00+01:00'));
});
it('über Zeitumstellung bleibt 18:00', () => {
  expect(new Date(roundUpTo18(Date.parse('2027-03-26T20:00:00+01:00') + 72 * H)).getHours()).toBe(18);
});
it('10 Tage Abwesenheit: 4 Aufträge nachträglich, ältester per Limit verfallen, Fristen nach Original', () => {
  const r = tick(start(t0), [], t0 + 10 * 24 * H, issueStub, rules);
  expect(r.assignments.map(a => a.number)).toEqual([1, 2, 3, 4]);
  expect(r.assignments[0].status).toBe('expired');
  expect(r.assignments[1].deadline).toBe(roundUpTo18(t0 + 72 * H + 72 * H));
});
it('Urlaub verschiebt Ausgabe und verlängert Fristen', () => { /* Urlaub über eine Ausgabezeit */ });
it('Urlaub > 14 Tage im Jahr oder rückwirkend wird abgelehnt', () => {
  expect(canAddVacation([], { start: now - H, end: now + 24 * H }, now)).toEqual({ ok: false, reason: 'past' });
});
it('rng ist deterministisch', () => { expect(rng('a#1')()).toBe(rng('a#1')()); });
```
- [ ] **Step 2:** `npx vitest run tests/unit/schedule.test.ts tests/unit/rng.test.ts` → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** Tests grün.
- [ ] **Step 5: Commit** `feat: Auftrags-Fahrplan mit Fristen, Urlaub und Nachholen`

### Task 3: Kataloge und Zufallsgenerator

**Files:** Create `catalogs/*.json`, `src/domain/assignments/generator.ts`, `src/domain/assignments/naming.ts`; Test `tests/unit/generator.test.ts`.

**Interfaces – Produces:**
- `type AssignmentType = 'video' | 'research' | 'ton' | 'bild' | 'motion'`; Phase 1 verfügbar: `['video', 'research']` (Konstante `AVAILABLE_TYPES`).
- `type ShotSize = 'totale' | 'halbtotale' | 'halbnah' | 'nah' | 'gross' | 'detail'`
- `interface VideoSpec { aspect: '16:9'|'9:16'|'1:1'; width: number; height: number; fps: 25|50|30|24; durationSec: number; toleranceSec: number; loudnessLufs: -14|-23; truePeakMax: -1; codec: 'h264'|'prores'; fileName: string; minShots: number; requiredShotSizes: ShotSize[]; requireJCut: boolean; requireLowerThird: boolean }`
- `interface Hook { id: string; text: string; verify: 'auto' | 'self'; autoRule?: 'longShot8s' | 'bothFormats' }`
- `interface Deliverable { id: string; kind: 'video' | 'research'; label: string; videoSpec?: VideoSpec; researchTemplate?: ResearchTemplateId }`
- `type ResearchTemplateId = 'expose' | 'drehplan' | 'shotlist' | 'rechte' | 'kaufberatung' | 'formatvergleich'`
- `Assignment` (in `types.ts`): `{ id, number, issuedAt, deadline, expiresAt, level: 1|2|3|4|5, type: AssignmentType | 'kombi', client: { name, branche }, occasion, title, briefing: string, hook: Hook, deliverables: Deliverable[], shootingNotes: string[], status, submissions: Submission[], expiredReason?: 'deadline'|'limit' }`
- `generateAssignment(installId: string, number: number, issuedAt: number, level: Level, available: AssignmentType[], catalogs: Catalogs, rules: Rules): Assignment` – `seed = installId + '#' + number`. Typgewichte aus `rules.json` (`video 40, ton 15, bild 15, motion 10, research 20`), auf verfügbare normiert; ab Stufe 2 zu 30 % `kombi` (Video + Recherche-Abgabe). Toleranz Länge je Stufe `[10, 7.5, 5, 3, 2] %`. Drehhinweise immer: „HDR-Video aus“, „Bildrate {fps} fps“, „Querformat/Hochformat halten“.
- `fileNameFor(a: Assignment, d: Deliverable, version: number): string` → `A07_Korn-und-Kruste_v01_1080p25.mp4` (Slug: Umlaute → ae/oe/ue/ss, Leerzeichen → `-`). `projectFolderFor(a): string` → `A07_Korn-und-Kruste`.
- Kataloge: ≥ 20 Kunden, ≥ 8 Anlässe je Kanal, ≥ 15 Haken (davon ≥ 2 `auto`), Recherche-Themen je Vorlage ≥ 5.

- [ ] **Step 1: Failing tests**

```ts
it('gleicher Seed → gleicher Auftrag', () => expect(gen('x', 7)).toEqual(gen('x', 7)));
it('nur verfügbare Typen', () => { for (let n = 1; n <= 200; n++) expect(['video','research','kombi']).toContain(gen('x', n).type); });
it('Stufe 1 hat keine Kombi-Aufträge', () => { for (let n = 1; n <= 100; n++) expect(gen('x', n, 1).type).not.toBe('kombi'); });
it('Toleranz sinkt mit der Stufe', () => expect(videoSpec(gen('x', 3, 5)).toleranceSec).toBeLessThan(videoSpec(gen('x', 3, 1)).toleranceSec));
it('Dateiname nach Konvention', () => expect(fileNameFor(a, d, 1)).toBe('A07_Baeckerei-Korn-und-Kruste_v01_1080p25.mp4'));
it('Hochformat 9:16 hat 1080×1920', () => { /* alle 9:16-Aufträge in 1..200 */ });
```
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren, Kataloge schreiben. **Step 4:** grün.
- [ ] **Step 5: Commit** `feat: Zufallsgenerator mit Bausteinkatalogen`

### Task 4: Regel-Chef, Recherche-Bewertung, Punktekonto

**Files:** Create `src/domain/chef/{evaluate.ts,research.ts,account.ts,phrases.ts}`, `src/domain/gemini/schema.ts` (hier nur der Typ `GeminiResult`, Task 14 ergänzt Schema und Parser); Modify `rules.json` nur falls ein Wert fehlt; Test `tests/unit/chef.test.ts`, `tests/unit/research.test.ts`, `tests/unit/account.test.ts`, Fixtures `tests/fixtures/measurements/*.json`.

**Interfaces – Consumes:** `Rules`, `loadRules` (Task 2); `Assignment`, `Deliverable`, `VideoSpec` (Task 3); `Measurements`, `Segment` (Typen in `src/backend/types.ts`, Werte liefert Task 7); `ProjectFacts` (Typ hier definiert, berechnet in Task 9).

**Interfaces – Produces:**
- `Measurements = { format: { width, height, fps, durationSec, videoCodec, audioCodec: string | null }, audio: { integratedLufs: number | null, truePeakDbtp: number | null, clippedSamples: number, silences: Interval[] }, video: { black: Interval[], freeze: Interval[], detectedCuts: number[], segments: SegmentStats[] } }`; `SegmentStats = { start, end, meanLuma, highlightsPct, shadowsPct, meanU, meanV }` (Luma 0–1, Prozent 0–100, U/V −0,5…0,5); `Segment = { start: number; end: number }`.
- `ProjectFacts = { shots: { start: number; end: number; mediaId: string; shotSize: ShotSize | null }[]; hasJOrLCut: boolean; lowerThirds: number; transitions: number; audioCutsWithoutFade: number; fpsMismatch: boolean; longestShotSec: number }`
- `Deduction = { ruleId: string; category: 'technik'|'gestaltung'|'auftrag'|'frist'|'bonus'; label: string; soll: string; ist: string; points: number; fix: string; tool?: { area: 'werkstatt'; panel: 'audio'|'farbe'|'export'|'timeline'|'medien' } }`
- `EvaluationInput = { assignment: Assignment; submittedAt: number; videos: Record<string /*deliverableId*/, { measurements: Measurements; facts: ProjectFacts; fileName: string } | null>; research: Record<string, ResearchDoc | null>; selfChecks: { hookDone: boolean }; isCorrection: boolean }`
- `evaluate(input: EvaluationInput, rules: Rules): Evaluation` mit `Evaluation = { id, assignmentId, at, categories: Record<'technik'|'gestaltung'|'auftrag', { max: number; points: number; deductions: Deduction[] }>, bonus: Deduction[], late: Deduction | null, total: number, phrase: string, gemini?: GeminiResult }`; Kategorie nie < 0; `total = min(100, Σ Kategorien + Σ Bonus) − Verspätung`, ≥ 0; bei `isCorrection` `min(total, 90)`.
- Regeln exakt nach Spec §9.2 mit Werten aus `rules.json`; Lautheit `null` → Abzug `loudness` mit Maximalwert und `ist: 'kein Ton'`. Rhythmus: Einstellung < 0,5 s oder > 10 s → −2 je (max −8), außer Haken `longShot8s` (dann eine Einstellung ≥ 8 s Pflicht, > 10 s erlaubt). Farbsprung: |ΔmeanLuma| > 0,12 oder |ΔU|/|ΔV| > 0,05 zwischen Nachbar-Einstellungen → −2 je (max −6).
- `evaluateResearch(doc: ResearchDoc, template: ResearchTemplate, rules): Deduction[]`; `ResearchDoc = { templateId; fields: Record<string, string>; sources: string[] }`; Vorlagen in `research.ts`: Felder mit `{ key, label, required, minWords?, maxWords? }`; Quellen zählen nur mit `https?://`.
- `applyLate(assignment, submittedAt, rules): Deduction | null` (−10 je angefangene 24 h, max 3 Tage).
- `account(evaluations: Evaluation[], assignments: Assignment[], rules): { points: number; level: Level; levelName: string; nextAt: number | null; frequent: { ruleId: string; label: string; count: number }[] }` – beste Bewertung je Auftrag zählt; verfallen −20; Stufen `[0, 300, 800, 1500, 2500]` mit Namen Probetag/Praktikum/1. Lehrjahr/2. Lehrjahr/3. Lehrjahr.
- `phraseFor(e: Evaluation): string` (< 50 / 50–79 / ≥ 80, plus die zwei größten Abzüge in Klartext).

- [ ] **Step 1: Failing tests** (Auszug; je Regel ein Test mit Fixture)

```ts
it('zu laut: −9 LUFS bei Ziel −14 → −10 (max)', () => {
  const d = find(evaluate(withLoudness(-9), rules), 'loudness');
  expect(d).toMatchObject({ points: -10, soll: '−14 LUFS ±1', ist: '−9,0 LUFS', category: 'technik' });
});
it('perfekte Abgabe 24 h vor Frist → 100 inkl. Bonus gedeckelt', () => expect(evaluate(perfectEarly, rules).total).toBe(100));
it('2 Tage zu spät → −20', () => expect(evaluate(lateBy(36 * H), rules).late?.points).toBe(-20));
it('Korrektur höchstens 90', () => expect(evaluate({ ...perfect, isCorrection: true }, rules).total).toBe(90));
it('kein Ton → Lautheit max Abzug, kein Absturz', () => expect(find(evaluate(silent, rules), 'loudness').ist).toBe('kein Ton'));
it('Kategorie wird nie negativ', () => expect(evaluate(allWrong, rules).categories.technik.points).toBe(0));
it('Pflicht-Einstellungsgröße fehlt → −4 je', () => { /* requiredShotSizes ['detail'], facts ohne detail */ });
it('Recherche: leeres Pflichtfeld −3, eine Quelle −5', () => { /* evaluateResearch */ });
it('Konto: verfallener Auftrag −20, beste Bewertung zählt', () => { /* account */ });
```
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren. **Step 4:** grün.
- [ ] **Step 5: Commit** `feat: Regel-Chef mit Punkten, Abzügen und Punktekonto`

### Task 5: App-Zustand und Bereich „Aufträge“

**Files:** Create `src/state/appStore.ts`, `src/features/auftraege/*`, Modify `src/backend/MockBackend.ts` (Zustand im Speicher + `localStorage`), `src/shell/TopBar.tsx`; Test `tests/unit/appStore.test.ts`, `tests/e2e/auftraege.spec.ts`.

**Interfaces – Consumes:** `tick`, `generateAssignment`, `account`, `Backend.loadState/saveState`.
**Interfaces – Produces:**
- `AppState = { version: 1; installId: string; createdAt: number; schedule: ScheduleState; assignments: Assignment[]; evaluations: Evaluation[]; showreel: string[]; settings: Settings }`; `Settings = { theme: 'auto'|'light'|'dark'; gemini: { enabled: boolean; model: string | null }; devTimeOffsetMs: number }`.
- `useApp` (Zustand): `init(backend, clock)`, `tickNow()` (jede Minute und beim Fokussieren des Fensters), `saveResearch(assignmentId, deliverableId, doc)`, `addVacation(v)`, Selektoren `openAssignments`, `activeAssignment` (früheste Frist), `accountSummary`.
- Speichern entprellt 2 s nach jeder Änderung; `restoredFromBackup` → Hinweis-Banner „Letzte Sicherung geladen“.
- UI nach Spec §8.3/§10: Liste offener Aufträge (Status dreifach codiert, Countdown „noch 2 T. 4 Std.“, gelb ≤ 24 h, rot verspätet), Archiv; Detail mit Briefing, Vorgaben-Checkliste, Drehhinweisen, Abgaben; Primärbutton „In der Werkstatt öffnen“ (Video) bzw. „Recherche bearbeiten“; `ResearchForm` mit Feldern der Vorlage, Wortzähler, Quellenliste.

- [ ] **Step 1: Failing tests**
  - Unit: `init` mit leerem Backend legt `installId` an und gibt Auftrag #1 aus; `tickNow` nach +72 h (Clock-Stub) gibt #2 aus; defekter Zustand → `restoredFromBackup` an UI weitergereicht.
  - E2E: Start → Aufträge zeigt Auftrag #1 mit Countdown und Checkliste; Recherche-Auftrag (MockBackend-Seed so gewählt, dass #1 Recherche ist, z. B. `?seed=e2e-research`) → Formular ausfüllen → nach Neuladen noch da; Entwickler-Zeitsimulation +80 h (Einstellungen) → Status „verspätet“ in Rot mit Symbol und Text.
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren. **Step 4:** grün (inkl. axe).
- [ ] **Step 5: Commit** `feat: Bereich Aufträge mit Countdown, Checkliste und Recherche-Formular`

### Task 6: mw-media – Probe, Dateien, Prozesse, Proxies

**Files:** Create `crates/mw-media/src/{lib.rs,probe.rs,fsx.rs,run.rs,proxy.rs}`, `scripts/make-fixtures.sh`; Test `crates/mw-media/tests/probe_proxy.rs`.

**Interfaces – Produces (Rust, serde `camelCase`):**
- `pub struct Tools { pub ffmpeg: PathBuf, pub ffprobe: PathBuf }` · `Tools::from_env()` (env `MW_FFMPEG`/`MW_FFPROBE`, sonst neben der ausführbaren Datei, sonst `PATH`).
- `pub fn probe(t: &Tools, file: &Path) -> Result<MediaInfo>`; `MediaInfo { kind: Video|Audio|Image, duration_sec, width, height /* angezeigt, nach Rotation */, fps: Option<f64>, has_audio, hdr: bool /* smpte2084 oder arib-std-b67 */, video_codec: Option<String>, audio_codec: Option<String>, rotation: i32 }`.
- `pub fn write_atomic(path: &Path, bytes: &[u8], keep_backups: usize) -> io::Result<()>` (Temp + fsync + rename; vorher `path` → `.bak1`, Kette bis `.bak10`). `pub fn read_with_backup(path) -> io::Result<(Vec<u8>, bool /*restored*/)>` – liefert die neueste Datei, die `validate` besteht (Closure-Parameter `validate: impl Fn(&[u8]) -> bool`).
- `pub fn run_ffmpeg(t: &Tools, args: &[String], duration_sec: f64, on_progress: impl FnMut(f64)) -> Result<()>` – hängt `-progress pipe:1 -nostats` an, liest `out_time_us`, Fehler enthält die letzten 20 Zeilen stderr.
- `pub fn proxy_args(input: &Path, output: &Path, info: &MediaInfo, encoder: &str) -> Vec<String>` – 720p (`scale=-2:720`, bei Hochformat `scale=720:-2`), Keyframe alle 12 Bilder, AAC 48 kHz; bei `hdr` Tonemapping `zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p`. `encoder` = `h264_videotoolbox` auf macOS, `libx264` sonst (`pub fn default_h264_encoder() -> &'static str` per `cfg!(target_os)`).
- `scripts/make-fixtures.sh` erzeugt nach `tests/fixtures/media/`: `clip-25p.mp4` (5 s, testsrc2 1080p25, Sinus −20 dBFS), `clip-30p.mp4`, `hochformat-rotiert.mov` (Rotation 90°), `hdr-hlg.mov` (HEVC 10 bit, `color_trc=arib-std-b67`), `zu-laut.wav` (Sinus 0 dBFS, geclippt), `stumm.mp4` (ohne Tonspur), `Bäckerei Clip 1.mov`.

- [ ] **Step 1: Failing tests** – `probe` auf `hochformat-rotiert.mov` → `width 1080, height 1920, rotation` ±90; `hdr-hlg.mov` → `hdr: true`; `stumm.mp4` → `has_audio: false`; Proxy aus `hdr-hlg.mov` → probe des Proxys `hdr: false, height 720`; Proxy aus `Bäckerei Clip 1.mov` gelingt; `write_atomic` 12× → genau `.bak1…bak10`; kaputte Hauptdatei → `read_with_backup` liefert `.bak1` mit `restored = true`; `run_ffmpeg` meldet Fortschritt monoton bis ≥ 0,99.
- [ ] **Step 2:** `bash scripts/make-fixtures.sh && cargo test -p mw-media` → FAIL. **Step 3:** Implementieren. **Step 4:** grün.
- [ ] **Step 5: Commit** `feat(mw-media): Probe, atomisches Speichern, ffmpeg-Lauf und Proxies`

### Task 7: mw-media – Analyse und Standbilder

**Files:** Create `crates/mw-media/src/{analyze.rs,frames.rs}`; Test `crates/mw-media/tests/analyze.rs`.

**Interfaces – Produces:** `pub fn analyze(t: &Tools, file: &Path, segments: &[Segment]) -> Result<Measurements>` (Struktur wie TS-`Measurements` in Task 4, serde `camelCase`), `pub fn extract_frames(t: &Tools, file: &Path, times: &[f64], max_width: u32, out_dir: &Path) -> Result<Vec<PathBuf>>` (JPEG Qualität 3).

Vorgehen (bestimmt durch die Messgrößen, deshalb hier festgelegt):
1. `ffprobe` → `format`.
2. Ton-Durchlauf A: `-af ebur128=peak=true -f null -` → aus der „Summary“ `I:` (LUFS) und `True peak … Peak:` (dBFS); `-inf`/fehlender Ton → `null`.
3. Ton-Durchlauf B: PCM `f32le` 48 kHz → `clipped_samples` (|x| ≥ 0,999), Stille (RMS über 50 ms < −50 dBFS für ≥ 1 s).
4. Bild-Durchlauf: `-vf fps=5,scale=160:-2,format=yuv444p -f rawvideo -` → je Bild Luma-Mittel (Y normiert 16–235 → 0–1), Anteil Y ≥ 235 (`highlightsPct`), Y ≤ 16 (`shadowsPct`), U/V-Mittel; Schwarzbild = Luma-Mittel < 0,04 für ≥ 0,2 s; Standbild = mittlere absolute Differenz < 0,003 für ≥ 2 s; Schnitt = Differenz > 0,25; Aggregation je übergebenem Segment.

- [ ] **Step 1: Failing tests** – Fixture-Export (mit ffmpeg im Test erzeugt): 3 s normal + 1 s Schwarz + 3 s überbelichtet (`eq=brightness=0.6`), Ton 0 dBFS → `truePeakDbtp > -1`, `clippedSamples > 0`, `black` enthält ~[3,4], Segment 3 `highlightsPct > 5`, `detectedCuts` ≈ [3, 4]; Datei ohne Ton → `integratedLufs: null`; `extract_frames` an [0.5, 2.5] → 2 JPEGs ≤ 768 px breit.
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren. **Step 4:** grün.
- [ ] **Step 5: Commit** `feat(mw-media): Messung von Lautheit, Clipping, Belichtung, Schwarz-/Standbild und Schnitten`

### Task 8: Tauri-Kleber, Schlüsselbund, Gemini-HTTP, TauriBackend

**Files:** Create `src-tauri/src/{main.rs,commands.rs,keychain.rs}`, `crates/mw-media/src/gemini.rs`, `src/backend/TauriBackend.ts`; Modify `src-tauri/tauri.conf.json` (`externalBin: ["binaries/ffmpeg", "binaries/ffprobe"]`, Asset-Protokoll mit Scope `$HOME/Movies/Medienwerkstatt/**` und importierten Pfaden, CSP ohne Fremd-Hosts), `capabilities/default.json` (dialog, fs-Scope, shell/opener für „Im Finder zeigen“); Test `crates/mw-media/tests/gemini.rs`, `tests/unit/tauriBackend.test.ts`.

**Interfaces – Produces:**
- Tauri-Commands `snake_case`, 1:1 zu den `Backend`-Methoden (Task 1); Fortschritt über Event `mw://progress` mit `{ jobId: string, p: number }`.
- `pub fn gemini_request_body(prompt: &str, images_b64_jpeg: &[String], schema: &serde_json::Value) -> serde_json::Value` (`contents[0].parts` = Text + `inline_data {mime_type: image/jpeg}`; `generationConfig.responseMimeType = "application/json"`, `responseSchema`); `pub async fn gemini_generate(key, model, body) -> Result<String>` (POST `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, Header `x-goog-api-key`); `pub async fn gemini_models(key) -> Result<Vec<String>>` (nur Modelle mit `generateContent`, Namen ohne `models/`).
- Schlüssel liest **nur Rust** aus dem Schlüsselbund; er wird nie an die Oberfläche zurückgegeben.
- `TauriBackend` mappt `mediaUrl` auf `convertFileSrc`. Risiko Spulen über das Asset-Protokoll: In der manuellen Mac-Abnahme prüfen (Checkliste, Task 15); Fallback ist ein lokaler HTTP-Server – nur bauen, wenn die Abnahme scheitert.

- [ ] **Step 1: Failing tests** – Rust: Body enthält 2 Bilder bei 2 Eingaben, `responseMimeType` gesetzt, kein Schlüssel im Body; TS: jede Methode des `Backend`-Interfaces ist in `TauriBackend` implementiert (Typprüfung + Laufzeit-Test mit gemocktem `invoke`, der Command-Namen protokolliert).
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren. **Step 4:** `cargo test -p mw-media`, `npx vitest run tests/unit/tauriBackend.test.ts`, `cargo check -p medienwerkstatt` (CI-Linux) grün.
- [ ] **Step 5: Commit** `feat: Tauri-Befehle, Schlüsselbund und Gemini-Anbindung`

### Task 9: Timeline-Modell, Bearbeitungsfunktionen, Verlauf, Projekt-Fakten

**Files:** Create `src/domain/timeline/{types.ts,ops.ts,history.ts,snap.ts,facts.ts}`; Test `tests/unit/timeline.test.ts`, `tests/unit/facts.test.ts`.

**Interfaces – Produces:**
- Typen: `Frames = number` (ganze Bilder in Sequenz-Bildrate). `MediaItem = MediaInfo & { id: string; name: string; path: string; proxyPath: string | null; shotSize: ShotSize | null }`. `ColorParams = { exposure: number /*±2 Blenden*/; contrast: number; highlights: number; shadows: number; temperature: number; tint: number; saturation: number /*alle anderen −100…100*/ }`. `TitleParams = { style: 'bauchbinde'|'titel'|'abspann'; line1: string; line2: string; font: string; size: number; color: string; x: number; y: number; fadeIn: Frames; fadeOut: Frames }`. `Clip = { id; trackId; kind: 'media'|'title'; mediaId?: string; start: Frames; duration: Frames; sourceIn: number /*Sekunden*/; linkId: string | null; gainDb: number; fadeIn: Frames; fadeOut: Frames; color: ColorParams | null; title: TitleParams | null }`. `Track = { id; kind: 'video'|'audio'; name: 'V1'|'V2'|'A1'|'A2'|'A3'|'A4'; locked: boolean; muted: boolean }`. `Transition = { id; trackId; leftClipId; rightClipId; duration: Frames; kind: 'dissolve'|'audioFade' }`. `Sequence = { id; name; width; height; fps; tracks: Track[]; clips: Clip[]; transitions: Transition[]; markers: { frame: Frames; label: string }[]; inPoint: Frames | null; outPoint: Frames | null }`. `ExportRecord = { deliverableId: string; path: string; fileName: string; presetId: ExportPresetId; version: number; at: number }` (`ExportPresetId = 'social169'|'social916'|'rundfunk'|'prores'`). `Project = { version: 1; assignmentId: string; media: MediaItem[]; sequences: Sequence[]; activeSequenceId: string; exports: ExportRecord[] }`. TS-Spiegel von `MediaInfo` (Task 6) liegt in `src/backend/types.ts`.
- Reine Funktionen (geben neue `Sequence` zurück, gesperrte Spuren bleiben unverändert): `insertEdit(seq, media, srcIn: number, srcOut: number, at: Frames, targets: { video?: TrackId; audio?: TrackId }, mode: 'insert'|'overwrite')` (erzeugt verknüpftes Bild+Ton-Paar), `razor(seq, at, trackIds)`, `addEditAll(seq, at)` (⌘K), `rippleDelete(seq, clipIds)` (schließt Lücke auf allen nicht gesperrten Spuren), `liftDelete(seq, clipIds)`, `moveClips(seq, clipIds, deltaFrames, deltaTrack)` (überschreibt Ziel), `trim(seq, clipId, edge: 'in'|'out', delta, mode: 'normal'|'ripple')` (begrenzt durch Quell-Länge), `roll(seq, leftId, rightId, delta)`, `rippleTrimToPlayhead(seq, at, which: 'prev'|'next', trackIds)` (Q/W), `toggleLink(seq, clipIds)`, `addTransition(seq, leftId, rightId, frames)` (mittig auf dem Schnitt; kürzt auf verfügbare Überhänge, liefert `{ seq, shortenedTo?: Frames }`), `setClipProps(seq, clipId, patch)`, `addTitle(seq, at, trackId, style)`.
- Verknüpfte Clips bewegen/trimmen sich gemeinsam, außer der Aufrufer übergibt `{ ignoreLinks: true }` (⌥-Ziehen → J/L-Cut).
- `History<T>`: `push(state)`, `undo()`, `redo()`, `canUndo/canRedo`, Kapazität 100 (Schnappschüsse mit struktureller Teilung durch Immer).
- `snapTargets(seq, playhead): Frames[]` und `snap(frame, targets, thresholdFrames)`.
- `projectFacts(seq, media): ProjectFacts` (Typ aus Task 4): sichtbare Einstellungen = oberste nicht stummgeschaltete Videospur je Zeitpunkt (Titel zählen nicht), `hasJOrLCut` = verknüpfter Ton beginnt/endet ≥ 3 Bilder anders als sein Bild, `audioCutsWithoutFade` = aneinanderstoßende Ton-Clips auf einer Spur ohne Blende ≥ 2 Bilder, `fpsMismatch` = genutzter Clip mit |fps − Sequenz-fps| > 0,01.

- [ ] **Step 1: Failing tests** (Auszug)

```ts
it('Überschreiben ersetzt, Einfügen schiebt nach rechts', () => { /* zwei 50-Bilder-Clips, Einfügen bei 25 → Länge 150 */ });
it('Rasierklinge + Ripple-Löschen schließt die Lücke auf allen Spuren', () => { /* … */ });
it('Trimmen über Quell-Ende hinaus wird begrenzt', () => { /* 5-s-Quelle */ });
it('Q trimmt den Kopf bis zur Abspielposition und rückt nach', () => { /* … */ });
it('⌥-Trim des Tons erzeugt J-Cut, projectFacts.hasJOrLCut = true', () => { /* … */ });
it('Überblendung ohne Überhang wird gekürzt', () => expect(addTransition(seq, 'a', 'b', 25).shortenedTo).toBe(10));
it('gesperrte Spur bleibt unverändert', () => { /* … */ });
it('100 Schritte rückgängig, der 101. fällt raus', () => { /* … */ });
it('30-fps-Clip in 25-fps-Sequenz → fpsMismatch', () => { /* … */ });
```
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren. **Step 4:** grün.
- [ ] **Step 5: Commit** `feat: Timeline-Modell mit Profi-Bearbeitungsfunktionen und Verlauf`

### Task 10: Farbe (LUT), Titel, Export-Filtergraph, Presets

**Files:** Create `src/domain/render/{color.ts,lut.ts,titles.ts,filtergraph.ts,presets.ts}`; Test `tests/unit/render.test.ts`, `tests/integration/export.test.ts` (führt echtes ffmpeg aus, nur wenn `ffmpeg` im PATH; in CI-Linux immer).

Abweichung von Spec §6 (bewusst): Der Filtergraph wird in TypeScript aus dem Timeline-Modell gebaut (eine Sprache für das Modell, testbar mit Vitest); Rust führt ihn nur aus.

**Interfaces – Produces:**
- `applyColor(p: ColorParams, rgb: [number, number, number]): [number, number, number]` (0–1, Reihenfolge: Weißabgleich → Belichtung (× 2^exposure) → Kontrast um 0,5 → Lichter/Tiefen (weiche Kurven) → Sättigung um Rec.709-Luma; Ergebnis geklemmt). Neutral (`alle 0`) ist die Identität.
- `buildCubeLut(p: ColorParams, size = 33): string` (Text im `.cube`-Format) – dieselbe Funktion speist die Vorschau (Task 11) und den Export → Vorschau = Export.
- `renderTitle(t: TitleParams, width: number, height: number, canvas: OffscreenCanvas | HTMLCanvasElement): void` (Bauchbinde: Balken + zwei Zeilen im unteren Drittel innerhalb des Titel-sicheren Bereichs 90 %).
- `buildExport(seq: Sequence, media: MediaItem[], preset: ExportPreset, assets: { lutPathByClipId: Record<string, string>; titlePngByClipId: Record<string, string> }, output: string): { args: string[]; durationSec: number }`. Algorithmus (festgelegt): schwarze Grundfläche `color=black:s={w}x{h}:r={fps}:d={dur}`; jeder sichtbare Video-Clip (V1 vor V2) → `trim`/`setpts` aus dem Original, `scale+pad` auf Sequenzgröße, `lut3d`, bei Überblendung `format=yuva420p,fade=t=in:alpha=1` am rechten Clip und Überhang am linken, `overlay=enable='between(t,a,b)'`; Titel-PNGs `loop`, `fade` (alpha), `overlay`; Ton: je Ton-Clip `atrim`, `asetpts`, `volume={gainDb}dB`, `afade`, `adelay`, dann `amix=normalize=0`; ohne Ton-Clips `anullsrc=r=48000:cl=stereo` → stille Spur. Bereich In/Out der Sequenz wird respektiert.
- `ExportPreset = { id: ExportPresetId; label: string; container: 'mp4'|'mov'; video: { codec: 'h264'|'prores'; bitrateMbps?: number }; audio: { codec: 'aac'|'pcm_s24le'; rateHz: 48000 }; loudnessHint: -14|-23 }` mit den vier Presets aus Spec §7.1 (Rundfunk: Hinweis −23 LUFS, kein Auto-Normalisieren).
- `normalizeArgs?` nicht bauen – Lautheit stellt man im Schnitt selbst ein (Lernziel).

- [ ] **Step 1: Failing tests** – `applyColor(neutral, x) ≈ x`; `exposure: 1` verdoppelt linear (geklemmt); `.cube` hat 33³ Zeilen; `buildExport` für Fixture-Sequenz (2 Clips + Überblendung + Bauchbinde + J-Cut) enthält `overlay`, `lut3d`, `amix`, `-r 25`, `-s 1920x1080`; Integration: Export der Fixture-Sequenz aus `tests/fixtures/media/clip-25p.mp4` und `Bäckerei Clip 1.mov` → ffprobe-Länge = Sequenzlänge ±1 Bild, 1920×1080, 25 fps; Sequenz ohne Ton → Ausgabe hat eine Tonspur.
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren. **Step 4:** grün.
- [ ] **Step 5: Commit** `feat: Farbkorrektur per LUT, Titel und Export-Filtergraph`

### Task 11: Wiedergabe, Monitore, Scopes

**Files:** Create `src/domain/timeline/resolve.ts`, `src/features/werkstatt/{playback.ts,glPreview.ts,Monitor.tsx,Scopes.tsx}`; Test `tests/unit/resolve.test.ts`, `tests/e2e/playback.spec.ts`.

**Interfaces – Produces:**
- `resolveFrame(seq, frame): { layers: { clipId; mediaId; sourceTime: number; alpha: number; lutKey: string }[]; titles: { clipId; alpha: number }[]; audio: { clipId; mediaId; sourceTime: number; gain: number /*linear inkl. Fades*/ }[] }` – reine Funktion; Grundlage für Vorschau **und** Tests.
- `PlaybackEngine` (`playback.ts`): `constructor(backend, getSeq, getMedia, canvas)`, `play(rate: number)` (J/K/L: −1/0/1, wiederholtes L/J → 2×, 4×, 8×), `pause()`, `seek(frame)`, `step(n)`, `onFrame(cb)`; ein `<video>` je Medium (stumm, Proxy wenn vorhanden), Ton über `HTMLAudioElement` → WebAudio-`GainNode` je Clip; Nachführen, wenn Abweichung > 2 Bilder; Wiedergabe bis `outPoint` bzw. Ende.
- `glPreview.ts`: WebGL2, Clip-Bild → 3D-LUT-Textur (aus `buildCubeLut`) → Alpha-Überlagerung; Titel als Textur aus `renderTitle`.
- `Monitor` (Quelle/Programm): Zeitcode `HH:MM:SS:FF` in Tabellenziffern, In/Out-Anzeige, Sicherheitsrahmen ein/aus.
- `Scopes`: Luma-Waveform + Histogramm aus dem Programm-Canvas (heruntergerechnet 160 px, alle 100 ms).

- [ ] **Step 1: Failing tests** – Unit: während einer 10-Bilder-Überblendung bei Bild 5 zwei Ebenen mit `alpha` 0,5; Ton-Clip mit `fadeIn 10` hat bei Bild 5 `gain` ≈ 0,5 × 10^(gainDb/20); oberste Spur verdeckt V1. E2E (MockBackend mit Fixture-Clip): L → Zeitcode läuft; K → steht; ⇧→ springt 5 Bilder; Scopes zeichnen (Canvas nicht leer).
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren. **Step 4:** grün.
- [ ] **Step 5: Commit** `feat: Vorschau mit Farbe und Titeln, J/K/L und Scopes`

### Task 12: Werkstatt-Oberfläche (Medien, Timeline, Werkzeuge, Inspektor)

**Files:** Create `src/state/projectStore.ts`, `src/features/werkstatt/{Werkstatt.tsx,MediaBin.tsx,Timeline.tsx,Inspector.tsx,ShortcutOverlay.tsx,keymap.ts}`; Test `tests/unit/keymap.test.ts`, `tests/e2e/werkstatt.spec.ts`.

**Interfaces – Consumes:** alle Funktionen aus Task 9–11, `Backend.importMedia/createProxy/saveProject`.
**Interfaces – Produces:**
- `useProject` (Zustand + `History`): `open(assignment)`, `import(paths)`, `setShotSize(mediaId, s)`, `apply(op: (seq) => Sequence)` (legt Verlaufsschritt an), `undo/redo`, Autosave 2 s entprellt.
- `KEYMAP` in `keymap.ts` (Taste → Befehl, Tooltip-Text, Adobe-Bezeichnung): V Auswahl · C Rasierklinge · B Ripple-Trim · N Rollen · H Hand · I/O · J/K/L · ←/→ · ⇧←/⇧→ · `,` Einfügen · `.` Überschreiben · ⌘K · Q/W · ⇧⌫ Ripple-Löschen · ⌫ Löschen · ⌘L Verknüpfen · S Einrasten · M Marker · + / − / \ Zoom · ⌘D Überblendung · ⇧⌘D Ton-Blende · ⌘Z / ⇧⌘Z · ⌘M Export · ⌘/ Übersicht · Leertaste Abspielen/Stopp. Keine Kürzel, während ein Textfeld Fokus hat.
- Medienbibliothek: Import per Dialog und Drag & Drop, Proxy-Fortschritt, Warnungen (HDR → „Am Handy HDR-Video ausschalten“, Bildrate ≠ Sequenz), Einstellungsgröße je Clip (Pflicht-Auswahl, Spec §9.2).
- Timeline: Canvas-Zeichnung (Spuren V2, V1, A1–A4, Lineal mit Zeitcode, Abspielkopf, Marker, In/Out), Ziehen 1:1 mit Greif-Versatz, Einrasten, Trimm-Griffe, ⌥-Ziehen ignoriert Verknüpfung, Spur sperren/stumm, keine Animationen.
- Inspektor: Clip-Pegel (dB) + Blenden-Griffe, Farbregler nach `ColorParams` mit Vorher/Nachher, Titel-Editor, Sequenz-Einstellungen (Auflösung/fps aus Spec §7.1, Standard aus dem Auftrag).
- Pegelanzeige (Peak + Kurzzeit-Lautheit über WebAudio-Analyser) und integrierte LUFS-Anzeige (Hinweis „genaue Messung beim Export“).
- Werkstatt ohne aktiven Auftrag: leerer Zustand mit einem Satz und Button „Zu den Aufträgen“.

- [ ] **Step 1: Failing tests** – Unit: jede Taste in `KEYMAP` ist eindeutig, jeder Befehl existiert. E2E: Auftrag öffnen → Import (Mock liefert Fixture) → Einstellungsgröße setzen → `,` fügt in V1/A1 ein → Abspielkopf auf 2 s → `C`, Klick auf rechten Teil, `⇧⌫` → Sequenzlänge kürzer → `⌘Z` → Länge wieder alt → Neuladen: Projekt erhalten.
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren. **Step 4:** grün (inkl. axe für die Werkstatt).
- [ ] **Step 5: Commit** `feat: Werkstatt mit Medienbibliothek, Timeline, Werkzeugen und Inspektor`

### Task 13: Export, Abgabe, Chefbüro

**Files:** Create `src/features/werkstatt/ExportSheet.tsx`, `src/features/chefbuero/{ChefbueroView.tsx,Protokoll.tsx,SubmitSheet.tsx}`; Modify `src/state/appStore.ts` (`submit`, `correction`, `toggleShowreel`); Test `tests/unit/submit.test.ts`, `tests/e2e/abgabe.spec.ts`.

**Interfaces – Consumes:** `buildExport`, `buildCubeLut`, `renderTitle`, `Backend.writeFile/runFfmpeg/analyze`, `projectFacts`, `evaluate`, `account`, `phraseFor`.
**Interfaces – Produces:**
- `exportDeliverable(project, seq, deliverable, presetId): Promise<ExportRecord>` (`ExportRecord` aus Task 9) – schreibt LUTs/Titel-PNGs nach `Cache/`, Datei nach `Export/` mit `fileNameFor`, Versionsnummer zählt hoch.
- `submit(assignmentId, selfChecks): Promise<Evaluation>` – prüft Vollständigkeit (fehlende Abgabe → Hinweis, Abgabe trotzdem möglich mit −15), analysiert jede Video-Abgabe mit den Einstellungs-Segmenten aus `projectFacts`, bewertet, speichert, setzt Status `evaluated`. `correction(assignmentId, selfChecks)` nur innerhalb 24 h nach der ersten Bewertung und einmal.
- Abgabe-Blatt: Liste der Abgaben mit Status, Häkchen „Haken umgesetzt“ bei `verify: 'self'`, Primärbutton „Abgeben“; Fortschritt „Messe Ton …“, „Prüfe Belichtung …“.
- Protokoll in drei Stufen (Spec §10.2): Kurz gesagt (Gesamtpunkte, einmal hochzählend, Chef-Satz) · Verstehen (Kategorien mit Balken) · Für Profis (jeder Abzug: Soll, Ist, Punkte, „So behebst du es“ + Sprung ins Werkzeug-Panel).
- Chefbüro: Konto, Stufe mit Fortschritt zur nächsten, Verlauf der letzten 10 (Punkte je Kategorie), „Dein Dauerbrenner“ (häufigster Abzug), Showreel-Merkliste (nur Bewertungen ≥ 80).

- [ ] **Step 1: Failing tests** – Unit: Abgabe 2 Tage nach Frist → `late.points = −20` und Konto entsprechend; zweite Korrektur wird abgelehnt; Korrektur nach 25 h abgelehnt. E2E (MockBackend mit Fixture-Messwerten „zu laut“): schneiden → ⌘M → Preset „Social 16:9“ → Export fertig → Abgeben → Protokoll zeigt Abzug „Lautheit“ mit Soll „−14 LUFS ±1“ und Ist „−9,0 LUFS“ → Chefbüro zeigt Konto und Verlauf → „Nachbessern“ öffnet die Werkstatt.
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren. **Step 4:** grün.
- [ ] **Step 5: Commit** `feat: Export, Abgabe und Chefbüro mit Abnahmeprotokoll`

### Task 14: Einstellungen und Gemini-Begutachtung

**Files:** Create `src/features/einstellungen/{SettingsView.tsx,GeminiConsent.tsx}`, `src/domain/gemini/{prompt.ts,schema.ts,apply.ts}`; Modify `src/state/appStore.ts` (`submit` ruft Gemini, wenn eingeschaltet und zugestimmt); Test `tests/unit/gemini.test.ts`, `tests/e2e/einstellungen.spec.ts`.

**Interfaces – Produces:**
- `buildGeminiPrompt(a: Assignment, input: EvaluationInput, ruleDeductions: Deduction[]): string` (Rolle: Producer/Ausbilder, deutsch, sachlich-direkt; Briefing, Vorgaben, Messwerte; Auftrag: nur Gestaltung und Auftragstreue beurteilen, Technik ist erledigt).
- `GEMINI_SCHEMA` (JSON-Schema) und Zod-Gegenstück: `{ criteria: { key: 'bildaufbau'|'einstellungsgroessen'|'licht'|'farbe'|'briefing'|'inhalt'; verdict: string; reason: string; shift: number /*−10…10*/ }[]; summary: string }`.
- `parseGeminiResult(text: string): GeminiResult | null` (ungültig → `null`); `applyGemini(e: Evaluation, g: GeminiResult, rules): Evaluation` – Summe der Verschiebungen auf `±rules.gemini.maxShift` (10) geklemmt, nur auf `gestaltung`/`auftrag`, Kategorie bleibt in 0…max, Technik unverändert.
- Ablauf in `submit`: nur wenn `settings.gemini.enabled` und Schlüssel vorhanden → `GeminiConsent`-Blatt zeigt die 8–12 Standbilder (je Einstellung mittig, max 768 px) und Pflicht-Häkchen „Alle erkennbaren Personen haben zugestimmt“; ohne Häkchen oder bei Fehler/Limit/offline → nur Regeln + Vermerk im Protokoll.
- Einstellungen: Darstellung (automatisch/hell/dunkel), Urlaub (Liste + Hinzufügen mit `canAddVacation`-Meldungen), Gemini (Schalter, standardmäßig aus; Schlüssel-Feld → `backend.gemini.setKey`; Modellliste über `listModels`, Standard neuestes `flash`; Datenschutz-Hinweis aus Spec §9.5; Link „Gratis-Schlüssel holen“ → aistudio.google.com), Entwickler (Zeitsimulation ±Stunden, nur sichtbar mit `?dev=1`).

- [ ] **Step 1: Failing tests** – `parseGeminiResult('kein json') === null`; Verschiebungen +8 und +7 → angewendet +10; Technik bleibt; Gemini aus → `MockBackend.gemini.generate` nie aufgerufen; Fehler beim Aufruf → Bewertung vorhanden mit Vermerk „Gemini nicht erreichbar – nur Regeln“. E2E: Schalter an → Datenschutz-Hinweis sichtbar; Abgabe ohne Personen-Häkchen → Protokoll ohne Gemini-Teil.
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren. **Step 4:** grün.
- [ ] **Step 5: Commit** `feat: Einstellungen, Urlaub und optionale Gemini-Begutachtung`

### Task 15: Mac-Build, Installation, Abnahme

**Files:** Create `.github/workflows/build-mac.yml`, `scripts/fetch-ffmpeg-mac.sh`, `scripts/ffmpeg-mac.sha256`, `src-tauri/icons/*` (eigenes Symbol: Kachel mit Verlauf in Akzentfarbe + weißes Zeichen „Klappe/Wellenform“), `README.md`, `docs/ABNAHME-CHECKLISTE.md`; Modify `playwright.config.ts` (Projekt `webkit`).

- `fetch-ffmpeg-mac.sh`: lädt `https://evermeet.cx/ffmpeg/ffmpeg-9.1.zip` und `…/ffprobe-9.1.zip` (`curl -fL`), prüft gegen `scripts/ffmpeg-mac.sha256` (fehlt die Datei: Prüfsumme ausgeben und mit Fehler abbrechen – sie wird nach dem ersten CI-Lauf aus dem Log übernommen und committet), entpackt nach `src-tauri/binaries/ffmpeg-x86_64-apple-darwin` bzw. `ffprobe-x86_64-apple-darwin`, `chmod +x`.
- `build-mac.yml`: Auslöser `push` (Branches `main`, `claude/**`), Tags `v*`, `workflow_dispatch`; Runner `macos-latest`; `rustup target add x86_64-apple-darwin`; `npm ci`; Skript; `npx tauri build --target x86_64-apple-darwin --bundles dmg`; `actions/upload-artifact` (`Medienwerkstatt-<sha>.dmg`); bei Tag zusätzlich Release mit der `.dmg`. Zweiter Job: Playwright-E2E mit WebKit (Safari-Engine) gegen `MockBackend`.
- README (deutsch): Download aus „Actions“ bzw. „Releases“, Installation, erster Start per Rechtsklick → „Öffnen“ (bzw. Systemeinstellungen → Datenschutz & Sicherheit → „Trotzdem öffnen“), iPhone-Einstellungen (HDR-Video aus, 1080p 25 fps), Gemini-Schlüssel holen, Datenschutz.
- `ABNAHME-CHECKLISTE.md`: die 9 Abnahmekriterien aus Spec §12, je mit Prüfschritt auf dem MacBook Pro 2019, plus „Spulen im Vorschau-Monitor funktioniert (Asset-Protokoll)“.

- [ ] **Step 1:** Workflow pushen → erster Lauf scheitert erwartungsgemäß an fehlender Prüfsumme; Prüfsumme aus dem Log (`mcp__github__get_job_logs`) übernehmen, committen.
- [ ] **Step 2:** Zweiter Lauf: Job „build“ grün, Artefakt `.dmg` vorhanden (Größe > 60 MB wegen ffmpeg), Job „e2e-webkit“ grün; `test.yml` grün.
- [ ] **Step 3: Commit** `build: Mac-Build mit ffmpeg-Sidecar, README und Abnahme-Checkliste`

---

## Selbstprüfung (erledigt)

- Spec-Abdeckung: §7.1 → Tasks 9–12; §8 → 2, 3, 5; §9.1–9.4, 9.6 → 4, 7, 13; §9.5 → 8, 14; §10 → 1 + alle UI-Tasks; §11 → 1, 15; §12 Kriterien 1 → 15, 2 → 2/5, 3 → 6/11/12, 4 → 9/12, 5 → 10/13, 6 → 4/7/13, 7 → 2/4/13/14, 8 → 4/5, 9 → 14. Phasen 2–4 (Ton, Bild, Motion) bewusst nicht enthalten.
- Bewusste Abweichungen von der Spec: Filtergraph in TypeScript statt Rust (Task 10); Verlauf als Schnappschüsse mit struktureller Teilung statt Immer-Patches (Task 9) – gleiche Wirkung, einfacher.
