import type { Assignment } from '../assignments/types';
import type { Level, Rules } from './rules';
import { allDeductions, type Evaluation } from './types';

export type AccountResult = {
  points: number;
  level: Level;
  levelName: string;
  nextAt: number | null;
  frequent: { ruleId: string; label: string; count: number }[];
};

/** Punktekonto (Spec §9.4): beste Bewertung je Auftrag, verfallene Aufträge −20, Stufe aus `rules.levels`. */
export function account(evaluations: Evaluation[], assignments: Assignment[], rules: Rules): AccountResult {
  const best = new Map<string, Evaluation>();
  for (const e of evaluations) {
    const cur = best.get(e.assignmentId);
    if (!cur || e.total > cur.total) best.set(e.assignmentId, e);
  }
  const counted = [...best.values()];
  const expired = assignments.filter(a => a.status === 'expired').length;
  const points = counted.reduce((s, e) => s + e.total, 0) + expired * rules.frist.expiredAccount;

  let idx = 0;
  rules.levels.forEach((l, i) => {
    if (l.min <= points) idx = i;
  });
  const next = rules.levels[idx + 1];

  const counts = new Map<string, { label: string; count: number }>();
  for (const e of counted) {
    for (const d of allDeductions(e)) {
      const c = counts.get(d.ruleId);
      if (c) c.count++;
      else counts.set(d.ruleId, { label: d.label, count: 1 });
    }
  }
  const frequent = [...counts.entries()]
    .map(([ruleId, c]) => ({ ruleId, ...c }))
    .sort((x, y) => y.count - x.count || x.label.localeCompare(y.label, 'de'))
    .slice(0, 5);

  return { points, level: (idx + 1) as Level, levelName: rules.levels[idx].name, nextAt: next ? next.min : null, frequent };
}
