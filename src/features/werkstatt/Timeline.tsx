import { Eye, EyeOff, Lock, LockOpen, Maximize2, Volume2, VolumeX, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Clip, Sequence, Track } from '../../domain/timeline/types';
import { useProject } from '../../state/projectStore';
import { COMMANDS, type CommandCtx } from './commands';
import { tooltipFor } from './keymap';
import type { PlaybackEngine } from './playback';
import { formatTimecode } from './timecode';
import { drawTimeline, frameToX, layoutRows, rowsHeight, viewOf, zoomAround, type Row } from './timelineCanvas';
import { useWerkstatt } from './uiStore';
import { useTimelinePointer, withPartners, type Preview } from './useTimelinePointer';

const seqEnd = (s: Sequence) => Math.max(0, ...s.clips.map((c) => c.start + c.duration));
const setTrack = (s: Sequence, id: string, patch: Partial<Track>): Sequence => ({ ...s, tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });

/** Beschriftung eines Clips in der zugänglichen Liste. */
export function clipLabel(c: Clip, track: string, names: ReadonlyMap<string, string>, fps: number): string {
  const name = c.kind === 'title' ? `Titel „${c.title?.line1 || 'Titel'}“` : (c.mediaId && names.get(c.mediaId)) || 'Clip';
  return `${track} · ${name} · ${formatTimecode(c.start, fps)} bis ${formatTimecode(c.start + c.duration, fps)}`;
}

type Props = { engine: PlaybackEngine; ctx: CommandCtx };

