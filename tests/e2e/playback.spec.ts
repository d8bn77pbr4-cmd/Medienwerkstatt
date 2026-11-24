import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const FPS = 25;
const timecode = (page: Page) => page.getByRole('timer', { name: 'Zeitcode' });
const frames = async (page: Page): Promise<number> => {
  const [h, m, s, f] = ((await timecode(page).textContent()) ?? '').split(':').map(Number);
  return ((h * 60 + m) * 60 + s) * FPS + f;
};

test.beforeEach(async ({ page }) => {
  await page.goto('/_dev/wiedergabe');
  await expect(timecode(page)).toHaveText('00:00:00:00');
  // Erstes Bild ist gezeichnet, sobald das Video Daten hat.
  await expect.poll(() => page.evaluate(() => document.querySelector<HTMLCanvasElement>('canvas.monitor-canvas') !== null)).toBe(true);
});

test('L spielt vorwärts, K hält an', async ({ page }) => {
  await page.keyboard.press('l');
  await expect.poll(() => frames(page)).toBeGreaterThan(8);
  await page.keyboard.press('k');
  const stopped = await frames(page);
  await page.waitForTimeout(400);
  expect(await frames(page)).toBe(stopped);
});

test('wiederholtes L beschleunigt (2×)', async ({ page }) => {
  await page.keyboard.press('l');
  await page.keyboard.press('l');
  await page.waitForTimeout(500);
  await page.keyboard.press('k');
  // 2× in ~0,5 s ≈ 25 Bilder (1× wären ≈ 12)
  expect(await frames(page)).toBeGreaterThan(16);
});

test('⇧→ springt 5 Bilder, → ein Bild, ⇧← zurück', async ({ page }) => {
  await page.keyboard.press('Shift+ArrowRight');
  await expect(timecode(page)).toHaveText('00:00:00:05');
  await page.keyboard.press('ArrowRight');
  await expect(timecode(page)).toHaveText('00:00:00:06');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(timecode(page)).toHaveText('00:00:00:01');
});

test('J spielt rückwärts: Zeitcode nimmt ab', async ({ page }) => {
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight'); // 30 Bilder
  await expect(timecode(page)).toHaveText('00:00:01:05');
  const before = await frames(page);
  await page.keyboard.press('j');
  await expect.poll(() => frames(page)).toBeLessThan(before - 4);
  await page.keyboard.press('k');
});

test('Wiedergabe stoppt am Sequenzende (6 s)', async ({ page }) => {
  for (let i = 0; i < 28; i++) await page.keyboard.press('Shift+ArrowRight'); // 140 Bilder
  await page.keyboard.press('l');
  await expect(timecode(page)).toHaveText('00:00:06:00', { timeout: 5000 });
  const end = await frames(page);
  await page.waitForTimeout(300);
  expect(await frames(page)).toBe(end);
});

test('Programm-Bild ist nicht schwarz', async ({ page }) => {
  await page.keyboard.press('Shift+ArrowRight');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const src = document.querySelector<HTMLCanvasElement>('canvas.monitor-canvas')!;
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 36;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(src, 0, 0, 64, 36);
        const d = ctx.getImageData(0, 0, 64, 36).data;
        let bright = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) bright++;
        return bright;
      }),
    )
    .toBeGreaterThan(100);
});

test('Scopes zeichnen eine Spur (Canvas nicht leer)', async ({ page }) => {
  await page.keyboard.press('Shift+ArrowRight');
  const traced = (testId: string, test: string) =>
    page.evaluate(
      ([id, kind]) => {
        const c = document.querySelector<HTMLCanvasElement>(`[data-testid="${id}"]`)!;
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          // Waveform-Spur ist bläulich (Akzent), Histogramm hellgrau; Hintergrund #1e1e1e, Linien #48484a
          if (kind === 'wave' ? d[i + 2] - d[i] > 30 : d[i] > 150) n++;
        }
        return n;
      },
      [testId, test],
    );
  await expect.poll(() => traced('scope-waveform', 'wave')).toBeGreaterThan(200);
  await expect.poll(() => traced('scope-histogram', 'hist')).toBeGreaterThan(50);
  await expect(page.getByText('Waveform (Luma)', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Histogramm', { exact: true }).first()).toBeVisible();
});

test('WebGL2 ist aktiv (kein Hinweis auf fehlende Farbkorrektur)', async ({ page }) => {
  await expect(page.locator('.monitor-canvas')).toBeVisible();
  await expect(page.getByText('Farbkorrektur in der Vorschau nicht verfügbar')).toHaveCount(0);
  expect(await page.evaluate(() => document.createElement('canvas').getContext('webgl2') !== null)).toBe(true);
});

test('Sicherheitsrahmen lässt sich ein- und ausschalten', async ({ page }) => {
  const btn = page.getByRole('button', { name: 'Sicherheitsrahmen' });
  await expect(page.getByTestId('safe-area')).toHaveCount(0);
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('safe-area')).toBeVisible();
  await btn.click();
  await expect(page.getByTestId('safe-area')).toHaveCount(0);
});

test('Monitor: Umfeld #1e1e1e, Zeitcode in Tabellenziffern, Schrift ≥ 12 px', async ({ page }) => {
  await expect(page.locator('.monitor-surround')).toHaveCSS('background-color', 'rgb(30, 30, 30)');
  await expect(timecode(page)).toHaveCSS('font-variant-numeric', 'tabular-nums');
  const small = await page.locator('.monitor, .scopes').evaluateAll((roots) => {
    const sizes: number[] = [];
    for (const root of roots) {
      root.querySelectorAll('*').forEach((el) => {
        if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())) sizes.push(parseFloat(getComputedStyle(el).fontSize));
      });
    }
    return sizes.filter((s) => s < 12);
  });
  expect(small).toEqual([]);
});

test('Barrierefreiheit (axe)', async ({ page }) => {
  await page.keyboard.press('Shift+ArrowRight');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
