import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Feste Uhr wie in den anderen Werkstatt-Tests. Seeds: „e2e-film“ = Auftrag #1 mit Video, „e2e-research-1“ = nur Recherche.
const FIXED = '2026-11-23T12:00:00+01:00';
const AXE = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test.use({ timezoneId: 'Europe/Berlin', locale: 'de-DE' });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED));
});

const clipList = (page: Page) => page.getByRole('list', { name: 'Clips in der Timeline' }).getByRole('button');

async function settle(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
}
async function axe(page: Page) {
  await settle(page);
  const v = (await new AxeBuilder({ page }).withTags(AXE).analyze()).violations;
  return v.map((x) => `${x.id}: ${x.nodes.map((n) => n.html.slice(0, 100)).join(' | ')}`);
}

/** „Neues Projekt“ im Blatt anlegen (Enter legt an) und in der Werkstatt landen. */
async function createProject(page: Page, name: string, format?: string) {
  await page.getByRole('button', { name: 'Neues Projekt' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Neues Projekt' });
  await expect(sheet).toBeVisible();
  const field = sheet.getByLabel('Name');
  await expect(field).toBeFocused();
  if (format) await sheet.getByRole('radio', { name: format }).check();
  await field.fill(name);
  await field.press('Enter');
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

async function importAndInsert(page: Page) {
  const bin = page.getByRole('region', { name: 'Medienbibliothek' });
  await bin.getByRole('button', { name: 'Importieren' }).click();
  await bin.getByRole('button', { name: 'e2e-clip.webm', exact: true }).dblclick();
  await expect(page.getByRole('region', { name: 'Quelle-Monitor' })).toContainText('e2e-clip.webm');
  await page.keyboard.press(',');
  await expect(clipList(page)).toHaveCount(2);
}

test('Start ohne Projekt: Übersicht mit leerem Zustand → Neues Projekt → Werkstatt mit Timeline → Neuladen öffnet es wieder', async ({ page }) => {
  await page.goto('/?seed=e2e-research-1');
  await expect(page).toHaveURL(/\/projekte$/);
  // Die Übersicht gehört zur Werkstatt: dunkel, Seitenleiste markiert „Werkstatt“.
  await expect(page.locator('.werkstatt')).toHaveCSS('background-color', 'rgb(28, 28, 30)');
  await expect(page.getByRole('link', { name: 'Werkstatt' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 2, name: 'Noch keine Projekte' })).toBeVisible();
  // Nur ein Recherche-Auftrag: Er steht nicht in der Liste (kein Video), die Werkstatt ist trotzdem nutzbar.
  await expect(page.getByRole('main').getByText('Auftrag #1')).toHaveCount(0);

  await createProject(page, 'Mein Film');
  await expect(page.getByTestId('seq-format')).toHaveText('1920×1080 · 25 fps');
  await expect(page.getByTestId('timeline-canvas')).toBeVisible();
  await importAndInsert(page);

  // Neustart der App: das zuletzt geöffnete Projekt geht wieder auf (kein Auftrag öffnet sich von selbst).
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Mein Film' })).toBeVisible();
  await expect(clipList(page)).toHaveCount(2);

  // „Projekte“ im Werkstatt-Kopf führt zurück zur Übersicht; dort steht das Projekt mit Format und „zuletzt geöffnet“.
  await page.getByRole('button', { name: 'Projekte' }).click();
  await expect(page).toHaveURL(/\/projekte$/);
  const row = page.getByRole('button', { name: /^Mein Film/ });
  await expect(row).toContainText('16:9 · 1920×1080 · 25p');
  await expect(row).toContainText('zuletzt geöffnet');
});

test('Neues Projekt: Name ist Pflicht, Esc bricht ab, Format wählbar (9:16)', async ({ page }) => {
  await page.goto('/projekte?seed=e2e-research-1');
  await page.getByRole('button', { name: 'Neues Projekt' }).click();
  const sheet = page.getByRole('dialog', { name: 'Neues Projekt' });
  await expect(sheet.getByRole('radio', { name: '16:9 · 1920×1080 · 25p' })).toBeChecked();
  await sheet.getByLabel('Name').fill('   ');
  await sheet.getByLabel('Name').press('Enter');
  await expect(sheet.getByRole('alert')).toHaveText('Gib deinem Projekt einen Namen.');
  await expect(sheet.getByLabel('Name')).toHaveAttribute('aria-invalid', 'true');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/\/projekte(\?|$)/);

  await createProject(page, 'Hochkant', '9:16 · 1080×1920 · 30p');
  await expect(page.getByTestId('seq-format')).toHaveText('1080×1920 · 30 fps');
});

test('Liste: freie Projekte und Video-Aufträge, zuletzt geöffnetes oben; Umbenennen; Auftrag öffnet seine Werkstatt', async ({ page }) => {
  await page.goto('/projekte?seed=e2e-film');
  const list = page.getByRole('list').filter({ has: page.getByRole('button', { name: /Auftrag #1/ }) });
  await expect(list.getByRole('button', { name: /Auftrag #1/ })).toBeVisible();
  await createProject(page, 'Skizze');
  await page.getByRole('button', { name: 'Projekte' }).click();

  const rows = page.locator('.proj-open');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Skizze');
  await expect(rows.nth(1)).toContainText('Auftrag #1');
  await expect(rows.nth(1)).toContainText('Frist');

  // Umbenennen über das kleine Blatt (Enter übernimmt)
  await page.getByRole('button', { name: '„Skizze“ umbenennen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Projekt umbenennen' });
  await sheet.getByLabel('Name').fill('Skizze 2');
  await sheet.getByLabel('Name').press('Enter');
  await expect(sheet).toHaveCount(0);
  await expect(rows.first()).toContainText('Skizze 2');

  // Tastatur: Zeilen sind echte Knöpfe
  await rows.nth(1).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Auftrag #1:');
  await page.getByRole('button', { name: 'Projekte' }).click();
  await expect(rows.first()).toContainText('Auftrag #1');
  await rows.nth(1).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Skizze 2' })).toBeVisible();
});

test('Export im freien Projekt: Vorlage nach Format, Datei <Name>_v01, Im Finder zeigen, kein Abgeben', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/projekte?seed=e2e-research-1');
  await createProject(page, 'Mein Film');
  await importAndInsert(page);
  await page.keyboard.press('Meta+m');
  const sheet = page.getByRole('dialog', { name: 'Exportieren' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel('Vorlage (Preset)')).toHaveValue('social169');
  await expect(sheet.getByText('Noch nicht exportiert.')).toBeVisible();
  expect(await axe(page), 'Export-Blatt frei').toEqual([]);
  await sheet.getByRole('button', { name: 'Exportieren', exact: true }).click();
  await expect(sheet.getByText('Export fertig: Mein-Film_v01_1080p25.mp4')).toBeVisible();
  await expect(sheet.getByText('Zuletzt: Version 1 · Mein-Film_v01_1080p25.mp4')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Im Finder zeigen' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /abgeben|nachbessern/i })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Erneut exportieren' }).click();
  await expect(sheet.getByText('Export fertig: Mein-Film_v02_1080p25.mp4')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});

test('Projektübersicht mit Auftrag und Blatt „Neues Projekt“ ohne axe-Verstöße (hell und dunkel)', async ({ page }) => {
  await page.goto('/projekte?seed=e2e-film');
  await expect(page.getByRole('heading', { level: 1, name: 'Projekte' })).toBeVisible();
  await expect(page.locator('.proj-open')).toHaveCount(1);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect(await axe(page), `Übersicht mit Auftrag (${scheme})`).toEqual([]);
    await page.getByRole('button', { name: 'Neues Projekt' }).click();
    await page.getByRole('dialog', { name: 'Neues Projekt' }).getByLabel('Name').press('Enter');
    await expect(page.getByRole('dialog', { name: 'Neues Projekt' }).getByRole('alert')).toBeVisible();
    expect(await axe(page), `Blatt mit Fehler (${scheme})`).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});

test('Leere Projektübersicht ohne axe-Verstöße (hell und dunkel)', async ({ page }) => {
  await page.goto('/projekte?seed=e2e-research-1');
  await expect(page.getByRole('heading', { level: 2, name: 'Noch keine Projekte' })).toBeVisible();
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect(await axe(page), `leere Übersicht (${scheme})`).toEqual([]);
  }
});
