import { X } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

type Props = {
  title: string;
  /** Eindeutige ID der Überschrift (aria-labelledby). */
  id: string;
  onClose(): void;
  /** Läuft gerade etwas (Export, Messung)? Dann bleibt das Blatt offen. */
  busy?: boolean;
  wide?: boolean;
  children: ReactNode;
  footer?: ReactNode;
};

/** Modales Blatt: Fokus bleibt im Dialog, Esc schließt (außer während einer Arbeit), Fokus kehrt zurück. */
export function Sheet({ title, id, onClose, busy = false, wide = false, children, footer }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const first = dialog.current?.querySelector<HTMLElement>('[data-autofocus]') ?? closeBtn.current;
    first?.focus();
    return () => before?.focus?.();
  }, []);

  // Ein Knopf, der sich beim Arbeiten sperrt, nimmt den Fokus mit: im Blatt halten, damit Esc und Tab weiter wirken.
  useEffect(() => {
    const d = dialog.current;
    if (!d || d.contains(document.activeElement)) return;
    (busy ? d : (d.querySelector<HTMLElement>('[data-autofocus]') ?? closeBtn.current ?? d)).focus();
  }, [busy]);

  const close = () => {
    if (!busy) onClose();
  };
  // Esc wirkt auch, wenn der Fokus (nach dem Schließen eines anderen Blatts) auf der Seite liegt.
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      closeRef.current();
    };
    document.addEventListener('keydown', onEsc, true);
    return () => document.removeEventListener('keydown', onEsc, true);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Werkstatt-Kürzel (⌘M, Leertaste, …) wirken nicht hinter dem Blatt.
    e.nativeEvent.stopImmediatePropagation?.();
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
    <div className="sheet-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet" style={wide ? { width: 'min(860px, 94vw)' } : undefined} role="dialog" aria-modal="true" aria-labelledby={id} ref={dialog} tabIndex={-1} onKeyDown={onKeyDown}>
        <div className="sheet-head">
          <h2 id={id}>{title}</h2>
          <button type="button" className="icon-btn" aria-label={`${title} schließen`} ref={closeBtn} disabled={busy} onClick={close}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
