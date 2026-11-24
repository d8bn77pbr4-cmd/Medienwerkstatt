import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

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

test('Einstellungen sind per Link erreichbar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Einstellungen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
});

test('Werkstatt: Grundschrift 13 px', async ({ page }) => {
  await page.goto('/');
  // Platzhalter-Text gibt es nicht mehr: Arbeitsfläche oder leerer Zustand, beide in .werkstatt.
  await expect(page.locator('.werkstatt')).toHaveCSS('font-size', '13px');
});

test('Markierung folgt Layoutänderungen (Fensterhöhe)', async ({ page }) => {
  await page.goto('/einstellungen');
  const gap = async () =>
    page.evaluate(() => {
      const m = document.querySelector('.nav-marker')!.getBoundingClientRect().top;
      const l = document.querySelector('[data-area="einstellungen"]')!.getBoundingClientRect().top;
      return Math.abs(m - l);
    });
  await expect.poll(gap).toBeLessThan(1);
  await page.setViewportSize({ width: 1440, height: 700 });
  await expect.poll(gap).toBeLessThan(1);
});

test('Tastenkürzel setzen die Markierung sofort (kein Zwischenstand)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Bereiche' })).toBeVisible();
  const samples = await page.evaluate(async () => {
    const top = () => document.querySelector('.nav-marker')!.getBoundingClientRect().top;
    const from = top();
    const to = document.querySelector('[data-area="chefbuero"]')!.getBoundingClientRect().top;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', metaKey: true, bubbles: true }));
    const seen: number[] = [];
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      seen.push(top());
    }
    return { from, to, seen };
  });
  const between = samples.seen.filter((y) => y > samples.from + 1 && y < samples.to - 1);
  expect(between).toEqual([]);
  expect(Math.abs(samples.seen[samples.seen.length - 1] - samples.to)).toBeLessThan(1);
});

test('Bewegung reduzieren: Markierung überblendet in 150 ms statt zu gleiten', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('link', { name: 'Chefbüro' }).click();
  const marker = page.locator('.nav-marker');
  await expect(marker).toHaveClass(/is-fading/);
  const anim = await marker.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { name: cs.animationName, duration: cs.animationDuration };
  });
  expect(anim).toEqual({ name: 'mw-fade', duration: '0.15s' });
});

for (const scheme of ['light', 'dark'] as const) {
  test(`keine axe-Verstöße in der Shell (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    for (const path of ['/', '/auftraege', '/chefbuero', '/einstellungen']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations, `${path} (${scheme})`).toEqual([]);
    }
  });
}
