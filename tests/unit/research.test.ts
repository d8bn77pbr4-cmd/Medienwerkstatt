import { describe, expect, it } from 'vitest';
import { evaluateResearch, RESEARCH_TEMPLATES, wordCount, type ResearchDoc } from '../../src/domain/chef/research';
import { loadRules } from '../../src/domain/chef/rules';

const rules = loadRules();
const words = (n: number) => Array.from({ length: n }, (_, i) => `wort${i}`).join(' ');
const goodExpose = (): ResearchDoc => ({
  templateId: 'expose',
  fields: { arbeitstitel: 'Brot', logline: words(20), zielgruppe: 'Familien', inhalt: words(120), gestaltung: words(60), laenge: '90 s' },
  sources: ['https://example.org/a', 'http://example.org/b'],
});
const run = (d: ResearchDoc) => evaluateResearch(d, RESEARCH_TEMPLATES[d.templateId], rules);

describe('Recherche-Vorlagen', () => {
  it('jede Vorlage hat 4–7 deutsche Felder', () => {
    expect(Object.keys(RESEARCH_TEMPLATES).sort()).toEqual(['drehplan', 'expose', 'formatvergleich', 'kaufberatung', 'rechte', 'shotlist']);
    for (const t of Object.values(RESEARCH_TEMPLATES)) {
      expect(t.fields.length).toBeGreaterThanOrEqual(4);
      expect(t.fields.length).toBeLessThanOrEqual(7);
    }
  });
  it('Wörter = Tokens', () => expect(wordCount('  ein  Wort\nzwei ')).toBe(3));
});

describe('Recherche-Bewertung', () => {
  it('vollständiges Exposé: keine Abzüge', () => expect(run(goodExpose())).toEqual([]));
  it('leeres Pflichtfeld −3, eine Quelle −5', () => {
    const d = goodExpose();
    d.fields.zielgruppe = '   ';
    d.sources = ['https://example.org/a'];
    const out = run(d);
    expect(out.map(x => [x.ruleId, x.points, x.category])).toEqual([['researchEmptyField', -3, 'auftrag'], ['researchSources', -5, 'auftrag']]);
    expect(out[1].ist).toBe('1 Quelle');
  });
  it('Quellen ohne http(s) zählen nicht', () => {
    const d = goodExpose();
    d.sources = ['www.example.org', 'ftp://x.de/y', 'https://ok.de/x', 'https:// kaputt'];
    expect(run(d).map(x => x.ruleId)).toEqual(['researchSources']);
  });
  it('Text außerhalb Längenrahmen −3 je Feld', () => {
    const d = goodExpose();
    d.fields.logline = words(5);
    d.fields.inhalt = words(400);
    const out = run(d);
    expect(out.map(x => x.points)).toEqual([-3, -3]);
    expect(out[0].soll).toBe('10–40 Wörter');
    expect(out[0].ist).toBe('5 Wörter');
  });
  it('fehlendes Feld im Dokument zählt als leer', () => {
    const d = goodExpose();
    delete d.fields.laenge;
    expect(run(d).map(x => x.ruleId)).toEqual(['researchEmptyField']);
  });
});
