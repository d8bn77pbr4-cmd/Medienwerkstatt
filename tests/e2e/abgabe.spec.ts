import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_PX_PER_SEC, ROW_H, RULER_H, frameToX, viewOf } from '../../src/features/werkstatt/timelineCanvas';

// Feste Uhr: Auftrag #1 (Seed e2e-laut) ist ein Video-Auftrag, 1920×1080 bei 25 fps, −14 LUFS, Haken zum Bestätigen.
const FIXED = '2026-11-23T12:00:00+01:00';
const VIEW = viewOf(DEFAULT_PX_PER_SEC, 25, 0);
const AXE = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test.use({ timezoneId: 'Europe/Berlin', locale: 'de-DE' });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED));
});

/** Wartet, bis Blatt- und Aufklapp-Bewegungen zu Ende sind (axe prüft sonst Zwischenfarben). */
async function settle(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
}
const axe = async (page: Page) => {
  await settle(page);
  const v = (await new AxeBuilder({ page }).withTags(AXE).analyze()).violations;
  return v.map((x) => `${x.id}: ${x.nodes.map((n) => n.html.slice(0, 100)).join(' | ')}`);
};

async function openFromAuftraege(page: Page, messung: 'perfekt' | 'zu-laut') {
  await page.goto(`/auftraege/A01?seed=e2e-laut&messung=${messung}`);
  await page.getByRole('button', { name: 'In der Werkstatt öffnen' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Auftrag #1');
}

/** Importieren, einfügen und mit der Rasierklinge bei 2 s schneiden. */
async function cut(page: Page) {
  const bin = page.getByRole('region', { name: 'Medienbibliothek' });
  await bin.getByRole('button', { name: 'Importieren' }).click();
  await bin.getByRole('button', { name: 'e2e-clip.webm', exact: true }).dblclick();
  await page.keyboard.press(',');
  await expect(page.getByRole('list', { name: 'Clips in der Timeline' }).getByRole('button')).toHaveCount(2);
  const box = await page.getByTestId('timeline-canvas').boundingBox();
  if (!box) throw new Error('keine Timeline');
  await page.mouse.click(box.x + frameToX(50, VIEW), box.y + RULER_H / 2);
  await page.keyboard.press('c');
  await page.mouse.click(box.x + frameToX(50, VIEW), box.y + RULER_H + ROW_H.video + ROW_H.video / 2);
  await expect(page.getByRole('list', { name: 'Clips in der Timeline' }).getByRole('button')).toHaveCount(4);
}

async function exportAndSubmit(page: Page) {
  await page.keyboard.press('Meta+m');
  const sheet = page.getByRole('dialog', { name: 'Exportieren' });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Preset').selectOption('social169');
  await sheet.getByRole('button', { name: 'Exportieren', exact: true }).click();
  await expect(sheet.getByRole('progressbar')).toBeVisible();
  await expect(sheet.getByText('Export fertig.')).toBeVisible();
  await expect(sheet.getByText(/Zuletzt: Version 1 · A01_.*_v01_1080p25\.mp4/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Jetzt abgeben' }).click();
  const submit = page.getByRole('dialog', { name: 'Abgeben' });
  await expect(submit).toBeVisible();
  // Die Hook-Bestätigung (nur bei „self“-Haken) setzen, falls vorhanden.
  const hook = submit.getByRole('checkbox');
  if (await hook.count()) await hook.check();
  await submit.getByRole('button', { name: 'Abgeben', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Kurz gesagt' })).toBeVisible();
}

test('schneiden → ⌘M → Social 16:9 → Export → Abgeben → Protokoll (zu laut) → Chefbüro → Nachbessern', async ({ page }) => {
  await openFromAuftraege(page, 'zu-laut');
  await cut(page);
  await exportAndSubmit(page);

  // Protokoll: Kurz gesagt (echte Zahl im DOM), Verstehen, Für Profis
  await expect(page).toHaveURL(/\/chefbuero\/.+/);
  const total = Number(await page.getByTestId('total').textContent());
  expect(total).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { level: 2, name: 'Verstehen' })).toBeVisible();
  await page.getByText('Für Profis', { exact: true }).click();
  const loud = page.locator('[data-rule="loudness"]');
  await expect(loud).toContainText('Lautheit');
  await expect(loud).toContainText('Soll−14 LUFS ±1');
  await expect(loud).toContainText('Ist−9,0 LUFS');
  await expect(loud.getByRole('button', { name: 'In der Werkstatt öffnen' })).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await axe(page), 'Protokoll dunkel').toEqual([]);

  // Chefbüro: Konto und Verlauf
  await page.getByRole('link', { name: 'Chefbüro', exact: true }).click();
  await expect(page.getByTestId('konto-punkte')).toHaveText(String(total));
  const verlauf = page.getByRole('list', { name: 'Verlauf der letzten Abgaben' });
  await expect(verlauf.locator(':scope > li')).toHaveCount(1);
  await expect(verlauf).toContainText('Auftrag #1');
  await expect(verlauf).toContainText(String(total));
  expect(await axe(page)).toEqual([]);
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await axe(page), 'Chefbüro hell').toEqual([]);

  // Nachbessern öffnet die Werkstatt dieses Auftrags
  await verlauf.getByRole('link').first().click();
  await page.getByRole('button', { name: 'Nachbessern' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Auftrag #1');
});

test('Chefbüro ohne Bewertung: ein Satz und „Zu den Aufträgen“', async ({ page }) => {
  await page.goto('/chefbuero?seed=e2e-laut');
  await expect(page.getByRole('heading', { level: 1, name: 'Chefbüro' })).toBeVisible();
  await expect(page.getByText('Noch keine Abnahme')).toBeVisible();
  await page.getByRole('button', { name: 'Zu den Aufträgen' }).click();
  await expect(page).toHaveURL(/\/auftraege$/);
});

test('Abgeben ist aus den Aufträgen erst nach einem Export möglich; perfekte Messung bekommt keinen Lautheits-Abzug', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openFromAuftraege(page, 'perfekt');
  await page.goto('/auftraege/A01?seed=e2e-laut&messung=perfekt');
  await expect(page.getByRole('button', { name: 'Abgeben', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'In der Werkstatt öffnen' }).click();
  await cut(page);
  await page.keyboard.press('Meta+m');
  const sheet = page.getByRole('dialog', { name: 'Exportieren' });
  await sheet.getByRole('button', { name: 'Exportieren', exact: true }).click();
  await expect(sheet.getByText('Export fertig.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await page.getByRole('link', { name: 'Aufträge' }).click();
  await page.locator('a.auftrag-card').click();
  await page.getByRole('button', { name: 'Abgeben', exact: true }).click();
  const submit = page.getByRole('dialog', { name: 'Abgeben' });
  const hook = submit.getByRole('checkbox');
  if (await hook.count()) await hook.check();
  await submit.getByRole('button', { name: 'Abgeben', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Kurz gesagt' })).toBeVisible();
  // „Bewegung reduzieren“: kein Hochzählen, die echte Zahl steht sofort da
  await expect(page.locator('.total-overlay')).toHaveCount(0);
  await expect(page.getByTestId('total')).toHaveText(/^\d+$/);
  await page.getByText('Für Profis', { exact: true }).click();
  await expect(page.locator('[data-rule="loudness"]')).toHaveCount(0);
});

test('Export- und Abgabe-Blatt ohne axe-Verstöße (hell und dunkel)', async ({ page }) => {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await openFromAuftraege(page, 'zu-laut');
    if (scheme === 'light') await cut(page);
    await page.keyboard.press('Meta+m');
    await expect(page.getByRole('dialog', { name: 'Exportieren' })).toBeVisible();
    expect(await axe(page), `Export-Blatt (${scheme})`).toEqual([]);
    const sheet = page.getByRole('dialog', { name: 'Exportieren' });
    await sheet.getByRole('button', { name: 'Exportieren', exact: true }).click();
    await expect(sheet.getByText('Export fertig.')).toBeVisible();
    await sheet.getByRole('button', { name: 'Jetzt abgeben' }).click();
    await expect(page.getByRole('dialog', { name: 'Abgeben' })).toBeVisible();
    expect(await axe(page), `Abgabe-Blatt (${scheme})`).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});
