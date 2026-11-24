import {
  addEditAll,
  addTransition,
  insertEdit,
  liftDelete,
  rippleDelete,
  rippleTrimToPlayhead,
  toggleLink,
} from '../../domain/timeline/ops';
import type { MediaItem, Sequence, TrackId } from '../../domain/timeline/types';
import { useProject } from '../../state/projectStore';
import type { CommandId } from './keymap';
import { fitZoom } from './timelineCanvas';
import { useWerkstatt, type MonitorId } from './uiStore';

/** Was ein Befehl von einem Monitor braucht (PlaybackEngine erfüllt das). */
export interface Transport {
  readonly frame: number;
  readonly isPlaying: boolean;
  play(rate: number): void;
  pause(): void;
  step(n: number): void;
  seek(frame: number): void;
}
/** Quell-Monitor (SourceEngine). */
export interface SourceTransport extends Transport {
  readonly item: MediaItem | null;
  readonly fps: number;
  readonly inPoint: number | null;
  readonly outPoint: number | null;
  readonly length: number;
  setIn(frame?: number | null): void;
  setOut(frame?: number | null): void;
}
export type CommandCtx = {
  program: Transport | null;
  source: SourceTransport | null;
  /** Monitor, auf den Transport und Ein-/Ausmarken wirken. */
  active: () => MonitorId;
};

export const ZOOM_STEP = 1.5;
/** Standarddauer von Überblendung und Ton-Blende: 1 s. */
const TRANSITION_SEC = 1;
const IMAGE_SEC = 5;

const ui = () => useWerkstatt.getState();
const project = () => useProject.getState();
const seqEnd = (s: Sequence) => Math.max(0, ...s.clips.map((c) => c.start + c.duration));

/** Quelle nur, wenn sie aktiv ist und ein Medium geladen hat; sonst das Programm. */
function transport(ctx: CommandCtx): Transport | null {
  if (ctx.active() === 'source' && ctx.source?.item) return ctx.source;
  return ctx.program;
}

function setMark(ctx: CommandCtx, which: 'in' | 'out'): void {
  if (ctx.active() === 'source' && ctx.source?.item) {
    const s = ctx.source;
    if (which === 'in') {
      s.setIn(s.frame);
      if (s.outPoint !== null && s.outPoint <= s.frame) s.setOut(null);
    } else {
      s.setOut(s.frame);
      if (s.inPoint !== null && s.inPoint >= s.frame) s.setIn(null);
    }
    ui().setSourceMarks({ in: s.inPoint, out: s.outPoint });
    return;
  }
  const f = ctx.program?.frame;
  if (f === undefined) return;
  project().apply((seq) => {
    if (which === 'in') return { ...seq, inPoint: f, outPoint: seq.outPoint !== null && seq.outPoint <= f ? null : seq.outPoint };
    return { ...seq, outPoint: f, inPoint: seq.inPoint !== null && seq.inPoint >= f ? null : seq.inPoint };
  });
}

/** Einfügen (,) / Überschreiben (.) des Quell-Bereichs am Programm-Abspielkopf in die Zielspuren. */
function editFromSource(ctx: CommandCtx, mode: 'insert' | 'overwrite'): void {
  const src = ctx.source;
  const item = src?.item;
  const at = ctx.program?.frame;
  if (!src || !item || at === undefined) return;
  const media = project().project?.media.find((m) => m.id === item.id);
  if (!media) return;
  const fps = src.fps;
  const srcIn = (src.inPoint ?? 0) / fps;
  // Standbilder haben keine eigene Länge: ohne Ausmarke 5 s.
  const fullOut = media.kind === 'image' ? IMAGE_SEC : media.durationSec;
  const srcOut = Math.min(src.outPoint !== null ? src.outPoint / fps : fullOut, media.kind === 'image' ? Infinity : media.durationSec);
  const { targets } = ui();
  let len = 0;
  const done = project().apply((seq) => {
    len = Math.max(1, Math.round((srcOut - srcIn) * seq.fps));
    return insertEdit(seq, media, srcIn, srcOut, at, targets, mode);
  });
  // Wie im Profi-Schnitt: der Abspielkopf steht danach hinter dem eingefügten Stück.
  if (done) ctx.program?.seek(at + len);
}

/** Schnitt auf der Spur, der dem Abspielkopf am nächsten liegt. */
function nearestCut(seq: Sequence, trackId: TrackId, at: number): { leftId: string; rightId: string } | null {
  const clips = seq.clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
  let best: { leftId: string; rightId: string } | null = null;
  let dist = Infinity;
  for (let i = 0; i + 1 < clips.length; i++) {
    const [l, r] = [clips[i], clips[i + 1]];
    if (l.start + l.duration !== r.start) continue;
    const d = Math.abs(r.start - at);
    if (d < dist) {
      dist = d;
      best = { leftId: l.id, rightId: r.id };
    }
  }
  return best;
}

