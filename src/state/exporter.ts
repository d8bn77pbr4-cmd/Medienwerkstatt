import type { Backend } from '../backend/Backend';
import type { Assignment, Deliverable } from '../domain/assignments/types';
import { fileNameFor } from '../domain/assignments/naming';
import { buildExport, exportRange, exportSize, type ExportAssets } from '../domain/render/filtergraph';
import { buildCubeLut } from '../domain/render/lut';
import { getPreset } from '../domain/render/presets';
import { renderTitle, type TitleCtx } from '../domain/render/titles';
import type { ExportPresetId, ExportRecord, Project, Sequence, TitleParams } from '../domain/timeline/types';

export type ExportDeps = {
  backend: Backend;
  /** Projektordner (ein Pfad unter dem Projekt-Stamm). */
  dir: string;
  assignment: Assignment;
  now: () => number;
  /** `h264_videotoolbox` im Tauri-Fenster, sonst `libx264`. */
  h264Encoder: 'h264_videotoolbox' | 'libx264';
  /** Titel als PNG mit Transparenz; Standard: OffscreenCanvas. */
  renderTitlePng?: (t: TitleParams, width: number, height: number) => Promise<Uint8Array>;
  onProgress?: (p: number) => void;
};

/** Kurzer, stabiler Hash (FNV-1a, 32 Bit) für Dateinamen im Cache. */
export function hashOf(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Titel-PNG im Browser (OffscreenCanvas); in Umgebungen ohne Canvas wirft es. */
export async function renderTitlePngDefault(t: TitleParams, width: number, height: number): Promise<Uint8Array> {
  if (typeof OffscreenCanvas === 'undefined') throw new Error('Titel lassen sich in dieser Umgebung nicht rendern.');
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Titel lassen sich nicht rendern (kein 2D-Kontext).');
  renderTitle(t, width, height, ctx as unknown as TitleCtx);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}

/** Im Tauri-Fenster der Hardware-Encoder, im Browser/Mock-Modus `libx264`. */
export function defaultEncoder(): ExportDeps['h264Encoder'] {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? 'h264_videotoolbox' : 'libx264';
}

/**
 * Exportiert eine Video-Abgabe aus `seq`: LUTs (`Cache/lut-<hash>.cube`) und Titel-PNGs in Ausgabegröße
 * (`Cache/title-<hash>.png`) schreiben, ffmpeg mit Fortschritt laufen lassen, Datei nach
 * `<Projekt>/Export/<Dateiname>`. Liefert den neuen Eintrag (Version = höchste bisherige + 1); das Anhängen an
 * das Projekt und Speichern übernimmt der Aufrufer.
 */
export async function exportDeliverable(
  project: Project,
  seq: Sequence,
  deliverable: Deliverable,
  presetId: ExportPresetId,
  deps: ExportDeps,
): Promise<ExportRecord> {
  const preset = getPreset(presetId);
  const { backend, dir } = deps;
  const version = Math.max(0, ...project.exports.filter((r) => r.deliverableId === deliverable.id).map((r) => r.version)) + 1;
  let fileName = fileNameFor(deps.assignment, deliverable, version);
  const ext = preset.container;
  if (!fileName.endsWith(`.${ext}`)) fileName = fileName.replace(/\.[^.]+$/, `.${ext}`);
  const output = `${dir}/Export/${fileName}`;

  const assets: ExportAssets = { lutPathByClipId: {}, titlePngByClipId: {} };
  const videoTracks = new Set(seq.tracks.filter((t) => t.kind === 'video' && !t.muted).map((t) => t.id));
  const luts = new Map<string, string>();
  for (const c of seq.clips) {
    if (c.kind !== 'media' || !c.color || !videoTracks.has(c.trackId)) continue;
    const key = hashOf(c.color);
    let path = luts.get(key);
    if (!path) {
      path = await backend.writeFile(dir, `Cache/lut-${key}.cube`, new TextEncoder().encode(buildCubeLut(c.color)));
      luts.set(key, path);
    }
    assets.lutPathByClipId[c.id] = path;
  }
  const { width, height } = exportSize(seq, preset);
  const render = deps.renderTitlePng ?? renderTitlePngDefault;
  const pngs = new Map<string, string>();
  for (const c of seq.clips) {
    if (c.kind !== 'title' || !c.title || !videoTracks.has(c.trackId)) continue;
    const key = hashOf([c.title, width, height]);
    let path = pngs.get(key);
    if (!path) {
      path = await backend.writeFile(dir, `Cache/title-${key}.png`, await render(c.title, width, height));
      pngs.set(key, path);
    }
    assets.titlePngByClipId[c.id] = path;
  }

  const { args, durationSec } = buildExport(seq, project.media, preset, assets, output, { h264Encoder: deps.h264Encoder });
  await backend.runFfmpeg(args, durationSec, (p) => deps.onProgress?.(p));

  const { inF, outF } = exportRange(seq);
  return {
    deliverableId: deliverable.id,
    path: output,
    fileName,
    presetId,
    version,
    at: deps.now(),
    sequenceId: seq.id,
    rangeSec: { start: inF / seq.fps, end: outF / seq.fps },
  };
}
