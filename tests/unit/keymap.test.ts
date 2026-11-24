import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COMMANDS, type CommandCtx } from '../../src/features/werkstatt/commands';
import { COMMAND_IDS, KEYMAP, bindingFor, comboIds, isTypingTarget, matchKey, ownsKey, tooltipFor } from '../../src/features/werkstatt/keymap';
import { resetWerkstattForTests, useWerkstatt } from '../../src/features/werkstatt/uiStore';
import { resetProjectForTests } from '../../src/state/projectStore';

const key = (k: string, mods: Partial<Record<'metaKey' | 'shiftKey' | 'altKey' | 'ctrlKey', boolean>> = {}) => ({
  key: k,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  ...mods,
});

beforeEach(() => {
  resetProjectForTests();
  resetWerkstattForTests();
});
afterEach(() => {
  resetProjectForTests();
  resetWerkstattForTests();
});

describe('KEYMAP', () => {
  it('jede Tastenkombination ist eindeutig', () => {
    const seen = new Map<string, string>();
    for (const b of KEYMAP) {
      for (const combo of comboIds(b)) {
        expect(seen.get(combo), `${combo} doppelt (${b.command})`).toBeUndefined();
        seen.set(combo, b.command);
      }
    }
  });

  it('jeder Befehl der Tastenbelegung existiert und hat eine Ausführung', () => {
    for (const b of KEYMAP) {
      expect(COMMAND_IDS).toContain(b.command);
      expect(typeof COMMANDS[b.command], b.command).toBe('function');
    }
  });

  it('jeder Befehl ist per Taste erreichbar und beschriftet (deutsch + Adobe-Name)', () => {
    for (const id of COMMAND_IDS) {
      const b = bindingFor(id);
      expect(b, id).toBeDefined();
      expect(b!.label.length).toBeGreaterThan(2);
      expect(b!.adobe.length).toBeGreaterThan(2);
      expect(b!.display.length).toBeGreaterThan(0);
    }
    expect(Object.keys(COMMANDS).sort()).toEqual([...COMMAND_IDS].sort());
  });

  it('enthält die Kürzel aus Spec §7.1', () => {
    const expected: [string, string][] = [
      ['v', 'tool.select'], ['c', 'tool.razor'], ['b', 'tool.ripple'], ['n', 'tool.roll'], ['h', 'tool.hand'],
      ['i', 'mark.in'], ['o', 'mark.out'], ['j', 'transport.reverse'], ['k', 'transport.stop'], ['l', 'transport.forward'],
      [',', 'edit.insert'], ['.', 'edit.overwrite'], ['q', 'edit.rippleTrimPrev'], ['w', 'edit.rippleTrimNext'],
      ['s', 'timeline.snap'], ['m', 'timeline.marker'], ['+', 'zoom.in'], ['-', 'zoom.out'], ['\\', 'zoom.fit'], [' ', 'transport.toggle'],
    ];
    for (const [k, cmd] of expected) expect(matchKey(key(k))?.command, k).toBe(cmd);
  });

  it('Modifikatoren: ⌘ = metaKey, ⇧ unterscheidet, Strg wird nicht als ⌘ gedeutet', () => {
    expect(matchKey(key('k', { metaKey: true }))?.command).toBe('edit.addEdit');
    expect(matchKey(key('l', { metaKey: true }))?.command).toBe('edit.link');
    expect(matchKey(key('d', { metaKey: true }))?.command).toBe('edit.dissolve');
    expect(matchKey(key('D', { metaKey: true, shiftKey: true }))?.command).toBe('edit.audioFade');
    expect(matchKey(key('z', { metaKey: true }))?.command).toBe('history.undo');
    expect(matchKey(key('z', { metaKey: true, shiftKey: true }))?.command).toBe('history.redo');
    expect(matchKey(key('m', { metaKey: true }))?.command).toBe('export.open');
    expect(matchKey(key('/', { metaKey: true }))?.command).toBe('help.shortcuts');
    expect(matchKey(key('/', { metaKey: true, shiftKey: true }))?.command).toBe('help.shortcuts'); // deutsche Tastatur: ⇧7
    expect(matchKey(key('Backspace', { shiftKey: true }))?.command).toBe('edit.rippleDelete');
    expect(matchKey(key('Backspace'))?.command).toBe('edit.lift');
    expect(matchKey(key('Delete'))?.command).toBe('edit.lift');
    expect(matchKey(key('ArrowRight'))?.command).toBe('transport.stepForward');
    expect(matchKey(key('ArrowRight', { shiftKey: true }))?.command).toBe('transport.stepForward5');
    expect(matchKey(key('ArrowLeft', { shiftKey: true }))?.command).toBe('transport.stepBack5');
    expect(matchKey(key('k', { ctrlKey: true }))).toBeNull();
    expect(matchKey(key('c', { shiftKey: true }))).toBeNull();
    expect(matchKey(key('c', { metaKey: true }))).toBeNull(); // ⌘C bleibt dem System
  });

  it('Zoom-Tasten funktionieren auf US- und deutscher Tastatur', () => {
    expect(matchKey(key('=', {}))?.command).toBe('zoom.in');
    expect(matchKey(key('+', { shiftKey: true }))?.command).toBe('zoom.in');
    expect(matchKey(key('\\', { altKey: true, shiftKey: true }))?.command).toBe('zoom.fit');
  });

  it('Tooltip nennt Funktion, Taste und den Adobe-Namen', () => {
    const t = tooltipFor('tool.razor');
    expect(t).toContain('Rasierklinge');
    expect(t).toContain('C');
    expect(t).toMatch(/So heißt das bei Adobe: .+/);
  });
});

