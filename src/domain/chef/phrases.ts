import { fmtDe } from './format';
import { loadRules, type Rules } from './rules';
import { allDeductions, type Deduction, type Evaluation } from './types';

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

/** Chef-Satz, wenn die Recherche aus Tastatursalat besteht (mindestens die Hälfte der Pflichtfelder Unsinn). */
export const GIBBERISH_PHRASE = 'Das ist Tastatursalat, keine Recherche. So geht nichts an den Kunden.';
/** Regeln, die der Tastatursalat-Satz schon ausspricht (sie stehen nicht noch einmal dahinter). */
const GIBBERISH_RULES = new Set(['researchGibberish', 'researchGibberishCap']);

export function phraseFor(e: Evaluation, rules: Rules = loadRules()): string {
  const all = allDeductions(e);
  if (all.some(d => d.ruleId === 'researchGibberishCap')) {
    const rest = all.filter(d => !GIBBERISH_RULES.has(d.ruleId) && d.points < 0).sort((x, y) => x.points - y.points).slice(0, 2);
    return [GIBBERISH_PHRASE, ...rest.map(plain)].join(' ');
  }
  const base = e.total < rules.tone.badBelow ? 'So geht das nicht raus.' : e.total < rules.tone.okBelow ? 'Brauchbar, aber da geht mehr.' : 'Kann so zum Kunden.';
  const top = [...all].sort((x, y) => x.points - y.points).slice(0, 2);
  return [base, ...top.map(plain)].join(' ');
}
