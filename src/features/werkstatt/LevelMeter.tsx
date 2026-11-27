import { useEffect, useRef } from 'react';
import { LoudnessMeter, formatDb, meanSquare, peakDb } from './meterMath';
import type { PlaybackEngine } from './playback';

const FLOOR_DB = -60;

/**
 * Pegelanzeige der Programm-Summe über den gemeinsamen WebAudio-Analyser: Spitzenpegel (dBFS),
 * Kurzzeit-Lautheit (3 s) und integrierte Lautheit als Näherung. Läuft per rAF und schreibt direkt
 * ins DOM (keine CSS-Übergänge, kein React-Rendern je Bild).
 */
export function LevelMeter({ engine }: { engine: PlaybackEngine }) {
  const bar = useRef<HTMLDivElement>(null);
  const peak = useRef<HTMLSpanElement>(null);
  const short = useRef<HTMLSpanElement>(null);
  const integ = useRef<HTMLSpanElement>(null);
  const meter = useRef(new LoudnessMeter());

  useEffect(() => {
    let raf = 0;
    let buf: Float32Array<ArrayBuffer> | null = null;
    let shown = '';
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const a = engine.analyser;
      let p: number | null = null;
      if (a) {
        if (!buf || buf.length !== a.fftSize) buf = new Float32Array(a.fftSize);
        a.getFloatTimeDomainData(buf);
        p = peakDb(buf);
        if (engine.isPlaying) meter.current.push(meanSquare(buf), performance.now());
      }
      const st = meter.current.shortTerm();
      const it = meter.current.integrated();
      const key = `${p === null ? '' : p.toFixed(1)}|${st?.toFixed(1)}|${it?.toFixed(1)}`;
      if (key === shown) return;
      shown = key;
      const frac = p === null || p === -Infinity ? 0 : Math.min(1, Math.max(0, (p - FLOOR_DB) / -FLOOR_DB));
      if (bar.current) bar.current.style.transform = `scaleX(${frac})`;
      if (peak.current) peak.current.textContent = `${formatDb(p)} dBFS`;
      if (short.current) short.current.textContent = formatDb(st);
      if (integ.current) integ.current.textContent = formatDb(it);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  return (
    <section className="meter" aria-labelledby="meter-h">
      <h2 id="meter-h" className="ws-h">Pegel</h2>
      <div className="meter-track" aria-hidden="true">
        <div className="meter-bar" ref={bar} />
      </div>
      <dl className="meter-values">
        <div>
          <dt>Spitze (Peak)</dt>
          <dd ref={peak}>– dBFS</dd>
        </div>
        <div>
          <dt>Kurzzeit ≈ LUFS (Vorschau)</dt>
          <dd ref={short}>–</dd>
        </div>
        <div>
          <dt>Integriert ≈ LUFS (Vorschau)</dt>
          <dd ref={integ}>–</dd>
        </div>
      </dl>
      <p className="meter-hint">
        Näherung ohne Gehörfilter – genaue Messung beim Export.{' '}
        <button type="button" className="link-btn" onClick={() => meter.current.reset()}>
          Messung zurücksetzen
        </button>
      </p>
    </section>
  );
}

