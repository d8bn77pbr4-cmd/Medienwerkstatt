import { ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';

const KEY = (id: string) => `mw-stage:${id}`;

function read(id: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(KEY(id));
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

/** Aufklappbare Stufe („Verstehen“, „Für Profis“); der Zustand wird gemerkt (nur Komfort, ohne Speicher gilt der Vorgabewert). */
export function Stage({ id, title, defaultOpen = false, children }: { id: string; title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(() => read(id, defaultOpen));
  return (
    <details
      className="card stage"
      open={open}
      onToggle={(e) => {
        const next = (e.currentTarget as HTMLDetailsElement).open;
        if (next === open) return;
        setOpen(next);
        try {
          localStorage.setItem(KEY(id), next ? '1' : '0');
        } catch {
          /* ohne Speicher: nicht gemerkt */
        }
      }}
    >
      <summary className="stage-summary">
        <ChevronRight className="stage-chevron" aria-hidden="true" />
        <h2>{title}</h2>
      </summary>
      <div className="stage-body">{children}</div>
    </details>
  );
}
