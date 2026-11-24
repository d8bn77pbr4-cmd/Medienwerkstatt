import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_PX_PER_SEC, ROW_H, RULER_H, frameToX, viewOf } from '../../src/features/werkstatt/timelineCanvas';

// Feste Uhr wie in auftraege.spec.ts: Auftrag #1 (Seed e2e-film) ist ein Video-Auftrag, 1920×1080 bei 25 fps.
const FIXED = '2026-11-23T12:00:00+01:00';
const FPS = 25;
const VIEW = viewOf(DEFAULT_PX_PER_SEC, FPS, 0);

test.use({ timezoneId: 'Europe/Berlin', locale: 'de-DE' });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED));
});

const clipList = (page: Page) => page.getByRole('list', { name: 'Clips in der Timeline' }).getByRole('button');
const seqLength = (page: Page) => page.getByTestId('seq-length');
const programTimecode = (page: Page) => page.getByRole('region', { name: 'Programm-Monitor' }).getByRole('timer');

async function openFromAuftraege(page: Page, seed = 'e2e-film') {
  await page.goto(`/auftraege/A01?seed=${seed}`);
  await page.getByRole('button', { name: 'In der Werkstatt öffnen' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Auftrag #1');
}

async function importAndInsert(page: Page) {
  const bin = page.getByRole('region', { name: 'Medienbibliothek' });
  await bin.getByRole('button', { name: 'Importieren' }).click();
  await expect(bin.getByRole('button', { name: 'e2e-clip.webm', exact: true })).toBeVisible();
  await expect(bin.getByRole('button', { name: 'e2e-clip2.webm', exact: true })).toBeVisible();
  await bin.getByRole('button', { name: 'e2e-clip.webm', exact: true }).dblclick();
  await expect(page.getByRole('region', { name: 'Quelle-Monitor' })).toContainText('e2e-clip.webm');
  await page.keyboard.press(',');
  await expect(clipList(page)).toHaveCount(2);
  await expect(seqLength(page)).toHaveText('00:00:05:00');
}

/** Klick in die Timeline-Zeichenfläche bei Bild `frame` (Lineal oder Spurzeile). */
async function clickTimeline(page: Page, frame: number, y: number) {
  const box = await page.getByTestId('timeline-canvas').boundingBox();
  if (!box) throw new Error('keine Timeline');
  await page.mouse.click(box.x + frameToX(frame, VIEW), box.y + y);
}

test('Auftrag öffnen → Import → Einstellungsgröße → Einfügen → Rasierklinge → Ripple-Löschen → Rückgängig → Neuladen', async ({ page }) => {
  await openFromAuftraege(page);
  await expect(page.getByTestId('seq-format')).toHaveText('1920×1080 · 25 fps');

  const bin = page.getByRole('region', { name: 'Medienbibliothek' });
  await bin.getByRole('button', { name: 'Importieren' }).click();
  const item = bin.getByRole('listitem').filter({ hasText: 'e2e-clip.webm' });
  await expect(item).toContainText('1280×720 · 25 fps');
  await expect(item).toContainText('Einstellungsgröße fehlt');
  await bin.getByLabel('Einstellungsgröße für e2e-clip.webm').selectOption('halbnah');
  await expect(item).not.toContainText('Einstellungsgröße fehlt');

  await bin.getByRole('button', { name: 'e2e-clip.webm', exact: true }).dblclick();
  await expect(page.getByRole('region', { name: 'Quelle-Monitor' })).toContainText('e2e-clip.webm');
  await page.keyboard.press(',');
  await expect(clipList(page)).toHaveCount(2);
  // explizite Listen-Rolle (WebKit verwirft sie bei list-style: none)
  await expect(page.getByRole('list', { name: 'Clips in der Timeline' })).toHaveAttribute('role', 'list');
  await expect(bin.getByRole('list')).toHaveAttribute('role', 'list');
  await expect(page.getByRole('button', { name: 'V1 · e2e-clip.webm · 00:00:00:00 bis 00:00:05:00' })).toBeAttached();
  await expect(page.getByRole('button', { name: 'A1 · e2e-clip.webm · 00:00:00:00 bis 00:00:05:00' })).toBeAttached();
  await expect(seqLength(page)).toHaveText('00:00:05:00');

  // Abspielkopf per Klick ins Lineal auf 2 s
  await clickTimeline(page, 2 * FPS, RULER_H / 2);
  await expect(programTimecode(page)).toHaveText('00:00:02:00');

  // C = Rasierklinge, Klick auf V1 am Abspielkopf teilt Bild und Ton
  await page.keyboard.press('c');
  await expect(page.getByRole('button', { name: /^Rasierklinge/ })).toHaveAttribute('aria-pressed', 'true');
  await clickTimeline(page, 2 * FPS, RULER_H + ROW_H.video + ROW_H.video / 2);
  await expect(clipList(page)).toHaveCount(4);

  const right = page.getByRole('button', { name: 'V1 · e2e-clip.webm · 00:00:02:00 bis 00:00:05:00' });
  await right.focus();
  await page.keyboard.press('Enter');
  await expect(right).toHaveAttribute('aria-pressed', 'true');
  // verknüpfter Ton ist mit ausgewählt
  await expect(page.getByRole('button', { name: 'A1 · e2e-clip.webm · 00:00:02:00 bis 00:00:05:00' })).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('Shift+Backspace');
  await expect(seqLength(page)).toHaveText('00:00:02:00');
  await expect(clipList(page)).toHaveCount(2);

  await page.keyboard.press('Meta+z');
  await expect(seqLength(page)).toHaveText('00:00:05:00');
  await expect(clipList(page)).toHaveCount(4);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Auftrag #1');
  await expect(seqLength(page)).toHaveText('00:00:05:00');
  await expect(clipList(page)).toHaveCount(4);
  await expect(page.getByLabel('Einstellungsgröße für e2e-clip.webm')).toHaveValue('halbnah');
});

const Y_V1 = RULER_H + ROW_H.video * 1.5;
const Y_A1 = RULER_H + 2 * ROW_H.video + ROW_H.audio / 2;

/** Zug in der Timeline von Bild `from` nach Bild `to` auf Höhe `y` (optional mit ⌥). */
async function dragTimeline(page: Page, from: number, to: number, y: number, alt = false) {
  const box = await page.getByTestId('timeline-canvas').boundingBox();
  if (!box) throw new Error('keine Timeline');
  await page.mouse.move(box.x + frameToX(from, VIEW), box.y + y);
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.mouse.move(box.x + frameToX(to, VIEW), box.y + y, { steps: 6 });
  await page.mouse.up();
  if (alt) await page.keyboard.up('Alt');
}

test('Timeline: Ziehen 1:1 mit Greif-Versatz, Trimmen, ⌥-Rollen für einen L-Cut', async ({ page }) => {
  await openFromAuftraege(page);
  const bin = page.getByRole('region', { name: 'Medienbibliothek' });
  await bin.getByRole('button', { name: 'Importieren' }).click();
  // Clip 1: nur 0–2 s aus der Quelle (I/O), dann Clip 2 ganz dahinter
  await bin.getByRole('button', { name: 'e2e-clip.webm', exact: true }).dblclick();
  await page.keyboard.press('i');
  for (let i = 0; i < 10; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('o');
  await expect(page.getByRole('region', { name: 'Quelle-Monitor' }).getByTestId('io-marks')).toContainText('00:00:02:00');
  await page.keyboard.press(',');
  await bin.getByRole('button', { name: 'e2e-clip2.webm', exact: true }).dblclick();
  await page.keyboard.press(',');
  await expect(seqLength(page)).toHaveText('00:00:07:00');

  // ⌥ + Rollen am Tonschnitt: nur A1 rollt 10 Bilder später → L-Cut
  await page.keyboard.press('n');
  await dragTimeline(page, 50, 60, Y_A1, true);
  await expect(page.getByRole('button', { name: 'A1 · e2e-clip.webm · 00:00:00:00 bis 00:00:02:10' })).toBeAttached();
  await expect(page.getByRole('button', { name: 'V1 · e2e-clip.webm · 00:00:00:00 bis 00:00:02:00' })).toBeAttached();
  await page.keyboard.press('Meta+z');
  await expect(page.getByRole('button', { name: 'A1 · e2e-clip.webm · 00:00:00:00 bis 00:00:02:00' })).toBeAttached();

  // Auswahl: Clip 2 am Körper greifen und 1 s nach rechts ziehen; der Ton folgt (verknüpft)
  await page.keyboard.press('v');
  await dragTimeline(page, 100, 125, Y_V1);
  await expect(page.getByRole('button', { name: 'V1 · e2e-clip2.webm · 00:00:03:00 bis 00:00:08:00' })).toBeAttached();
  await expect(page.getByRole('button', { name: 'A1 · e2e-clip2.webm · 00:00:03:00 bis 00:00:08:00' })).toBeAttached();
  await expect(seqLength(page)).toHaveText('00:00:08:00');

  // Ende von Clip 2 um 1 s kürzen (Trimm-Griff), Ton folgt
  await dragTimeline(page, 199, 174, Y_V1);
  await expect(page.getByRole('button', { name: 'V1 · e2e-clip2.webm · 00:00:03:00 bis 00:00:07:00' })).toBeAttached();
  await expect(page.getByRole('button', { name: 'A1 · e2e-clip2.webm · 00:00:03:00 bis 00:00:07:00' })).toBeAttached();

  // ein Verlaufsschritt je Zug
  await page.keyboard.press('Meta+z');
  await expect(seqLength(page)).toHaveText('00:00:08:00');
  await page.keyboard.press('Meta+Shift+z');
  await expect(seqLength(page)).toHaveText('00:00:07:00');
});

test('Werkzeugleiste: aktives Werkzeug in Akzentfarbe, Tooltip mit Adobe-Namen, ohne Animation', async ({ page }) => {
  await openFromAuftraege(page);
  const razor = page.getByRole('button', { name: /^Rasierklinge/ });
  await expect(razor).toHaveAttribute('title', /So heißt das bei Adobe: /);
  await page.keyboard.press('c');
  await expect(razor).toHaveAttribute('aria-pressed', 'true');
  await expect(razor).toHaveCSS('background-color', 'rgb(122, 162, 255)');
  await expect(razor).toHaveCSS('transition-duration', '0s');
  await page.keyboard.press('v');
  await expect(page.getByRole('button', { name: /^Auswahl/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(razor).toHaveAttribute('aria-pressed', 'false');
});

test('Kürzel greifen nicht, solange ein Eingabefeld Fokus hat', async ({ page }) => {
  await openFromAuftraege(page);
  await importAndInsert(page);
  await page.getByRole('tab', { name: 'Titel' }).click();
  await page.getByRole('button', { name: 'Bauchbinde hinzufügen' }).click();
  await expect(clipList(page)).toHaveCount(3);
  const line1 = page.getByLabel('Zeile 1');
  await line1.fill('Anna');
  await line1.press('c');
  await expect(page.getByRole('button', { name: /^Rasierklinge/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(line1).toHaveValue('Annac');

  // Schriftfamilie (Spec §7.1) ändert den Titel-Clip – ein Verlaufsschritt
  const font = page.getByLabel('Schrift', { exact: true });
  await expect(font).toHaveValue('Helvetica Neue');
  await font.selectOption('Georgia');
  await expect(font).toHaveValue('Georgia');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Meta+z');
  await expect(font).toHaveValue('Helvetica Neue');

  // Regler (range) sperren keine Kürzel; Pfeile bleiben beim Regler
  const posX = page.getByLabel('Position waagerecht');
  const before = await posX.inputValue();
  await posX.focus();
  await page.keyboard.press('ArrowRight');
  await expect(posX).not.toHaveValue(before);
  await expect(programTimecode(page)).toHaveText('00:00:05:00');
  await page.keyboard.press('c');
  await expect(page.getByRole('button', { name: /^Rasierklinge/ })).toHaveAttribute('aria-pressed', 'true');
});

test('Überblendung: per Klick oder Liste wählen, Dauer im Inspektor (auf Überhang gekürzt), entfernen', async ({ page }) => {
  await openFromAuftraege(page);
  const bin = page.getByRole('region', { name: 'Medienbibliothek' });
  await bin.getByRole('button', { name: 'Importieren' }).click();
  // Clip 1: 0–2 s (3 s Überhang hinten), Clip 2 ab 1 s (25 Bilder Überhang vorn)
  await bin.getByRole('button', { name: 'e2e-clip.webm', exact: true }).dblclick();
  await page.keyboard.press('i');
  for (let i = 0; i < 10; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('o');
  await page.keyboard.press(',');
  await bin.getByRole('button', { name: 'e2e-clip2.webm', exact: true }).dblclick();
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('i');
  await page.keyboard.press(',');
  await expect(seqLength(page)).toHaveText('00:00:06:00');

  await page.keyboard.press('Meta+d');
  const entry = page.getByRole('button', { name: /^Überblendung V1 · \d+ Bilder$/ });
  await expect(entry).toHaveAccessibleName('Überblendung V1 · 25 Bilder');

  // Klick auf die Überblendung in der Zeichenfläche (neben dem Schnitt) wählt sie
  await clickTimeline(page, 42, Y_V1);
  await expect(entry).toHaveAttribute('aria-pressed', 'true');
  const dur = page.getByLabel('Dauer (Bilder)');
  await expect(dur).toHaveValue('25');

  // zu lang → auf den verfügbaren Überhang (2 × 25 Bilder) gekürzt
  await dur.fill('1000');
  await expect(entry).toHaveAccessibleName('Überblendung V1 · 50 Bilder');
  await expect(dur).toHaveValue('50');
  await dur.fill('12');
  await expect(entry).toHaveAccessibleName('Überblendung V1 · 12 Bilder');

  await page.getByRole('button', { name: 'Überblendung entfernen' }).click();
  await expect(entry).toHaveCount(0);
  await page.keyboard.press('Meta+z');
  await expect(entry).toHaveAccessibleName('Überblendung V1 · 12 Bilder');
});

test('Tastenkürzel-Übersicht (⌘/): Tabelle, Fokus bleibt im Dialog, Esc schließt', async ({ page }) => {
  await openFromAuftraege(page);
  await page.keyboard.press('Meta+/');
  const dialog = page.getByRole('dialog', { name: 'Tastenkürzel' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('columnheader')).toHaveText(['Taste', 'Funktion', 'Bei Adobe']);
  await expect(dialog.getByRole('row').filter({ hasText: 'Rasierklinge' })).toContainText('C');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('Reiner Recherche-Auftrag: keine Sackgasse – die Werkstatt zeigt die Projektübersicht', async ({ page }) => {
  await page.goto('/?seed=e2e-research-1');
  await expect(page).toHaveURL(/\/projekte$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Projekte' })).toBeVisible();
  await expect(page.getByText('Dieser Auftrag braucht keine Werkstatt.', { exact: false })).toHaveCount(0);
});

test('Recherche-Auftrag ausdrücklich geöffnet (z. B. „Nachbessern“): Weg zum Formular und zur Projektübersicht', async ({ page }) => {
  await page.goto('/auftraege?seed=e2e-research-1');
  await expect(page.getByRole('heading', { level: 1, name: 'Aufträge' })).toBeVisible();
  // Wie navigate('/', { state: { assignmentId } }) aus dem Chefbüro (React Router liest den Verlaufszustand bei popstate).
  await page.evaluate(() => {
    window.history.pushState({ usr: { assignmentId: 'A01' }, key: 'e2e', idx: 1 }, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });
  await expect(page.getByText('Dieser Auftrag braucht keine Werkstatt.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Zur Projektübersicht' }).click();
  await expect(page).toHaveURL(/\/projekte$/);
  await page.goBack();
  await page.getByRole('button', { name: 'Recherche bearbeiten' }).click();
  await expect(page).toHaveURL(/\/auftraege\/A01\/recherche\//);
});

test('Werkstatt: dunkel, Grundschrift 13 px, nichts unter 12 px', async ({ page }) => {
  await openFromAuftraege(page);
  await importAndInsert(page);
  await expect(page.locator('.werkstatt')).toHaveCSS('background-color', 'rgb(28, 28, 30)');
  await expect(page.locator('.werkstatt')).toHaveCSS('font-size', '13px');
  await expect(page.locator('.topbar')).toHaveCSS('color', 'rgb(209, 209, 214)');
  const small = await page.locator('.werkstatt').evaluate((root) => {
    const out: string[] = [];
    root.querySelectorAll('*').forEach((el) => {
      if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12) out.push(el.outerHTML.slice(0, 80));
    });
    return out;
  });
  expect(small).toEqual([]);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`keine axe-Verstöße in der Werkstatt (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openFromAuftraege(page);
    await importAndInsert(page);
    await page.getByRole('button', { name: 'V1 · e2e-clip.webm · 00:00:00:00 bis 00:00:05:00' }).focus();
    await page.keyboard.press('Enter');
    for (const tab of ['Clip', 'Farbe', 'Sequenz']) {
      await page.getByRole('tab', { name: tab }).click();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations, `${tab} (${scheme})`).toEqual([]);
    }
  });
}
