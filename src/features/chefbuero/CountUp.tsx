import { useEffect, useState } from 'react';

const PLAYED = (id: string) => `mw-countup:${id}`;
const DURATION_MS = 600;

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function wasPlayed(id: string): boolean {
  try {
    return sessionStorage.getItem(PLAYED(id)) === '1';
  } catch {
    return false;
  }
}

/**
 * Gesamtpunkte: Der echte Wert steht immer im DOM (für Lesegeräte und Tests); beim ersten Öffnen nach einer Abnahme
 * (`animate`) zählt eine Überlagerung einmal von 0 hoch. Bei „Bewegung reduzieren“ entfällt sie.
 */
export function CountUp({ id, value, animate }: { id: string; value: number; animate: boolean }) {
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!animate || reduced() || wasPlayed(id) || value <= 0) return;
    let raf = 0;
    const t0 = performance.now();
    setShown(0);
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / DURATION_MS);
      const eased = 1 - Math.pow(1 - k, 3);
      if (k < 1) {
        setShown(Math.round(value * eased));
        raf = requestAnimationFrame(step);
      } else {
        setShown(null);
        try {
          sessionStorage.setItem(PLAYED(id), '1');
        } catch {
          /* egal */
        }
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [animate, id, value]);
  return (
    <span className="total">
      <span className={`total-real${shown !== null ? ' is-counting' : ''}`} data-testid="total">
        {value}
      </span>
      {shown !== null && (
        <span className="total-overlay" aria-hidden="true">
          {shown}
        </span>
      )}
    </span>
  );
}
