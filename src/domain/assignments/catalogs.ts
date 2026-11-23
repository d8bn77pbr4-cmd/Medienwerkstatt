import { z } from 'zod';
import kundenJson from '../../../catalogs/kunden.json';
import kanaeleJson from '../../../catalogs/kanaele.json';
import anlaesseJson from '../../../catalogs/anlaesse.json';
import hakenJson from '../../../catalogs/haken.json';
import rechercheJson from '../../../catalogs/recherche.json';

const aspect = z.enum(['16:9', '9:16', '1:1']);

const Kunde = z.object({ name: z.string().min(1), branche: z.string().min(1) });

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
    kunden: z.array(Kunde).min(20),
    kanaele: z.array(Kanal),
    anlaesse: z.array(Anlass),
    haken: z.array(Haken).min(15),
    recherche: Recherche,
  })
  .refine(c => c.haken.every(h => (h.onlyChannels ?? []).every(id => c.kanaele.some(k => k.id === id))), {
    message: 'haken.onlyChannels verweist auf einen unbekannten Kanal',
  });

export type Catalogs = z.infer<typeof CatalogsSchema>;
export type Kanal = z.infer<typeof Kanal>;
export type Anlass = z.infer<typeof Anlass>;
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
  });
  return cached;
}
