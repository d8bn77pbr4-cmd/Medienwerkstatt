/**
 * Die eine Quelle aller Werkstatt-Tastenkürzel (Spec §7.1): Taste, Modifikatoren, Befehl, deutsche
 * Bezeichnung und der Name bei Adobe (nur beschreibend im Tooltip „So heißt das bei Adobe: …“).
 * ⌘ = metaKey. Keine Kürzel, während ein Textfeld Fokus hat.
 */

export const COMMAND_IDS = [
  'tool.select', 'tool.razor', 'tool.ripple', 'tool.roll', 'tool.hand',
  'mark.in', 'mark.out',
  'transport.reverse', 'transport.stop', 'transport.forward', 'transport.toggle',
  'transport.stepBack', 'transport.stepForward', 'transport.stepBack5', 'transport.stepForward5',
  'edit.insert', 'edit.overwrite', 'edit.addEdit', 'edit.rippleTrimPrev', 'edit.rippleTrimNext',
  'edit.rippleDelete', 'edit.lift', 'edit.link', 'edit.dissolve', 'edit.audioFade',
  'timeline.snap', 'timeline.marker', 'zoom.in', 'zoom.out', 'zoom.fit',
  'history.undo', 'history.redo', 'file.save', 'export.open', 'help.shortcuts',
] as const;
export type CommandId = (typeof COMMAND_IDS)[number];

export type KeyBinding = {
  command: CommandId;
  /** `KeyboardEvent.key`, Buchstaben klein; mehrere = Alternativen (US/deutsche Tastatur). */
  keys: string[];
  meta?: boolean;
  shift?: boolean;
  /** Satzzeichen, deren Umschalt-/Wahl-Ebene je Tastatur verschieden ist: ⇧ und ⌥ werden nicht geprüft. */
  loose?: boolean;
  /** Gehaltene Taste wiederholt den Befehl (Pfeile, Zoom, Verlauf). */
  repeat?: boolean;
  /** Anzeige in Übersicht und Tooltip. */
  display: string;
  label: string;
  adobe: string;
};

const T = (command: CommandId, keys: string[], display: string, label: string, adobe: string, o: Partial<KeyBinding> = {}): KeyBinding => ({
  command, keys, display, label, adobe, ...o,
});

export const KEYMAP: readonly KeyBinding[] = [
  T('tool.select', ['v'], 'V', 'Auswahl (Selection)', 'Auswahl-Werkzeug (Selection Tool)'),
  T('tool.razor', ['c'], 'C', 'Rasierklinge (Razor)', 'Rasierklinge (Razor Tool)'),
  T('tool.ripple', ['b'], 'B', 'Ripple-Trim (Ripple Edit)', 'Ripple-Bearbeitung (Ripple Edit Tool)'),
  T('tool.roll', ['n'], 'N', 'Rollen (Roll)', 'Rollen-Bearbeitung (Rolling Edit Tool)'),
  T('tool.hand', ['h'], 'H', 'Hand-Werkzeug (Hand)', 'Hand-Werkzeug (Hand Tool)'),
  T('mark.in', ['i'], 'I', 'Eingang setzen (Mark In)', 'Mark In'),
  T('mark.out', ['o'], 'O', 'Ausgang setzen (Mark Out)', 'Mark Out'),
  T('transport.reverse', ['j'], 'J', 'Rückwärts abspielen, mehrfach = schneller', 'Shuttle Left'),
  T('transport.stop', ['k'], 'K', 'Anhalten', 'Shuttle Stop'),
  T('transport.forward', ['l'], 'L', 'Vorwärts abspielen, mehrfach = schneller', 'Shuttle Right'),
  T('transport.toggle', [' '], 'Leertaste', 'Abspielen/Stopp', 'Play-Stop Toggle'),
  T('transport.stepBack', ['arrowleft'], '←', 'Ein Bild zurück', 'Step Back 1 Frame', { repeat: true }),
  T('transport.stepForward', ['arrowright'], '→', 'Ein Bild vor', 'Step Forward 1 Frame', { repeat: true }),
  T('transport.stepBack5', ['arrowleft'], '⇧←', 'Fünf Bilder zurück', 'Step Back 5 Frames', { shift: true, repeat: true }),
  T('transport.stepForward5', ['arrowright'], '⇧→', 'Fünf Bilder vor', 'Step Forward 5 Frames', { shift: true, repeat: true }),
  T('edit.insert', [','], ',', 'Einfügen (Insert)', 'Insert', { loose: true }),
  T('edit.overwrite', ['.'], '.', 'Überschreiben (Overwrite)', 'Overwrite', { loose: true }),
  T('edit.addEdit', ['k'], '⌘K', 'Schnitt an Abspielposition (Add Edit)', 'Add Edit', { meta: true }),
  T('edit.rippleTrimPrev', ['q'], 'Q', 'Ripple-Trim bis zum Kopf (Ripple Trim Previous)', 'Ripple Trim Previous Edit to Playhead'),
  T('edit.rippleTrimNext', ['w'], 'W', 'Ripple-Trim ab dem Kopf (Ripple Trim Next)', 'Ripple Trim Next Edit to Playhead'),
  T('edit.rippleDelete', ['backspace', 'delete'], '⇧⌫', 'Ripple-Löschen (Ripple Delete)', 'Ripple Delete', { shift: true }),
  T('edit.lift', ['backspace', 'delete'], '⌫', 'Löschen ohne Nachrücken (Lift)', 'Clear'),
  T('edit.link', ['l'], '⌘L', 'Bild und Ton verknüpfen/lösen (Link)', 'Link/Unlink', { meta: true }),
  T('edit.dissolve', ['d'], '⌘D', 'Überblendung Bild (Cross Dissolve)', 'Apply Video Transition', { meta: true }),
  T('edit.audioFade', ['d'], '⇧⌘D', 'Ton-Blende (Crossfade)', 'Apply Audio Transition', { meta: true, shift: true }),
  T('timeline.snap', ['s'], 'S', 'Einrasten ein/aus (Snap)', 'Snap in Timeline'),
  T('timeline.marker', ['m'], 'M', 'Marker setzen (Marker)', 'Add Marker'),
  T('zoom.in', ['+', '='], '+', 'Hineinzoomen (Zoom In)', 'Zoom In', { loose: true, repeat: true }),
  T('zoom.out', ['-', '−'], '−', 'Herauszoomen (Zoom Out)', 'Zoom Out', { loose: true, repeat: true }),
  T('zoom.fit', ['\\'], '\\', 'Ganze Sequenz zeigen (Zoom to Sequence)', 'Zoom to Sequence', { loose: true }),
  T('history.undo', ['z'], '⌘Z', 'Rückgängig (Undo)', 'Undo', { meta: true, repeat: true }),
  T('history.redo', ['z'], '⇧⌘Z', 'Wiederholen (Redo)', 'Redo', { meta: true, shift: true, repeat: true }),
  T('file.save', ['s'], '⌘S', 'Sichern: speichert sofort und legt eine Version an (Save)', 'Save', { meta: true }),
  T('export.open', ['m'], '⌘M', 'Exportieren (Export)', 'Export Media', { meta: true }),
  T('help.shortcuts', ['/'], '⌘/', 'Tastenkürzel-Übersicht', 'Keyboard Shortcuts', { meta: true, loose: true }),
];

