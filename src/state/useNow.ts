import { useEffect, useState } from 'react';
import { useApp } from './appStore';

/** Aktuelle Zeit der App-Uhr (inkl. Entwickler-Versatz); rendert alle `everyMs` neu, ohne Animation. */
export function useNow(everyMs = 30_000): number {
  const clock = useApp((s) => s.clock);
  const [, setBeat] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setBeat((b) => b + 1), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return clock ? clock.now() : Date.now();
}
