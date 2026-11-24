import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import type { VideoSpec } from '../../domain/assignments/types';
import { withFormat } from '../../domain/timeline/sequence';
import type { Clip, Sequence } from '../../domain/timeline/types';
import { useProject } from '../../state/projectStore';
import { IntField, Slider } from './controls';
import { ColorPanel, TitlePanel, onKind, patchClip, primaryClip } from './inspectorParts';
import { formatTimecode } from './timecode';
import { useWerkstatt, type InspectorTab } from './uiStore';

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'clip', label: 'Clip' },
  { id: 'farbe', label: 'Farbe' },
  { id: 'titel', label: 'Titel' },
  { id: 'sequenz', label: 'Sequenz' },
];

/** Sequenz-Einstellungen nach Spec §7.1. */
export const RESOLUTIONS = [
  { w: 1920, h: 1080, label: '1920×1080 (16:9)' },
  { w: 1080, h: 1920, label: '1080×1920 (9:16, Hochformat)' },
  { w: 1080, h: 1080, label: '1080×1080 (1:1)' },
  { w: 3840, h: 2160, label: '3840×2160 (16:9, UHD)' },
];
export const FRAME_RATES = [25, 50, 30, 24];

type Props = { spec: VideoSpec | null; playhead: () => number };

/** Eigenschaften rechts: Reiter Clip, Farbe, Titel, Sequenz (schrittweise: nur was zur Auswahl passt). */
export function Inspector({ spec, playhead }: Props) {
  const seq = useProject((s) => s.seq)!;
  const selection = useWerkstatt((s) => s.selection);
  const tab = useWerkstatt((s) => s.inspectorTab);
  const setTab = useWerkstatt((s) => s.setInspectorTab);
  const tabRefs = useRef(new Map<InspectorTab, HTMLButtonElement>());
  const primary = primaryClip(seq, selection);

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id;
    setTab(next);
    tabRefs.current.get(next)?.focus();
  };

  return (
    <section className="insp" aria-labelledby="insp-h">
      <h2 id="insp-h" className="ws-h">
        Inspektor
      </h2>
      <div className="insp-tabs" role="tablist" aria-label="Inspektor-Bereiche" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              if (el) tabRefs.current.set(t.id, el);
            }}
            type="button"
            role="tab"
            id={`insp-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`insp-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="insp-panel" role="tabpanel" id={`insp-panel-${tab}`} aria-labelledby={`insp-tab-${tab}`}>
        {tab === 'clip' && <ClipPanel seq={seq} clip={primary} />}
        {tab === 'farbe' && <ColorPanel clip={onKind(seq, primary, 'video')} />}
        {tab === 'titel' && <TitlePanel clip={primary} playhead={playhead} />}
        {tab === 'sequenz' && <SequencePanel seq={seq} spec={spec} />}
      </div>
    </section>
  );
}

function ClipPanel({ seq, clip }: { seq: Sequence; clip: Clip | null }) {
  const media = useProject((s) => s.project?.media);
  if (!clip) return <p className="insp-empty">Wähle einen Clip in der Timeline (Klick oder Clip-Liste).</p>;
  const tc = (f: number) => formatTimecode(f, seq.fps);
  const name = clip.kind === 'title' ? `Titel „${clip.title?.line1 ?? ''}“` : (media?.find((m) => m.id === clip.mediaId)?.name ?? 'Clip');
  const audio = clip.kind === 'media' ? onKind(seq, clip, 'audio') : null;
  const track = (c: Clip) => seq.tracks.find((t) => t.id === c.trackId)?.name ?? c.trackId;
  return (
    <>
      <p className="insp-name">{name}</p>
      <dl className="insp-facts">
        <div>
          <dt>Spur</dt>
          <dd>{track(clip)}</dd>
        </div>
        <div>
          <dt>Anfang</dt>
          <dd className="tc">{tc(clip.start)}</dd>
        </div>
        <div>
          <dt>Ende</dt>
          <dd className="tc">{tc(clip.start + clip.duration)}</dd>
        </div>
        <div>
          <dt>Dauer</dt>
          <dd className="tc">{tc(clip.duration)}</dd>
        </div>
      </dl>
      <h3 className="insp-sub">Ton{audio && audio.id !== clip.id ? ` (${track(audio)})` : ''}</h3>
      {clip.kind === 'title' ? (
        <p className="insp-empty">Titel bearbeitest du im Reiter „Titel“.</p>
      ) : !audio ? (
        <p className="insp-empty">Dieser Clip hat keinen Ton.</p>
      ) : (
        <>
          <Slider label="Pegel (Gain)" min={-60} max={12} step={0.5} unit="dB" numberInput value={audio.gainDb} onChange={(v) => patchClip(audio.id, { gainDb: v }, 'gain')} />
          <div className="insp-grid">
            <IntField label="Blende ein (Bilder)" value={audio.fadeIn} min={0} max={audio.duration} onChange={(v) => patchClip(audio.id, { fadeIn: v }, 'fadeIn')} />
            <IntField label="Blende aus (Bilder)" value={audio.fadeOut} min={0} max={audio.duration} onChange={(v) => patchClip(audio.id, { fadeOut: v }, 'fadeOut')} />
          </div>
          <p className="insp-hint">Kurze Blenden an Tonschnitten verhindern Klicks.</p>
        </>
      )}
    </>
  );
}

function SequencePanel({ seq, spec }: { seq: Sequence; spec: VideoSpec | null }) {
  const apply = useProject((s) => s.apply);
  const media = useProject((s) => s.project?.media ?? []);
  const res = `${seq.width}x${seq.height}`;
  const differs = spec !== null && (spec.width !== seq.width || spec.height !== seq.height || spec.fps !== seq.fps);
  const otherFps = media.filter((m) => m.kind === 'video' && m.fps && Math.abs(m.fps - seq.fps) > 0.01).length;
  return (
    <>
      <div className="field">
        <label htmlFor="seq-res">Auflösung</label>
        <select
          id="seq-res"
          value={res}
          onChange={(e) => {
            const [w, h] = e.target.value.split('x').map(Number);
            apply((s) => withFormat(s, { width: w, height: h, fps: s.fps }));
          }}
        >
          {!RESOLUTIONS.some((r) => `${r.w}x${r.h}` === res) && <option value={res}>{`${seq.width}×${seq.height}`}</option>}
          {RESOLUTIONS.map((r) => (
            <option key={r.label} value={`${r.w}x${r.h}`}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="seq-fps">Bildrate</label>
        <select id="seq-fps" value={seq.fps} onChange={(e) => apply((s) => withFormat(s, { width: s.width, height: s.height, fps: Number(e.target.value) }))}>
          {!FRAME_RATES.includes(seq.fps) && <option value={seq.fps}>{seq.fps} fps</option>}
          {FRAME_RATES.map((f) => (
            <option key={f} value={f}>
              {f} fps
            </option>
          ))}
        </select>
      </div>
      {spec &&
        (differs ? (
          <p className="ws-warn">
            <TriangleAlert aria-hidden="true" /> Weicht vom Auftrag ab: verlangt sind {spec.width}×{spec.height} bei {spec.fps} fps.
          </p>
        ) : (
          <p className="ws-ok">
            <CircleCheck aria-hidden="true" /> Passt zum Auftrag ({spec.width}×{spec.height}, {spec.fps} fps).
          </p>
        ))}
      {otherFps > 0 && (
        <p className="ws-warn">
          <TriangleAlert aria-hidden="true" /> {otherFps === 1 ? 'Ein Clip hat' : `${otherFps} Clips haben`} eine andere Bildrate als die Sequenz.
        </p>
      )}
    </>
  );
}
