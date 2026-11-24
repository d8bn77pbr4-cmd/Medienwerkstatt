/** Rec.709-Luma 0–255 für 8-Bit-RGB. */
export const luma8 = (r: number, g: number, b: number): number => Math.min(255, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b));

export type LumaScopes = {
  width: number;
  /** Treffer je Spalte und Luma-Stufe: `columns[x * 256 + luma]`. */
  columns: Uint32Array;
  maxColumn: number;
  /** 256 Stufen. */
  histogram: Uint32Array;
  maxBin: number;
};

/** Waveform-Spalten und Histogramm aus RGBA-Pixeln. */
export function lumaScopes(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): LumaScopes {
  const columns = new Uint32Array(width * 256);
  const histogram = new Uint32Array(256);
  let maxColumn = 0;
  let maxBin = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const l = luma8(rgba[i], rgba[i + 1], rgba[i + 2]);
      const c = ++columns[x * 256 + l];
      if (c > maxColumn) maxColumn = c;
      const h = ++histogram[l];
      if (h > maxBin) maxBin = h;
    }
  }
  return { width, columns, maxColumn, histogram, maxBin };
}
