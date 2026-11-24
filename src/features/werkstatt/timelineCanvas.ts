import type { Clip, Frames, Sequence, Track, TrackId } from '../../domain/timeline/types';

/**
 * Timeline-Geometrie und -Zeichnung ohne React: Bild ↔ x, Spur ↔ y, Treffer auf Clips/Ränder/Schnitte,
 * Einrasten und Zoom. Alles in CSS-Pixeln relativ zur Zeichenfläche (Spurköpfe liegen als DOM daneben).
 * Nichts hier wird animiert: Abspielkopf, Schnitte und Trimmen springen.
 */

export const RULER_H = 28;
export const ROW_H = { video: 44, audio: 36 } as const;
/** Standard-Zoom: 80 px je Sekunde. */
export const DEFAULT_PX_PER_SEC = 80;
export const MIN_PX_PER_SEC = 2;
export const MAX_PX_PER_SEC = 2000;
/** Greifbreite eines Trimm-Griffs. */
export const EDGE_PX = 6;
/** Einrast-Schwelle in Pixeln (in Bilder umgerechnet über `snapThreshold`). */
export const SNAP_PX = 8;
const DISPLAY_ORDER = ['V2', 'V1', 'A1', 'A2', 'A3', 'A4'];

export type View = { pxPerFrame: number; scroll: Frames };
export type Row = { trackId: TrackId; name: Track['name']; kind: Track['kind']; y: number; h: number; locked: boolean; muted: boolean };
export type Hit =
  | { area: 'ruler'; frame: Frames }
  | { area: 'clip'; clipId: string; trackId: TrackId; zone: 'body' | 'in' | 'out'; frame: number }
  | { area: 'track'; trackId: TrackId; frame: number }
  | { area: 'none' };

export const viewOf = (pxPerSec: number, fps: number, scroll: Frames): View => ({ pxPerFrame: pxPerSec / fps, scroll });
export const frameToX = (frame: number, v: View): number => (frame - v.scroll) * v.pxPerFrame;
export const xToFrame = (x: number, v: View): number => x / v.pxPerFrame + v.scroll;
export const snapThreshold = (v: View): number => SNAP_PX / v.pxPerFrame;
const clipEnd = (c: Clip): Frames => c.start + c.duration;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Spuren von oben nach unten: V2, V1, A1–A4. */
export function layoutRows(tracks: Track[]): Row[] {
  const rank = (t: Track) => {
    const i = DISPLAY_ORDER.indexOf(t.name);
    return i < 0 ? DISPLAY_ORDER.length : i;
  };
  let y = RULER_H;
  return [...tracks].sort((a, b) => rank(a) - rank(b)).map((t) => {
    const h = ROW_H[t.kind];
    const row: Row = { trackId: t.id, name: t.name, kind: t.kind, y, h, locked: t.locked, muted: t.muted };
    y += h;
    return row;
  });
}

export const rowsHeight = (rows: Row[]): number => (rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].h : RULER_H);

export function rowAtY(rows: Row[], y: number): Row | null {
  return rows.find((r) => y >= r.y && y < r.y + r.h) ?? null;
}

const clipsOn = (seq: Sequence, trackId: TrackId): Clip[] => seq.clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);

/** Was liegt unter (x, y)? Ränder sind höchstens ein Drittel des Clips breit, damit kurze Clips greifbar bleiben. */
export function hitTest(seq: Sequence, rows: Row[], view: View, x: number, y: number): Hit {
  if (y >= 0 && y < RULER_H) return { area: 'ruler', frame: Math.max(0, Math.round(xToFrame(x, view))) };
  const row = rowAtY(rows, y);
  if (!row) return { area: 'none' };
  const frame = xToFrame(x, view);
  const clips = clipsOn(seq, row.trackId);
  const edgeOf = (c: Clip) => Math.min(EDGE_PX, (c.duration * view.pxPerFrame) / 3);
  const inside = clips.find((c) => c.start <= frame && frame < clipEnd(c));
  if (inside) {
    const x0 = frameToX(inside.start, view);
    const x1 = frameToX(clipEnd(inside), view);
    const e = edgeOf(inside);
    const zone = x - x0 <= e ? 'in' : x1 - x <= e ? 'out' : 'body';
    return { area: 'clip', clipId: inside.id, trackId: row.trackId, zone, frame };
  }
  // Knapp neben einem freien Rand greift der Griff ebenfalls.
  for (const c of clips) {
    const dOut = x - frameToX(clipEnd(c), view);
    if (dOut >= 0 && dOut <= EDGE_PX) return { area: 'clip', clipId: c.id, trackId: row.trackId, zone: 'out', frame };
    const dIn = frameToX(c.start, view) - x;
    if (dIn > 0 && dIn <= EDGE_PX) return { area: 'clip', clipId: c.id, trackId: row.trackId, zone: 'in', frame };
  }
  return { area: 'track', trackId: row.trackId, frame };
}

