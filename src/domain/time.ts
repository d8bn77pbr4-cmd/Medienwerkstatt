export interface Clock {
  now(): number;
}

/** Systemuhr mit Versatz (Entwickler-Zeitsimulation). Zeiten sind Epoch-ms (UTC). */
export function systemClock(offsetMs: () => number): Clock {
  return { now: () => Date.now() + offsetMs() };
}
