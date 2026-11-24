import { useEffect, useRef } from 'react';
import { isTypingTarget, matchKey, type CommandId } from './keymap';

export type KeyHandlers = Partial<Record<CommandId, () => void>>;

/**
 * Hängt die Tastenbelegung aus `KEYMAP` an das Fenster. Nur Befehle mit Handler werden ausgewertet;
 * nichts, solange ein Textfeld Fokus hat. Gehaltene Tasten wiederholen nur, wo die Belegung es erlaubt
 * (sonst eskaliert z. B. L auf 8×). Nie animiert.
 */
export function useKeymap(handlers: KeyHandlers, enabled = true): void {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      const b = matchKey(e);
      const run = b ? ref.current[b.command] : undefined;
      if (!b || !run) return;
      // Leertaste auf einem Knopf löst den Knopf aus, nicht die Wiedergabe.
      if (b.command === 'transport.toggle' && (e.target as HTMLElement | null)?.tagName === 'BUTTON') return;
      e.preventDefault();
      if (e.repeat && !b.repeat) return;
      run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