/** Nächster Schnitt zwischen zwei aneinanderstoßenden Clips der Spur innerhalb der Greifbreite (Rollen). */
export function editPointNear(seq: Sequence, trackId: TrackId, x: number, view: View): { leftId: string; rightId: string; frame: Frames } | null {
  const clips = clipsOn(seq, trackId);
  let best: { leftId: string; rightId: string; frame: Frames } | null = null;
  let bestDist = Infinity;
  for (let i = 0; i + 1 < clips.length; i++) {
    const [l, r] = [clips[i], clips[i + 1]];
    if (clipEnd(l) !== r.start) continue;
    const d = Math.abs(frameToX(r.start, view) - x);
    if (d <= EDGE_PX && d < bestDist) {
      best = { leftId: l.id, rightId: r.id, frame: r.start };
      bestDist = d;
    }
  }
  return best;
}

/** Verschiebung `delta` so anpassen, dass die nächste Kante (`edges + delta`) auf ein Ziel innerhalb der Schwelle fällt. */
export function snapDelta(edges: number[], delta: number, targets: number[], threshold: number): { delta: number; at: number | null } {
  let best: { delta: number; at: number | null } = { delta, at: null };
  let bestDist = Infinity;
  for (const e of edges) {
    for (const t of targets) {
      const d = t - (e + delta);
      if (Math.abs(d) <= threshold && Math.abs(d) < bestDist) {
        best = { delta: delta + d, at: t };
        bestDist = Math.abs(d);
      }
    }
  }
  return best;
}

/** Abstand der Lineal-Beschriftungen in Bildern (mindestens ~70 px). */
export function rulerStep(pxPerFrame: number, fps: number): Frames {
  const f = Math.max(1, Math.round(fps));
  const steps = [1, 2, 5, 10, f, 2 * f, 5 * f, 10 * f, 15 * f, 30 * f, 60 * f, 120 * f, 300 * f, 600 * f, 1800 * f, 3600 * f];
  return steps.find((s) => s * pxPerFrame >= 70) ?? steps[steps.length - 1];
}

/** Zoom, bei dem die ganze Sequenz (mit etwas Rand) in `width` passt. */
export function fitZoom(endFrames: Frames, fps: number, width: number): number {
  if (endFrames <= 0 || width <= 0) return DEFAULT_PX_PER_SEC;
  return clamp((width * 0.95) / (endFrames / fps), MIN_PX_PER_SEC, MAX_PX_PER_SEC);
}

/** Zoomt um `factor` und hält das Bild unter `anchorX` fest. */
export function zoomAround(pxPerSec: number, scroll: Frames, factor: number, anchorX: number, fps: number): { pxPerSec: number; scroll: Frames } {
  const anchor = xToFrame(anchorX, viewOf(pxPerSec, fps, scroll));
  const next = clamp(pxPerSec * factor, MIN_PX_PER_SEC, MAX_PX_PER_SEC);
  return { pxPerSec: next, scroll: Math.max(0, anchor - anchorX / (next / fps)) };
}

// ---------------------------------------------------------------- Zeichnen

