import { Import, Tag, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getBackend } from '../../backend';
import type { ShotSize } from '../../domain/assignments/types';
import type { MediaItem } from '../../domain/timeline/types';
import { useProject } from '../../state/projectStore';

const EMPTY: MediaItem[] = [];

/** Einstellungsgrößen wie Profis ihr Material beschriften (Spec §9.2). */
export const SHOT_SIZES: { id: ShotSize; label: string }[] = [
  { id: 'totale', label: 'Totale' },
  { id: 'halbtotale', label: 'Halbtotale' },
  { id: 'halbnah', label: 'Halbnah' },
  { id: 'nah', label: 'Nah' },
  { id: 'gross', label: 'Groß' },
  { id: 'detail', label: 'Detail' },
];

const fmtFps = (fps: number) => (Number.isInteger(fps) ? String(fps) : fps.toFixed(2).replace('.', ','));
function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Warnungen eines Clips (Farbe + Symbol + Text). */
export function mediaWarnings(m: MediaItem, seqFps: number): string[] {
  const out: string[] = [];
  if (m.hdr) out.push('Am Handy HDR-Video ausschalten');
  if (m.kind === 'video' && m.fps && Math.abs(m.fps - seqFps) > 0.01) out.push(`Bildrate passt nicht zur Sequenz (${fmtFps(m.fps)} statt ${fmtFps(seqFps)} fps)`);
  return out;
}

type Props = {
  seqFps: number;
  /** Medium, das gerade im Quell-Monitor liegt. */
  loadedId: string | null;
  onLoad(m: MediaItem): void;
};

/** Medienbibliothek des Auftrags: Import (Dialog, Drag & Drop im Tauri-Fenster), Proxy-Fortschritt, Warnungen, Einstellungsgröße. */
export function MediaBin({ seqFps, loadedId, onLoad }: Props) {
  const media = useProject((s) => s.project?.media ?? EMPTY);
  const progress = useProject((s) => s.proxyProgress);
  const queue = useProject((s) => s.proxyQueue);
  const importError = useProject((s) => s.importError);
  const importPaths = useProject((s) => s.import);
  const setShotSize = useProject((s) => s.setShotSize);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  useEffect(() => getBackend().onFileDrop({ over: setOver, drop: (paths) => void importPaths(paths) }), [importPaths]);

  const pick = async () => {
    setBusy(true);
    try {
      await importPaths(await getBackend().pickMediaFiles());
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`bin${over ? ' is-over' : ''}`} aria-labelledby="bin-h">
      <div className="ws-panel-head">
        <h2 id="bin-h" className="ws-h">Medienbibliothek</h2>
        <button type="button" className="btn btn-small" onClick={() => void pick()} disabled={busy} title="Dateien in den Projektordner kopieren und prüfen">
          <Import aria-hidden="true" />
          Importieren
        </button>
      </div>
      {importError && (
        <p className="ws-warn" role="alert">
          <TriangleAlert aria-hidden="true" /> Import fehlgeschlagen: {importError}
        </p>
      )}
      {media.length === 0 ? (
        <p className="bin-empty">Noch keine Medien. Importiere Clips von der Platte{over ? '' : ' oder ziehe sie hierher'}.</p>
      ) : (
        <ul className="bin-list" role="list">
          {media.map((m) => {
            const warnings = mediaWarnings(m, seqFps);
            const p = progress[m.id];
            const needsSize = m.kind !== 'audio';
            return (
              <li key={m.id} className={`bin-item${loadedId === m.id ? ' is-loaded' : ''}`}>
                <button
                  type="button"
                  className="bin-name"
                  title="Doppelklick oder Eingabe: in den Quell-Monitor laden"
                  onDoubleClick={() => onLoad(m)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onLoad(m);
                    }
                  }}
                >
                  {m.name}
                </button>
                <p className="bin-meta">
                  <span>{fmtDuration(m.durationSec)}</span>
                  {m.kind !== 'audio' && (
                    <span>
                      {m.width}×{m.height}
                      {m.fps ? ` · ${fmtFps(m.fps)} fps` : ''}
                    </span>
                  )}
                </p>
                {p !== undefined ? (
                  <label className="bin-proxy">
                    <span>Proxy {Math.round(p * 100)} %</span>
                    <progress max={1} value={p} aria-label={`Proxy für ${m.name}`} />
                  </label>
                ) : (
                  queue.includes(m.id) && <p className="bin-proxy bin-wait">Proxy: Wartet …</p>
                )}
                {warnings.map((w) => (
                  <p key={w} className="ws-warn">
                    <TriangleAlert aria-hidden="true" /> {w}
                  </p>
                ))}
                {needsSize && (
                  <div className="bin-size">
                    <select
                      aria-label={`Einstellungsgröße für ${m.name}`}
                      value={m.shotSize ?? ''}
                      required
                      aria-invalid={m.shotSize === null}
                      onChange={(e) => setShotSize(m.id, (e.target.value || null) as ShotSize | null)}
                    >
                      <option value="">Einstellungsgröße wählen</option>
                      {SHOT_SIZES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    {m.shotSize === null && (
                      <p className="ws-care">
                        <Tag aria-hidden="true" /> Einstellungsgröße fehlt
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

