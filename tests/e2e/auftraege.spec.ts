import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Feste Uhr: Mo 23.11.2026, 12:00 Berlin. Auftrag #1 → Frist Do 26.11., 18:00 (3 T. 6 Std. später).
const FIXED = '2026-11-23T12:00:00+01:00';
const VIDEO = 'e2e-film'; // Auftrag #1 ist ein Video-Auftrag
const RESEARCH = 'e2e-research-1'; // Auftrag #1 ist ein Recherche-Auftrag (Technik-Kaufberatung)

test.use({ timezoneId: 'Europe/Berlin', locale: 'de-DE' });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED));
});

const card = (page: Page) => page.locator('main').getByRole('link', { name: /Auftrag #1/ });

test('Aufträge zeigt Auftrag #1 mit Countdown; Checkliste bleibt nach Neuladen', async ({ page }) => {
  await page.goto(`/auftraege?seed=${VIDEO}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Aufträge' })).toBeVisible();
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toContainText('noch 3 T. 6 Std.');
  await expect(card(page).locator('[data-status="offen"]')).toContainText('offen');

  await card(page).click();
  await expect(page).toHaveURL(/\/auftraege\/A01$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Briefing' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Vorgaben' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Drehhinweise' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Abgaben' })).toBeVisible();

  const fps = page.getByRole('checkbox', { name: /Bildrate/ });
  await expect(fps).not.toBeChecked();
  await fps.check();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: /Bildrate/ })).toBeChecked();

  // TopBar: aktiver Auftrag mit Countdown und Punktekonto
  await expect(page.locator('.topbar')).toContainText('Auftrag #1');
  await expect(page.locator('.topbar')).toContainText('noch 3 T. 6 Std.');
  await expect(page.locator('.topbar')).toContainText('0 Punkte');
});

test('Video-Auftrag: „In der Werkstatt öffnen“ führt in die Werkstatt', async ({ page }) => {
  await page.goto(`/auftraege/A01?seed=${VIDEO}`);
  await page.getByRole('button', { name: 'In der Werkstatt öffnen' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.werkstatt')).toContainText('Auftrag #1:');
});

test('Recherche-Auftrag: Formular ausfüllen, Neuladen, Eingaben noch da', async ({ page }) => {
  await page.goto(`/auftraege/A01?seed=${RESEARCH}`);
  await expect(page.getByRole('button', { name: 'In der Werkstatt öffnen' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Recherche bearbeiten' }).click();
  await expect(page).toHaveURL(/\/auftraege\/A01\/recherche\/recherche$/);

  await page.getByLabel('Budget').fill('800 Euro');
  const bedarf = page.getByLabel('Bedarf');
  await bedarf.fill('Zwei Personen drehen Interviews und brauchen leichte Technik für unterwegs');
  await expect(page.getByText('10 Wörter')).toBeVisible(); // Wortzähler live
  await expect(page.getByText(/Ziel: 20–150/)).toBeVisible();

  await page.getByRole('button', { name: 'Quelle hinzufügen' }).click();
  await page.getByLabel('Quelle 1', { exact: true }).fill('https://example.org/kamera-test');
  await page.getByRole('button', { name: 'Quelle hinzufügen' }).click();
  await page.getByLabel('Quelle 2', { exact: true }).fill('https://example.org/stativ');
  await page.getByRole('button', { name: 'Quelle 2 entfernen' }).click();
  await expect(page.getByLabel('Quelle 2', { exact: true })).toHaveCount(0);

  await page.reload();
  await expect(page.getByLabel('Budget')).toHaveValue('800 Euro');
  await expect(page.getByLabel('Bedarf')).toHaveValue(/leichte Technik/);
  await expect(page.getByLabel('Quelle 1', { exact: true })).toHaveValue('https://example.org/kamera-test');
});

test('Zeitsimulation +80 h: Status „verspätet“ in Rot mit Symbol und Text', async ({ page }) => {
  await page.goto(`/auftraege?seed=${VIDEO}`);
  await expect(card(page)).toBeVisible();
  await page.goto('/einstellungen?dev=1');
  await page.getByLabel('Zeit vorspulen (Stunden)').fill('80');
  await page.getByRole('button', { name: 'Übernehmen' }).click();
  await page.getByRole('link', { name: 'Aufträge', exact: true }).click();

  const late = card(page).locator('[data-status="verspaetet"]');
  await expect(late).toBeVisible();
  await expect(late).toContainText('verspätet');
  await expect(late.locator('svg')).toBeVisible();
  await expect(late).toHaveCSS('color', 'rgb(215, 0, 21)');
  await expect(card(page)).toContainText('verspätet seit 2 Std. 0 Min.');
  // 72 h später ist Auftrag #2 fällig geworden
  await expect(page.locator('main').getByRole('link', { name: /Auftrag #2/ })).toBeVisible();
});

test('Einstellungen ohne ?dev=1 zeigen keine Entwickler-Zeit', async ({ page }) => {
  await page.goto('/einstellungen');
  await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
  await expect(page.getByLabel('Zeit vorspulen (Stunden)')).toHaveCount(0);
});

test('Hinweis „Letzte Sicherung geladen“ erscheint bei defektem Zustand und lässt sich schließen', async ({ page }) => {
  await page.goto(`/auftraege?seed=${VIDEO}`);
  await expect(card(page)).toBeVisible();
  await page.evaluate(() => {
    const cur = localStorage.getItem('mw-state');
    localStorage.setItem('mw-state.bak1', cur ?? '');
    localStorage.setItem('mw-state', '{kaputt');
  });
  await page.goto('/auftraege');
  const banner = page.getByRole('status').filter({ hasText: 'Letzte Sicherung geladen' });
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Hinweis schließen' }).click();
  await expect(banner).toHaveCount(0);
});

test('Zustand {version:1} mit gültiger Sicherung: Sicherung wird geladen, Seite hängt nicht', async ({ page }) => {
  await page.goto(`/auftraege?seed=${VIDEO}`);
  await expect(card(page)).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('mw-state.bak1', localStorage.getItem('mw-state') ?? '');
    localStorage.setItem('mw-state', '{"version":1}');
  });
  await page.goto('/auftraege');
  await expect(card(page)).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Letzte Sicherung geladen' })).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`keine axe-Verstöße in Aufträgen, Detail und Formular (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const check = async (label: string) => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations, `${label} (${scheme})`).toEqual([]);
    };
    await page.goto(`/auftraege?seed=${RESEARCH}`);
    await expect(card(page)).toBeVisible();
    await check('Liste');
    await page.goto('/auftraege/A01');
    await expect(page.getByRole('heading', { level: 2, name: 'Briefing' })).toBeVisible();
    await check('Detail');
    await page.getByRole('button', { name: 'Recherche bearbeiten' }).click();
    await page.getByRole('button', { name: 'Quelle hinzufügen' }).click();
    await page.getByLabel('Budget').fill('x');
    await check('Formular');
    await page.goto('/einstellungen?dev=1');
    await expect(page.getByLabel('Zeit vorspulen (Stunden)')).toBeVisible();
    await check('Einstellungen');
  });
}
