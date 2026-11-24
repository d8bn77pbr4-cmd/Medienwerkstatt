import { useEffect } from 'react';
import type { PlaybackEngine } from './playback';

/**
 * Transport-Tastenkürzel (nie animiert): J/K/L, ←/→ (1 Bild), ⇧←/⇧→ (5 Bilder), Leertaste.
 * Task 12 hängt dasselbe an die Werkstatt.
 */
export function useTransportKeys(engine: PlaybackEngine | null): void {
  useEffect(() => {
    if (!engine) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      switch (key) {
        case 'l': engine.play(1); break;
        case 'j': engine.play(-1); break;
        case 'k': engine.pause(); break;
        case ' ':
          if (t?.tagName === 'BUTTON') return; // Leertaste löst dort den Knopf aus
          if (engine.isPlaying) engine.pause();
          else engine.play(1);
          break;
        case 'ArrowRight': engine.step(e.shiftKey ? 5 : 1); break;
        case 'ArrowLeft': engine.step(e.shiftKey ? -5 : -1); break;
        default: return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine]);
}
