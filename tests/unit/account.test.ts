import { describe, expect, it } from 'vitest';
import type { Assignment } from '../../src/domain/assignments/types';
import { account } from '../../src/domain/chef/account';
import { loadRules } from '../../src/domain/chef/rules';
import type { Deduction, Evaluation } from '../../src/domain/chef/types';

const rules = loadRules();
const ded = (ruleId: string, label: string): Deduction => ({ ruleId, category: 'technik', label, soll: '', ist: '', points: -2, fix: 'x' });
const ev = (assignmentId: string, total: number, ds: Deduction[] = [], at = 1): Evaluation => ({
  id: `${assignmentId}:${at}`, assignmentId, at, total, phrase: '', bonus: [], late: null,
  categories: { technik: { max: 40, points: 40, deductions: ds }, gestaltung: { max: 35, points: 35, deductions: [] }, auftrag: { max: 25, points: 25, deductions: [] } },
});
const asg = (id: string, status: Assignment['status']): Assignment => ({ id, status } as Assignment);

describe('Punktekonto', () => {
  it('leer: 0 Punkte, Probetag, nächste Stufe 300', () => {
    expect(account([], [], rules)).toEqual({ points: 0, level: 1, levelName: 'Probetag', nextAt: 300, frequent: [] });
  });
  it('beste Bewertung je Auftrag zählt', () => {
    const r = account([ev('a', 70, [], 1), ev('a', 90, [], 2), ev('b', 80)], [asg('a', 'evaluated'), asg('b', 'evaluated')], rules);
    expect(r.points).toBe(170);
  });
  it('verfallener Auftrag −20, Konto kann negativ werden → Stufe 1', () => {
    const r = account([ev('a', 50)], [asg('a', 'evaluated'), asg('x', 'expired'), asg('y', 'expired')], rules);
    expect(r.points).toBe(10);
    const n = account([], [asg('x', 'expired')], rules);
    expect(n).toMatchObject({ points: -20, level: 1, levelName: 'Probetag', nextAt: 300 });
  });
  it('Stufen an den Schwellen und oberste Stufe', () => {
    const at = (p: number) => account([ev('a', p)], [], rules);
    expect(at(299)).toMatchObject({ level: 1 });
    expect(at(300)).toMatchObject({ level: 2, levelName: 'Praktikum', nextAt: 800 });
    expect(at(1500)).toMatchObject({ level: 4, levelName: '2. Lehrjahr', nextAt: 2500 });
    expect(at(2600)).toMatchObject({ level: 5, levelName: '3. Lehrjahr', nextAt: null });
  });
  it('häufigste Abzüge: nach Anzahl, dann Name, höchstens 5, nur beste Bewertungen', () => {
    const loud = ded('loudness', 'Ton zu laut');
    const evs = [
      ev('a', 80, [loud, ded('clipping', 'Clipping')]),
      ev('b', 80, [loud, ded('fps', 'Bildrate falsch')]),
      ev('c', 80, [ded('codecOrFileName', 'Falscher Codec'), ded('truePeak', 'True Peak'), ded('length', 'Länge'), ded('blackOrFreeze', 'Schwarzbild')]),
      ev('c', 10, [ded('verworfen', 'Verworfen')], 0),
    ];
    const f = account(evs, [], rules).frequent;
    expect(f).toHaveLength(5);
    expect(f[0]).toEqual({ ruleId: 'loudness', label: 'Ton zu laut', count: 2 });
    expect(f.map(x => x.label).slice(1)).toEqual(['Bildrate falsch', 'Clipping', 'Falscher Codec', 'Länge']);
  });
});
