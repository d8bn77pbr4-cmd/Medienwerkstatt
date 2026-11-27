import type { Settings } from '../../backend/types';

/** Darstellung setzen: hell/dunkel über `data-theme`, „automatisch“ entfernt das Attribut (System entscheidet). */
export function applyTheme(theme: Settings['theme'], root: HTMLElement = document.documentElement): void {
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}
