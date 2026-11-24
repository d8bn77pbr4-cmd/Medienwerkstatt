import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_PX_PER_SEC, ROW_H, RULER_H, frameToX, viewOf } from '../../src/features/werkstatt/timelineCanvas';

const FIXED = '2026-11-23T12:00:00+01:00';
const VIEW = viewOf(DEFAULT_PX_PER_SEC, 25, 0);
const AXE = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const KEY = 'AIza-test-key-12345';

test.use({ timezoneId: 'Europe/Berlin', locale: 'de-DE' });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED));
});

async function settle(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
}
const axe = async (page: Page) => {
  await settle(page);
  const v = (await new AxeBuilder({ page }).withTags(AXE).analyze()).violations;
  return v.map((x) => `${x.id}: ${x.nodes.map((n) => n.html.slice(0, 100)).join(' | ')}`);
};

const gemini = (page: Page) => page.getByRole('region', { name: 'Gemini' });

/** Schalter an, Datenschutz-Hinweis bestätigen, Schlüssel speichern. */
async function enableGemini(page: Page, withKey = true) {
  const g = gemini(page);
  await g.getByRole('switch', { name: 'Gestaltung von Gemini begutachten lassen' }).click();
  const notice = page.getByRole('dialog', { name: 'Datenschutz-Hinweis' });
  await expect(notice).toBeVisible();
  await notice.getByRole('button', { name: 'Verstanden, einschalten' }).click();
  if (!withKey) return;
  await g.getByLabel('Gemini-Schlüssel').fill(KEY);
  await g.getByRole('button', { name: 'Speichern' }).click();
  await expect(g.getByText('Schlüssel gespeichert')).toBeVisible();
}

