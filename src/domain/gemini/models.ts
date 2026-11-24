/** Versionszahlen im Modellnamen, z. B. „gemini-2.5-flash“ → [2, 5]. */
function version(name: string): number[] {
  const m = /(\d+(?:\.\d+)*)/.exec(name);
  return m ? m[1].split('.').map(Number) : [];
}

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Standardmodell: das neueste Modell mit „flash“ im Namen (Version absteigend, bei Gleichstand alphabetisch). */
export function defaultModel(models: string[]): string | null {
  const flash = models.filter((m) => m.toLowerCase().includes('flash'));
  flash.sort((a, b) => compareVersions(version(b), version(a)) || a.localeCompare(b));
  return flash[0] ?? null;
}
