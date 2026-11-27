import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const FPS = 25;
const timecode = (page: Page) => page.getByRole('timer', { name: 'Zeitcode' });
const frames = async (page: Page): Promise<number> => {
  const [h, m, s, f] = ((await timecode(page).textContent()) ?? '').split(':').map(Number);
  return ((h * 60 + m) * 60 + s) * FPS + f;
};

const rateBadge = (page: Page) => page.getByTestId('rate');
/** Wartet, bis der Zeitcode sich nicht mehr ändert (Wiedergabe angehalten, Anzeige nachgezogen). */
const settled = async (page: Page): Promise<number> => {
  let last = -1;
  await expect
    .poll(async () => {
      // Erst zwei Bildwechsel abwarten: ein ausstehender Takt (Halt) hat dann den Zeitcode geschrieben.
      await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
      const f = await frames(page);
      const same = f === last;
      last = f;
      return same;
    })
    .toBe(true);
  return last;
};
/** Zurück auf Bild 0 (⇧← springt je 5 Bilder), damit die 6-s-Fixture nie vor dem Ende der Messung ausläuft. */
const rewind = async (page: Page): Promise<void> => {
  for (let i = Math.ceil((await frames(page)) / 5) + 1; i > 0; i--) await page.keyboard.press('Shift+ArrowLeft');
  await expect(timecode(page)).toHaveText('00:00:00:00');
};
/** Zeitstempel der Tasten im Browser: Wartezeit und Tastenlatenz des Testläufers fallen so aus der Rechnung. */
const stamp = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __keys?: { key: string; t: number }[] };
    if (w.__keys) return;
    w.__keys = [];
    window.addEventListener('keydown', (e) => w.__keys!.push({ key: e.key, t: e.timeStamp }), true);
  });
const lastRun = (page: Page) =>
  page.evaluate(() => {
    const keys = (window as unknown as { __keys: { key: string; t: number }[] }).__keys;
    const k = keys[keys.length - 1];
    // Erstes `l` nach dem vorletzten `k` (oder dem Anfang).
    let i = keys.length - 2;
    while (i >= 0 && keys[i].key !== 'k') i--;
    const firstL = keys.slice(i + 1).find((x) => x.key === 'l')!;
    return (k.t - firstL.t) / 1000;
  });
/** Bilder pro Sekunde Wanduhrzeit zwischen erstem `l` und `k` (Verhältnisse sind rechnerunabhängig, absolute Bildzahlen nicht). */
const fps = async (page: Page, run: () => Promise<void>): Promise<number> => {
  await stamp(page);
  await settled(page);
  await rewind(page);
  const from = await settled(page);
  await run();
  const frames_ = (await settled(page)) - from;
  return frames_ / (await lastRun(page));
};
/** `l` `presses`-mal, 1 s laufen lassen, `k` (lange Messzeit dämpft Latenzschwankungen der Tasten). */
const play = (page: Page, presses = 1) => async () => {
  for (let i = 0; i < presses; i++) await page.keyboard.press('l');
  await page.waitForTimeout(1000);
  await page.keyboard.press('k');
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
  const stopped = await settled(page); // Anzeige hat den Halt nachgezogen
  await page.waitForTimeout(400);
  expect(await frames(page)).toBe(stopped);
});

test('wiederholtes L beschleunigt (2×): Anzeige und Vorlauf gegenüber 1×', async ({ page }) => {
  const base = await fps(page, play(page)); // 1× als Maßstab auf diesem Rechner
  expect(base).toBeGreaterThan(0);
  await page.keyboard.press('l');
  await expect(rateBadge(page)).toHaveCount(0); // 1×: keine Anzeige
  await page.keyboard.press('l');
  await expect(rateBadge(page)).toHaveText('2×');
  await expect(page.getByRole('status', { name: 'Wiedergabegeschwindigkeit 2-fach' })).toBeVisible();
  await page.keyboard.press('k');
  await expect(rateBadge(page)).toHaveCount(0); // Stillstand: keine Anzeige
  const fast = await fps(page, play(page, 2));
  expect(fast).toBeGreaterThanOrEqual(base * 1.5);
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

test('gehaltenes L (Tastenwiederholung) eskaliert nicht auf 8×', async ({ page }) => {
  const base = await fps(page, play(page));
  const held = await fps(page, async () => {
    await page.keyboard.press('l');
    await page.evaluate(() => {
      for (let i = 0; i < 6; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', repeat: true, bubbles: true }));
    });
    // Tempo steht an der Anzeige: bei 1× gibt es keine, bei Eskalation stünde dort 2×/4×/8×.
    await expect(rateBadge(page)).toHaveCount(0);
    await page.waitForTimeout(500);
    await page.keyboard.press('k');
  });
  expect(held).toBeLessThan(base * 2);
});

const brightPixels = (page: Page) =>
  page.evaluate(() => {
    const src = document.querySelector<HTMLCanvasElement>('canvas.monitor-canvas')!;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 36;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(src, 0, 0, 64, 36);
    const d = ctx.getImageData(0, 0, 64, 36).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) n++;
    return n;
  });

test('WebGL-Kontextverlust mit Wiederherstellung: Bild kommt zurück', async ({ page }) => {
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => brightPixels(page)).toBeGreaterThan(100);
  await page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>('canvas.monitor-canvas')!.getContext('webgl2')!;
    const ext = gl.getExtension('WEBGL_lose_context')!;
    ext.loseContext();
    setTimeout(() => ext.restoreContext(), 300);
  });
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => brightPixels(page), { timeout: 5000 }).toBeGreaterThan(100);
  await expect(page.getByText('Farbkorrektur in der Vorschau nicht verfügbar')).toHaveCount(0);
});

test('WebGL-Kontextverlust ohne Wiederherstellung: Rückfall auf Canvas 2D mit Hinweis', async ({ page }) => {
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => brightPixels(page)).toBeGreaterThan(100);
  await page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>('canvas.monitor-canvas')!.getContext('webgl2')!;
    gl.getExtension('WEBGL_lose_context')!.loseContext();
  });
  await expect(page.getByText('Farbkorrektur in der Vorschau nicht verfügbar')).toBeVisible({ timeout: 6000 });
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => brightPixels(page), { timeout: 5000 }).toBeGreaterThan(100);
  await expect(page.locator('canvas.monitor-canvas')).toHaveCount(1);
});

test('Scopes: SecurityError beim Lesen zeigt Hinweis und stoppt die Schleife', async ({ page }) => {
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => brightPixels(page)).toBeGreaterThan(100);
  await page.evaluate(() => {
    const w = window as unknown as { __reads: number };
    w.__reads = 0;
    CanvasRenderingContext2D.prototype.getImageData = function () {
      w.__reads++;
      throw new DOMException('tainted', 'SecurityError');
    };
  });
  await expect(page.getByText('Vorschau blockiert: Medienquelle nicht freigegeben').first()).toBeVisible();
  const reads = await page.evaluate(() => (window as unknown as { __reads: number }).__reads);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { __reads: number }).__reads)).toBe(reads);
  expect(reads).toBe(1);
});
