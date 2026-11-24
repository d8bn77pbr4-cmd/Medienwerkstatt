import type { Backend } from '../backend/Backend';
import { useApp } from './appStore';
import { refOf, targetKey, useProject, type OpenTarget } from './projectStore';

/**
 * Öffnet das Ziel in der Werkstatt und merkt es sich im App-Zustand (`lastOpened`, bei freien Projekten
 * `openedAt`) – über den normalen Speicherweg des App-Stores. Nur ein bereitstehendes Projekt zählt:
 * ein Auftrag ohne Video-Abgabe oder ein Ladefehler wird nicht „zuletzt geöffnet“.
 */
export async function openTarget(t: OpenTarget, backend?: Backend): Promise<boolean> {
  const ok = await useProject.getState().open(t, backend);
  const s = useProject.getState();
  if (ok && s.status === 'ready' && s.target && targetKey(s.target) === targetKey(t)) useApp.getState().noteOpened(refOf(t));
  return ok;
}
