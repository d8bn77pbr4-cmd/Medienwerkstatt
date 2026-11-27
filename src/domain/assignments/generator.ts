import { pick, rng, weighted } from '../rng';
import type { Level, Rules } from '../chef/rules';
import { loadCatalogs, type Anlass, type Catalogs, type HakenEintrag, type Kanal, type Kunde, type Thema } from './catalogs';
import { fileNameFor, padNumber } from './naming';
import type {
  Assignment,
  AssignmentType,
  AssignmentTopic,
  Deliverable,
  Hook,
  ResearchTemplateId,
  ShotSize,
  ThemaKategorie,
  VideoSpec,
  WorldId,
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
  meinung: 'Kommentar',
  geschichte: 'Dossier',
  erklaer: 'Erklärvideo-Konzept',
};
/** Mit Artikel im Akkusativ („… braucht ⟨eine Shotlist⟩“). */
const TEMPLATE_PHRASE: Record<ResearchTemplateId, string> = {
  expose: 'ein Exposé',
  drehplan: 'einen Drehplan',
  shotlist: 'eine Shotlist',
  rechte: 'eine Rechte-Recherche',
  kaufberatung: 'eine Technik-Kaufberatung',
  formatvergleich: 'einen Formatvergleich',
  meinung: 'einen Kommentar',
  geschichte: 'ein Dossier',
  erklaer: 'ein Erklärvideo-Konzept',
};
/** Vorlagen der Betriebs-Aufträge (Themen mit eigenem Katalog `recherche`). */
type BetriebTemplateId = keyof Catalogs['recherche'];
const TEMPLATES: BetriebTemplateId[] = ['expose', 'drehplan', 'shotlist', 'rechte', 'kaufberatung', 'formatvergleich'];
const KOMBI_TEMPLATES: ResearchTemplateId[] = ['shotlist', 'drehplan'];

/** Haupt-Vorlage je Themen-Welt; in einem von vier Fällen ersetzt das Exposé sie (ein Film zum Thema). */
const WORLD_TEMPLATE: Record<ThemaKategorie, ResearchTemplateId> = {
  gesellschaft: 'meinung',
  geschichte: 'geschichte',
  wissen: 'erklaer',
  medien: 'erklaer',
  nischen: 'erklaer',
};
const EXPOSE_SHARE = 0.25;

/** Wie viele Aufträge nach hinten ein Thema nicht wiederkehrt, und wie oft dieselbe Kategorie hintereinander vorkommen darf. */
const TOPIC_MEMORY = 20;
const MAX_SAME_KATEGORIE_IN_ROW = 2;