export type DrawInput = {
  seq: Sequence;
  rows: Row[];
  view: View;
  width: number;
  height: number;
  playhead: Frames;
  selection: ReadonlySet<string>;
  names: ReadonlyMap<string, string>;
  /** Senkrechte Einrast-Linie (Bild) während eines Zuges. */
  snapAt: Frames | null;
  fontFamily: string;
};

const C = {
  ruler: '#2c2c2e',
  rulerText: '#98989d',
  tick: '#48484a',
  rowVideo: '#232326',
  rowAudio: '#202022',
  line: '#38383a',
  video: '#45526b',
  audio: '#3d5a4c',
  title: '#5a4d78',
  clipLine: 'rgba(255,255,255,0.16)',
  clipText: '#f5f5f7',
  level: '#d1d1d6',
  accent: '#7aa2ff',
  marker: '#ffd60a',
  inOut: 'rgba(122,162,255,0.28)',
  outside: 'rgba(0,0,0,0.28)',
  transition: 'rgba(245,245,247,0.22)',
  snap: '#f5f5f7',
  hatch: 'rgba(255,255,255,0.07)',
};

const pad2 = (n: number) => String(n).padStart(2, '0');
/** Lineal: `MM:SS:FF` (Stunden nur ab 1 h). */
export function rulerLabel(frame: Frames, fps: number): string {
  const f = Math.max(1, Math.round(fps));
  const secs = Math.floor(frame / f);
  const h = Math.floor(secs / 3600);
  const body = `${pad2(Math.floor(secs / 60) % 60)}:${pad2(secs % 60)}:${pad2(frame % f)}`;
  return h > 0 ? `${pad2(h)}:${body}` : body;
}

function drawRuler(ctx: CanvasRenderingContext2D, d: DrawInput): void {
  const { seq, view, width } = d;
  ctx.fillStyle = C.ruler;
  ctx.fillRect(0, 0, width, RULER_H);
  if (seq.inPoint !== null || seq.outPoint !== null) {
    const a = frameToX(seq.inPoint ?? 0, view);
    const b = seq.outPoint !== null ? frameToX(seq.outPoint, view) : width;
    ctx.fillStyle = C.inOut;
    ctx.fillRect(a, 0, Math.max(0, b - a), RULER_H);
  }
  const step = rulerStep(view.pxPerFrame, seq.fps);
  const minor = step >= 5 ? step / 5 : step;
  const first = Math.max(0, Math.floor(view.scroll / minor) * minor);
  ctx.font = `12px ${d.fontFamily}`;
  ctx.textBaseline = 'middle';
  for (let f = first; frameToX(f, view) <= width; f += minor) {
    const x = Math.round(frameToX(f, view)) + 0.5;
    const major = Math.abs(f / step - Math.round(f / step)) < 1e-6;
    ctx.fillStyle = C.tick;
    ctx.fillRect(x - 0.5, major ? 14 : 21, 1, major ? 14 : 7);
    if (major) {
      ctx.fillStyle = C.rulerText;
      ctx.fillText(rulerLabel(Math.round(f), seq.fps), x + 4, 8);
    }
  }
  for (const m of seq.markers) {
    const x = frameToX(m.frame, view);
    ctx.fillStyle = C.marker;
    ctx.beginPath();
    ctx.moveTo(x - 5, 14);
    ctx.lineTo(x + 5, 14);
    ctx.lineTo(x, 22);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = C.line;
  ctx.fillRect(0, RULER_H - 1, width, 1);
}

function drawClip(ctx: CanvasRenderingContext2D, d: DrawInput, row: Row, c: Clip): void {
  const x0 = frameToX(c.start, d.view);
  const x1 = frameToX(clipEnd(c), d.view);
  if (x1 < 0 || x0 > d.width) return;
  const y = row.y + 3;
  const h = row.h - 6;
  const w = Math.max(1, x1 - x0);
  ctx.save();
  if (row.muted) ctx.globalAlpha = 0.45;
  ctx.fillStyle = c.kind === 'title' ? C.title : row.kind === 'video' ? C.video : C.audio;
  ctx.fillRect(x0, y, w, h);
  ctx.beginPath();
  ctx.rect(x0, y, w, h);
  ctx.clip();
  ctx.fillStyle = C.clipLine;
  ctx.fillRect(x0, y, w, 1);
  if (row.kind === 'audio') {
    // Pegel als Linie (−60…+12 dB), Blenden als Rampen
    const level = y + h - 4 - ((clamp(c.gainDb, -60, 12) + 60) / 72) * (h - 18);
    const fin = c.fadeIn * d.view.pxPerFrame;
    const fout = c.fadeOut * d.view.pxPerFrame;
    ctx.strokeStyle = C.level;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, fin > 0 ? y + h - 2 : level);
    ctx.lineTo(x0 + fin, level);
    ctx.lineTo(x1 - fout, level);
    ctx.lineTo(x1, fout > 0 ? y + h - 2 : level);
    ctx.stroke();
  }
  if (w > 24) {
    const name = c.kind === 'title' ? c.title?.line1 || 'Titel' : (c.mediaId && d.names.get(c.mediaId)) || 'Clip';
    ctx.font = `12px ${d.fontFamily}`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = C.clipText;
    ctx.fillText(name, x0 + 6, y + 4);
  }
  ctx.restore();
  if (d.selection.has(c.id)) {
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 + 1, y + 1, Math.max(0, w - 2), h - 2);
  }
}

