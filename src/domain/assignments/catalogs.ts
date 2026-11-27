import { z } from 'zod';
import kundenJson from '../../../catalogs/kunden.json';
import kanaeleJson from '../../../catalogs/kanaele.json';
import anlaesseJson from '../../../catalogs/anlaesse.json';
import hakenJson from '../../../catalogs/haken.json';
import rechercheJson from '../../../catalogs/recherche.json';
import themenJson from '../../../catalogs/themen.json';

const aspect = z.enum(['16:9', '9:16', '1:1']);

const text = z.string().min(1);

/** Steckbrief eines erfundenen Kunden. */
const KundenProfil = z.object({
  gegruendet: z.number().int().min(1800).max(2030),
  mitarbeitende: z.number().int().min(1),
  /** Eine echte deutsche Stadt oder Gemeinde; der Kunde selbst bleibt erfunden. */
  ort: text,
  angebot: text,
  werte: z.array(text).min(2).max(3),
  zielgruppe: text,
  ansprechperson: z.object({ name: text, rolle: text }),
  besonderheit: text,
  /** Wörter nahe an der Branche, für den Themenbezug der Recherche. */
  synonyme: z.array(text).min(2).max(5),
});

/** `betrieb`: erfundener Betrieb oder Verein (Betriebs-Aufträge); `redaktion`: Redaktion, Medienhaus, Bildungsträger (Themen-Aufträge). */
const Kunde = z.object({
  name: text,
  branche: text,
  art: z.enum(['betrieb', 'redaktion']).default('betrieb'),
  profile: KundenProfil,
});

const ThemaKategorie = z.enum(['gesellschaft', 'geschichte', 'wissen', 'medien', 'nischen']);

/** Thema für Aufträge mit Meinung, Geschichte, Erklären (nur neutrale Rahmung, keine erfundenen Fakten). */
const Thema = z.object({
  id: text,
  kategorie: ThemaKategorie,
  titel: text,
  /** Zwei bis drei neutrale Sätze. */
  hintergrund: text,
  leitfragen: z.array(text).length(3),
  /** Wörter für den Themenbezug der Recherche. */
  schlagwoerter: z.array(text).min(4).max(8),
  /** Quellenarten oder bekannte Einrichtungen für den Einstieg, keine Links. */
  einstieg: z.array(text).min(2).max(3),
});

/** Mindestzahl Themen je Kategorie. */
export const MIN_THEMEN: Record<z.infer<typeof ThemaKategorie>, number> = { gesellschaft: 14, geschichte: 12, wissen: 16, medien: 8, nischen: 10 };

/** Kanal: bestimmt Format und Lautheit der zugehörigen Anlässe. */
const Kanal = z.object({
  id: z.string(),
  name: z.string(),
  /** Wo der Film läuft, als Ortsangabe im Briefing („auf Instagram“). */
  ort: z.string(),
  aspects: z.array(aspect).min(1),
  loudnessLufs: z.union([z.literal(-14), z.literal(-23)]),
  /** 4K möglich (nur in höheren Stufen). */
  uhd: z.boolean(),
  zielgruppen: z.array(z.string()).min(1),
});

const AnlassArt = z.enum(['imagefilm', 'interview', 'bericht', 'tutorial', 'event', 'produkt', 'loop']);

const Anlass = z.object({
  id: z.string(),
  kanal: z.string(),
  /** Kurzer Name, im Katalog eindeutig. */
  name: z.string(),
  /** Ergänzt „… braucht ⟨satz⟩.“ im Briefing (Akkusativ). */
  satz: z.string(),
  kind: AnlassArt,
  minSec: z.number().int().min(15).max(180),
  maxSec: z.number().int().min(15).max(180),
  /** Anlass für Themen-Aufträge (Erklärvideo, Kurzdoku); `satz` enthält dann „{thema}“. Betriebs-Aufträge ziehen ihn nie. */
  thema: z.boolean().optional(),
  /** Nur gesetzt, wenn der Anlass die Bildrate ausdrücklich vorgibt. */
  fps: z.union([z.literal(30), z.literal(24)]).optional(),
  /** Abgabe als Master (ProRes ab Stufe 4). */
  master: z.boolean().optional(),
});

