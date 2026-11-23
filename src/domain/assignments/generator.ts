import { pick, rng, weighted } from '../rng';
import type { Level, Rules } from '../chef/rules';
import { loadCatalogs, type Anlass, type Catalogs, type HakenEintrag, type Kanal } from './catalogs';
import { fileNameFor, padNumber } from './naming';
import type {
  Assignment,
  AssignmentType,
  Deliverable,
  Hook,
  ResearchTemplateId,
  ShotSize,
  VideoSpec,
} from './types';

export { loadCatalogs };
export type { Catalogs };

/** Typen, deren Werkzeuge in Phase 1 gebaut sind (nur diese werden gezogen). */
export const AVAILABLE_TYPES: AssignmentType[] = ['video', 'research'];

const TEMPLATE_LABEL: Record<ResearchTemplateId, string> = {
  expose: 'Exposé',
  drehplan: 'Drehplan',
  shotlist: 'Shotlist',
  rechte: 'Rechte-Recherche',
  kaufberatung: 'Technik-Kaufberatung',
  formatvergleich: 'Formatvergleich',
};
/** Mit Artikel im Akkusativ („… braucht ⟨eine Shotlist⟩“). */
const TEMPLATE_PHRASE: Record<ResearchTemplateId, string> = {
  expose: 'ein Exposé',
  drehplan: 'einen Drehplan',
  shotlist: 'eine Shotlist',
  rechte: 'eine Rechte-Recherche',
  kaufberatung: 'eine Technik-Kaufberatung',
  formatvergleich: 'einen Formatvergleich',
};
const TEMPLATES = Object.keys(TEMPLATE_LABEL) as ResearchTemplateId[];
const KOMBI_TEMPLATES: ResearchTemplateId[] = ['shotlist', 'drehplan'];

const SIZE_ORDER: ShotSize[] = ['totale', 'halbtotale', 'halbnah', 'nah', 'gross', 'detail'];
const SIZE_LABEL: Record<ShotSize, string> = {
  totale: 'Totale',
  halbtotale: 'Halbtotale',
  halbnah: 'Halbnah',
  nah: 'Nah',
  gross: 'Groß',
  detail: 'Detail',
};
/** Pflicht-Einstellungsgrößen werden aus diesen drei gezogen (Spec §8.2: Totale, Halbnah, Detail). */
const SIZE_POOL: ShotSize[] = ['totale', 'halbnah', 'detail'];

const DIMENSIONS = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
} as const;

/** Anteil der Aufträge ab Stufe 3 mit 50 statt 25 fps, und 4K-Anteil ab Stufe 4 bei dafür freigegebenen Kanälen. */
const FPS50_SHARE = 0.25;
const UHD_SHARE = 0.3;

