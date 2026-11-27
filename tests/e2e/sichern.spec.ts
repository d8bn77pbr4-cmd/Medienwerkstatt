import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Feste Uhr wie in den anderen Werkstatt-Tests; Berlin = UTC+1, also 12:00 Uhr.
const FIXED = '2026-11-23T12:00:00+01:00';
const AXE = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test.use({ timezoneId: 'Europe/Berlin', locale: 'de-DE' });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED));
});

const clipList = (page: Page) => page.getByRole('list', { name: 'Clips in der Timeline' }).getByRole('button');
const status = (page: Page) => page.getByTestId('save-status');

async function settle(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
}
async function axe(page: Page) {
  await settle(page);
  const v = (await new AxeBuilder({ page }).withTags(AXE).analyze()).violations;
  return v.map((x) => `${x.id}: ${x.nodes.map((n) => n.html.slice(0, 100)).join(' | ')}`);
}

async function createProject(page: Page, name: string) {
  await page.getByRole('button', { name: 'Neues Projekt' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Neues Projekt' });
  const field = sheet.getByLabel('Name');
  await field.fill(name);
  await field.press('Enter');
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

/** Importiert die Testclips und fügt den ersten am Abspielkopf ein (Bild + Ton = zwei Clips). */
async function importAndInsert(page: Page) {
  const bin = page.getByRole('region', { name: 'Medienbibliothek' });
  await bin.getByRole('button', { name: 'Importieren' }).click();
  await bin.getByRole('button', { name: 'e2e-clip.webm', exact: true }).dblclick();
  await expect(page.getByRole('region', { name: 'Quelle-Monitor' })).toContainText('e2e-clip.webm');
  await page.keyboard.press(',');
  await expect(clipList(page)).toHaveCount(2);
}

test('Ändern → ⌘S zeigt „Gespeichert“ → weiter schneiden → „Ältere Version …“ → Wiederherstellen bringt die Timeline zurück', async ({ page }) => {
  await page.goto('/?seed=e2e-research-1');
  await createProject(page, 'Sicherungstest');
  await importAndInsert(page);

  // ⌘S: sofort gespeichert, die Anzeige nennt die Uhrzeit.
  await page.keyboard.press('Meta+s');
  await expect(status(page)).toHaveText('Gespeichert · 12:00');
  await expect(status(page)).toHaveAttribute('aria-live', 'polite');

  // Weiter schneiden: ein zweiter Block.
  await page.keyboard.press(',');
  await expect(clipList(page)).toHaveCount(4);
  await expect(status(page)).toHaveText('Gespeichert · 12:00');

  // Liste der Versionen: genau die von ⌘S, mit Zeit und Größe.
  const opener = page.getByRole('button', { name: 'Ältere Version …' });
  await opener.click();
  const sheet = page.getByRole('dialog', { name: 'Ältere Version' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Alle 10 Minuten legt die App eine Sicherungsversion an (die letzten 20 bleiben)')).toBeVisible();
  const list = sheet.getByRole('list', { name: 'Sicherungsversionen, neueste zuerst' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list.getByRole('listitem').first()).toContainText(/23\.11\.2026, 12:00:\d{2}/);
  await expect(list.getByRole('listitem').first()).toContainText(/\d+ KB/);
  expect(await axe(page)).toEqual([]);

  // Wiederherstellen fragt nach.
  await list.getByRole('button', { name: /wiederherstellen$/ }).click();
  await expect(sheet.getByText('Der aktuelle Stand wird vorher selbst als Version gesichert.')).toBeVisible();
  const confirm = sheet.getByRole('button', { name: 'Wiederherstellen', exact: true });
  await expect(confirm).toBeFocused();
  expect(await axe(page)).toEqual([]);
  // „Abbrechen“ führt zurück in die Liste, der Fokus bleibt am Eintrag.
  await sheet.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(list.getByRole('button', { name: /wiederherstellen$/ })).toBeFocused();
  await list.getByRole('button', { name: /wiederherstellen$/ }).click();
  await sheet.getByRole('button', { name: 'Wiederherstellen', exact: true }).click();

  await expect(sheet).toHaveCount(0);
  await expect(clipList(page)).toHaveCount(2);
  await expect(page.getByTestId('timeline-canvas')).toBeVisible();
  await expect(opener).toBeFocused();

  // Rückgängig kennt nur noch den Stand nach dem Zurückholen.
  await page.keyboard.press('Meta+z');
  await expect(clipList(page)).toHaveCount(2);

  // Der Stand davor ist selbst eine Version: Das Zurückholen lässt sich umkehren.
  await opener.click();
  await expect(list.getByRole('listitem')).toHaveCount(1); // gleiche Sekunde: überschreibt die ⌘S-Version mit dem Stand davor
  await list.getByRole('button', { name: /wiederherstellen$/ }).click();
  await sheet.getByRole('button', { name: 'Wiederherstellen', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(clipList(page)).toHaveCount(4);

  // Neuladen: der wiederhergestellte Stand ist gespeichert.
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Sicherungstest' })).toBeVisible();
  await expect(clipList(page)).toHaveCount(4);
});

test('Ohne Version: leerer Zustand mit Hinweis; Esc schließt und der Fokus kehrt zurück', async ({ page }) => {
  await page.goto('/?seed=e2e-research-1');
  await createProject(page, 'Leer');
  const opener = page.getByRole('button', { name: 'Ältere Version …' });
  await opener.click();
  const sheet = page.getByRole('dialog', { name: 'Ältere Version' });
  await expect(sheet.getByTestId('ver-empty')).toContainText('Noch keine Sicherungsversion');
  await expect(sheet.getByRole('button', { name: 'Ältere Version schließen' })).toBeFocused();
  expect(await axe(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('Tastenkürzel-Übersicht nennt ⌘S „Sichern“; ⌘S in der Werkstatt wird abgefangen', async ({ page }) => {
  await page.goto('/?seed=e2e-research-1');
  await createProject(page, 'Kürzel');
  await page.keyboard.press('Meta+/');
  const dialog = page.getByRole('dialog', { name: 'Tastenkürzel' });
  await expect(dialog.getByRole('row', { name: /⌘S.*Sichern/ })).toBeVisible();
  await page.keyboard.press('Escape');
  const prevented = await page.evaluate(() => {
    const e = new KeyboardEvent('keydown', { key: 's', metaKey: true, cancelable: true, bubbles: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(prevented).toBe(true);
});

test('Einstellungen „Sichern“: Standard 10 min, Umstellen wirkt sofort und bleibt nach dem Neuladen; ⌘S auch dort abgefangen', async ({ page }) => {
  await page.goto('/einstellungen?seed=e2e-research-1');
  const section = page.getByRole('region', { name: 'Sichern' });
  const group = section.getByRole('radiogroup', { name: 'Sicherungsversion alle' });
  await expect(group.getByRole('radio', { name: '10 min' })).toBeChecked();
  await expect(group.getByRole('radio')).toHaveCount(4);
  await expect(section).toContainText('Alle 10 Minuten legt die App eine Sicherungsversion an (die letzten 20 bleiben).');
  expect(await axe(page)).toEqual([]);

  await group.getByRole('radio', { name: '5 min', exact: true }).check();
  await expect(group.getByRole('radio', { name: '5 min', exact: true })).toBeChecked();
  await expect(section).toContainText('Alle 5 Minuten legt die App');

  const prevented = await page.evaluate(() => {
    const e = new KeyboardEvent('keydown', { key: 's', metaKey: true, cancelable: true, bubbles: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(prevented).toBe(true);

  await page.reload();
  await expect(page.getByRole('radio', { name: '5 min', exact: true })).toBeChecked();
});
