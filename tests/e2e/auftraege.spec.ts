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

/** Füllt die Kaufberatung des Recherche-Seeds, trägt zwei Links ein und gibt aus dem Auftrag heraus ab. */
async function submitKaufberatung(page: Page, fields: Record<string, string>, links: string[], query = '') {
  await page.goto(`/auftraege/A01?seed=${RESEARCH}${query}`);
  await page.getByRole('button', { name: 'Recherche bearbeiten' }).click();
  await expect(page.getByText('Beim Abgeben prüft die App deine Links kurz online (nur die eingetragenen Adressen).')).toBeVisible();
  for (const [label, text] of Object.entries(fields)) await page.getByLabel(label).fill(text);
  for (const [i, link] of links.entries()) {
    await page.getByRole('button', { name: 'Quelle hinzufügen' }).click();
    await page.getByLabel(`Quelle ${i + 1}`, { exact: true }).fill(link);
  }
  await page.getByRole('link', { name: 'Zurück zum Auftrag' }).click();
  await page.getByRole('button', { name: 'Abgeben', exact: true }).click();
  const submit = page.getByRole('dialog', { name: 'Abgeben' });
  const hook = submit.getByRole('checkbox');
  if (await hook.count()) await hook.check();
  await submit.getByRole('button', { name: 'Abgeben', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Kurz gesagt' })).toBeVisible();
}

test('Recherche aus Tastatursalat mit zwei gültigen Links: höchstens 15 Punkte, Chef-Satz und Abzüge sichtbar', async ({ page }) => {
  const mash = 'asdf jklö qwertz fdsa hjkl ölkj sdfg ghjk dfgh vbnm yxcv uiop fjdksl ghfjdk djfkls hdjskal';
  await submitKaufberatung(page, { Budget: 'hgfd', Bedarf: mash, Empfehlung: `${mash} ${mash} ${mash}`, Alternativen: mash, Fazit: mash }, [
    'https://www.thomann.de/de/funkmikrofone.html',
    'https://de.wikipedia.org/wiki/Mikrofon',
  ]);
  const total = Number(await page.getByTestId('total').textContent());
  expect(total).toBeLessThanOrEqual(15);
  await expect(page.locator('.kurz-phrase')).toContainText('Das ist Tastatursalat, keine Recherche. So geht nichts an den Kunden.');
  await page.getByText('Für Profis', { exact: true }).click();
  await expect(page.locator('[data-rule="researchGibberish"]')).toHaveCount(5);
  await expect(page.locator('[data-rule="researchGibberishCap"]')).toContainText('Recherche gedeckelt');
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('Link-Prüfung ohne Netz (?links=offline): kein Link-Abzug, Hinweis im Protokoll', async ({ page }) => {
  await submitKaufberatung(page, { Budget: '150 Euro' }, ['https://www.thomann.de/de/404', 'https://de.wikipedia.org/wiki/Mikrofon'], '&links=offline');
  await expect(page.getByRole('note').filter({ hasText: 'Links nicht online geprüft – keine Verbindung. Das kostet keine Punkte.' })).toBeVisible();
  await page.getByText('Für Profis', { exact: true }).click();
  await expect(page.locator('[data-rule="researchSourceNotFound"], [data-rule="researchSourceUnreachable"]')).toHaveCount(0);
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

// Phase 1.1 (3b): Steckbrief und Themen-Aufträge. Seeds (Auftrag #1): e2e-thema-8 = Kommentar zum Handyverbot,
// e2e-thema-5 = Dossier zum Buchdruck, e2e-thema-1 = Erklärvideo-Konzept zu Schlaf, e2e-geschichte-4 = Kurzdoku (Video) zum Handyverbot.
const KOMMENTAR = 'e2e-thema-8';
const DOSSIER = 'e2e-thema-5';
const ERKLAER = 'e2e-thema-1';
const KURZDOKU = 'e2e-geschichte-4';

test('Betriebs-Auftrag zeigt den Steckbrief als Definitionsliste, kein Thema', async ({ page }) => {
  await page.goto(`/auftraege/A01?seed=${VIDEO}`);
  const steckbrief = page.locator('section[aria-labelledby="steckbrief-h"]');
  await expect(steckbrief.getByRole('heading', { level: 2, name: 'Steckbrief' })).toBeVisible();
  await expect(steckbrief.getByText('Der Betrieb ist erfunden – alles Wichtige steht hier. Recherchiere Branche und Thema.')).toBeVisible();
  for (const term of ['Branche', 'Ort', 'Gegründet', 'Mitarbeitende', 'Angebot', 'Werte', 'Zielgruppe', 'Ansprechperson', 'Besonderheit']) {
    await expect(steckbrief.locator('dt', { hasText: new RegExp(`^${term}$`) })).toHaveCount(1);
  }
  await expect(steckbrief.locator('dl dd')).toHaveCount(9);
  await expect(page.getByRole('heading', { level: 2, name: 'Thema' })).toHaveCount(0);
});

test('Themen-Auftrag zeigt Thema mit Leitfragen und Recherche-Einstieg, keinen Steckbrief', async ({ page }) => {
  await page.goto(`/auftraege/A01?seed=${KOMMENTAR}`);
  await expect(page.getByRole('heading', { level: 1, name: /Kommentar: Handyverbot an Schulen/ })).toBeVisible();
  const thema = page.locator('section[aria-labelledby="thema-h"]');
  await expect(thema.getByRole('heading', { level: 2, name: 'Thema' })).toBeVisible();
  await expect(thema).toContainText('Smartphones gehören für viele Jugendliche zum Alltag');
  await expect(thema.getByRole('heading', { level: 3, name: 'Leitfragen' })).toBeVisible();
  await expect(thema.getByRole('list').nth(0).getByRole('listitem')).toHaveCount(3);
  await expect(thema.getByRole('heading', { level: 3, name: 'Recherche-Einstieg' })).toBeVisible();
  expect(await thema.getByRole('list').nth(1).getByRole('listitem').count()).toBeGreaterThanOrEqual(2);
  await expect(thema.getByText('Recherchiere den aktuellen Stand und gib deine Quellen an.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Steckbrief' })).toHaveCount(0);
});

test('Kommentar: Formular zeigt die Felder, zählt und speichert', async ({ page }) => {
  await page.goto(`/auftraege/A01?seed=${KOMMENTAR}`);
  await page.getByRole('button', { name: 'Recherche bearbeiten' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Kommentar' })).toBeVisible();
  for (const label of ['These', 'Argumente dafür', 'Argumente dagegen', 'Eigene Meinung und Fazit']) await expect(page.getByLabel(label)).toBeVisible();
  await page.getByLabel('These').fill('Ein Handyverbot an Schulen ist sinnvoll, wenn es klare Ausnahmen gibt.');
  await expect(page.getByText(/Ziel: 10–40 Wörter/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('These')).toHaveValue(/klare Ausnahmen/);
});

test('Dossier: Formular zeigt die Felder', async ({ page }) => {
  await page.goto(`/auftraege/A01/recherche/recherche?seed=${DOSSIER}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Dossier' })).toBeVisible();
  for (const label of ['Ereignis', 'Zeitleiste', 'Ursachen', 'Folgen', 'Bedeutung heute']) await expect(page.getByLabel(label)).toBeVisible();
});

test('Erklärvideo-Konzept: Formular zeigt die Felder', async ({ page }) => {
  await page.goto(`/auftraege/A01/recherche/recherche?seed=${ERKLAER}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Erklärvideo-Konzept' })).toBeVisible();
  for (const label of ['Kernfrage', 'Zielgruppe', 'Drei Kernaussagen', 'Skript-Entwurf', 'Visualisierung']) await expect(page.getByLabel(label)).toBeVisible();
});

test('Themen-Video: Kurzdoku mit Thema, Steckbrief entfällt', async ({ page }) => {
  await page.goto(`/auftraege/A01?seed=${KURZDOKU}`);
  await expect(page.getByRole('heading', { level: 1, name: /Kurzdoku: Handyverbot an Schulen/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Thema' })).toBeVisible();
  await expect(page.locator('section[aria-labelledby="briefing-h"]')).toContainText('„Handyverbot an Schulen“');
  await expect(page.getByRole('button', { name: 'In der Werkstatt öffnen' })).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  const pages: [string, string, () => string][] = [
    ['Steckbrief', `/auftraege/A01?seed=${VIDEO}`, () => 'Steckbrief'],
    ['Thema', `/auftraege/A01?seed=${KOMMENTAR}`, () => 'Thema'],
    ['Dossier-Formular', `/auftraege/A01/recherche/recherche?seed=${DOSSIER}`, () => 'Dossier'],
  ];
  for (const [label, url, heading] of pages) {
    test(`keine axe-Verstöße: ${label} (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(url);
      await expect(page.getByRole('heading', { name: heading(), exact: true }).first()).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations, `${label} (${scheme})`).toEqual([]);
    });
  }
}
