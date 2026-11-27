/** Deutsche Zahl mit Dezimalkomma und echtem Minuszeichen (U+2212), z. B. `−9,0`. */
export function fmtDe(n: number, digits = 1): string {
  const s = n.toFixed(digits);
  const t = Number(s) === 0 ? s.replace('-', '') : s;
  return t.replace('.', ',').replace('-', '−');
}

/** Ganze Zahl ohne Nachkommastellen, sonst eine Stelle. */
export function fmtTol(n: number): string {
  return fmtDe(n, Number.isInteger(n) ? 0 : 1);
}