/** Aufträge davor, soweit für Abwechslung nötig (`number` und `topic`). */
export type AssignmentHistory = readonly Pick<Assignment, 'number' | 'topic'>[];

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
  return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`;
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

/** `topic`: Themen-Auftrag – der Anlass kommt dann aus den Themen-Anlässen (Erklärvideo, Kurzdoku), sonst aus den übrigen. */
function planVideo(r: () => number, level: Level, catalogs: Catalogs, rules: Rules, topic?: Thema): VideoPlan {
  const gewaehlt = pick(
    r,
    catalogs.anlaesse.filter(a => (a.thema === true) === (topic !== undefined)),
  );
  const anlass = topic ? { ...gewaehlt, satz: gewaehlt.satz.replace('{thema}', `„${topic.titel}“`) } : gewaehlt;
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
      (h.minDurationSec ?? 0) <= durationSec &&
      (h.onlyChannels === undefined || h.onlyChannels.includes(anlass.kanal)) &&
      (topic ? !h.nurBetrieb : !h.nurThema),
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

  // bothFormats: Hauptabgabe im eigenen Format des Kanals, zweite Abgabe im jeweils anderen Format
  const other = aspect === '9:16' ? '16:9' : '9:16';
  const specs =
    hook.autoRule === 'bothFormats'
      ? [spec(aspect, aspect === '16:9' && uhd), spec(other, other === '16:9' && uhd)]
      : [spec(aspect, aspect === '16:9' && uhd)];
  return { anlass, kanal, zielgruppe, hook, specs };
}

function videoDeliverables(plan: VideoPlan): Deliverable[] {
  if (plan.specs.length === 1) return [{ id: 'film', kind: 'video', label: 'Film', videoSpec: plan.specs[0] }];
  return plan.specs.map((s, i) => ({
    id: i === 0 ? 'film' : `film-${s.aspect.replace(':', 'x')}`,
    kind: 'video' as const,
    label: `Film ${s.aspect} (${s.aspect === '9:16' ? 'Hochformat' : 'Querformat'})`,
    videoSpec: s,
  }));
}

function videoBriefing(client: Assignment['client'], plan: VideoPlan, kombi?: ResearchTemplateId, bezug = 'Film'): string {
  const { anlass, kanal, zielgruppe, hook } = plan;
  const spec = plan.specs[0];
  const wants = [`mindestens ${spec.minShots} Einstellungen (${spec.requiredShotSizes.map(s => SIZE_LABEL[s]).join(', ')})`];
  if (spec.requireJCut) wants.push('einen J-Cut');
  if (spec.requireLowerThird) wants.push('eine Bauchbinde');
  const extra = kombi ? `, dazu ${TEMPLATE_PHRASE[kombi]} zum ${bezug}` : '';
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

/** Kopie des Steckbriefs (die Aufträge teilen keine Objekte mit dem Katalog). */
function profileOf(k: Kunde): NonNullable<Assignment['client']['profile']> {
  const p = k.profile;
  return { ...p, werte: [...p.werte], ansprechperson: { ...p.ansprechperson }, synonyme: [...p.synonyme] };
}

function topicOf(t: Thema): AssignmentTopic {
  return { id: t.id, kategorie: t.kategorie, titel: t.titel, hintergrund: t.hintergrund, leitfragen: [...t.leitfragen], schlagwoerter: [...t.schlagwoerter], einstieg: [...t.einstieg] };
}

const WORLDS: WorldId[] = ['betrieb', 'gesellschaft', 'geschichte', 'wissen', 'medien', 'nischen'];

/** Die letzten `n` früheren Aufträge (neueste zuerst). */
function recentBefore(history: AssignmentHistory, number: number, n: number): AssignmentHistory {
  return history
    .filter(h => h.number < number)
    .sort((a, b) => b.number - a.number)
    .slice(0, n);
}

/**
 * Zieht die Welt (Betrieb oder Themenbereich) nach `rules.worldWeights` aus einem eigenen Zufallsstrom
 * (`…#welt`), damit der Rest des Auftrags für Betriebe unverändert bleibt. Dieselbe Kategorie kommt höchstens zweimal
 * hintereinander vor: Standen die letzten beiden Aufträge in derselben Kategorie, scheidet sie aus.
 */
export function drawWorld(installId: string, number: number, rules: Rules, history: AssignmentHistory = []): WorldId {
  const rw = rng(`${installId}#${number}#welt`);
  const last = recentBefore(history, number, MAX_SAME_KATEGORIE_IN_ROW);
  const blocked =
    last.length === MAX_SAME_KATEGORIE_IN_ROW && last[0].topic && last.every(h => h.topic?.kategorie === last[0].topic?.kategorie)
      ? last[0].topic.kategorie
      : null;
  let weights = WORLDS.map(w => [w, rules.worldWeights[w]] as [WorldId, number]);
  const allowed = weights.filter(([w]) => w !== blocked);
  if (allowed.some(([, x]) => x > 0)) weights = allowed;
  return weighted(rw, weights);
}

/** Thema der Kategorie, das in den letzten Aufträgen nicht vorkam (gibt es keins mehr, das am längsten nicht gezogene). */
function pickTopic(r: () => number, catalogs: Catalogs, kategorie: ThemaKategorie, recent: AssignmentHistory): Thema {
  const pool = catalogs.themen.filter(t => t.kategorie === kategorie);
  const used = new Set(recent.flatMap(h => (h.topic ? [h.topic.id] : [])));
  const fresh = pool.filter(t => !used.has(t.id));
  if (fresh.length > 0) return pick(r, fresh);
  const oldestFirst = [...recent].reverse().flatMap(h => (h.topic?.kategorie === kategorie ? [h.topic.id] : []));
  return pool.find(t => t.id === oldestFirst[0]) ?? pick(r, pool);
}

/**
 * Erzeugt einen Auftrag deterministisch aus `rng(installId + '#' + number)` (kein Date.now, kein Math.random).
 * `deadline` und `expiresAt` sind Platzhalter (= issuedAt); `schedule.tick` setzt sie samt Status.
 * Typen außerhalb von AVAILABLE_TYPES (ton, bild, motion) werden ignoriert, auch wenn sie in `available` stehen.
 * `history`: frühere Aufträge, damit Themen sich nicht wiederholen und eine Kategorie nicht mehr als zweimal in Folge
 * kommt; ohne sie gibt es keine solche Beschränkung (die Erzeugung bleibt deterministisch zu Seed und History).
 */
