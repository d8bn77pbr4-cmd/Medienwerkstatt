import { useEffect, useRef, useState } from 'react';
import type { PlaybackEngine } from './playback';
import { lumaScopes, type LumaScopes } from './scopesMath';
import './monitor.css';

const SRC_W = 160;
const INTERVAL_MS = 100;
const WAVE = { w: 320, h: 200 };
const HIST = { w: 256, h: 100 };
const LINE = '#48484a';
const LABEL = '#98989d';
const TRACE = [122, 162, 255]; // --accent (Werkstatt)

function drawWaveform(c: HTMLCanvasElement, s: LumaScopes | null): void {
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, WAVE.w, WAVE.h);
  if (s) {
    const colW = WAVE.w / s.width;
    for (let x = 0; x < s.width; x++) {
      for (let l = 0; l < 256; l++) {
        const n = s.columns[x * 256 + l];
        if (n === 0) continue;
        const a = Math.min(1, 0.25 + Math.sqrt(n / s.maxColumn));
        ctx.fillStyle = `rgba(${TRACE[0]}, ${TRACE[1]}, ${TRACE[2]}, ${a.toFixed(2)})`;
        ctx.fillRect(x * colW, (1 - l / 255) * (WAVE.h - 1), colW, 1.5);
      }
    }
  }
  ctx.font = '12px -apple-system, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  for (const pct of [0, 50, 100]) {
    const y = Math.min(WAVE.h - 0.5, Math.max(0.5, (1 - pct / 100) * WAVE.h));
    ctx.fillStyle = LINE;
    ctx.fillRect(0, Math.round(y), WAVE.w, 1);
    ctx.fillStyle = LABEL;
    ctx.fillText(`${pct} %`, 4, Math.min(WAVE.h - 8, Math.max(8, y - 8)));
  }
}

function drawHistogram(c: HTMLCanvasElement, s: LumaScopes | null): void {
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, HIST.w, HIST.h);
  if (s && s.maxBin > 0) {
    ctx.fillStyle = '#d1d1d6';
    for (let i = 0; i < 256; i++) {
      const h = Math.round((s.histogram[i] / s.maxBin) * (HIST.h - 2));
      if (h > 0) ctx.fillRect(i, HIST.h - h, 1, h);
    }
  }
  ctx.fillStyle = LINE;
  for (const x of [0, 128, 255]) ctx.fillRect(x, 0, 1, HIST.h);
}

/** Luma-Waveform und Histogramm des Programm-Canvas, 160 px breit heruntergerechnet, alle 100 ms. */
export function Scopes({ engine }: { engine: PlaybackEngine }) {
  const wave = useRef<HTMLCanvasElement>(null);
  const hist = useRef<HTMLCanvasElement>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    setBlocked(false);
    let stopped = false;
    const small = document.createElement('canvas');
    const sctx = small.getContext('2d', { willReadFrequently: true });
    let id = 0;
    const tick = () => {
      const src = engine.canvas;
      let s: LumaScopes | null = null;
      if (sctx && src.width > 0 && src.height > 0) {
        try {
          small.width = SRC_W;
          small.height = Math.max(1, Math.round((SRC_W * src.height) / src.width));
          sctx.drawImage(src, 0, 0, small.width, small.height);
          s = lumaScopes(sctx.getImageData(0, 0, small.width, small.height).data, small.width, small.height);
        } catch (e) {
          // Cross-Origin-Quelle ohne Freigabe: Canvas ist „tainted“. Nicht alle 100 ms erneut werfen.
          if (e instanceof DOMException && e.name === 'SecurityError') {
            stopped = true;
            window.clearInterval(id);
            engine.markBlocked();
            setBlocked(true);
            return;
          }
          throw e;
        }
      }
      if (wave.current) drawWaveform(wave.current, s);
      if (hist.current) drawHistogram(hist.current, s);
    };
    tick();
    if (!stopped) id = window.setInterval(tick, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [engine]);

  return (
    <section className="scopes" aria-label="Scopes">
      <figure>
        <figcaption>Waveform (Luma)</figcaption>
        <canvas ref={wave} width={WAVE.w} height={WAVE.h} role="img" aria-label="Waveform (Luma)" data-testid="scope-waveform" />
      </figure>
      <figure>
        <figcaption>Histogramm</figcaption>
        <canvas ref={hist} width={HIST.w} height={HIST.h} role="img" aria-label="Histogramm" data-testid="scope-histogram" />
      </figure>
      {blocked && (
        <p className="scopes-hint" role="status">
          Vorschau blockiert: Medienquelle nicht freigegeben
        </p>
      )}
    </section>
  );
}
