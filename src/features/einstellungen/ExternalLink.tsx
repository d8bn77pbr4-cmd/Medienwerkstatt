import { ExternalLink as ExternalIcon } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';

/** Öffnet im Tauri-Fenster den Standardbrowser (Opener-Plugin), im Browser/Mock als normaler Link in neuem Tab. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  const onClick = async (e: MouseEvent<HTMLAnchorElement>) => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
    e.preventDefault();
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('plugin:opener|open_url', { url: href });
    } catch {
      /* Fenster ohne Opener: der Link bleibt als Text sichtbar */
    }
  };
  return (
    <a className="ext-link" href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => void onClick(e)}>
      {children}
      <ExternalIcon aria-hidden="true" />
    </a>
  );
}
