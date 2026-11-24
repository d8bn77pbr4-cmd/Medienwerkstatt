import type { TitleParams } from '../timeline/types';

/** Teilmenge von `CanvasRenderingContext2D`/`OffscreenCanvasRenderingContext2D` (mit Attrappe testbar). */
export type TitleCtx = {
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  save(): void;
  restore(): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): TextMetrics;
};

/** Titel-sicherer Bereich: 90 % der Bildfläche. */
const SAFE = 0.05;

const fontOf = (family: string, px: number): string => `600 ${Math.round(px * 100) / 100}px "${family}", "Helvetica Neue", Helvetica, Arial, sans-serif`;

/**
 * Zeichnet einen Titel transparent auf die Fläche (width × height). Schriftgröße `t.size` gilt
 * für 1080 Zeilen Höhe und wächst mit der Höhe. Alles bleibt im Titel-sicheren Bereich.
 * Bauchbinde: Balken + zwei Zeilen im unteren Drittel; Titel: mittig; Abspann: zentrierte Zeilen.
 */
export function renderTitle(t: TitleParams, width: number, height: number, ctx: TitleCtx): void {
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  const safe = { l: width * SAFE, r: width * (1 - SAFE), t: height * SAFE, b: height * (1 - SAFE) };
  const base = (t.size * height) / 1080;
  if (t.style === 'bauchbinde') lowerThird(t, width, height, base, safe, ctx);
  else centered(t, width, height, base, safe, ctx);
  ctx.restore();
}

type Safe = { l: number; r: number; t: number; b: number };

function widest(ctx: TitleCtx, lines: { text: string; px: number; family: string }[]): number {
  let w = 0;
  for (const l of lines) {
    ctx.font = fontOf(l.family, l.px);
    w = Math.max(w, ctx.measureText(l.text).width);
  }
  return w;
}

function lowerThird(t: TitleParams, width: number, height: number, base: number, safe: Safe, ctx: TitleCtx): void {
  const texts = [t.line1, t.line2].filter((s) => s !== '');
  if (texts.length === 0) return;
  const pad = base * 0.5;
  const stripe = base * 0.12;
  const ratios = [1, 0.7];
  const mk = (k: number) => texts.map((text, i) => ({ text, px: base * ratios[i] * k, family: t.font }));
  const natural = widest(ctx, mk(1)) + 2 * pad + stripe;
  const k = Math.min(1, (safe.r - safe.l) / natural);
  const lines = mk(k);
  const p = pad * k;
  const barW = Math.min(safe.r - safe.l, widest(ctx, lines) + 2 * p + stripe * k);
  const lineH = lines.map((l) => l.px * 1.2);
  const barH = 2 * p + lineH.reduce((a, b) => a + b, 0);
  const x = Math.min(Math.max(t.x * width, safe.l), safe.r - barW);
  const y = Math.min(Math.max(t.y * height, (height * 2) / 3), safe.b - barH);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
  ctx.fillRect(x, y, barW, barH);
  ctx.fillStyle = t.color;
  ctx.fillRect(x, y, stripe * k, barH);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let ty = y + p;
  lines.forEach((l, i) => {
    ctx.font = fontOf(l.family, l.px);
    ctx.fillStyle = t.color;
    ctx.fillText(l.text, x + stripe * k + p, ty);
    ty += lineH[i];
  });
}

function centered(t: TitleParams, width: number, height: number, base: number, safe: Safe, ctx: TitleCtx): void {
  const split = (s: string) => (s === '' ? [] : s.split('\n'));
  const second = t.style === 'titel' ? 0.6 : 1;
  const all = [...split(t.line1).map((text) => ({ text, r: 1 })), ...split(t.line2).map((text) => ({ text, r: second }))];
  if (all.length === 0) return;
  const mk = (k: number) => all.map((l) => ({ text: l.text, px: base * l.r * k, family: t.font }));
  const heightOf = (k: number) => mk(k).reduce((a, l) => a + l.px * 1.35, 0);
  const k = Math.min(1, (safe.r - safe.l) / Math.max(1, widest(ctx, mk(1))), (safe.b - safe.t) / heightOf(1));
  const lines = mk(k);
  const total = lines.reduce((a, l) => a + l.px * 1.35, 0);
  let y = Math.min(Math.max(t.y * height - total / 2, safe.t), safe.b - total);
  ctx.fillStyle = t.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const x = Math.min(Math.max(t.x * width, safe.l), safe.r);
  for (const l of lines) {
    ctx.font = fontOf(l.family, l.px);
    ctx.fillText(l.text, x, y);
    y += l.px * 1.35;
  }
}
