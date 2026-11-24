import { RotateCcw } from 'lucide-react';
import { addTitle, setClipProps } from '../../domain/timeline/ops';
import type { Clip, ColorParams, Sequence, TitleParams, TitleStyle } from '../../domain/timeline/types';
import { useProject } from '../../state/projectStore';
import { IntField, Slider } from './controls';
import { useWerkstatt } from './uiStore';

/** Erster gewählter Clip, der noch existiert. */
export function primaryClip(seq: Sequence, selection: string[]): Clip | null {
  for (const id of selection) {
    const c = seq.clips.find((x) => x.id === id);
    if (c) return c;
  }
  return null;
}

/** Der Clip selbst, falls auf einer Spur dieser Art, sonst sein verknüpfter Partner dort. */
export function onKind(seq: Sequence, c: Clip | null, kind: 'video' | 'audio'): Clip | null {
  if (!c) return null;
  const kindOf = (x: Clip) => seq.tracks.find((t) => t.id === x.trackId)?.kind;
  if (kindOf(c) === kind) return c;
  return c.linkId ? (seq.clips.find((x) => x.linkId === c.linkId && kindOf(x) === kind) ?? null) : null;
}

const patch = (id: string, p: Parameters<typeof setClipProps>[2], key: string) =>
  useProject.getState().apply((s) => setClipProps(s, id, p), { coalesce: `${key}:${id}` });

// ---------------------------------------------------------------- Farbe

const NEUTRAL: ColorParams = { exposure: 0, contrast: 0, highlights: 0, shadows: 0, temperature: 0, tint: 0, saturation: 0 };
const COLOR_FIELDS: { key: keyof ColorParams; label: string; min: number; max: number; step: number; unit?: string }[] = [
  { key: 'exposure', label: 'Belichtung (Exposure)', min: -2, max: 2, step: 0.05, unit: 'Blenden' },
  { key: 'contrast', label: 'Kontrast (Contrast)', min: -100, max: 100, step: 1 },
  { key: 'highlights', label: 'Lichter (Highlights)', min: -100, max: 100, step: 1 },
  { key: 'shadows', label: 'Tiefen (Shadows)', min: -100, max: 100, step: 1 },
  { key: 'temperature', label: 'Temperatur (Temperature)', min: -100, max: 100, step: 1 },
  { key: 'tint', label: 'Tönung (Tint)', min: -100, max: 100, step: 1 },
  { key: 'saturation', label: 'Sättigung (Saturation)', min: -100, max: 100, step: 1 },
];

/** Grundkorrektur nach `ColorParams` mit Vorher/Nachher; die Vorschau zeigt die Wirkung sofort. */
export function ColorPanel({ clip }: { clip: Clip | null }) {
  const bypass = useWerkstatt((s) => s.colorBypass);
  const setBypass = useWerkstatt((s) => s.setColorBypass);
  if (!clip || clip.kind !== 'media') return <p className="insp-empty">Wähle einen Bild-Clip, um die Farbe zu korrigieren.</p>;
  const c = clip.color ?? NEUTRAL;
  const changed = clip.color !== null && COLOR_FIELDS.some((f) => c[f.key] !== 0);
  return (
    <>
      <div className="insp-row">
        <button type="button" className="btn btn-small" aria-pressed={bypass} onClick={() => setBypass(!bypass)} title="Vorschau ohne Farbkorrektur dieses Clips">
          Vorher zeigen
        </button>
        <button
          type="button"
          className="btn btn-small"
          disabled={!changed}
          onClick={() => useProject.getState().apply((s) => setClipProps(s, clip.id, { color: null }))}
        >
          <RotateCcw aria-hidden="true" /> Zurücksetzen
        </button>
      </div>
      {COLOR_FIELDS.map((f) => (
        <Slider
          key={f.key}
          label={f.label}
          min={f.min}
          max={f.max}
          step={f.step}
          unit={f.unit}
          value={c[f.key]}
          onChange={(v) => patch(clip.id, { color: { ...c, [f.key]: v } }, `color-${f.key}`)}
        />
      ))}
      <p className="insp-hint">Steht der Abspielkopf über dem Clip, siehst du die Wirkung im Programm-Monitor und in den Scopes.</p>
    </>
  );
}