/** Timeline: Spurköpfe (DOM), Canvas-Zeichnung, zugängliche Clip-Liste. Abspielkopf und Schnitte springen (keine Animation). */
export function Timeline({ engine, ctx }: Props) {
  const seq = useProject((s) => s.seq)!;
  const media = useProject((s) => s.project?.media);
  const apply = useProject((s) => s.apply);
  const selection = useWerkstatt((s) => s.selection);
  const targets = useWerkstatt((s) => s.targets);
  const pxPerSec = useWerkstatt((s) => s.pxPerSec);
  const scroll = useWerkstatt((s) => s.scroll);
  const notice = useWerkstatt((s) => s.notice);
  const [width, setWidth] = useState(0);
  const [preview, setPreview] = useState<Preview>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const playhead = useRef(engine.frame);
  const space = useRef(false);
  const raf = useRef(0);

  const names = useMemo(() => new Map((media ?? []).map((m) => [m.id, m.name])), [media]);
  const shown = preview?.seq ?? seq;
  const rows = useMemo(() => layoutRows(shown.tracks), [shown.tracks]);
  const view = useMemo(() => viewOf(pxPerSec, seq.fps, scroll), [pxPerSec, seq.fps, scroll]);
  const height = rowsHeight(rows);
  const latest = useRef({ shown, rows, view, width, height, selection, snapAt: preview?.snapAt ?? null, names, seq });
  latest.current = { shown, rows, view, width, height, selection, snapAt: preview?.snapAt ?? null, names, seq };

  const draw = useCallback(() => {
    raf.current = 0;
    const c = canvas.current;
    const l = latest.current;
    if (!c || l.width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const [w, h] = [Math.round(l.width * dpr), Math.round(l.height * dpr)];
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTimeline(g, {
      seq: l.shown, rows: l.rows, view: l.view, width: l.width, height: l.height, playhead: playhead.current,
      selection: new Set(l.selection), names: l.names, snapAt: l.snapAt, fontFamily: getComputedStyle(c).fontFamily,
    });
  }, []);
  const requestDraw = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(draw);
  }, [draw]);
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    },
    [],
  );

  useEffect(requestDraw, [requestDraw, shown, rows, view, width, selection, preview, names]);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const w = Math.floor(el.clientWidth);
      setWidth(w);
      useWerkstatt.getState().setTimelineWidth(w);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Abspielkopf: zeichnen, bei Wiedergabe seitenweise mitlaufen (springt, gleitet nicht).
  useEffect(
    () =>
      engine.onFrame((f) => {
        playhead.current = f;
        const l = latest.current;
        if (engine.isPlaying && l.width > 0 && frameToX(f, l.view) > l.width - 16) useWerkstatt.getState().setScroll(f);
        requestDraw();
      }),
    [engine, requestDraw],
  );

  // Leertaste gedrückt halten + ziehen = Hand.
  useEffect(() => {
    const down = (e: KeyboardEvent) => e.key === ' ' && (space.current = true);
    const up = (e: KeyboardEvent) => e.key === ' ' && (space.current = false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Mausrad: waagerecht blättern, mit ⌘/Strg um den Zeiger zoomen.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const ui = useWerkstatt.getState();
      const fps = latest.current.seq.fps;
      if (e.metaKey || e.ctrlKey) {
        const z = zoomAround(ui.pxPerSec, ui.scroll, e.deltaY < 0 ? 1.25 : 0.8, e.clientX - c.getBoundingClientRect().left, fps);
        ui.setZoom(z.pxPerSec, z.scroll);
      } else {
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        ui.setScroll(ui.scroll + d / (ui.pxPerSec / fps));
      }
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, []);

  const pointer = useTimelinePointer(
    () => ({ seq: latest.current.seq, rows: latest.current.rows, view: latest.current.view, playhead: playhead.current }),
    (f) => {
      engine.pause();
      engine.seek(f);
    },
    setPreview,
    () => space.current,
  );

  const listed = useMemo(() => {
    const order = new Map(rows.map((r, i) => [r.trackId, i]));
    return [...seq.clips].sort((a, b) => (order.get(a.trackId) ?? 0) - (order.get(b.trackId) ?? 0) || a.start - b.start);
  }, [seq.clips, rows]);
  const trackName = (id: string) => seq.tracks.find((t) => t.id === id)?.name ?? id;

  return (
    <section className="tl" aria-labelledby="tl-h">
      <div className="tl-bar">
        <h2 id="tl-h" className="ws-h">Timeline</h2>
        <span className="tl-seq">{seq.name}</span>
        <span className="tl-len">
          Länge <span className="tc" data-testid="seq-length">{formatTimecode(seqEnd(seq), seq.fps)}</span>
        </span>
        {notice && (
          <p className="tl-notice" role="status">
            {notice}
          </p>
        )}
        <span className="tl-zoom">
          <button type="button" className="icon-btn" aria-label="Herauszoomen" title={tooltipFor('zoom.out')} onClick={() => COMMANDS['zoom.out'](ctx)}>
            <ZoomOut aria-hidden="true" />
          </button>
          <button type="button" className="icon-btn" aria-label="Hineinzoomen" title={tooltipFor('zoom.in')} onClick={() => COMMANDS['zoom.in'](ctx)}>
            <ZoomIn aria-hidden="true" />
          </button>
          <button type="button" className="icon-btn" aria-label="Ganze Sequenz zeigen" title={tooltipFor('zoom.fit')} onClick={() => COMMANDS['zoom.fit'](ctx)}>
            <Maximize2 aria-hidden="true" />
          </button>
        </span>
      </div>
      <div className="tl-body">
        <div className="tl-heads" style={{ paddingTop: rows[0]?.y ?? 0 }}>
          {rows.map((r) => (
            <TrackHead key={r.trackId} row={r} target={targets[r.kind] === r.trackId} onChange={(patch) => apply((s) => setTrack(s, r.trackId, patch))} />
          ))}
        </div>
        <div className="tl-canvas" ref={wrap}>
          <canvas
            ref={canvas}
            data-testid="timeline-canvas"
            aria-hidden="true"
            style={{ width: `${width}px`, height: `${height}px` }}
            {...pointer}
          />
        </div>
      </div>
      <ul className="tl-clips" aria-label="Clips in der Timeline">
        {listed.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              aria-pressed={selection.includes(c.id)}
              onClick={(e) => {
                const ids = withPartners(seq, c.id, e.altKey);
                useWerkstatt.getState().select(ids, e.shiftKey ? 'add' : 'replace');
              }}
            >
              {clipLabel(c, trackName(c.trackId), names, seq.fps)}
            </button>
          </li>
        ))}
        {listed.length === 0 && <li>Noch keine Clips. Lade einen Clip in die Quelle und füge ihn mit „,“ ein.</li>}
      </ul>
    </section>
  );
}

function TrackHead({ row, target, onChange }: { row: Row; target: boolean; onChange(p: Partial<Track>): void }) {
  const setTarget = useWerkstatt((s) => s.setTarget);
  const video = row.kind === 'video';
  return (
    <div className={`tl-head${target ? ' is-target' : ''}`} style={{ height: row.h }}>
      <span className="tl-name">{row.name}</span>
      <button
        type="button"
        className="tl-target"
        aria-pressed={target}
        aria-label={`Ziel ${row.name}`}
        title="Zielspur für Einfügen (,) und Überschreiben (.)"
        onClick={() => setTarget(row.kind, row.trackId)}
      >
        Ziel
      </button>
      <button type="button" className="tl-toggle" aria-pressed={row.locked} aria-label={`${row.name} sperren`} title="Spur sperren" onClick={() => onChange({ locked: !row.locked })}>
        {row.locked ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}
      </button>
      <button
        type="button"
        className="tl-toggle"
        aria-pressed={row.muted}
        aria-label={video ? `${row.name} ausblenden` : `${row.name} stummschalten`}
        title={video ? 'Spur ausblenden (auch im Export)' : 'Spur stummschalten'}
        onClick={() => onChange({ muted: !row.muted })}
      >
        {video ? row.muted ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" /> : row.muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
      </button>
    </div>
  );
}
