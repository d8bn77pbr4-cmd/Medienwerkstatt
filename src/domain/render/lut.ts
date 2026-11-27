import type { ColorParams } from '../timeline/types';
import { applyColor } from './color';

/**
 * 3D-LUT im `.cube`-Format (R läuft am schnellsten). Dieselbe Funktion speist die Vorschau und
 * den Export (`lut3d`), damit beides gleich aussieht.
 */
export function buildCubeLut(p: ColorParams, size = 33): string {
  const lines = ['TITLE "Medienwerkstatt"', `LUT_3D_SIZE ${size}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1'];
  const step = size - 1;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const [x, y, z] = applyColor(p, [r / step, g / step, b / step]);
        lines.push(`${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Dieselbe 3D-LUT als RGBA8 (R läuft am schnellsten, Alpha 255) für die Vorschau (WebGL-3D-Textur).
 * Rechnet mit `applyColor`, genau wie `buildCubeLut` für den Export.
 */
export function lutData(p: ColorParams, size = 33): Uint8Array {
  const out = new Uint8Array(size * size * size * 4);
  const step = size - 1;
  let i = 0;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const [x, y, z] = applyColor(p, [r / step, g / step, b / step]);
        out[i++] = Math.round(x * 255);
        out[i++] = Math.round(y * 255);
        out[i++] = Math.round(z * 255);
        out[i++] = 255;
      }
    }
  }
  return out;
}
