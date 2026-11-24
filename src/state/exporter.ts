import type { Backend } from '../backend/Backend';
import type { Assignment, Deliverable } from '../domain/assignments/types';
import { fileNameFor } from '../domain/assignments/naming';
import { buildExport, exportRange, exportSize, type ExportAssets } from '../domain/render/filtergraph';
import { buildCubeLut } from '../domain/render/lut';
import { getPreset } from '../domain/render/presets';
import { renderTitle, type TitleCtx } from '../domain/render/titles';
import { projectSetting } from '../domain/timeline/settings';
import { hashOf, sequenceHash } from './hash';
import { factsForExport } from './submission';
import type { ExportPresetId, ExportRecord, Project, Sequence, TitleParams } from '../domain/timeline/types';

export type ExportDeps = {
  backend: Backend;
  /** Projektordner (ein Pfad unter dem Projekt-Stamm). */
  dir: string;
  /** Auftrag: Dateiname nach `fileNameFor`. Für freie Projekte stattdessen `fileName`. */
  assignment?: Assignment;
  /** Freies Projekt: Dateiname je Version und Ausgabeformat (Größe des Presets, Bildrate der Sequenz). */
  fileName?: (version: number, out: { width: number; height: number; fps: number }) => string;
  now: () => number;
  /** `h264_videotoolbox` im Tauri-Fenster, sonst `libx264`. */
  h264Encoder: 'h264_videotoolbox' | 'libx264';
  /** Sicherheits-Limiter (−2 dBFS); ohne Angabe gilt die Projekt-Einstellung (Standard an). */
  limiter?: boolean;
  /** Titel als PNG mit Transparenz; Standard: OffscreenCanvas. */
  renderTitlePng?: (t: TitleParams, width: number, height: number) => Promise<Uint8Array>;
  onProgress?: (p: number) => void;
};

/** Blob → Bytes; `Blob.arrayBuffer` fehlt in älterem WebKit, dann über FileReader. */
async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error ?? new Error('Titel-PNG ließ sich nicht lesen.'));
    r.readAsArrayBuffer(blob);
  });
}

/**
 * Titel-PNG im Browser: OffscreenCanvas mit `convertToBlob`, sonst (macOS 12 / Safari 15 kennt beides nicht)
 * ein DOM-Canvas mit `toBlob`. In Umgebungen ganz ohne Canvas wirft es.
 */
export async function renderTitlePngDefault(t: TitleParams, width: number, height: number): Promise<Uint8Array> {
  if (typeof OffscreenCanvas !== 'undefined' && typeof OffscreenCanvas.prototype?.convertToBlob === 'function') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      renderTitle(t, width, height, ctx as unknown as TitleCtx);
      return blobBytes(await canvas.convertToBlob({ type: 'image/png' }));
    }
  }
  if (typeof document === 'undefined') throw new Error('Titel lassen sich in dieser Umgebung nicht rendern.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Titel lassen sich nicht rendern (kein 2D-Kontext).');
  renderTitle(t, width, height, ctx as unknown as TitleCtx);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Titel lassen sich nicht rendern (kein PNG).');
  return blobBytes(blob);
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
  const { width, height } = exportSize(seq, preset);
  let fileName: string;
  if (deps.fileName) fileName = deps.fileName(version, { width, height, fps: seq.fps });
  else if (deps.assignment) fileName = fileNameFor(deps.assignment, deliverable, version);
  else throw new Error('Export: Dateiname unbekannt (weder Auftrag noch freies Projekt).');
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

  const limiter = deps.limiter ?? projectSetting(project, 'safetyLimiter');
  const { args, durationSec } = buildExport(seq, project.media, preset, assets, output, { h264Encoder: deps.h264Encoder, limiter });
  await backend.runFfmpeg(args, durationSec, (p) => deps.onProgress?.(p));

  const { inF, outF } = exportRange(seq);
  const rangeSec = { start: inF / seq.fps, end: outF / seq.fps };
  // Momentaufnahme: Die Messung gilt der Datei, nicht dem späteren Stand der Sequenz.
  const facts = factsForExport(seq, project.media, rangeSec);
  return {
    deliverableId: deliverable.id,
    path: output,
    fileName,
    presetId,
    version,
    at: deps.now(),
    sequenceId: seq.id,
    rangeSec,
    facts,
    segments: facts.shots.map((x) => ({ start: x.start, end: x.end })),
    sequenceHash: sequenceHash(seq),
  };
}