/** „a“, „a und b“, „a, b und c“. */
function joinGerman(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} und ${items.at(-1)}`;
}

/** 45 → „45 Sekunden“, 90 → „1:30 Minuten“, 120 → „2 Minuten“. */
function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} Sekunden`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m} Minuten` : `${m}:${String(s).padStart(2, '0')} Minuten`;
}

/**
 * Mindestzahl Einstellungen: ein Grundwert nach Dauer (eine Einstellung je 8 s, mindestens 3)
 * plus eine weitere je Stufe über Stufe 1. 15 s/Stufe 1 → 3; 180 s/Stufe 5 → 27.
 */
function minShotsFor(durationSec: number, level: Level): number {
  return Math.max(3, Math.round(durationSec / 8)) + (level - 1);
}

/** Anzahl Pflicht-Einstellungsgrößen: Stufe 1 → 1, Stufe 3 → 2, Stufe 5 → 3 (dazwischen gerundet). */
function shotSizeCount(level: Level): number {
  return Math.round(1 + (level - 1) / 2);
}

function pickShotSizes(r: () => number, level: Level): ShotSize[] {
  const start = Math.floor(r() * SIZE_POOL.length);
  const rotated = SIZE_POOL.map((_, i) => SIZE_POOL[(start + i) % SIZE_POOL.length]);
  const chosen = rotated.slice(0, shotSizeCount(level));
  return SIZE_ORDER.filter(s => chosen.includes(s));
}

interface VideoPlan {
  anlass: Anlass;
  kanal: Kanal;
  zielgruppe: string;
  hook: Hook;
  specs: VideoSpec[];
}

function toHook(h: HakenEintrag): Hook {
  return { id: h.id, text: h.text, verify: h.verify, ...(h.autoRule ? { autoRule: h.autoRule } : {}) };
}

function planVideo(r: () => number, level: Level, catalogs: Catalogs, rules: Rules): VideoPlan {
  const anlass = pick(r, catalogs.anlaesse);
  const kanal = catalogs.kanaele.find(k => k.id === anlass.kanal);
  if (!kanal) throw new Error(`Anlass ${anlass.id}: unbekannter Kanal ${anlass.kanal}`);
  const zielgruppe = pick(r, kanal.zielgruppen);

  // Dauer in 5-s-Schritten innerhalb des Anlass-Rahmens
  const steps = Math.floor((anlass.maxSec - anlass.minSec) / 5);
  const durationSec = anlass.minSec + 5 * Math.floor(r() * (steps + 1));

  const aspect = pick(r, kanal.aspects);
  const fps50Roll = r();
  const uhdRoll = r();
  const fps: VideoSpec['fps'] = anlass.fps ?? (level >= 3 && fps50Roll < FPS50_SHARE ? 50 : 25);
  const uhd = kanal.uhd && level >= 4 && uhdRoll < UHD_SHARE;

  const candidates = catalogs.haken.filter(
    h =>
      h.appliesTo.includes('video') &&
      !(h.excludeKinds ?? []).includes(anlass.kind) &&
      (h.minDurationSec ?? 0) <= durationSec,
  );
  const hakenEintrag = pick(r, candidates);
  const hook = toHook(hakenEintrag);

  const interview = anlass.kind === 'interview';
  const base = {
    durationSec,
    toleranceSec: (durationSec * rules.lengthTolerancePct[level - 1]) / 100,
    loudnessLufs: kanal.loudnessLufs,
    truePeakMax: -1 as const,
    codec: anlass.master && level >= 4 ? ('prores' as const) : ('h264' as const),
    minShots: minShotsFor(durationSec, level),
    requiredShotSizes: pickShotSizes(r, level),
    requireJCut: level >= 2 && interview,
    requireLowerThird: interview || anlass.kind === 'bericht',
    fps,
  };
  const spec = (a: VideoSpec['aspect'], fourK: boolean): VideoSpec => {
    const [width, height] = fourK ? [3840, 2160] : DIMENSIONS[a];
    return { aspect: a, width, height, ...base, requiredShotSizes: [...base.requiredShotSizes], fileName: '' };
  };

  const specs =
    hook.autoRule === 'bothFormats'
      ? [spec('16:9', uhd), spec('9:16', false)]
      : [spec(aspect, aspect === '16:9' && uhd)];
  return { anlass, kanal, zielgruppe, hook, specs };
}

function videoDeliverables(plan: VideoPlan): Deliverable[] {
  if (plan.specs.length === 1) return [{ id: 'film', kind: 'video', label: 'Film', videoSpec: plan.specs[0] }];
  return plan.specs.map(s => ({
    id: s.aspect === '9:16' ? 'film-9x16' : 'film-16x9',
    kind: 'video' as const,
    label: s.aspect === '9:16' ? 'Film 9:16 (Hochformat)' : 'Film 16:9 (Querformat)',
    videoSpec: s,
  }));
}

function videoBriefing(client: Assignment['client'], plan: VideoPlan, level: Level, kombi?: ResearchTemplateId): string {
  const { anlass, kanal, zielgruppe, hook } = plan;
  const spec = plan.specs[0];
  const wants = [`mindestens ${spec.minShots} Einstellungen (${spec.requiredShotSizes.map(s => SIZE_LABEL[s]).join(', ')})`];
  if (spec.requireJCut) wants.push('einen J-Cut');
  if (spec.requireLowerThird) wants.push('eine Bauchbinde');
  if (level >= 4) wants.push('ein Logo am Ende');
  const extra = kombi ? `, dazu ${TEMPLATE_PHRASE[kombi]} zum Film` : '';
  return [
    `${client.name} (${client.branche}) braucht ${anlass.satz}${extra}.`,
    `Der Film läuft ${kanal.ort} und dauert etwa ${formatDuration(spec.durationSec)}; Zielgruppe: ${zielgruppe}.`,
    `Verlangt sind ${joinGerman(wants)}.`,
    `Besonderheit: ${hook.text}.`,
  ].join(' ');
}

function shootingNotesFor(spec: VideoSpec): string[] {
  return ['HDR-Video aus', `Bildrate ${spec.fps} fps`, spec.aspect === '9:16' ? 'Hochformat halten' : 'Querformat halten'];
}

/**
 * Erzeugt einen Auftrag deterministisch aus `rng(installId + '#' + number)` (kein Date.now, kein Math.random).
 * `deadline` und `expiresAt` sind Platzhalter (= issuedAt); `schedule.tick` setzt sie samt Status.
 * Typen außerhalb von AVAILABLE_TYPES (ton, bild, motion) werden ignoriert, auch wenn sie in `available` stehen.
 */
export function generateAssignment(
  installId: string,
  number: number,
  issuedAt: number,
  level: Level,
  available: AssignmentType[],
  catalogs: Catalogs,
  rules: Rules,
): Assignment {
  const r = rng(`${installId}#${number}`);
  const types = available.filter(t => AVAILABLE_TYPES.includes(t));
  if (types.length === 0) throw new Error('generateAssignment: keine unterstützten Typen verfügbar');

  const kombiRoll = r();
  const kombi =
    level >= 2 && types.includes('video') && types.includes('research') && kombiRoll < rules.kombiShareFromLevel2;
  const mainType: AssignmentType = kombi
    ? 'video'
    : weighted(r, types.map(t => [t, rules.typeWeights[t]] as [AssignmentType, number]));
  const client = pick(r, catalogs.kunden);
  const id = `A${padNumber(number)}`;

  let partial: Pick<Assignment, 'type' | 'occasion' | 'title' | 'briefing' | 'hook' | 'deliverables' | 'shootingNotes'>;

  if (mainType === 'research') {
    const template = pick(r, TEMPLATES);
    const topic = pick(r, catalogs.recherche[template]);
    const kanal = pick(r, catalogs.kanaele);
    const zielgruppe = pick(r, kanal.zielgruppen);
    const hook = toHook(pick(r, catalogs.haken.filter(h => h.appliesTo.includes('research'))));
    const label = TEMPLATE_LABEL[template];
    partial = {
      type: 'research',
      occasion: `Recherche: ${label}`,
      title: `${label} für ${client.name}`,
      briefing: [
        `${client.name} (${client.branche}) braucht von dir ${TEMPLATE_PHRASE[template]}.`,
        `Es geht um ${topic}.`,
        `Die Ergebnisse sind für die Zielgruppe gedacht: ${zielgruppe}.`,
        `Besonderheit: ${hook.text}.`,
      ].join(' '),
      hook,
      deliverables: [{ id: 'recherche', kind: 'research', label, researchTemplate: template }],
      shootingNotes: [],
    };
  } else {
    const plan = planVideo(r, level, catalogs, rules);
    const deliverables = videoDeliverables(plan);
    let researchTemplate: ResearchTemplateId | undefined;
    if (kombi) {
      researchTemplate = pick(r, KOMBI_TEMPLATES);
      deliverables.push({
        id: 'recherche',
        kind: 'research',
        label: `${TEMPLATE_LABEL[researchTemplate]} zum Film`,
        researchTemplate,
      });
    }
    partial = {
      type: kombi ? 'kombi' : 'video',
      occasion: `${plan.kanal.name}: ${plan.anlass.name}`,
      title: `${plan.anlass.name} – ${client.name}`,
      briefing: videoBriefing(client, plan, level, researchTemplate),
      hook: plan.hook,
      deliverables,
      shootingNotes: shootingNotesFor(plan.specs[0]),
    };
  }

  const a: Assignment = {
    id,
    number,
    issuedAt,
    deadline: issuedAt,
    expiresAt: issuedAt,
    level,
    client: { name: client.name, branche: client.branche },
    status: 'open',
    submissions: [],
    ...partial,
  };
  for (const d of a.deliverables) if (d.videoSpec) d.videoSpec.fileName = fileNameFor(a, d, 1);
  return a;
}
