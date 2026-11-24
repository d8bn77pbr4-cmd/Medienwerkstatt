import type { ShotSize } from '../assignments/types';

/** Ein Standbild für Gemini: Zeit in der exportierten Datei, ihre Einstellungsgröße und die Bilddatei. */
export type GeminiFrame = { deliverableId: string; time: number; shotSize: ShotSize | null; path: string };

export const MAX_FRAMES = 12;
export const MIN_FRAMES = 8;

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Zeiten der Standbilder (Spec §9.5, 8–12 Bilder): die Mitte jeder Einstellung; mehr als `max` Einstellungen →
 * `max` gleichmäßig verteilte; weniger als `min` bei längerem Film → gleichmäßig verteilte Zeiten ergänzen.
 */
export function selectFrameTimes(shots: { start: number; end: number }[], durationSec: number, max = MAX_FRAMES, min = MIN_FRAMES): number[] {
  const mids = shots.map((s) => r3((s.start + s.end) / 2));
  let times = mids;
  if (mids.length > max) times = Array.from({ length: max }, (_, i) => mids[Math.round((i * (mids.length - 1)) / (max - 1))]);
  const target = Math.min(min, max);
  if (times.length < target && durationSec > 0) {
    const need = target - times.length;
    const have = new Set(times);
    const extra: number[] = [];
    // Gleichmäßig über den Film; Zeiten, die schon vorkommen, rücken um ein Raster weiter.
    for (let n = need; extra.length < need && n <= 10 * need; n++) {
      extra.length = 0;
      for (let i = 1; i <= n; i++) {
        const t = r3((durationSec * i) / (n + 1));
        if (!have.has(t) && !extra.includes(t)) extra.push(t);
      }
    }
    times = [...times, ...extra.slice(0, need)];
  }
  return [...times].sort((a, b) => a - b);
}
