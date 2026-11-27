import type { ColorParams } from '../timeline/types';

export type RGB = [number, number, number];

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
/** Weiche Kurve 0…1 (smoothstep): 0 am Rand des Wirkbereichs, 1 am Ende des Tonwertumfangs. */
const smooth = (t: number): number => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};

/** Rec.709-Luma. */
const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Farbkorrektur eines Pixels (Werte 0–1). Reihenfolge, immer gleich für Vorschau und Export:
 *  1. Weißabgleich (multiplikativ): Wärme t = temperature/100 → R × (1 + 0,2·t), B × (1 − 0,2·t);
 *     Tönung → G × (1 − 0,15·tint/100).
 *  2. Belichtung: × 2^exposure (Blenden, linear).
 *  3. Kontrast c um 0,5: (x − 0,5)·(1 + c/100) + 0,5.
 *  4. Lichter: wirkt nur für x > 0,5 (smoothstep von 0,5 bis 1), ±0,25 bei ±100 am oberen Ende;
 *     Tiefen: wirkt nur für x < 0,5 (smoothstep von 0,5 bis 0), ±0,25 bei ±100 am unteren Ende.
 *  5. Sättigung s: lineare Mischung zur Rec.709-Luma mit Faktor (1 + s/100).
 * Das Ergebnis wird auf 0–1 geklemmt; alle Parameter 0 ergeben die Identität.
 */
export function applyColor(p: ColorParams, rgb: RGB): RGB {
  const t = p.temperature / 100;
  const wb: RGB = [rgb[0] * (1 + 0.2 * t), rgb[1] * (1 - (0.15 * p.tint) / 100), rgb[2] * (1 - 0.2 * t)];
  const gain = 2 ** p.exposure;
  const k = 1 + p.contrast / 100;
  const hi = (p.highlights / 100) * 0.25;
  const lo = (p.shadows / 100) * 0.25;
  const tone = (v: number): number => {
    let x = v * gain;
    x = (x - 0.5) * k + 0.5;
    if (x > 0.5) x += hi * smooth((x - 0.5) / 0.5);
    else if (x < 0.5) x += lo * smooth((0.5 - x) / 0.5);
    return x;
  };
  const [r, g, b] = [tone(wb[0]), tone(wb[1]), tone(wb[2])];
  const y = luma(r, g, b);
  const s = 1 + p.saturation / 100;
  return [clamp01(y + (r - y) * s), clamp01(y + (g - y) * s), clamp01(y + (b - y) * s)];
}