function transition(ctx: CommandCtx, kind: 'video' | 'audio'): void {
  const seq = project().seq;
  const at = ctx.program?.frame;
  if (!seq || at === undefined) return;
  const cut = nearestCut(seq, ui().targets[kind], at);
  if (!cut) return;
  let shortened: number | undefined;
  project().apply((s, media) => {
    const r = addTransition(s, media, cut.leftId, cut.rightId, Math.round(TRANSITION_SEC * s.fps));
    shortened = r.shortenedTo;
    return r.seq;
  });
  if (shortened === 0) ui().showNotice('Kein Überhang am Schnitt: Für eine Blende fehlt Material vor oder nach dem Schnitt.');
  else if (shortened !== undefined) ui().showNotice(`Blende auf ${shortened} Bilder gekürzt (mehr Material ist nicht da).`);
}

function withSelection(fn: (seq: Sequence, ids: string[], media: MediaItem[]) => Sequence, clear = false): void {
  const ids = ui().selection;
  if (!ids.length) return;
  if (project().apply((s, media) => fn(s, ids, media)) && clear) ui().clearSelection();
}

function zoom(factor: number): void {
  const { pxPerSec, setZoom } = ui();
  setZoom(pxPerSec * factor);
}

export const COMMANDS: Record<CommandId, (ctx: CommandCtx) => void> = {
  'tool.select': () => ui().setTool('select'),
  'tool.razor': () => ui().setTool('razor'),
  'tool.ripple': () => ui().setTool('ripple'),
  'tool.roll': () => ui().setTool('roll'),
  'tool.hand': () => ui().setTool('hand'),
  'mark.in': (ctx) => setMark(ctx, 'in'),
  'mark.out': (ctx) => setMark(ctx, 'out'),
  'transport.reverse': (ctx) => transport(ctx)?.play(-1),
  'transport.stop': (ctx) => transport(ctx)?.pause(),
  'transport.forward': (ctx) => transport(ctx)?.play(1),
  'transport.toggle': (ctx) => {
    const t = transport(ctx);
    if (!t) return;
    if (t.isPlaying) t.pause();
    else t.play(1);
  },
  'transport.stepBack': (ctx) => transport(ctx)?.step(-1),
  'transport.stepForward': (ctx) => transport(ctx)?.step(1),
  'transport.stepBack5': (ctx) => transport(ctx)?.step(-5),
  'transport.stepForward5': (ctx) => transport(ctx)?.step(5),
  'edit.insert': (ctx) => editFromSource(ctx, 'insert'),
  'edit.overwrite': (ctx) => editFromSource(ctx, 'overwrite'),
  'edit.addEdit': (ctx) => {
    const at = ctx.program?.frame;
    if (at !== undefined) project().apply((s) => addEditAll(s, at));
  },
  'edit.rippleTrimPrev': (ctx) => {
    const at = ctx.program?.frame;
    if (at === undefined) return;
    const seq = project().seq;
    const head = seq?.clips.find((c) => c.start < at && c.start + c.duration > at)?.start;
    if (project().apply((s, media) => rippleTrimToPlayhead(s, media, at, 'prev')) && head !== undefined) ctx.program?.seek(head);
  },
  'edit.rippleTrimNext': (ctx) => {
    const at = ctx.program?.frame;
    if (at !== undefined) project().apply((s, media) => rippleTrimToPlayhead(s, media, at, 'next'));
  },
  'edit.rippleDelete': () => withSelection((s, ids) => rippleDelete(s, ids), true),
  'edit.lift': () => withSelection((s, ids) => liftDelete(s, ids), true),
  'edit.link': () => withSelection((s, ids) => toggleLink(s, ids)),
  'edit.dissolve': (ctx) => transition(ctx, 'video'),
  'edit.audioFade': (ctx) => transition(ctx, 'audio'),
  'timeline.snap': () => ui().toggleSnapping(),
  'timeline.marker': (ctx) => {
    const f = ctx.program?.frame;
    if (f === undefined) return;
    project().apply((s) => (s.markers.some((m) => m.frame === f) ? s : { ...s, markers: [...s.markers, { frame: f, label: '' }].sort((a, b) => a.frame - b.frame) }));
  },
  'zoom.in': () => zoom(ZOOM_STEP),
  'zoom.out': () => zoom(1 / ZOOM_STEP),
  'zoom.fit': () => {
    const seq = project().seq;
    const { timelineWidth, setZoom } = ui();
    if (seq && timelineWidth > 0) setZoom(fitZoom(seqEnd(seq), seq.fps, timelineWidth), 0);
  },
  'history.undo': () => project().undo(),
  'history.redo': () => project().redo(),
  // Task 13 öffnet hier das Export-Blatt; bis dahin der Sequenz-Bereich (Auflösung/Bildrate).
  'export.open': () => ui().focusPanel('export'),
  'help.shortcuts': () => ui().setShortcutsOpen(!ui().shortcutsOpen),
};
