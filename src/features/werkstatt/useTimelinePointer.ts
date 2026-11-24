import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { moveClips, razor, roll, trim } from '../../domain/timeline/ops';
import { snap, snapTargets } from '../../domain/timeline/snap';
import type { Clip, Frames, Sequence } from '../../domain/timeline/types';
import { useProject } from '../../state/projectStore';
import { editPointNear, hitTest, rowAtY, snapDelta, snapThreshold, xToFrame, type Row, type View } from './timelineCanvas';
import { useWerkstatt } from './uiStore';

/** Ab dieser Zeigerbewegung wird aus einem Klick ein Zug (kein versehentliches Verschieben). */
const DRAG_START_PX = 3;

type Op = (s: Sequence) => Sequence;
type Drag =
  | { kind: 'scrub' }
  | { kind: 'pan'; x0: number; scroll0: number }
  | { kind: 'move'; x0: number; f0: number; ids: string[]; primary: Clip; started: boolean }
  | { kind: 'trim'; f0: number; clip: Clip; edge: 'in' | 'out'; mode: 'normal' | 'ripple' }
  | { kind: 'roll'; f0: number; leftId: string; rightId: string; cut: Frames };

export type Preview = { seq: Sequence; snapAt: Frames | null } | null;
export type Geometry = { seq: Sequence; rows: Row[]; view: View; playhead: Frames };

const end = (c: Clip) => c.start + c.duration;

/** Gewählter Clip samt verknüpften Partnern (außer mit ⌥). */
export function withPartners(seq: Sequence, id: string, ignoreLinks: boolean): string[] {
  const c = seq.clips.find((x) => x.id === id);
  if (!c) return [];
  if (ignoreLinks || !c.linkId) return [c.id];
  // Der angeklickte Clip zuerst: er ist der „primäre“ für den Inspektor.
  return [c.id, ...seq.clips.filter((x) => x.linkId === c.linkId && x.id !== c.id).map((x) => x.id)];
}

/** Ziele ohne die Kanten der bewegten Clips. */
function targetsWithout(seq: Sequence, ids: Set<string>, playhead: Frames): Frames[] {
  return snapTargets({ ...seq, clips: seq.clips.filter((c) => !ids.has(c.id)) }, playhead);
}

/**
 * Zeiger in der Timeline: Lineal scrubbt, Hand/Leertaste verschiebt die Ansicht, Auswahl zieht 1:1 mit
 * Greif-Versatz (Einrasten mit S), Ränder trimmen (V normal, B Ripple, N Rollen), C teilt, ⌥ ignoriert
 * Verknüpfungen. Während des Zuges zeigt eine Vorschau das Ergebnis; erst beim Loslassen entsteht ein Verlaufsschritt.
 */
