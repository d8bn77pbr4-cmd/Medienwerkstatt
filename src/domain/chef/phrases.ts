import { fmtDe } from './format';
import { loadRules, type Rules } from './rules';
import type { Deduction, Evaluation } from './types';

const num = (s: string): number | null => {
  const m = /[−-]?\d+(?:,\d+)?/.exec(s);
  return m ? Number(m[0].replace('−', '-').replace(',', '.')) : null;
};

/** Ein Abzug in Klartext, z. B. „Ton zu laut (−9,0 LUFS statt −14).“ */
function plain(d: Deduction): string {
  if (d.ruleId === 'loudness') {
    if (d.ist === 'kein Ton') return `${d.label}.`;
    const target = num(d.soll);
    return `${d.label} (${d.ist} statt ${target === null ? d.soll : fmtDe(target, 0)}).`;
  }
  if (d.ruleId === 'late') return `${d.label} (${d.ist}).`;
  return `${d.label} (${d.ist} statt ${d.soll}).`;
}

export function phraseFor(e: Evaluation, rules: Rules = loadRules()): string {
  const base = e.total < rules.tone.badBelow ? 'So geht das nicht raus.' : e.total < rules.tone.okBelow ? 'Brauchbar, aber da geht mehr.' : 'Kann so zum Kunden.';
  const all = [...e.categories.technik.deductions, ...e.categories.gestaltung.deductions, ...e.categories.auftrag.deductions, ...(e.late ? [e.late] : [])];
  const top = [...all].sort((x, y) => x.points - y.points).slice(0, 2);
  return [base, ...top.map(plain)].join(' ');
}
