import type { Level } from '../chef/rules';

export type AssignmentType = 'video' | 'research' | 'ton' | 'bild' | 'motion';
export type ShotSize = 'totale' | 'halbtotale' | 'halbnah' | 'nah' | 'gross' | 'detail';

export interface VideoSpec {
  aspect: '16:9' | '9:16' | '1:1';
  width: number;
  height: number;
  fps: 25 | 50 | 30 | 24;
  durationSec: number;
  toleranceSec: number;
  loudnessLufs: -14 | -23;
  truePeakMax: -1;
  codec: 'h264' | 'prores';
  fileName: string;
  minShots: number;
  requiredShotSizes: ShotSize[];
  requireJCut: boolean;
  requireLowerThird: boolean;
}

export interface Hook {
  id: string;
  text: string;
  verify: 'auto' | 'self';
  autoRule?: 'longShot8s' | 'bothFormats';
}

export type ResearchTemplateId = 'expose' | 'drehplan' | 'shotlist' | 'rechte' | 'kaufberatung' | 'formatvergleich';

export interface Deliverable {
  id: string;
  kind: 'video' | 'research';
  label: string;
  videoSpec?: VideoSpec;
  researchTemplate?: ResearchTemplateId;
}

export interface Submission {
  at: number;
  evaluationId: string | null;
  isCorrection: boolean;
}

export interface Assignment {
  id: string;
  number: number;
  issuedAt: number;
  deadline: number;
  expiresAt: number;
  /** Frist ohne Urlaub (18:00 nach dem Ausgabetakt); Ursprung für das Neuberechnen bei Urlaub. Fehlt in alten Ständen. */
  baseDeadline?: number;
  level: Level;
  type: AssignmentType | 'kombi';
  client: { name: string; branche: string };
  occasion: string;
  title: string;
  briefing: string;
  hook: Hook;
  deliverables: Deliverable[];
  shootingNotes: string[];
  status: 'open' | 'submitted' | 'evaluated' | 'expired';
  submissions: Submission[];
  expiredReason?: 'deadline' | 'limit';
}