export type KeyLike = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>;

export const normalizeKey = (key: string): string => key.toLowerCase();

/** Eindeutige Schlüssel einer Belegung (für die Prüfung auf Doppelbelegung); lockere Belegungen gelten für ⇧ an und aus. */
export function comboIds(b: KeyBinding): string[] {
  const shifts = b.loose ? [false, true] : [!!b.shift];
  return b.keys.flatMap((k) => shifts.map((s) => `${b.meta ? 'meta+' : ''}${s ? 'shift+' : ''}${normalizeKey(k)}`));
}

/** Passende Belegung zum Tastendruck oder `null`. Strg wird nie als ⌘ gedeutet. */
export function matchKey(e: KeyLike): KeyBinding | null {
  if (e.ctrlKey) return null;
  const key = normalizeKey(e.key);
  for (const b of KEYMAP) {
    if (!b.keys.includes(key) || !!b.meta !== e.metaKey) continue;
    if (!b.loose && (!!b.shift !== e.shiftKey || e.altKey)) continue;
    return b;
  }
  return null;
}

/** Eingabe-Typen, in denen getippt wird (ohne Typ = text). */
const TEXT_INPUTS = new Set(['text', 'search', 'number', 'url', 'email', 'password', 'tel']);

const asElement = (t: EventTarget | null): HTMLElement | null =>
  t && typeof (t as HTMLElement).tagName === 'string' ? (t as HTMLElement) : null;

/**
 * Fokus in einer Texteingabe (Textfeld, Zahl, Textbereich, Auswahlliste, editierbarer Bereich): dort gibt es
 * keine Kürzel. Regler, Farbwähler, Häkchen, Optionsfelder und Knöpfe sperren Kürzel nicht.
 */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = asElement(t);
  if (!el) return false;
  if (el.tagName === 'INPUT') return TEXT_INPUTS.has((el as HTMLInputElement).type || 'text');
  return el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable === true;
}

const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

/** Tasten, die ein fokussiertes Bedienelement selbst braucht (Regler: Pfeile/Pos1/Ende/Bild; Knöpfe: Leertaste/Eingabe). */
export function ownsKey(t: EventTarget | null, key: string): boolean {
  const el = asElement(t);
  if (!el) return false;
  const type = el.tagName === 'INPUT' ? (el as HTMLInputElement).type : el.tagName === 'BUTTON' ? 'button' : '';
  if (type === 'range') return [...ARROWS, 'Home', 'End', 'PageUp', 'PageDown'].includes(key);
  if (type === 'radio') return ARROWS.includes(key) || key === ' ';
  if (['checkbox', 'color', 'button', 'submit', 'reset', 'file'].includes(type)) return key === ' ' || key === 'Enter';
  return false;
}

export const bindingFor = (command: CommandId): KeyBinding | undefined => KEYMAP.find((b) => b.command === command);

/** Tooltip: „Rasierklinge (Razor) – C · So heißt das bei Adobe: Rasierklinge (Razor Tool)“. */
export function tooltipFor(command: CommandId): string {
  const b = bindingFor(command);
  return b ? `${b.label} – ${b.display} · So heißt das bei Adobe: ${b.adobe}` : '';
}