// ---------------------------------------------------------------- Titel

const STYLES: { id: TitleStyle; label: string }[] = [
  { id: 'bauchbinde', label: 'Bauchbinde' },
  { id: 'titel', label: 'Titel' },
  { id: 'abspann', label: 'Abspann' },
];

/** Titel-Editor (Vorlage, Zeilen, Größe, Farbe, Position, Blenden) und neue Titel am Abspielkopf. */
export function TitlePanel({ clip, playhead }: { clip: Clip | null; playhead: () => number }) {
  const title = clip?.kind === 'title' ? clip.title : null;
  const add = (style: TitleStyle) => {
    const at = playhead();
    const { seq } = useProject.getState();
    if (!seq) return;
    const track = seq.tracks.find((t) => t.id === 'V2' && !t.locked) ?? seq.tracks.find((t) => t.kind === 'video' && !t.locked);
    if (!track) return;
    const before = new Set(seq.clips.map((c) => c.id));
    if (!useProject.getState().apply((s) => addTitle(s, at, track.id, style))) return;
    const created = useProject.getState().seq?.clips.find((c) => !before.has(c.id) && c.kind === 'title');
    if (created) useWerkstatt.getState().select([created.id]);
  };
  const set = (p: Partial<TitleParams>, key: string) => clip && title && patch(clip.id, { title: { ...title, ...p } }, `title-${key}`);
  return (
    <>
      <div className="insp-row" role="group" aria-label="Neuer Titel am Abspielkopf">
        {STYLES.map((s) => (
          <button key={s.id} type="button" className="btn btn-small" onClick={() => add(s.id)}>
            {s.label} hinzufügen
          </button>
        ))}
      </div>
      {!clip || !title ? (
        <p className="insp-empty">Wähle einen Titel in der Timeline oder lege einen neuen an.</p>
      ) : (
        <>
          <div className="field">
            <label htmlFor="title-style">Vorlage</label>
            <select id="title-style" value={title.style} onChange={(e) => set({ style: e.target.value as TitleStyle }, 'style')}>
              {STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="title-l1">Zeile 1</label>
            <input id="title-l1" type="text" value={title.line1} onChange={(e) => set({ line1: e.target.value }, 'line1')} onBlur={() => useProject.getState().endGesture()} />
          </div>
          <div className="field">
            <label htmlFor="title-l2">Zeile 2</label>
            <input id="title-l2" type="text" value={title.line2} onChange={(e) => set({ line2: e.target.value }, 'line2')} onBlur={() => useProject.getState().endGesture()} />
          </div>
          <div className="insp-grid">
            <IntField label="Größe (px)" value={title.size} min={12} max={300} onChange={(v) => set({ size: v }, 'size')} />
            <div className="field">
              <label htmlFor="title-color">Farbe</label>
              <input id="title-color" type="color" value={title.color} onChange={(e) => set({ color: e.target.value }, 'color')} onBlur={() => useProject.getState().endGesture()} />
            </div>
          </div>
          <Slider label="Position waagerecht" min={0} max={100} step={1} unit="%" value={Math.round(title.x * 100)} onChange={(v) => set({ x: v / 100 }, 'x')} />
          <Slider label="Position senkrecht" min={0} max={100} step={1} unit="%" value={Math.round(title.y * 100)} onChange={(v) => set({ y: v / 100 }, 'y')} />
          <div className="insp-grid">
            <IntField label="Einblenden (Bilder)" value={title.fadeIn} min={0} max={clip.duration} onChange={(v) => set({ fadeIn: v }, 'fadeIn')} />
            <IntField label="Ausblenden (Bilder)" value={title.fadeOut} min={0} max={clip.duration} onChange={(v) => set({ fadeOut: v }, 'fadeOut')} />
          </div>
          <p className="insp-hint">Sichere Bereiche zeigt der Knopf „Sicherheitsrahmen“ am Programm-Monitor.</p>
        </>
      )}
    </>
  );
}

export { patch as patchClip };
