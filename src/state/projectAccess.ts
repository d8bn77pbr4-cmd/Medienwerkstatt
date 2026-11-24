import type { Backend } from '../backend/Backend';
import { projectFolderFor } from '../domain/assignments/naming';
import type { Assignment } from '../domain/assignments/types';
import type { Project } from '../domain/timeline/types';
import { useProject } from './projectStore';

/**
 * Projekt eines Auftrags: der offene Stand der Werkstatt (vorher gesichert), sonst von der Platte.
 * `project` ist `null`, wenn es (noch) keines gibt.
 */
export async function loadProjectFor(a: Assignment, backend: Backend): Promise<{ dir: string; project: Project | null }> {
  const open = useProject.getState();
  if (open.target?.kind === 'assignment' && open.target.assignment.id === a.id && open.status === 'ready' && open.project && open.dir) {
    await open.flush();
    return { dir: open.dir, project: useProject.getState().project };
  }
  const dir = await backend.projectDir(projectFolderFor(a));
  const loaded = await backend.loadProject(dir);
  return { dir, project: loaded.value };
}
