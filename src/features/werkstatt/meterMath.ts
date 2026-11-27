/**
 * Pegel-Mathematik der Vorschau (ohne WebAudio): Spitzenpegel in dBFS und eine Lautheits-Näherung
 * nach BS.1770 ohne K-Filter und ohne relatives Gate. Die genaue Messung macht der Export (ebur128).
 */

/** Spitzenpegel (dBFS) des größten Betrags; Stille = −∞. */
export function peakDb(samples: Float32Array): number {
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]);
    if (v > max) max = v;
  }
  return max > 0 ? 20 * Math.log10(max) : -Infinity;
}

export function meanSquare(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return sum / samples.length;
}

/** Mittleres Quadrat → Lautheit (≈ LUFS): −0,691 + 10·log10(ms). */
export function msToLufs(ms: number): number {
  return ms > 0 ? -0.691 + 10 * Math.log10(ms) : -Infinity;
}

/** „−12,3“, „−∞“; ohne Wert „–“. */
export function formatDb(v: number | null): string {
  if (v === null || Number.isNaN(v)) return '–';
  if (v === -Infinity) return '−∞';
  const s = (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

const SHORT_TERM_MS = 3000;
/** Absolutes Gate wie BS.1770: leiser als −70 LUFS zählt nicht zur integrierten Lautheit. */
const ABSOLUTE_GATE = -70;

/** Kurzzeit- (3 s) und integrierte Lautheit aus Blöcken mittlerer Quadrate. */
export class LoudnessMeter {
  private blocks: { ms: number; t: number }[] = [];
  private sum = 0;
  private count = 0;

  push(ms: number, t: number): void {
    this.blocks.push({ ms, t });
    while (this.blocks.length && this.blocks[0].t < t - SHORT_TERM_MS) this.blocks.shift();
    if (msToLufs(ms) > ABSOLUTE_GATE) {
      this.sum += ms;
      this.count++;
    }
  }
  shortTerm(): number | null {
    if (!this.blocks.length) return null;
    return msToLufs(this.blocks.reduce((s, b) => s + b.ms, 0) / this.blocks.length);
  }
  integrated(): number | null {
    return this.count ? msToLufs(this.sum / this.count) : null;
  }
  reset(): void {
    this.blocks = [];
    this.sum = 0;
    this.count = 0;
  }
}
