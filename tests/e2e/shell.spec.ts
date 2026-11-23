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
