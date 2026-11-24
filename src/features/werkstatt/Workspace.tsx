import { ChevronsLeftRight, Hand, Keyboard, LayoutGrid, Magnet, MousePointer2, Scissors, UnfoldHorizontal, X, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBackend } from '../../backend';
import { newSequence } from '../../domain/timeline/sequence';
import type { MediaItem, Sequence } from '../../domain/timeline/types';
import { targetKey, useProject, type OpenTarget } from '../../state/projectStore';
import { COMMANDS, type CommandCtx } from './commands';
import { SubmitSheet } from '../chefbuero/SubmitSheet';
import { ExportSheet, FreeExportSheet } from './ExportSheet';
import { Inspector } from './Inspector';
import { onKind, primaryClip } from './inspectorParts';
import { COMMAND_IDS, bindingFor, tooltipFor, type CommandId } from './keymap';
import { LevelMeter } from './LevelMeter';
import { MediaBin } from './MediaBin';
import { Monitor } from './Monitor';
import { PlaybackEngine, SourceEngine, sequenceEnd } from './playback';
import { Scopes } from './Scopes';
import { ShortcutOverlay } from './ShortcutOverlay';
import { Timeline } from './Timeline';
import { useWerkstatt, type Tool } from './uiStore';
import { useKeymap, type KeyHandlers } from './useKeymap';

const FALLBACK = newSequence({ width: 1920, height: 1080, fps: 25, name: '' }, () => 'leer');
const TOOLS: { tool: Tool; command: CommandId; icon: LucideIcon }[] = [
  { tool: 'select', command: 'tool.select', icon: MousePointer2 },
  { tool: 'razor', command: 'tool.razor', icon: Scissors },
  { tool: 'ripple', command: 'tool.ripple', icon: UnfoldHorizontal },
  { tool: 'roll', command: 'tool.roll', icon: ChevronsLeftRight },
  { tool: 'hand', command: 'tool.hand', icon: Hand },
];

