import { X } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { KEYMAP } from './keymap';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Tastenkürzel-Übersicht (⌘/): Taste, Funktion, Bezeichnung bei Adobe. Esc schließt, der Fokus bleibt im Dialog. */
export function ShortcutOverlay({ onClose }: { onClose(): void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    return () => before?.focus?.();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !dialog.current) return;
    const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return;
    const [first, last] = [items[0], items[items.length - 1]];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !dialog.current.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !dialog.current.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="sheet-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet keys-sheet" role="dialog" aria-modal="true" aria-labelledby="keys-h" ref={dialog} onKeyDown={onKeyDown}>
        <div className="sheet-head">
          <h2 id="keys-h">Tastenkürzel</h2>
          <button type="button" className="icon-btn" aria-label="Übersicht schließen" ref={closeBtn} onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="keys-scroll" tabIndex={0} aria-label="Liste der Tastenkürzel">
          <table className="keys-table">
            <thead>
              <tr>
                <th scope="col">Taste</th>
                <th scope="col">Funktion</th>
                <th scope="col">Bei Adobe</th>
              </tr>
            </thead>
            <tbody>
              {KEYMAP.map((b) => (
                <tr key={b.command}>
                  <td>
                    <kbd>{b.display}</kbd>
                  </td>
                  <td>{b.label}</td>
                  <td className="muted">{b.adobe}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="keys-hint">Kürzel wirken nicht, solange ein Eingabefeld Fokus hat. ⌥ beim Ziehen löst die Verknüpfung von Bild und Ton (J-/L-Cut).</p>
      </div>
    </div>
  );
}