export function useTimelinePointer(
  geo: () => Geometry,
  seekProgram: (f: Frames) => void,
  setPreview: (p: Preview) => void,
  spaceHeld: () => boolean,
) {
  const drag = useRef<Drag | null>(null);
  const lastOp = useRef<Op | null>(null);

  const local = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const preview = (op: Op, orig: Sequence, snapAt: Frames | null) => {
    lastOp.current = op;
    setPreview({ seq: op(orig), snapAt });
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const ui = useWerkstatt.getState();
    const { seq, rows, view, playhead } = geo();
    const { x, y } = local(e);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    ui.setActiveMonitor('program');
    lastOp.current = null;
    if (ui.tool === 'hand' || spaceHeld()) {
      drag.current = { kind: 'pan', x0: x, scroll0: ui.scroll };
      return;
    }
    const hit = hitTest(seq, rows, view, x, y);
    if (hit.area === 'ruler') {
      drag.current = { kind: 'scrub' };
      seekProgram(hit.frame);
      return;
    }
    if (hit.area !== 'clip') {
      if (hit.area === 'track' && !e.shiftKey) ui.clearSelection();
      drag.current = null;
      return;
    }
    const clip = seq.clips.find((c) => c.id === hit.clipId)!;
    const locked = rows.find((r) => r.trackId === hit.trackId)?.locked ?? false;
    const thr = snapThreshold(view);
    const f = Math.round(hit.frame);
    if (ui.tool === 'razor') {
      if (locked) return;
      const at = ui.snapping ? snap(f, snapTargets(seq, playhead), thr) : f;
      useProject.getState().apply((s) => razor(s, at, [hit.trackId]));
      return;
    }
    if (ui.tool === 'roll' && !locked) {
      const ep = editPointNear(seq, hit.trackId, x, view);
      if (ep) drag.current = { kind: 'roll', f0: hit.frame, leftId: ep.leftId, rightId: ep.rightId, cut: ep.frame };
      return;
    }
    if (hit.zone !== 'body' && !locked && (ui.tool === 'select' || ui.tool === 'ripple')) {
      drag.current = { kind: 'trim', f0: hit.frame, clip, edge: hit.zone, mode: ui.tool === 'ripple' ? 'ripple' : 'normal' };
      return;
    }
    const ids = withPartners(seq, clip.id, e.altKey);
    if (e.shiftKey) ui.select(ids, 'add');
    else if (!ui.selection.includes(clip.id)) ui.select(ids);
    if (ui.tool === 'select' && !locked) {
      drag.current = { kind: 'move', x0: x, f0: hit.frame, ids: useWerkstatt.getState().selection, primary: clip, started: false };
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    const { seq, rows, view, playhead } = geo();
    const { x, y } = local(e);
    const canvas = e.currentTarget;
    if (!d) {
      canvas.style.cursor = cursorFor(geo(), x, y, spaceHeld());
      return;
    }
    const ui = useWerkstatt.getState();
    const thr = ui.snapping ? snapThreshold(view) : -1;
    const frame = xToFrame(x, view);
    const ignoreLinks = e.altKey;
    const media = useProject.getState().project?.media ?? [];
    switch (d.kind) {
      case 'pan':
        ui.setScroll(d.scroll0 - (x - d.x0) / view.pxPerFrame);
        return;
      case 'scrub':
        seekProgram(Math.max(0, Math.round(frame)));
        return;
      case 'move': {
        if (!d.started && Math.abs(x - d.x0) < DRAG_START_PX && rowAtY(rows, y)?.trackId === d.primary.trackId) return;
        d.started = true;
        const moving = new Set(d.ids);
        const s = snapDelta([d.primary.start, end(d.primary)], Math.round(frame - d.f0), targetsWithout(seq, moving, playhead), thr);
        const row = rowAtY(rows, y);
        const same = seq.tracks.filter((t) => t.kind === rows.find((r) => r.trackId === d.primary.trackId)?.kind);
        const from = same.findIndex((t) => t.id === d.primary.trackId);
        const to = row && same.some((t) => t.id === row.trackId) ? same.findIndex((t) => t.id === row.trackId) : from;
        // Spurwechsel nur für Clips der gezogenen Art; verknüpfte Partner folgen zeitlich.
        const kindOf = (id: string) => seq.tracks.find((t) => t.id === seq.clips.find((c) => c.id === id)?.trackId)?.kind;
        const ids = to !== from ? d.ids.filter((id) => kindOf(id) === kindOf(d.primary.id)) : d.ids;
        preview((q) => moveClips(q, ids, s.delta, to - from, { ignoreLinks }), seq, s.at);
        return;
      }
      case 'trim': {
        const edgeAt = d.edge === 'in' ? d.clip.start : end(d.clip);
        const s = snapDelta([edgeAt], Math.round(frame - d.f0), targetsWithout(seq, new Set([d.clip.id]), playhead), thr);
        const { clip, edge, mode } = d;
        preview((q) => trim(q, media, clip.id, edge, s.delta, mode, { ignoreLinks }), seq, s.at);
        return;
      }
      case 'roll': {
        const s = snapDelta([d.cut], Math.round(frame - d.f0), targetsWithout(seq, new Set([d.leftId, d.rightId]), playhead), thr);
        const { leftId, rightId } = d;
        preview((q) => roll(q, media, leftId, rightId, s.delta, { ignoreLinks }), seq, s.at);
        return;
      }
    }
  };

  const finish = (commit: boolean) => {
    const op = lastOp.current;
    drag.current = null;
    lastOp.current = null;
    setPreview(null);
    if (commit && op) useProject.getState().apply((s) => op(s));
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: () => finish(true),
    onPointerCancel: () => finish(false),
  };
}

function cursorFor(g: Geometry, x: number, y: number, space: boolean): string {
  const tool = useWerkstatt.getState().tool;
  if (tool === 'hand' || space) return 'grab';
  const hit = hitTest(g.seq, g.rows, g.view, x, y);
  if (hit.area !== 'clip') return 'default';
  if (tool === 'razor') return 'crosshair';
  if (tool === 'roll') return editPointNear(g.seq, hit.trackId, x, g.view) ? 'col-resize' : 'default';
  if (hit.zone !== 'body' && (tool === 'select' || tool === 'ripple')) return 'ew-resize';
  return 'default';
}
