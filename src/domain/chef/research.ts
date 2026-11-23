import type { ResearchTemplateId } from '../assignments/types';
import type { Rules } from './rules';
import { makeDeduction, type Deduction } from './types';

export type ResearchField = { key: string; label: string; required: boolean; minWords?: number; maxWords?: number };
export type ResearchTemplate = { id: ResearchTemplateId; label: string; fields: ResearchField[] };
export type ResearchDoc = { templateId: ResearchTemplateId; fields: Record<string, string>; sources: string[] };

export const RESEARCH_TEMPLATES: Record<ResearchTemplateId, ResearchTemplate> = {
  expose: {
    id: 'expose',
    label: 'Exposé',
    fields: [
      { key: 'arbeitstitel', label: 'Arbeitstitel', required: true },
      { key: 'logline', label: 'Logline', required: true, minWords: 10, maxWords: 40 },
      { key: 'zielgruppe', label: 'Zielgruppe', required: true },
      { key: 'inhalt', label: 'Inhalt', required: true, minWords: 80, maxWords: 300 },
      { key: 'gestaltung', label: 'Gestaltungsidee', required: true, minWords: 40, maxWords: 200 },
      { key: 'laenge', label: 'Länge', required: true },
    ],
  },
  drehplan: {
    id: 'drehplan',
    label: 'Drehplan',
    fields: [
      { key: 'datum', label: 'Datum', required: true },
      { key: 'ort', label: 'Ort', required: true },
      { key: 'motive', label: 'Motive', required: true, minWords: 10, maxWords: 150 },
      { key: 'personen', label: 'Personen', required: true },
      { key: 'technik', label: 'Technikliste', required: true, minWords: 5, maxWords: 150 },
      { key: 'zeitplan', label: 'Zeitplan', required: true, minWords: 10, maxWords: 200 },
    ],
  },
  shotlist: {
    id: 'shotlist',
    label: 'Shotlist',
    fields: [
      { key: 'ueberblick', label: 'Überblick', required: true, minWords: 10, maxWords: 80 },
      { key: 'einstellungen', label: 'Einstellungen', required: true, minWords: 30, maxWords: 300 },
      { key: 'einstellungsgroessen', label: 'Einstellungsgrößen', required: true, minWords: 5, maxWords: 100 },
      { key: 'ton', label: 'Ton und Atmo', required: false, maxWords: 100 },
    ],
  },
  rechte: {
    id: 'rechte',
    label: 'Rechte-Recherche',
    fields: [
      { key: 'werk', label: 'Werk (Musik oder Bild)', required: true },
      { key: 'quelle', label: 'Quelle', required: true },
      { key: 'lizenz', label: 'Lizenz', required: true },
      { key: 'link', label: 'Link', required: true },
      { key: 'bedingungen', label: 'Bedingungen', required: true, minWords: 8, maxWords: 150 },
    ],
  },
  kaufberatung: {
    id: 'kaufberatung',
    label: 'Technik-Kaufberatung',
    fields: [
      { key: 'budget', label: 'Budget', required: true },
      { key: 'bedarf', label: 'Bedarf', required: true, minWords: 20, maxWords: 150 },
      { key: 'empfehlung', label: 'Empfehlung', required: true, minWords: 40, maxWords: 250 },
      { key: 'alternativen', label: 'Alternativen', required: true, minWords: 20, maxWords: 200 },
      { key: 'fazit', label: 'Fazit', required: true, minWords: 10, maxWords: 80 },
    ],
  },
  formatvergleich: {
    id: 'formatvergleich',
    label: 'Formatvergleich (Codecs)',
    fields: [
      { key: 'formate', label: 'Verglichene Formate', required: true },
      { key: 'qualitaet', label: 'Bildqualität', required: true, minWords: 20, maxWords: 200 },
      { key: 'dateigroesse', label: 'Dateigröße', required: true, minWords: 10, maxWords: 150 },
      { key: 'einsatz', label: 'Einsatzzweck', required: true, minWords: 20, maxWords: 200 },
      { key: 'empfehlung', label: 'Empfehlung', required: true, minWords: 10, maxWords: 100 },
    ],
  },
};

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function validSources(sources: string[]): string[] {
  return sources.filter(s => /^https?:\/\/\S+$/.test(s.trim()));
}

export type ResearchPoints = { emptyField: number; tooFewSources: number; lengthOutOfRange: number; minSources: number };

/** Punktwerte für Recherche in Kombi-Aufträgen (Kategorie Auftrag). */
export function kombiResearchPoints(rules: Rules): ResearchPoints {
  const a = rules.deductions.auftrag;
  return { emptyField: a.researchEmptyField, tooFewSources: a.researchTooFewSources, lengthOutOfRange: a.researchLengthOutOfRange, minSources: a.researchMinSources };
}

/** Punktwerte für reine Recherche-Aufträge. */
export function researchOnlyPoints(rules: Rules): ResearchPoints {
  const o = rules.deductions.researchOnly;
  return { emptyField: o.emptyField, tooFewSources: o.tooFewSources, lengthOutOfRange: o.lengthOutOfRange, minSources: rules.deductions.auftrag.researchMinSources };
}

export function evaluateResearch(doc: ResearchDoc, template: ResearchTemplate, rules: Rules, r: ResearchPoints = kombiResearchPoints(rules)): Deduction[] {
  const out: Deduction[] = [];
  const prefix = template.label;
  for (const f of template.fields) {
    const text = (doc.fields[f.key] ?? '').trim();
    if (text === '') {
      if (f.required) {
        out.push(
          makeDeduction(prefix, 'researchEmptyField', 'auftrag', `Pflichtfeld „${f.label}“ leer`, 'ausgefüllt', 'leer', r.emptyField, `Fülle das Feld „${f.label}“ aus.`),
        );
      }
      continue;
    }
    const n = wordCount(text);
    const below = f.minWords !== undefined && n < f.minWords;
    const above = f.maxWords !== undefined && n > f.maxWords;
    if (below || above) {
      const soll = `${f.minWords ?? 0}–${f.maxWords ?? '∞'} Wörter`;
      out.push(
        makeDeduction(
          prefix,
          'researchLength',
          'auftrag',
          `„${f.label}“ ${below ? 'zu kurz' : 'zu lang'}`,
          soll,
          `${n} Wörter`,
          r.lengthOutOfRange,
          below
            ? `Schreibe zum Feld „${f.label}“ mehr, bis du mindestens ${f.minWords} Wörter hast.`
            : `Kürze das Feld „${f.label}“ auf höchstens ${f.maxWords} Wörter.`,
        ),
      );
    }
  }
  const sources = validSources(doc.sources).length;
  if (sources < r.minSources) {
    out.push(
      makeDeduction(
        prefix,
        'researchSources',
        'auftrag',
        'Zu wenige Quellen',
        `mindestens ${r.minSources} Quellen mit http(s)-Link`,
        `${sources} Quelle${sources === 1 ? '' : 'n'}`,
        r.tooFewSources,
        `Ergänze Quellen mit vollständigem Link (https://…), bis es mindestens ${r.minSources} sind.`,
      ),
    );
  }
  return out;
}
