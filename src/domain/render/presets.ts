import type { ExportPresetId } from '../timeline/types';

export type ExportPreset = {
  id: ExportPresetId;
  label: string;
  container: 'mp4' | 'mov';
  /** Ausgabegröße; `null` = Größe der Sequenz. */
  size: { width: number; height: number } | null;
  video: { codec: 'h264' | 'prores'; bitrateMbps?: number };
  audio: { codec: 'aac' | 'pcm_s24le'; rateHz: 48000 };
  /** Hinweis (LUFS) – es wird nicht automatisch normalisiert, die Lautheit stellt man im Schnitt selbst ein. */
  loudnessHint: -14 | -23;
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
    loudnessHint: -23,
  },
];

export function getPreset(id: ExportPresetId): ExportPreset {
  const p = EXPORT_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unbekanntes Preset: ${id}`);
  return p;
}
