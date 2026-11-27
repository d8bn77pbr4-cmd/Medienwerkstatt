import { useEffect, useRef } from 'react';
import { isTypingTarget, matchKey, ownsKey, type CommandId } from './keymap';

export type KeyHandlers = Partial<Record<CommandId, () => void>>;

/**
 * Hängt die Tastenbelegung aus `KEYMAP` an das Fenster. Nur Befehle mit Handler werden ausgewertet;
 * nichts, solange eine Texteingabe Fokus hat; Tasten, die ein fokussierter Regler/Knopf selbst braucht, bleiben dort. Gehaltene Tasten wiederholen nur, wo die Belegung es erlaubt
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
      // Texteingaben bekommen alle Tasten; Regler/Knöpfe nur die, die sie selbst brauchen (Pfeile, Leertaste …).
      if (e.defaultPrevented || isTypingTarget(e.target) || ownsKey(e.target, e.key)) return;
      const b = matchKey(e);
      const run = b ? ref.current[b.command] : undefined;
      if (!b || !run) return;
      e.preventDefault();
      if (e.repeat && !b.repeat) return;
      run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
