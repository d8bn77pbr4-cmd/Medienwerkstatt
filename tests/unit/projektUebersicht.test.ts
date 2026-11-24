import { describe, expect, it } from 'vitest';
import type { AppState, Assignment } from '../../src/backend/types';
import type { Deliverable, VideoSpec } from '../../src/domain/assignments/types';
import { PROJECT_FORMATS, newFreeProject } from '../../src/domain/projects';
import { openedText, projectEntries } from '../../src/features/werkstatt/projectList';

const t0 = Date.parse('2026-11-24T10:00:00+01:00');
const MIN = 60_000;
const spec: VideoSpec = {
  aspect: '16:9', width: 1920, height: 1080, fps: 25, durationSec: 30, toleranceSec: 3, loudnessLufs: -14, truePeakMax: -1,
  codec: 'h264', fileName: 'A01_X_v01_1080p25.mp4', minShots: 5, requiredShotSizes: [], requireJCut: false, requireLowerThird: false,
};
const film: Deliverable = { id: 'film', kind: 'video', label: 'Film', videoSpec: spec };
const research: Deliverable = { id: 'recherche', kind: 'research', label: 'Exposé', researchTemplate: 'expose' };
function assignment(id: string, deliverables: Deliverable[], o: Partial<Assignment> = {}): Assignment {
  return {
    id, number: Number(id.slice(1)), issuedAt: 0, deadline: t0 + 72 * 60 * MIN, expiresAt: t0 + 96 * 60 * MIN, level: 1, type: 'video',
    client: { name: 'Café Mühle', branche: 'Gastro' }, occasion: 'Eröffnung', title: 'Reel', briefing: '',
    hook: { id: 'h', text: '', verify: 'self' }, deliverables, shootingNotes: [], status: 'open', submissions: [], ...o,
  };
}
const free = (name: string, id: string) => newFreeProject(name, PROJECT_FORMATS[0].format, t0, id);
function oldState(): AppState {
  return {
    version: 1, installId: 'x', createdAt: t0, schedule: { nextIssueAt: t0, nextNumber: 3, vacations: [] },
    assignments: [], evaluations: [], showreel: [], settings: { theme: 'auto', gemini: { enabled: false, model: null }, devTimeOffsetMs: 0 },
    checklist: {}, research: {},
  };
}

describe('Projektübersicht: Reihenfolge und Texte', () => {
  it('alle Projekte, zuletzt geöffnetes oben; Aufträge nur mit Video-Abgabe', () => {
    const older = { ...free('Alt', 'p-aaaaaa'), openedAt: t0 - 60 * MIN };
    const newer = { ...free('Neu', 'p-bbbbbb'), openedAt: t0 - 5 * MIN };
    const a = assignment('A01', [film], { issuedAt: t0 - 30 * MIN });
    const r = assignment('A02', [research], { issuedAt: t0 });
    const s: AppState = { ...oldState(), assignments: [a, r], projects: [older, newer] };
    const ids = (st: AppState) => projectEntries(st).map((e) => (e.kind === 'free' ? e.project.name : e.assignment.id));
    expect(ids(s)).toEqual(['Neu', 'A01', 'Alt']);
    expect(ids({ ...s, lastOpened: { kind: 'free', id: older.id } })).toEqual(['Alt', 'Neu', 'A01']);
    expect(ids({ ...s, lastOpened: { kind: 'assignment', id: 'A01' } })).toEqual(['A01', 'Neu', 'Alt']);
  });

  it('„zuletzt geöffnet …“', () => {
    const at = Date.parse('2026-11-24T14:05:00+01:00');
    expect(openedText(at, at + 20_000)).toBe('zuletzt geöffnet gerade eben');
    expect(openedText(at, at + 5 * MIN)).toBe('zuletzt geöffnet vor 5 Min.');
    expect(openedText(at, at + 3 * 60 * MIN)).toBe('zuletzt geöffnet heute, 14:05 Uhr');
    expect(openedText(at, at + 24 * 60 * MIN)).toBe('zuletzt geöffnet gestern, 14:05 Uhr');
    expect(openedText(at, at + 5 * 24 * 60 * MIN)).toBe('zuletzt geöffnet am 24.11.2026');
  });
});
