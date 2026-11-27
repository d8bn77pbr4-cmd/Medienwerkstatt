import type { Backend } from '../../backend/Backend';
import { resolveFrame, type ResolvedAudio } from '../../domain/timeline/resolve';
import { DEFAULT_TRACKS, newSequence } from '../../domain/timeline/sequence';
import type { Clip, MediaItem, Sequence } from '../../domain/timeline/types';
import { CanvasPreview, createPreview, IDLE_MS, type DrawList, type Preview, type TexSource } from './glPreview';
import { assignSlots, Pool } from './pool';

/** Höchstes Abspieltempo (J/K/L: 1, 2, 4, 8). */
export const MAX_RATE = 8;
/** Ab diesem Tempo wird der Ton stummgeschaltet. */
export const MAX_AUDIO_RATE = 2;
/** Breite des Programm-Canvas höchstens (Vorschau, nicht Export). */
const MAX_CANVAS_WIDTH = 1280;

/** J (−1) / L (+1): gleiche Richtung verdoppelt das Tempo bis 8×, Richtungswechsel beginnt bei ±1. */
export function nextRate(current: number, dir: 1 | -1): number {
  if (Math.sign(current) === dir) return dir * Math.min(MAX_RATE, Math.abs(current) * 2);
  return dir;
}

export const sequenceEnd = (seq: Sequence): number => Math.max(0, ...seq.clips.map((c) => c.start + c.duration));

type AudioNode_ = { el: HTMLAudioElement; gain: GainNode | null; source: MediaElementAudioSourceNode | null };

/** Prüfintervall für Aufräumen der Zwischenspeicher während der Wiedergabe (ms). */
const PRUNE_EVERY_MS = 5000;

function releaseVideo(el: TexSource): void {
  if (el instanceof HTMLVideoElement) {
    el.pause();
    el.removeAttribute('src');
    el.load();
  } else {
    el.removeAttribute('src');
  }
}

function releaseAudio(a: AudioNode_): void {
  a.el.pause();
  a.el.removeAttribute('src');
  a.el.load();
  a.source?.disconnect();
  a.gain?.disconnect();
}
export type FrameListener = (frame: number) => void;

/**
 * Wiedergabe-Motor: Zeitgeber, ein stummes `<video>` je Medium, Ton über `HTMLAudioElement` →
 * WebAudio-`GainNode` je Clip. Was zu sehen/hören ist, entscheidet allein `resolveFrame`.
 * Enthält kein React.
 */
export class PlaybackEngine {
  private preview: Preview;
  private listeners = new Set<FrameListener>();
  private pos = 0;
  private _rate = 0;
  private lastT = 0;
  private stopAt = 0;
  private raf = 0;
  private videos = new Pool<TexSource>((url) => this.createVideoOrImage(url), releaseVideo);
  private audios = new Pool<AudioNode_>((url) => this.createAudio(url), releaseAudio);
  private slotOf = new Map<string, { mediaId: string; slot: number }>();
  private pendingKind: 'video' | 'image' = 'video';
  private lastClips: unknown = null;
  private lastPrune = 0;
  private _canvas: HTMLCanvasElement;
  private canvasListeners = new Set<() => void>();
  private _blocked = false;
  private audioCtx: AudioContext | null = null;
  /** Ein gemeinsamer Summenknoten mit Analyser (Pegelanzeige); alle Clip-Gains laufen hier hinein. */
  private master: { gain: GainNode; analyser: AnalyserNode } | null = null;
  private disposed = false;

  constructor(
    private backend: Backend,
    private getSeq: () => Sequence,
    private getMedia: () => MediaItem[],
    canvas: HTMLCanvasElement,
  ) {
    this._canvas = canvas;
    this.syncSize(getSeq());
    this.preview = createPreview(canvas);
    this.preview.onUnrecoverable = () => this.fallbackToCanvas2d();
    this.preview.onRestored = () => this.invalidate();
  }

  /** Aktuelle Zeichenfläche (wechselt nur, wenn WebGL endgültig ausfällt: dann `onCanvasChange`). */
  get canvas(): HTMLCanvasElement {
    return this._canvas;
  }
  onCanvasChange(cb: () => void): () => void {
    this.canvasListeners.add(cb);
    return () => this.canvasListeners.delete(cb);
  }
  /** WebGL-Kontext verloren und nicht zurückgekehrt: neue Zeichenfläche mit Canvas 2D (ohne Farbkorrektur). */
  private fallbackToCanvas2d(): void {
    if (this.disposed) return;
    const old = this._canvas;
    const fresh = document.createElement('canvas');
    fresh.width = old.width;
    fresh.height = old.height;
    fresh.className = old.className;
    for (const a of ['role', 'aria-label']) {
      const v = old.getAttribute(a);
      if (v !== null) fresh.setAttribute(a, v);
    }
    this.preview.dispose();
    this._canvas = fresh;
    this.preview = new CanvasPreview(fresh);
    for (const cb of this.canvasListeners) cb();
    this.invalidate();
  }
  /** Eine Medienquelle darf nicht gezeichnet/gelesen werden (CORS); die Oberfläche zeigt einen Hinweis. */
  get blocked(): boolean {
    return this._blocked || this.preview.blocked;
  }
  markBlocked(): void {
    this._blocked = true;
    this.invalidate();
  }