function drawRows(ctx: CanvasRenderingContext2D, d: DrawInput): void {
  for (const row of d.rows) {
    ctx.fillStyle = row.kind === 'video' ? C.rowVideo : C.rowAudio;
    ctx.fillRect(0, row.y, d.width, row.h);
    for (const c of d.seq.clips) if (c.trackId === row.trackId) drawClip(ctx, d, row, c);
    for (const t of d.seq.transitions) {
      if (t.trackId !== row.trackId) continue;
      const r = d.seq.clips.find((c) => c.id === t.rightClipId);
      if (!r) continue;
      const a = frameToX(r.start - t.duration / 2, d.view);
      const b = frameToX(r.start + t.duration / 2, d.view);
      ctx.fillStyle = C.transition;
      ctx.fillRect(a, row.y + 3, b - a, row.h - 6);
      ctx.strokeStyle = C.clipText;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a, row.y + row.h - 4);
      ctx.lineTo(b, row.y + 4);
      ctx.stroke();
    }
    if (row.locked) {
      ctx.strokeStyle = C.hatch;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -row.h; x < d.width; x += 10) {
        ctx.moveTo(x, row.y + row.h);
        ctx.lineTo(x + row.h, row.y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = C.line;
    ctx.fillRect(0, row.y + row.h - 1, d.width, 1);
  }
}

/** Ganze Timeline zeichnen (Lineal, Spuren, Clips, In/Out, Marker, Abspielkopf, Einrast-Linie). */
export function drawTimeline(ctx: CanvasRenderingContext2D, d: DrawInput): void {
  ctx.clearRect(0, 0, d.width, d.height);
  drawRuler(ctx, d);
  drawRows(ctx, d);
  const { inPoint, outPoint } = d.seq;
  const bottom = rowsHeight(d.rows);
  if (inPoint !== null || outPoint !== null) {
    ctx.fillStyle = C.outside;
    const a = frameToX(inPoint ?? 0, d.view);
    if (a > 0) ctx.fillRect(0, RULER_H, a, bottom - RULER_H);
    if (outPoint !== null) {
      const b = frameToX(outPoint, d.view);
      if (b < d.width) ctx.fillRect(b, RULER_H, d.width - b, bottom - RULER_H);
    }
  }
  if (d.snapAt !== null) {
    const x = Math.round(frameToX(d.snapAt, d.view)) + 0.5;
    ctx.strokeStyle = C.snap;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const px = Math.round(frameToX(d.playhead, d.view));
  ctx.fillStyle = C.accent;
  ctx.fillRect(px, 0, 1, bottom);
  ctx.beginPath();
  ctx.moveTo(px - 6, 0);
  ctx.lineTo(px + 7, 0);
  ctx.lineTo(px + 0.5, 10);
  ctx.closePath();
  ctx.fill();
}
