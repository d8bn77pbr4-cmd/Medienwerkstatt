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


test('Freies Projekt → Export → „Chef ansehen lassen“ → Übungsprotokoll; Punkte, Rang und Showreel bleiben', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/projekte?seed=e2e-film');
  await createProject(page, 'Mein Film');
  const topbar = page.locator('.topbar');
  await expect(topbar).toContainText('0 Punkte');
  // Vor dem Export gibt es nichts zu zeigen.
  await expect(page.getByRole('button', { name: 'Chef ansehen lassen (ohne Punkte)' })).toHaveCount(0);

  await importAndInsert(page);
  await page.keyboard.press('Meta+m');
  const sheet = page.getByRole('dialog', { name: 'Exportieren' });
  await expect(sheet.getByRole('button', { name: 'Chef ansehen lassen (ohne Punkte)' })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Exportieren', exact: true }).click();
  await expect(sheet.getByText('Export fertig: Mein-Film_v01_1080p25.mp4')).toBeVisible();
  expect(await axe(page), 'Export-Blatt mit Chef-Knopf').toEqual([]);
  await sheet.getByRole('button', { name: 'Chef ansehen lassen (ohne Punkte)' }).click();

  await expect(page).toHaveURL(/\/chefbuero\/practice/);
  await expect(page.getByTestId('uebung-badge')).toHaveText('Übung – zählt nicht fürs Konto');
  await expect(page.getByRole('heading', { level: 1, name: 'Mein Film' })).toBeVisible();
  await expect(page.getByText(/von 100 Punkten – Übung, zählt nicht/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nachbessern' })).toHaveCount(0);
  await expect(page.getByText(/Frist|Vorgaben/)).toHaveCount(0);
  await expect(topbar).toContainText('0 Punkte');
  expect(await axe(page), 'Übungsprotokoll').toEqual([]);

  // Chefbüro: eigener Abschnitt „Übungen“, das Konto bleibt bei 0.
  await page.getByRole('link', { name: 'Zurück zum Chefbüro' }).click();
  const uebungen = page.getByRole('region', { name: 'Übungen' });
  await expect(uebungen).toContainText('Mein Film');
  await expect(uebungen).toContainText(/\d+\/100 – Übung, zählt nicht/);
  await expect(page.getByTestId('konto-punkte')).toHaveCount(0);
  await expect(topbar).toContainText('0 Punkte');
  expect(await axe(page), 'Chefbüro mit Übungen').toEqual([]);

  // Zurück in die Werkstatt: Der Kopf bietet die Prüfung bei aktuellem Export erneut an.
  await page.getByRole('link', { name: 'Werkstatt' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mein Film' })).toBeVisible();
  await page.locator('.ws-bar').getByRole('button', { name: 'Chef ansehen lassen (ohne Punkte)' }).click();
  await expect(page.getByTestId('uebung-badge')).toBeVisible();
  await page.getByRole('link', { name: 'Zurück zum Chefbüro' }).click();
  await expect(page.getByRole('region', { name: 'Übungen' }).getByRole('listitem')).toHaveCount(2);
  await expect(topbar).toContainText('0 Punkte');
});