  // ---- Zustand ----
  /** Aktuelles Bild (ganzzahlig). */
  get frame(): number {
    return Math.max(0, Math.floor(this.pos + 1e-6));
  }
  get rate(): number {
    return this._rate;
  }
  get isPlaying(): boolean {
    return this._rate !== 0;
  }
  /** `false`, wenn nur Canvas 2D ohne Farbkorrektur zur Verfügung steht. */
  get colorSupported(): boolean {
    return this.preview.colorSupported;
  }

  onFrame(cb: FrameListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // ---- Steuerung ----
  /**
   * J/K/L: `play(1)` = L, `play(-1)` = J, `play(0)` = K. Wiederholtes `play(±1)` in derselben
   * Richtung verdoppelt das Tempo (2×, 4×, 8×); andere Werte setzen das Tempo genau.
   */
  play(rate: number): void {
    if (rate === 0) return this.pause();
    this.ensureAudio();
    this.settle(performance.now());
    const next = Math.abs(rate) === 1 ? nextRate(this._rate, rate > 0 ? 1 : -1) : Math.max(-MAX_RATE, Math.min(MAX_RATE, rate));
    const seq = this.getSeq();
    const end = sequenceEnd(seq);
    const out = seq.outPoint;
    this.stopAt = out !== null && this.pos < out ? out : end;
    if (next > 0 && this.pos >= this.stopAt) {
      this.pos = seq.inPoint ?? 0;
      this.stopAt = out !== null && this.pos < out ? out : end;
    }
    this._rate = next;
    this.lastT = Math.max(this.lastT, performance.now());
    this.schedule();
  }

  pause(): void {
    if (this._rate === 0) return;
    this.settle(performance.now());
    this._rate = 0;
    this.invalidate();
  }

  /**
   * Bis `now` mit dem bisherigen Tempo weiterrechnen. Ohne das gehen beim Anhalten/Tempowechsel
   * die Millisekunden seit dem letzten Takt verloren (auf langsamen Rechnern bis zu einem Taktabstand).
   */
  private settle(now: number): void {
    if (this._rate === 0) return;
    this.advance(now, this.getSeq().fps);
  }

  private advance(t: number, fps: number): void {
    const dt = Math.max(0, t - this.lastT) / 1000;
    this.lastT = Math.max(this.lastT, t);
    this.pos += dt * fps * this._rate;
    if (this._rate > 0 && this.pos >= this.stopAt) {
      this.pos = this.stopAt;
      this._rate = 0;
    } else if (this._rate < 0 && this.pos <= 0) {
      this.pos = 0;
      this._rate = 0;
    }
  }

  seek(frame: number): void {
    const end = sequenceEnd(this.getSeq());
    this.pos = Math.max(0, Math.min(end, Math.round(frame)));
    this.lastT = Math.max(this.lastT, performance.now()); // Zeit läuft erst ab dem Sprung weiter
    this.invalidate();
  }

  step(n: number): void {
    this.settle(performance.now());
    const f = this.frame;
    this._rate = 0;
    this.seek(f + n);
  }

  /** Neu zeichnen (z. B. nach Änderung der Zeitleiste oder wenn ein Video `seeked` meldet). */
  invalidate(): void {
    this.schedule();
  }

  dispose(): void {
    this.disposed = true;
    this._rate = 0;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.videos.clear();
    this.audios.clear();
    void this.audioCtx?.close();
    this.audioCtx = null;
    this.master = null;
    this.preview.dispose();
    this.listeners.clear();
    this.canvasListeners.clear();
  }

  // ---- Takt ----
  private schedule(): void {
    if (this.disposed || this.raf) return;
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (t: number): void => {
    this.raf = 0;
    if (this.disposed) return;
    const seq = this.getSeq();
    if (this._rate !== 0) this.advance(t, seq.fps);
    this.render(seq);
    for (const cb of this.listeners) cb(this.frame);
    if (this._rate !== 0) this.schedule();
  };

  // ---- Bild ----
  private syncSize(seq: Sequence): void {
    const w = Math.max(2, Math.min(seq.width, MAX_CANVAS_WIDTH));
    const h = Math.max(2, Math.round((w * seq.height) / seq.width));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  private createVideoOrImage(url: string): TexSource {
    const wake = () => this.invalidate();
    if (this.pendingKind === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.addEventListener('load', wake);
      img.src = url;
      return img;
    }
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    v.preload = 'auto';
    for (const ev of ['seeked', 'loadeddata', 'canplay']) v.addEventListener(ev, wake);
    v.src = url;
    return v;
  }

  private sourceFor(m: MediaItem, slot: number, now: number): TexSource | null {
    if (m.kind === 'audio') return null;
    this.pendingKind = m.kind === 'image' ? 'image' : 'video';
    return this.videos.get(`${m.id}#${slot}`, this.backend.mediaUrl(m.proxyPath ?? m.path), now);
  }

  private syncVideo(el: HTMLVideoElement, sourceTime: number, fps: number): void {
    if (el.readyState === 0) return;
    const aim = sourceTime + 0.25 / fps; // mitten im Bild, damit Rundung nicht das Vorgängerbild trifft
    const drift = Math.abs(el.currentTime - aim);
    if (this._rate > 0) {
      el.playbackRate = this._rate;
      if (drift > 2 / fps) el.currentTime = aim;
      if (el.paused) void el.play().catch(() => undefined);
    } else {
      if (!el.paused) el.pause();
      if (drift > 0.5 / fps) el.currentTime = aim;
    }
  }

  private render(seq: Sequence): void {
    this.syncSize(seq);
    const media = new Map(this.getMedia().map((m) => [m.id, m]));
    const r = resolveFrame(seq, media, this.frame);
    const now = performance.now();
    const list: DrawList = { layers: [], titles: [] };
    const used = new Set<string>();
    const slots = assignSlots(r.layers, this.slotOf);
    this.slotOf = new Map(r.layers.map((l) => [l.clipId, { mediaId: l.mediaId, slot: slots.get(l.clipId) ?? 0 }]));
    for (const l of r.layers) {
      const m = media.get(l.mediaId);
      const slot = slots.get(l.clipId) ?? 0;
      const el = m ? this.sourceFor(m, slot, now) : null;
      if (!el) continue;
      if (el instanceof HTMLVideoElement) this.syncVideo(el, l.sourceTime, seq.fps);
      used.add(`${l.mediaId}#${slot}`);
      const clip = seq.clips.find((c) => c.id === l.clipId);
      list.layers.push({ source: el, alpha: l.alpha, lutKey: l.lutKey, color: clip?.color ?? null });
    }
    for (const [key, v] of this.videos.entries()) if (!used.has(key) && v.el instanceof HTMLVideoElement && !v.el.paused) v.el.pause();
    for (const t of r.titles) {
      const params = seq.clips.find((c: Clip) => c.id === t.clipId)?.title;
      if (params) list.titles.push({ key: t.clipId, params, alpha: t.alpha });
    }
    this.syncAudio(r.audio, media, seq.fps, now);
    this.preview.draw(list);
    this.maybePrune(seq, media, now);
  }

  /** Zwischenspeicher aufräumen: bei geänderter Zeitleiste und alle paar Sekunden. */
  private maybePrune(seq: Sequence, media: Map<string, MediaItem>, now: number): void {
    if (seq.clips === this.lastClips && now - this.lastPrune < PRUNE_EVERY_MS) return;
    this.lastClips = seq.clips;
    this.lastPrune = now;
    const mediaIds = new Set(seq.clips.flatMap((c) => (c.mediaId && media.has(c.mediaId) ? [c.mediaId] : [])));
    const clipIds = new Set(seq.clips.map((c) => c.id));
    this.videos.prune((key) => mediaIds.has(key.slice(0, key.lastIndexOf('#'))), now, IDLE_MS);
    this.audios.prune((clipId) => clipIds.has(clipId), now, IDLE_MS);
    this.preview.prune(new Set(seq.clips.filter((c) => c.kind === 'title').map((c) => c.id)), now);
  }

  // ---- Ton ----
  /** AudioContext erst bei der ersten Bedienung (Autoplay-Regeln); beim Abspielen fortsetzen. */
  private ensureAudio(): void {
    if (!this.audioCtx && typeof AudioContext !== 'undefined') {
      try {
        this.audioCtx = new AudioContext();
      } catch {
        this.audioCtx = null;
      }
    }
    if (this.audioCtx && !this.master) {
      const gain = this.audioCtx.createGain();
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      gain.connect(analyser).connect(this.audioCtx.destination);
      this.master = { gain, analyser };
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') void this.audioCtx.resume().catch(() => undefined);
  }

  /** Analyser der Summe (nach allen Clip-Pegeln), sobald WebAudio läuft; sonst `null`. */
  get analyser(): AnalyserNode | null {
    return this.master?.analyser ?? null;
  }

  private createAudio(url: string): AudioNode_ {
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.src = url;
    let gain: GainNode | null = null;
    let source: MediaElementAudioSourceNode | null = null;
    if (this.audioCtx) {
      gain = this.audioCtx.createGain();
      gain.gain.value = 0;
      source = this.audioCtx.createMediaElementSource(el);
      source.connect(gain).connect(this.master?.gain ?? this.audioCtx.destination);
    }
    return { el, gain, source };
  }

  private audioFor(clipId: string, m: MediaItem, now: number): AudioNode_ {
    return this.audios.get(clipId, this.backend.mediaUrl(m.proxyPath ?? m.path), now);
  }

  private syncAudio(entries: ResolvedAudio[], media: Map<string, MediaItem>, fps: number, now: number): void {
    const audible = this._rate > 0 && this._rate <= MAX_AUDIO_RATE;
    const active = new Set<string>();
    if (audible) {
      for (const a of entries) {
        const m = media.get(a.mediaId);
        const node = m ? this.audioFor(a.clipId, m, now) : null;
        if (!node) continue;
        active.add(a.clipId);
        const { el, gain } = node;
        el.playbackRate = this._rate;
        if (Math.abs(el.currentTime - a.sourceTime) > 2 / fps) el.currentTime = a.sourceTime;
        if (el.paused) void el.play().catch(() => undefined);
        if (gain && this.audioCtx) gain.gain.setTargetAtTime(a.gain, this.audioCtx.currentTime, 0.01);
        else el.volume = Math.min(1, a.gain);
      }
    }
    for (const [id, { el: n }] of this.audios.entries()) {
      if (active.has(id)) continue;
      if (!n.el.paused) n.el.pause();
      if (n.gain && this.audioCtx) n.gain.gain.value = 0;
    }
  }
}

// ---- Quell-Monitor ----

const EMPTY_SEQ = newSequence({ width: 1920, height: 1080, fps: 25, name: 'leer' }, () => 'leer');

/** Eine Sequenz mit genau einem Medium (Quell-Monitor); Länge = Dauer des Mediums. */
export function sourceSequence(m: MediaItem): Sequence {
  const fps = m.fps && m.fps > 0 ? m.fps : 25;
  const swap = m.rotation === 90 || m.rotation === 270;
  const [w, h] = m.kind === 'audio' || !m.width || !m.height ? [1920, 1080] : swap ? [m.height, m.width] : [m.width, m.height];
  const duration = Math.max(1, Math.round(m.durationSec * fps));
  const base = { start: 0, duration, sourceIn: 0, linkId: null, gainDb: 0, fadeIn: 0, fadeOut: 0, color: null, title: null, kind: 'media' as const, mediaId: m.id };
  const clips: Clip[] = [];
  if (m.kind !== 'audio') clips.push({ ...base, id: 'src-v', trackId: 'V1' });
  if (m.hasAudio && m.kind !== 'image') clips.push({ ...base, id: 'src-a', trackId: 'A1' });
  return { id: 'src', name: m.name, width: w, height: h, fps, tracks: DEFAULT_TRACKS.map((t) => ({ ...t })), clips, transitions: [], markers: [], inPoint: null, outPoint: null };
}

type SourceHolder = { seq: Sequence | null; item: MediaItem | null };

/**
 * Wiedergabe eines einzelnen Mediums mit eigenen Ein-/Ausmarken. Task 12 liest `inPoint`/`outPoint`
 * für „Einfügen“ (insertEdit). Gleiche Steuerung und Takt wie `PlaybackEngine`.
 */
export class SourceEngine extends PlaybackEngine {
  private holder: SourceHolder;

  constructor(backend: Backend, canvas: HTMLCanvasElement, holder: SourceHolder = { seq: null, item: null }) {
    super(backend, () => holder.seq ?? EMPTY_SEQ, () => (holder.item ? [holder.item] : []), canvas);
    this.holder = holder;
  }

  get item(): MediaItem | null {
    return this.holder.item;
  }
  get fps(): number {
    return this.holder.seq?.fps ?? 25;
  }
  get inPoint(): number | null {
    return this.holder.seq?.inPoint ?? null;
  }
  get outPoint(): number | null {
    return this.holder.seq?.outPoint ?? null;
  }
  get length(): number {
    return this.holder.seq ? sequenceEnd(this.holder.seq) : 0;
  }

  load(item: MediaItem | null): void {
    this.pause();
    this.holder.item = item;
    this.holder.seq = item ? sourceSequence(item) : null;
    this.seek(0);
  }
  setIn(frame: number | null = this.frame): void {
    if (this.holder.seq) this.holder.seq.inPoint = frame;
    this.invalidate();
  }
  setOut(frame: number | null = this.frame): void {
    if (this.holder.seq) this.holder.seq.outPoint = frame;
    this.invalidate();
  }
}