const Haken = z.object({
  id: z.string(),
  text: z.string(),
  verify: z.enum(['auto', 'self']),
  autoRule: z.enum(['longShot8s', 'bothFormats']).optional(),
  /** Katalogfeld (nicht Teil des Hook-Typs): für welche Haupttypen der Haken passt. */
  appliesTo: z.array(z.enum(['video', 'research'])).min(1),
  excludeKinds: z.array(AnlassArt).optional(),
  minDurationSec: z.number().optional(),
  /** Nur für diese Kanäle (z. B. bothFormats nur, wo beide Formate Sinn ergeben). */
  onlyChannels: z.array(z.string()).optional(),
  /** Passt nur zu Betriebs-Aufträgen (nicht zu Themen-Aufträgen). */
  nurBetrieb: z.boolean().optional(),
  /** Passt nur zu Themen-Aufträgen. */
  nurThema: z.boolean().optional(),
});

const topics = z.array(z.string()).min(5);
const Recherche = z.object({
  expose: topics,
  drehplan: topics,
  shotlist: topics,
  rechte: topics,
  kaufberatung: topics,
  formatvergleich: topics,
});

export const CatalogsSchema = z
  .object({
    kunden: z.array(Kunde).min(28),
    themen: z.array(Thema).min(60),
    kanaele: z.array(Kanal),
    anlaesse: z.array(Anlass),
    haken: z.array(Haken).min(15),
    recherche: Recherche,
  })
  .refine(c => c.haken.every(h => (h.onlyChannels ?? []).every(id => c.kanaele.some(k => k.id === id))), {
    message: 'haken.onlyChannels verweist auf einen unbekannten Kanal',
  })
  .refine(c => c.kunden.filter(k => k.art === 'betrieb').length >= 20 && c.kunden.filter(k => k.art === 'redaktion').length >= 8, {
    message: 'kunden: mindestens 20 Betriebe und 8 Redaktionen nötig',
  })
  .refine(c => new Set(c.kunden.map(k => k.name)).size === c.kunden.length, { message: 'kunden: Namen müssen eindeutig sein' })
  .refine(c => new Set(c.themen.map(t => t.id)).size === c.themen.length, { message: 'themen: IDs müssen eindeutig sein' })
  .refine(c => (Object.keys(MIN_THEMEN) as (keyof typeof MIN_THEMEN)[]).every(k => c.themen.filter(t => t.kategorie === k).length >= MIN_THEMEN[k]), {
    message: 'themen: zu wenige Themen in einer Kategorie',
  })
  .refine(c => c.anlaesse.filter(a => a.thema).length >= 1 && c.anlaesse.filter(a => a.thema).every(a => a.satz.includes('{thema}') && a.minSec >= 60 && a.maxSec <= 90), {
    message: 'anlaesse: Themen-Anlässe brauchen „{thema}“ im Satz und 60–90 Sekunden',
  })
  .refine(c => c.anlaesse.filter(a => !a.thema).every(a => !a.satz.includes('{thema}')), { message: 'anlaesse: „{thema}“ nur in Themen-Anlässen' });

export type Catalogs = z.infer<typeof CatalogsSchema>;
export type Kanal = z.infer<typeof Kanal>;
export type Anlass = z.infer<typeof Anlass>;
export type Kunde = z.infer<typeof Kunde>;
export type Thema = z.infer<typeof Thema>;
export type HakenEintrag = z.infer<typeof Haken>;

let cached: Catalogs | null = null;

/** Liest `catalogs/*.json` und validiert beim ersten Aufruf; wirft bei ungültigen Katalogen. */
export function loadCatalogs(): Catalogs {
  cached ??= CatalogsSchema.parse({
    kunden: kundenJson,
    kanaele: kanaeleJson,
    anlaesse: anlaesseJson,
    haken: hakenJson,
    recherche: rechercheJson,
    themen: themenJson,
  });
  return cached;
}