describe('isTypingTarget', () => {
  it('Eingabefelder, Textbereiche, Auswahllisten und contenteditable', () => {
    const input = document.createElement('input');
    const area = document.createElement('textarea');
    const select = document.createElement('select');
    const div = document.createElement('div');
    div.contentEditable = 'true';
    // jsdom kennt isContentEditable nicht zuverlässig
    Object.defineProperty(div, 'isContentEditable', { value: true });
    for (const el of [input, area, select, div]) expect(isTypingTarget(el)).toBe(true);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  const input = (type: string | null) => {
    const el = document.createElement('input');
    if (type !== null) el.setAttribute('type', type);
    return el;
  };
  it('nur Texteingaben sperren Kürzel; Regler, Farbe, Häkchen, Optionen und Knöpfe nicht', () => {
    for (const t of [null, 'text', 'search', 'number', 'url', 'email', 'password', 'tel']) expect(isTypingTarget(input(t)), String(t)).toBe(true);
    for (const t of ['range', 'color', 'checkbox', 'radio', 'button', 'submit', 'reset', 'file']) expect(isTypingTarget(input(t)), t).toBe(false);
  });

  it('Tasten, die ein Bedienelement selbst braucht, bleiben beim Element', () => {
    const range = input('range');
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']) expect(ownsKey(range, k), k).toBe(true);
    for (const k of [' ', 'k', 'l', 'z', 'Backspace']) expect(ownsKey(range, k), k).toBe(false);
    expect(ownsKey(input('checkbox'), ' ')).toBe(true);
    expect(ownsKey(input('radio'), 'ArrowDown')).toBe(true);
    expect(ownsKey(input('color'), ' ')).toBe(true);
    expect(ownsKey(document.createElement('button'), ' ')).toBe(true);
    expect(ownsKey(document.createElement('button'), 'Enter')).toBe(true);
    expect(ownsKey(document.createElement('button'), 'c')).toBe(false);
    expect(ownsKey(document.body, ' ')).toBe(false);
    expect(ownsKey(null, ' ')).toBe(false);
  });
});

describe('COMMANDS ohne Projekt, Auswahl oder Monitor', () => {
  const emptyCtx: CommandCtx = { program: null, source: null, active: () => 'program' };

  it('tun nichts und werfen nicht', () => {
    for (const id of COMMAND_IDS) expect(() => COMMANDS[id](emptyCtx), id).not.toThrow();
  });

  it('Werkzeuge und Einrasten wirken auf den Werkstatt-Zustand', () => {
    COMMANDS['tool.razor'](emptyCtx);
    expect(useWerkstatt.getState().tool).toBe('razor');
    COMMANDS['tool.select'](emptyCtx);
    expect(useWerkstatt.getState().tool).toBe('select');
    const snap = useWerkstatt.getState().snapping;
    COMMANDS['timeline.snap'](emptyCtx);
    expect(useWerkstatt.getState().snapping).toBe(!snap);
  });

  it('Transport wirkt auf den aktiven Monitor', () => {
    const calls: string[] = [];
    const fake = (name: string) => ({
      frame: 10,
      isPlaying: false,
      play: (r: number) => calls.push(`${name}.play(${r})`),
      pause: () => calls.push(`${name}.pause`),
      step: (n: number) => calls.push(`${name}.step(${n})`),
      seek: (f: number) => calls.push(`${name}.seek(${f})`),
    });
    const program = fake('p');
    const source = { ...fake('s'), item: null, fps: 25, inPoint: null, outPoint: null, length: 0, setIn: () => {}, setOut: () => {} };
    const ctx: CommandCtx = { program, source, active: () => 'program' };
    COMMANDS['transport.forward'](ctx);
    COMMANDS['transport.stepBack5'](ctx);
    COMMANDS['transport.toggle'](ctx);
    // Quelle ohne geladenes Medium: Programm bleibt Ziel
    COMMANDS['transport.reverse']({ ...ctx, active: () => 'source' });
    expect(calls).toEqual(['p.play(1)', 'p.step(-5)', 'p.play(1)', 'p.play(-1)']);
  });

  it('⌘/ schaltet die Übersicht, ⌘M öffnet das Export-Blatt', () => {
    COMMANDS['help.shortcuts'](emptyCtx);
    expect(useWerkstatt.getState().shortcutsOpen).toBe(true);
    COMMANDS['help.shortcuts'](emptyCtx);
    expect(useWerkstatt.getState().shortcutsOpen).toBe(false);
    COMMANDS['export.open'](emptyCtx);
    expect(useWerkstatt.getState().exportOpen).toBe(true);
  });
});