test('Schalter an → Datenschutz-Hinweis; Schlüssel wird nie wieder gezeigt; Standardmodell ist das neueste Flash', async ({ page }) => {
  await page.goto('/einstellungen');
  const g = gemini(page);
  const sw = g.getByRole('switch', { name: 'Gestaltung von Gemini begutachten lassen' });
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(g.getByLabel('Gemini-Schlüssel')).toHaveCount(0);

  await sw.click();
  const notice = page.getByRole('dialog', { name: 'Datenschutz-Hinweis' });
  await expect(notice).toContainText('Im Gratis-Tarif nutzt Google');
  await expect(notice).toContainText('Menschen können sie lesen');
  // Abbrechen lässt Gemini aus
  await notice.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');

  await sw.click();
  await page.getByRole('dialog', { name: 'Datenschutz-Hinweis' }).getByRole('button', { name: 'Verstanden, einschalten' }).click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  const field = g.getByLabel('Gemini-Schlüssel');
  await expect(field).toHaveAttribute('type', 'password');
  await field.fill(KEY);
  await g.getByRole('button', { name: 'Speichern' }).click();
  await expect(g.getByText('Schlüssel gespeichert')).toBeVisible();
  await expect(g.getByLabel('Gemini-Schlüssel')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(KEY);
  expect(await page.locator('input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).not.toContain(KEY);

  const model = g.getByRole('combobox', { name: 'Modell' });
  await expect(model).toHaveValue('gemini-2.5-flash');
  await expect(model.locator('option')).toHaveText(['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro']);
  await expect(g.getByRole('link', { name: /Gratis-Schlüssel holen/ })).toHaveAttribute('href', 'https://aistudio.google.com/apikey');

  await g.getByRole('button', { name: 'Entfernen' }).click();
  await expect(g.getByLabel('Gemini-Schlüssel')).toBeVisible();
});

test('Gemini bleibt nach dem Neuladen ausgeschaltet bzw. eingeschaltet wie gespeichert', async ({ page }) => {
  await page.goto('/einstellungen');
  await gemini(page).getByRole('switch').click();
  await page.getByRole('button', { name: 'Verstanden, einschalten' }).click();
  await expect(gemini(page).getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await expect(gemini(page).getByRole('switch')).toHaveAttribute('aria-checked', 'true');
});

test('Darstellung: hell, dunkel, automatisch', async ({ page }) => {
  await page.goto('/einstellungen');
  const group = page.getByRole('radiogroup', { name: 'Darstellung' });
  await group.getByLabel('Dunkel').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await group.getByLabel('Hell').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await group.getByLabel('Automatisch').check();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
});

test('Urlaub: hinzufügen, Meldungen zu jedem Ablehnungsgrund, Entfernen', async ({ page }) => {
  await page.goto('/einstellungen');
  const u = page.getByRole('region', { name: 'Urlaub' });
  const add = async (von: string, bis: string) => {
    await u.getByLabel('Von').fill(von);
    await u.getByLabel('Bis (einschließlich)').fill(bis);
    await u.getByRole('button', { name: 'Urlaub eintragen' }).click();
  };
  await add('2026-11-01', '2026-11-03');
  await expect(u.getByRole('alert')).toContainText('Vergangenheit');
  await add('2026-12-10', '2026-12-05');
  await expect(u.getByRole('alert')).toContainText('Ende muss nach dem Beginn');
  await add('2026-12-01', '2026-12-10');
  await expect(u.getByRole('list', { name: 'Eingetragener Urlaub' }).getByRole('listitem')).toHaveCount(1);
  await add('2026-12-08', '2026-12-12');
  await expect(u.getByRole('alert')).toContainText('überschneidet');
  await add('2026-12-20', '2026-12-31');
  await expect(u.getByRole('alert')).toContainText('14');
  await u.getByRole('button', { name: /Urlaub vom .* entfernen/ }).click();
  await expect(u.getByRole('list', { name: 'Eingetragener Urlaub' })).toHaveCount(0);
});

test('Urlaub ab heute wird angenommen', async ({ page }) => {
  await page.goto('/einstellungen');
  const u = page.getByRole('region', { name: 'Urlaub' });
  await u.getByLabel('Von').fill('2026-11-23');
  await u.getByLabel('Bis (einschließlich)').fill('2026-11-24');
  await u.getByRole('button', { name: 'Urlaub eintragen' }).click();
  await expect(u.getByRole('alert')).toHaveCount(0);
  await expect(u.getByRole('list', { name: 'Eingetragener Urlaub' }).getByRole('listitem')).toHaveCount(1);
});

test('Gemini an mit Schlüssel: Standardmodell gewählt, kein „Kein Modell“-Hinweis', async ({ page }) => {
  await page.goto('/einstellungen');
  await enableGemini(page);
  await expect(gemini(page).getByRole('combobox', { name: 'Modell' })).toHaveValue('gemini-2.5-flash');
  await expect(page.getByText('Kein Modell gewählt')).toHaveCount(0);
});

test('Gemini an ohne Schlüssel: Abgabe-Blatt nennt „nicht bereit“, es gibt keine Einwilligungsfrage', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const submit = await openSubmitSheet(page, false);
  await expect(submit.getByText('Gemini ist eingeschaltet, aber nicht bereit (Schlüssel oder Modell fehlt) – nur Regeln')).toBeVisible();
  expect(await axe(page), 'Abgabe-Blatt mit Hinweis').toEqual([]);
  const hook = submit.getByRole('checkbox');
  if (await hook.count()) await hook.check();
  await submit.getByRole('button', { name: 'Abgeben', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Kurz gesagt' })).toBeVisible();
  await page.getByText('Für Profis', { exact: true }).click();
  await expect(page.getByText('Gestaltung (Gemini)')).toHaveCount(0);
});

test('Entwickler-Abschnitt nur mit ?dev=1', async ({ page }) => {
  await page.goto('/einstellungen');
  await expect(page.getByRole('heading', { name: 'Entwickler' })).toHaveCount(0);
  await page.goto('/einstellungen?dev=1');
  await expect(page.getByRole('heading', { name: 'Entwickler' })).toBeVisible();
});

test('Entwickler-Abschnitt per ⌥-Klick auf die Versionszeile (ohne Adressleiste), bleibt für die Sitzung', async ({ page }) => {
  await page.goto('/einstellungen');
  const version = page.getByTestId('app-version');
  await expect(version).toContainText('Medienwerkstatt');
  await version.click();
  await expect(page.getByRole('heading', { name: 'Entwickler' })).toHaveCount(0);
  await version.click({ modifiers: ['Alt'] });
  await expect(page.getByRole('heading', { name: 'Entwickler' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Entwickler' })).toBeVisible();
  await page.getByTestId('app-version').click({ modifiers: ['Alt'] });
  await expect(page.getByRole('heading', { name: 'Entwickler' })).toHaveCount(0);
});

test('Über: Version, ffmpeg-GPL-Hinweis mit Quelltext-Links, Lucide (ISC), Adobe nur beschreibend', async ({ page }) => {
  await page.goto('/einstellungen');
  const about = page.getByRole('region', { name: 'Über' });
  await expect(about).toContainText('ffmpeg 9.1 (evermeet.cx), lizenziert unter der GNU GPL');
  await expect(about).toContainText('separates Programm im App-Bundle');
  await expect(about.getByRole('link', { name: /ffmpeg\.org/ })).toHaveAttribute('href', 'https://ffmpeg.org/download.html');
  await expect(about.getByRole('link', { name: /evermeet\.cx/ })).toHaveAttribute('href', 'https://evermeet.cx/ffmpeg/');
  await expect(about).toContainText('Lucide');
  await expect(about).toContainText('ISC');
  await expect(about).toContainText('Adobe');
});

test('Einstellungen ohne axe-Verstöße (hell, dunkel, mit Gemini und Hinweis)', async ({ page }) => {
  await page.goto('/einstellungen?dev=1');
  await page.getByRole('region', { name: 'Urlaub' }).getByLabel('Von').fill('2026-12-01');
  await page.getByRole('region', { name: 'Urlaub' }).getByLabel('Bis (einschließlich)').fill('2026-12-03');
  await page.getByRole('button', { name: 'Urlaub eintragen' }).click();
  await enableGemini(page);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect(await axe(page), `Einstellungen ${scheme}`).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await gemini(page).getByRole('switch').click(); // aus
  await gemini(page).getByRole('switch').click(); // Hinweis
  await expect(page.getByRole('dialog', { name: 'Datenschutz-Hinweis' })).toBeVisible();
  expect(await axe(page), 'Hinweis').toEqual([]);
});

// ---- Abgabe mit Gemini -----------------------------------------------------------------------------------------

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

/** Schneiden, exportieren, Gemini einschalten (alles ohne Neuladen: Der Mock-Schlüssel lebt im Arbeitsspeicher) und das Abgabe-Blatt öffnen. */
async function readyToSubmit(page: Page, query = '', withKey = true) {
  await page.goto(`/auftraege/A01?seed=e2e-laut&messung=perfekt${query}`);
  await page.getByRole('button', { name: 'In der Werkstatt öffnen' }).click();
  await cut(page);
  await page.keyboard.press('Meta+m');
  const sheet = page.getByRole('dialog', { name: 'Exportieren' });
  await sheet.getByRole('button', { name: 'Exportieren', exact: true }).click();
  await expect(sheet.getByText('Export fertig.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await page.getByRole('link', { name: 'Einstellungen' }).click();
  await enableGemini(page, withKey);
  await page.getByRole('link', { name: 'Aufträge' }).click();
  await page.locator('a.auftrag-card').click();
  await page.getByRole('button', { name: 'Abgeben', exact: true }).click();
  const submit = page.getByRole('dialog', { name: 'Abgeben' });
  const hook = submit.getByRole('checkbox');
  if (await hook.count()) await hook.check();
  await submit.getByRole('button', { name: 'Abgeben', exact: true }).click();
  return page.getByRole('dialog', { name: 'Gemini-Begutachtung' });
}

/** Wie `readyToSubmit`, hält aber vor dem Klick auf „Abgeben“ im Blatt an. */
async function openSubmitSheet(page: Page, withKey: boolean) {
  await page.goto('/auftraege/A01?seed=e2e-laut&messung=perfekt');
  await page.getByRole('button', { name: 'In der Werkstatt öffnen' }).click();
  await cut(page);
  await page.keyboard.press('Meta+m');
  const sheet = page.getByRole('dialog', { name: 'Exportieren' });
  await sheet.getByRole('button', { name: 'Exportieren', exact: true }).click();
  await expect(sheet.getByText('Export fertig.')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Einstellungen' }).click();
  await enableGemini(page, withKey);
  await page.getByRole('link', { name: 'Aufträge' }).click();
  await page.locator('a.auftrag-card').click();
  await page.getByRole('button', { name: 'Abgeben', exact: true }).click();
  return page.getByRole('dialog', { name: 'Abgeben' });
}

test('Abgabe ohne Personen-Häkchen: „Senden“ gesperrt, „Ohne Gemini abgeben“ → Protokoll ohne Gemini-Teil', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const consent = await readyToSubmit(page);
  await expect(consent).toBeVisible();
  // Fokus bleibt im Blatt: Pflicht-Häkchen (Senden ist noch gesperrt)
  await expect(consent.getByRole('checkbox', { name: 'Alle erkennbaren Personen haben zugestimmt' })).toBeFocused();
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  await expect(consent).toContainText('Im Gratis-Tarif nutzt Google');
  await expect(consent.getByRole('img')).toHaveCount(8);
  await expect(consent.getByRole('button', { name: 'Senden' })).toBeDisabled();
  expect(await axe(page), 'Einwilligung').toEqual([]);
  await consent.getByRole('button', { name: 'Ohne Gemini abgeben' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Kurz gesagt' })).toBeVisible();
  await expect(page.getByText('Ohne Gemini abgegeben')).toBeVisible();
  await page.getByText('Für Profis', { exact: true }).click();
  await expect(page.getByText('Gestaltung (Gemini)')).toHaveCount(0);
});

test('Abgabe mit Häkchen und Mock-Gemini: Gemini-Abschnitt im Protokoll', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const consent = await readyToSubmit(page);
  const send = consent.getByRole('button', { name: 'Senden' });
  await consent.getByRole('checkbox', { name: 'Alle erkennbaren Personen haben zugestimmt' }).check();
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByRole('heading', { level: 2, name: 'Kurz gesagt' })).toBeVisible();
  await page.getByText('Für Profis', { exact: true }).click();
  const section = page.getByRole('heading', { name: 'Gestaltung (Gemini)' });
  await expect(section).toBeVisible();
  await expect(page.getByText('Solide Bildgestaltung')).toBeVisible();
  await expect(page.getByText('Ohne Gemini abgegeben')).toHaveCount(0);
  expect(await axe(page), 'Protokoll mit Gemini').toEqual([]);
});

test('?gemini=limit: Abgabe läuft nur mit Regeln, Vermerk „Gemini-Limit erreicht – nur Regeln“', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const consent = await readyToSubmit(page, '&gemini=limit');
  await consent.getByRole('checkbox', { name: 'Alle erkennbaren Personen haben zugestimmt' }).check();
  await consent.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Kurz gesagt' })).toBeVisible();
  await expect(page.getByText('Gemini-Limit erreicht – nur Regeln')).toBeVisible();
  await page.getByText('Für Profis', { exact: true }).click();
  await expect(page.getByText('Gestaltung (Gemini)')).toHaveCount(0);
});

test('Ohne eingeschaltetes Gemini fragt die Abgabe nichts und es gibt keine Anfrage an Google', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1')) external.push(r.url());
  });
  await page.goto('/auftraege/A01?seed=e2e-laut&messung=perfekt');
  await page.getByRole('button', { name: 'In der Werkstatt öffnen' }).click();
  await cut(page);
  await page.keyboard.press('Meta+m');
  const sheet = page.getByRole('dialog', { name: 'Exportieren' });
  await sheet.getByRole('button', { name: 'Exportieren', exact: true }).click();
  await expect(sheet.getByText('Export fertig.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Jetzt abgeben' }).click();
  const submit = page.getByRole('dialog', { name: 'Abgeben' });
  const hook = submit.getByRole('checkbox');
  if (await hook.count()) await hook.check();
  await submit.getByRole('button', { name: 'Abgeben', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Kurz gesagt' })).toBeVisible();
  await expect(page.getByText(/Gemini/)).toHaveCount(0);
  expect(external).toEqual([]);
});