/** Auswahl der aktiven Sequenz (nur, wenn das Projekt mehrere hat, z. B. Hoch- und Querformat). */
function SequenceSwitcher() {
  const sequences = useProject((s) => s.project?.sequences);
  const activeId = useProject((s) => s.project?.activeSequenceId);
  if (!sequences || sequences.length < 2) return null;
  return (
    <label className="ws-seq">
      <span>Sequenz</span>
      <select
        value={activeId}
        onChange={(e) => {
          useProject.getState().switchSequence(e.target.value);
          useWerkstatt.getState().clearSelection();
        }}
      >
        {sequences.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name || 'Sequenz'} · {s.width}×{s.height}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Programm-Vorschau: bei „Vorher zeigen“ ohne Farbkorrektur des gewählten Clips (zwischengespeichert je Stand). */
function previewSequence(): () => Sequence {
  let last: { seq: Sequence; id: string; out: Sequence } | null = null;
  return () => {
    const seq = useProject.getState().seq ?? FALLBACK;
    const ui = useWerkstatt.getState();
    if (!ui.colorBypass) return seq;
    const target = onKind(seq, primaryClip(seq, ui.selection), 'video');
    if (!target?.color) return seq;
    if (last && last.seq === seq && last.id === target.id) return last.out;
    const out = { ...seq, clips: seq.clips.map((c) => (c.id === target.id ? { ...c, color: null } : c)) };
    last = { seq, id: target.id, out };
    return out;
  };
}

/**
 * Die Arbeitsfläche: Medien links, Quelle + Programm oben, Inspektor rechts, Timeline unten. Immer dunkel.
 * Für Aufträge mit Vorgaben, Export nach Abgabe und „Abgeben“; für freie Projekte ohne Vorgaben.
 */
export function Workspace({ target, heading }: { target: OpenTarget; heading: string }) {
  const seq = useProject((s) => s.seq) ?? FALLBACK;
  const saveError = useProject((s) => s.saveError);
  const restored = useProject((s) => s.restoredFromBackup);
  const tool = useWerkstatt((s) => s.tool);
  const snapping = useWerkstatt((s) => s.snapping);
  const active = useWerkstatt((s) => s.activeMonitor);
  const marks = useWerkstatt((s) => s.sourceMarks);
  const shortcutsOpen = useWerkstatt((s) => s.shortcutsOpen);
  const focusRequest = useWerkstatt((s) => s.focusRequest);
  const exportOpen = useWerkstatt((s) => s.exportOpen);
  const submitOpen = useWerkstatt((s) => s.submitOpen);
  const navigate = useNavigate();
  const [engines, setEngines] = useState<{ program: PlaybackEngine; source: SourceEngine } | null>(null);
  const [loaded, setLoaded] = useState<MediaItem | null>(null);
  const [scopes, setScopes] = useState(false);
  const binRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<HTMLDivElement>(null);
  const assignment = target.kind === 'assignment' ? target.assignment : null;
  const spec = assignment?.deliverables.find((d) => d.kind === 'video' && d.videoSpec)?.videoSpec ?? null;
  const key = targetKey(target);

  useEffect(() => {
    const backend = getBackend();
    const program = new PlaybackEngine(backend, previewSequence(), () => useProject.getState().project?.media ?? [], document.createElement('canvas'));
    const source = new SourceEngine(backend, document.createElement('canvas'));
    setEngines({ program, source });
    // Neuer Stand oder Vorher/Nachher: neu zeichnen; kürzere Sequenz zieht den Abspielkopf mit.
    const offProject = useProject.subscribe((s, prev) => {
      if (s.seq === prev.seq && s.project?.media === prev.project?.media) return;
      if (s.seq && program.frame > sequenceEnd(s.seq)) program.seek(sequenceEnd(s.seq));
      program.invalidate();
    });
    const offUi = useWerkstatt.subscribe((s, prev) => {
      if (s.colorBypass !== prev.colorBypass || (s.colorBypass && s.selection !== prev.selection)) program.invalidate();
    });
    useWerkstatt.getState().resetForProject();
    return () => {
      offProject();
      offUi();
      program.dispose();
      source.dispose();
      setEngines(null);
    };
  }, [key]);

  const ctxRef = useRef<CommandCtx>({ program: null, source: null, active: () => useWerkstatt.getState().activeMonitor });
  ctxRef.current.program = engines?.program ?? null;
  ctxRef.current.source = engines?.source ?? null;
  const ctx = ctxRef.current;

  const handlers = useMemo<KeyHandlers>(() => {
    if (shortcutsOpen) return { 'help.shortcuts': () => COMMANDS['help.shortcuts'](ctx) };
    return Object.fromEntries(COMMAND_IDS.map((id) => [id, () => COMMANDS[id](ctx)]));
  }, [ctx, shortcutsOpen]);
  useKeymap(handlers, engines !== null);

  // Sprung in einen Bereich (Protokoll „So behebst du es“, ⌘M): Fokus auf Timeline, Medien oder den Inspektor-Reiter.
  useEffect(() => {
    if (!focusRequest || !engines) return;
    const p = focusRequest.panel;
    if (p === 'timeline') tlRef.current?.focus();
    else if (p === 'medien') binRef.current?.focus();
    else document.getElementById(`insp-tab-${useWerkstatt.getState().inspectorTab}`)?.focus();
    useWerkstatt.getState().clearFocusRequest();
  }, [focusRequest, engines]);

  const loadSource = (m: MediaItem) => {
    engines?.source.load(m);
    setLoaded(m);
    useWerkstatt.getState().setSourceMarks({ in: null, out: null });
    useWerkstatt.getState().setActiveMonitor('source');
  };

  return (
    <main className="main werkstatt">
      <div className="ws">
        <header className="ws-bar">
          <button
            type="button"
            className="btn btn-small"
            title="Zur Projektübersicht"
            onClick={() => {
              void useProject.getState().flush();
              navigate('/projekte');
            }}
          >
            <LayoutGrid aria-hidden="true" /> Projekte
          </button>
          <h1 className="ws-title">{heading}</h1>
          <div className="ws-tools" role="group" aria-label="Werkzeuge">
            {TOOLS.map(({ tool: t, command, icon: Icon }) => (
              <button
                key={t}
                type="button"
                className="tool"
                aria-pressed={tool === t}
                aria-label={bindingFor(command)!.label}
                title={tooltipFor(command)}
                onClick={() => COMMANDS[command](ctx)}
              >
                <Icon aria-hidden="true" />
                <span className="tool-key" aria-hidden="true">
                  {bindingFor(command)!.display}
                </span>
              </button>
            ))}
            <span className="ws-sep" aria-hidden="true" />
            <button type="button" className="tool" aria-pressed={snapping} aria-label="Einrasten (Snap)" title={tooltipFor('timeline.snap')} onClick={() => COMMANDS['timeline.snap'](ctx)}>
              <Magnet aria-hidden="true" />
              <span className="tool-key" aria-hidden="true">S</span>
            </button>
          </div>
          <SequenceSwitcher />
          <span className="ws-format" data-testid="seq-format">
            {seq.width}×{seq.height} · {seq.fps} fps
          </span>
          <button type="button" className="btn btn-small" title={tooltipFor('help.shortcuts')} onClick={() => COMMANDS['help.shortcuts'](ctx)}>
            <Keyboard aria-hidden="true" /> Tastenkürzel
          </button>
        </header>
        {saveError && (
          <div className="banner ws-banner" role="alert">
            <span>Projekt speichern fehlgeschlagen – neuer Versuch …</span>
          </div>
        )}
        {restored && (
          <div className="banner ws-banner" role="status">
            <span>Letzte Sicherung des Projekts geladen</span>
            <button type="button" className="icon-btn" aria-label="Hinweis schließen" onClick={() => useProject.getState().dismissRestored()}>
              <X aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="ws-mid">
          <div className="ws-bin" ref={binRef} tabIndex={-1}>
            <MediaBin seqFps={seq.fps} loadedId={loaded?.id ?? null} onLoad={loadSource} />
          </div>
          <div className="ws-monitors">
            {engines && (
              <>
                <div
                  className={`ws-monitor${active === 'source' ? ' is-active' : ''}`}
                  onPointerDownCapture={() => useWerkstatt.getState().setActiveMonitor('source')}
                  onFocusCapture={() => useWerkstatt.getState().setActiveMonitor('source')}
                >
                  <Monitor
                    engine={engines.source}
                    label="Quelle"
                    caption={loaded?.name ?? 'Doppelklick auf einen Clip lädt ihn hier'}
                    fps={engines.source.fps}
                    inPoint={marks.in}
                    outPoint={marks.out}
                    aspect={loaded && loaded.kind !== 'audio' && loaded.height > 0 ? loaded.width / loaded.height : 16 / 9}
                  />
                </div>
                <div
                  className={`ws-monitor${active === 'program' ? ' is-active' : ''}`}
                  onPointerDownCapture={() => useWerkstatt.getState().setActiveMonitor('program')}
                  onFocusCapture={() => useWerkstatt.getState().setActiveMonitor('program')}
                >
                  <Monitor engine={engines.program} label="Programm" caption={seq.name} fps={seq.fps} inPoint={seq.inPoint} outPoint={seq.outPoint} aspect={seq.width / seq.height} />
                </div>
                <div className={`ws-scopes${scopes ? ' is-open' : ''}`}>
                  <button type="button" className="btn btn-small" aria-expanded={scopes} onClick={() => setScopes((s) => !s)}>
                    Scopes
                  </button>
                  {scopes && <Scopes engine={engines.program} />}
                </div>
              </>
            )}
          </div>
          <div className="ws-side">
            <Inspector spec={spec} playhead={() => engines?.program.frame ?? 0} />
            {engines && <LevelMeter engine={engines.program} />}
          </div>
        </div>
        <div className="ws-tl" ref={tlRef} tabIndex={-1}>
          {engines && <Timeline engine={engines.program} ctx={ctx} />}
        </div>
      </div>
      {shortcutsOpen && <ShortcutOverlay onClose={() => useWerkstatt.getState().setShortcutsOpen(false)} />}
      {exportOpen && target.kind === 'free' && <FreeExportSheet freeProject={target.project} onClose={() => useWerkstatt.getState().setExportOpen(false)} />}
      {exportOpen && assignment && (
        <ExportSheet
          assignment={assignment}
          onClose={() => useWerkstatt.getState().setExportOpen(false)}
          onSubmit={() => {
            useWerkstatt.getState().setExportOpen(false);
            useWerkstatt.getState().setSubmitOpen(true);
          }}
        />
      )}
      {submitOpen && assignment && (
        <SubmitSheet
          assignment={assignment}
          onClose={() => useWerkstatt.getState().setSubmitOpen(false)}
          onDone={(e) => {
            useWerkstatt.getState().setSubmitOpen(false);
            navigate(`/chefbuero/${encodeURIComponent(e.id)}`, { state: { fresh: true } });
          }}
        />
      )}
    </main>
  );
}
