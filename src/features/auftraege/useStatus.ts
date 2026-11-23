import { useMemo } from 'react';
import type { Assignment } from '../../backend/types';
import { useApp } from '../../state/appStore';
import { useNow } from '../../state/useNow';
import { countdown, statusOf, type Status } from './format';

/** Beste Bewertung je Auftrag (wie im Punktekonto). */
function useBestTotals(): Map<string, number> {
  const evaluations = useApp((s) => s.state?.evaluations);
  return useMemo(() => {
    const m = new Map<string, number>();
    for (const e of evaluations ?? []) m.set(e.assignmentId, Math.max(m.get(e.assignmentId) ?? -Infinity, e.total));
    return m;
  }, [evaluations]);
}

export function useStatusOf(): (a: Assignment) => { status: Status; countdown: ReturnType<typeof countdown> | null } {
  const now = useNow();
  const totals = useBestTotals();
  return (a) => ({
    status: statusOf(a, totals.get(a.id) ?? null, now),
    countdown: a.status === 'open' ? countdown(a.deadline, now) : null,
  });
}
