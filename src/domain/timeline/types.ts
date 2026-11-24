import type { MediaInfo } from '../../backend/types';
import type { ShotSize } from '../assignments/types';

/** Ganze Bilder in der Bildrate der Sequenz. */
export type Frames = number;
export type TrackId = string;

export type MediaItem = MediaInfo & {
  id: string;
  name: string;
  path: string;
  proxyPath: string | null;
  shotSize: ShotSize | null;
};

export type ColorParams = {
  /** ±2 Blenden. */
  exposure: number;
  /** Alle anderen −100…100. */
  contrast: number;
  highlights: number;
  shadows: number;
  temperature: number;
  tint: number;
  saturation: number;
};

export type TitleStyle = 'bauchbinde' | 'titel' | 'abspann';

export type TitleParams = {
  style: TitleStyle;
  line1: string;
  line2: string;
  font: string;
  size: number;
  color: string;
  x: number;
  y: number;
  fadeIn: Frames;
  fadeOut: Frames;
};

export type Clip = {
  id: string;
  trackId: TrackId;
  kind: 'media' | 'title';
  mediaId?: string;
  start: Frames;
  duration: Frames;
  /** Sekunden in der Quelle. */
  sourceIn: number;
  linkId: string | null;
  gainDb: number;
  fadeIn: Frames;
  fadeOut: Frames;
  color: ColorParams | null;
  title: TitleParams | null;
};

export type Track = {
  id: TrackId;
  kind: 'video' | 'audio';
  name: 'V1' | 'V2' | 'A1' | 'A2' | 'A3' | 'A4';
  locked: boolean;
  muted: boolean;
};

export type Transition = {
  id: string;
  trackId: TrackId;
  leftClipId: string;
  rightClipId: string;
  duration: Frames;
  kind: 'dissolve' | 'audioFade';
};

export type Sequence = {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  tracks: Track[];
  clips: Clip[];
  transitions: Transition[];
  markers: { frame: Frames; label: string }[];
  inPoint: Frames | null;
  outPoint: Frames | null;
};

export type ExportPresetId = 'social169' | 'social916' | 'rundfunk' | 'prores';

export type ExportRecord = {
  deliverableId: string;
  path: string;
  fileName: string;
  presetId: ExportPresetId;
  version: number;
  at: number;
};

export type Project = {
  version: 1;
  assignmentId: string;
  media: MediaItem[];
  sequences: Sequence[];
  activeSequenceId: string;
  exports: ExportRecord[];
};
