import type { Assignment, Deliverable } from './types';

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };

/** „Bäckerei Korn & Kruste“ → „Baeckerei-Korn-und-Kruste“. */
export function slugify(name: string): string {
  return name
    .replace(/[äöüÄÖÜß]/g, c => UMLAUTS[c])
    .replace(/&/g, ' und ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

/** Zwei Stellen, ab 100 drei (und mehr). */
export function padNumber(n: number): string {
  return String(n).padStart(2, '0');
}

/** `A07_Baeckerei-Korn-und-Kruste` (Projektordner und Dateinamen-Präfix). */
export function projectFolderFor(a: Assignment): string {
  return `A${padNumber(a.number)}_${slugify(a.client.name)}`;
}

/**
 * `A07_Baeckerei-Korn-und-Kruste_v01_1080p25.mp4`. Auflösungskürzel = kürzere Bildseite + „p“ + fps.
 * Die zweite Abgabe eines „bothFormats“-Hakens (das andere Format) bekommt `_9x16` bzw. `_16x9` vor der Version.
 * Nur für Video-Abgaben; für Recherche-Abgaben gibt es keinen Dateinamen (wirft).
 */
export function fileNameFor(a: Assignment, d: Deliverable, version: number): string {
  const spec = d.videoSpec;
  if (d.kind !== 'video' || !spec) throw new Error(`fileNameFor: „${d.id}“ ist keine Video-Abgabe`);
  const firstVideo = a.deliverables.find(x => x.kind === 'video');
  const isExtra = a.hook.autoRule === 'bothFormats' && firstVideo !== undefined && firstVideo.id !== d.id;
  const suffix = isExtra ? `_${spec.aspect.replace(':', 'x')}` : '';
  const ext = spec.codec === 'prores' ? 'mov' : 'mp4';
  const res = `${Math.min(spec.width, spec.height)}p${spec.fps}`;
  return `${projectFolderFor(a)}${suffix}_v${padNumber(version)}_${res}.${ext}`;
}
