import type { VideoSpec } from '../assignments/types';
import type { ExportPresetId } from '../timeline/types';

export type ExportPreset = {
  id: ExportPresetId;
  label: string;
  container: 'mp4' | 'mov';
  /** Ausgabegröße; `null` = Größe der Sequenz. */
  size: { width: number; height: number } | null;
  video: { codec: 'h264' | 'prores'; bitrateMbps?: number };
  audio: { codec: 'aac' | 'pcm_s24le'; rateHz: 48000 };
  /**
   * Hinweis (LUFS) – es wird nicht automatisch normalisiert, die Lautheit stellt man im Schnitt selbst ein.
   * `null` = Zwischenformat: Lautheit nach Vorgabe des Auftrags.
   */
  loudnessHint: -14 | -23 | null;
};

export const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: 'social169',
    label: 'Social 16:9 (1920×1080, H.264, 16 Mbit/s)',
    container: 'mp4',
    size: { width: 1920, height: 1080 },
    video: { codec: 'h264', bitrateMbps: 16 },
    audio: { codec: 'aac', rateHz: 48000 },
    loudnessHint: -14,
  },
  {
    id: 'social916',
    label: 'Social 9:16 (1080×1920, H.264, 12 Mbit/s)',
    container: 'mp4',
    size: { width: 1080, height: 1920 },
    video: { codec: 'h264', bitrateMbps: 12 },
    audio: { codec: 'aac', rateHz: 48000 },
    loudnessHint: -14,
  },
  {
    id: 'social11',
    label: 'Social 1:1 (1080×1080, H.264, 12 Mbit/s)',
    container: 'mp4',
    size: { width: 1080, height: 1080 },
    video: { codec: 'h264', bitrateMbps: 12 },
    audio: { codec: 'aac', rateHz: 48000 },
    loudnessHint: -14,
  },
  {
    id: 'uhd',
    label: 'UHD 4K (H.264, 3840×2160, 40 Mbit/s)',
    container: 'mp4',
    size: { width: 3840, height: 2160 },
    video: { codec: 'h264', bitrateMbps: 40 },
    audio: { codec: 'aac', rateHz: 48000 },
    loudnessHint: -14,
  },
  {
    id: 'rundfunk',
    label: 'Rundfunk (1920×1080, H.264, 25 Mbit/s, −23 LUFS)',
    container: 'mp4',
    size: { width: 1920, height: 1080 },
    video: { codec: 'h264', bitrateMbps: 25 },
    audio: { codec: 'aac', rateHz: 48000 },
    loudnessHint: -23,
  },
  {
    id: 'prores',
    label: 'Zwischenformat (ProRes 422, Sequenzgröße, 24-Bit-Ton)',
    container: 'mov',
    size: null,
    video: { codec: 'prores' },
    audio: { codec: 'pcm_s24le', rateHz: 48000 },
    loudnessHint: null,
  },
];

export function getPreset(id: ExportPresetId): ExportPreset {
  const p = EXPORT_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unbekanntes Preset: ${id}`);
  return p;
}

/** Passt das Preset genau zur Vorgabe (Größe, Codec, Container, Lautheitsziel)? Größe `null` = Sequenzgröße. */
export function presetFits(p: ExportPreset, spec: VideoSpec): boolean {
  const container = spec.codec === 'prores' ? 'mov' : 'mp4';
  return (
    p.video.codec === spec.codec &&
    p.container === container &&
    (p.size === null || (p.size.width === spec.width && p.size.height === spec.height)) &&
    (p.loudnessHint === null || p.loudnessHint === spec.loudnessLufs)
  );
}

/** Voreinstellung für eine Abgabe: das erste Preset mit fester Größe, das genau passt, sonst eins in Sequenzgröße. */
export function defaultPresetFor(spec: VideoSpec): ExportPresetId {
  const fixed = EXPORT_PRESETS.find((p) => p.size !== null && presetFits(p, spec));
  const any = fixed ?? EXPORT_PRESETS.find((p) => presetFits(p, spec));
  return (any ?? EXPORT_PRESETS[0]).id;
}

/** Preset, das zur Vorgabe in Größe/Seitenverhältnis passt (für Hinweise im Chefbüro). */
export function presetForSize(width: number, height: number): ExportPreset | undefined {
  return EXPORT_PRESETS.find((p) => p.size?.width === width && p.size?.height === height);
}
