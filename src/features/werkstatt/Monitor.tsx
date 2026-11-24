import { useEffect, useRef, useState } from 'react';
import type { PlaybackEngine } from './playback';
import { formatTimecode } from './timecode';
import './monitor.css';

export type MonitorProps = {
  engine: PlaybackEngine;
  label: 'Quelle' | 'Programm';
  fps: number;
  inPoint: number | null;
  outPoint: number | null;
  /** Seitenverhältnis des Bildes (Breite / Höhe), Vorgabe 16:9. */
  aspect?: number;
  /** Zusatz neben der Bezeichnung, z. B. der Name des Mediums in der Quelle. */
  caption?: string;
};

const mark = (f: number | null, fps: number): string => (f === null ? '–' : formatTimecode(f, fps));

/** Monitor mit Bild, Zeitcode (`HH:MM:SS:FF`, Tabellenziffern), Ein-/Aus-Anzeige und Sicherheitsrahmen. */
export function Monitor({ engine, label, fps, inPoint, outPoint, aspect = 16 / 9, caption }: MonitorProps) {
  const host = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(engine.frame);
  const [safe, setSafe] = useState(false);
  const [color, setColor] = useState(engine.colorSupported);
  const [blocked, setBlocked] = useState(engine.blocked);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let shown: HTMLCanvasElement | null = null;
    const mount = () => {
      if (shown && shown.parentNode === el) el.removeChild(shown);
      shown = engine.canvas;
      shown.classList.add('monitor-canvas');
      shown.setAttribute('role', 'img');
      shown.setAttribute('aria-label', `${label}-Monitor`);
      el.prepend(shown);
      setColor(engine.colorSupported);
    };
    mount();
    setFrame(engine.frame);
    const offFrame = engine.onFrame((f) => {
      setFrame(f);
      setBlocked(engine.blocked);
    });
    const offCanvas = engine.onCanvasChange(mount);
    engine.invalidate();
    return () => {
      offFrame();
      offCanvas();
      if (shown && shown.parentNode === el) el.removeChild(shown);
    };
  }, [engine, label]);

  return (
    <section className="monitor" aria-label={`${label}-Monitor`}>
      <div className="monitor-surround">
        <div className="monitor-frame" ref={host} style={{ aspectRatio: String(aspect), ['--aspect' as string]: String(aspect) }}>
          {safe && (
            <div className="monitor-safe" data-testid="safe-area" aria-hidden="true">
              <div className="safe-action" />
              <div className="safe-title" />
            </div>
          )}
        </div>
      </div>
      <div className="monitor-bar">
        <span className="monitor-label">{label}</span>
        {caption && <span className="monitor-caption">{caption}</span>}
        <span className="timecode" role="timer" aria-live="off" aria-label="Zeitcode">
          {formatTimecode(frame, fps)}
        </span>
        <span className="monitor-io" data-testid="io-marks">
          <span>Ein <span className="timecode-small">{mark(inPoint, fps)}</span></span>
          <span>Aus <span className="timecode-small">{mark(outPoint, fps)}</span></span>
        </span>
        <button type="button" className="mon-btn" aria-pressed={safe} onClick={() => setSafe((s) => !s)} title="Sicherheitsrahmen: Aktion 93 %, Titel 90 %">
          Sicherheitsrahmen
        </button>
      </div>
      {!color && <p className="monitor-hint">Farbkorrektur in der Vorschau nicht verfügbar</p>}
      {blocked && (
        <p className="monitor-hint" role="status">
          Vorschau blockiert: Medienquelle nicht freigegeben
        </p>
      )}
    </section>
  );
}