export function generateAssignment(
  installId: string,
  number: number,
  issuedAt: number,
  level: Level,
  available: AssignmentType[],
  catalogs: Catalogs,
  rules: Rules,
  history: AssignmentHistory = [],
): Assignment {
  const r = rng(`${installId}#${number}`);
  const types = available.filter(t => AVAILABLE_TYPES.includes(t));
  if (types.length === 0) throw new Error('generateAssignment: keine unterstützten Typen verfügbar');
  const world = drawWorld(installId, number, rules, history);

  const kombiRoll = r();
  const kombi =
    level >= 2 && types.includes('video') && types.includes('research') && kombiRoll < rules.kombiShareFromLevel2;
  const mainType: AssignmentType = kombi
    ? 'video'
    : weighted(r, types.map(t => [t, rules.typeWeights[t]] as [AssignmentType, number]));
  const kunde = pick(r, catalogs.kunden.filter(k => k.art === (world === 'betrieb' ? 'betrieb' : 'redaktion')));
  const client: Assignment['client'] = { name: kunde.name, branche: kunde.branche, profile: profileOf(kunde) };
  const id = `A${padNumber(number)}`;
  const thema = world === 'betrieb' ? undefined : pickTopic(r, catalogs, world, recentBefore(history, number, TOPIC_MEMORY));
  /** Vorlage des Themas (ein Zufallswert; nur bei Themen-Aufträgen gezogen). */
  const topicTemplate = (t: Thema): ResearchTemplateId => (r() < EXPOSE_SHARE ? 'expose' : WORLD_TEMPLATE[t.kategorie]);

  let partial: Pick<Assignment, 'type' | 'occasion' | 'title' | 'briefing' | 'hook' | 'deliverables' | 'shootingNotes'>;

  if (mainType === 'research') {
    let template: ResearchTemplateId;
    let subject: string;
    if (thema) {
      template = topicTemplate(thema);
      subject = `„${thema.titel}“`;
    } else {
      const betriebTemplate = pick(r, TEMPLATES);
      template = betriebTemplate;
      subject = pick(r, catalogs.recherche[betriebTemplate]);
    }
    const hook = toHook(pick(r, catalogs.haken.filter(h => h.appliesTo.includes('research') && (thema ? !h.nurBetrieb : !h.nurThema))));
    const label = TEMPLATE_LABEL[template];
    partial = {
      type: 'research',
      occasion: `Recherche: ${label}`,
      title: thema ? `${label}: ${thema.titel}` : `${label} für ${client.name}`,
      briefing: [
        `${client.name} (${client.branche}) braucht von dir ${TEMPLATE_PHRASE[template]}.`,
        `Es geht um ${subject}.`,
        `Besonderheit: ${hook.text}.`,
      ].join(' '),
      hook,
      deliverables: [{ id: 'recherche', kind: 'research', label, researchTemplate: template }],
      shootingNotes: [],
    };
  } else {
    const plan = planVideo(r, level, catalogs, rules, thema);
    const deliverables = videoDeliverables(plan);
    let researchTemplate: ResearchTemplateId | undefined;
    if (kombi) {
      researchTemplate = thema ? topicTemplate(thema) : pick(r, KOMBI_TEMPLATES);
      deliverables.push({
        id: 'recherche',
        kind: 'research',
        label: `${TEMPLATE_LABEL[researchTemplate]} zum ${thema ? 'Thema' : 'Film'}`,
        researchTemplate,
      });
    }
    partial = {
      type: kombi ? 'kombi' : 'video',
      occasion: `${plan.kanal.name}: ${plan.anlass.name}`,
      title: thema ? `${plan.anlass.name}: ${thema.titel}` : `${plan.anlass.name} – ${client.name}`,
      briefing: videoBriefing(client, plan, researchTemplate, thema ? 'Thema' : 'Film'),
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
    client,
    ...(thema ? { topic: topicOf(thema) } : {}),
    status: 'open',
    submissions: [],
    ...partial,
  };
  for (const d of a.deliverables) if (d.videoSpec) d.videoSpec.fileName = fileNameFor(a, d, 1);
  return a;
}
