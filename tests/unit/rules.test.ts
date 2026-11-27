import { describe, expect, it } from 'vitest';
import { loadRules, RulesSchema } from '../../src/domain/chef/rules';
import rulesJson from '../../rules.json';

describe('loadRules', () => {
  const rules = loadRules();
  it('Fahrplan und Stufen laut Spec §8.1/§9.4', () => {
    expect(rules.schedule).toEqual({ intervalHours: 72, deadlineHour: 18, lateWindowHours: 72, maxOpen: 3, vacationDaysPerYear: 14 });
    expect(rules.lengthTolerancePct).toEqual([10, 7.5, 5, 3, 2]);
    expect(rules.kombiShareFromLevel2).toBe(0.3);
    expect(rules.levels.map(l => l.min)).toEqual([0, 300, 800, 1500, 2500]);
    expect(rules.levels.map(l => l.name)).toEqual(['Probetag', 'Praktikum', '1. Lehrjahr', '2. Lehrjahr', '3. Lehrjahr']);
  });
  it('Abzüge, Frist, Bonus, Korrektur, Gemini laut Spec §9.2–9.5', () => {
    expect(rules.frist).toMatchObject({ perDay: -10, maxDays: 3, expiredAccount: -20 });
    expect(rules.deductions.technik).toMatchObject({ max: 40, resolutionOrAspect: -10, fps: -8, truePeak: -5, clipping: -5 });
    expect(rules.deductions.gestaltung).toMatchObject({ max: 35, missingShotSize: -4, overexposedThresholdPct: 5 });
    expect(rules.deductions.auftrag).toMatchObject({ max: 25, missingDeliverable: -15, hookNotMet: -8 });
    expect(rules.bonus).toMatchObject({ max: 5, early24h: 3, allTechPerfect: 2 });
    expect(rules.correction).toMatchObject({ windowHours: 24, maxScore: 90 });
    expect(rules.gemini.maxShift).toBe(10);
    expect(rules.showreelMinScore).toBe(80);
  });
  it('Recherche ehrlich bewerten (Phase 1.1, 3a): Deckel 15 ab der Hälfte Unsinn, Kombi-Werte etwa ein Viertel', () => {
    const q = rules.researchQuality;
    expect(q.gibberishCapTotal).toBe(15);
    expect(q.gibberishCapShare).toBe(0.5);
    const keys = ['copiedField', 'offTopic', 'implausibleField', 'placeholderSource', 'sourceNotFound', 'sourceUnreachable'] as const;
    for (const k of keys) {
      expect(q.kombi[k], k).toBeLessThan(0);
      expect(q.researchOnly[k], k).toBeLessThan(q.kombi[k]);
    }
  });
  it('Schema prüft researchQuality wie die übrigen Schlüssel', () => {
    const broken = JSON.parse(JSON.stringify(rulesJson)) as Record<string, Record<string, unknown>>;
    delete broken.researchQuality.kombi;
    expect(RulesSchema.safeParse(broken).success).toBe(false);
    const share = JSON.parse(JSON.stringify(rulesJson)) as Record<string, Record<string, unknown>>;
    share.researchQuality.gibberishCapShare = 2;
    expect(RulesSchema.safeParse(share).success).toBe(false);
    expect(RulesSchema.safeParse(rulesJson).success).toBe(true);
  });
});
