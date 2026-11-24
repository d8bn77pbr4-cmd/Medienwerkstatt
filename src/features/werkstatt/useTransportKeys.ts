import { useMemo } from 'react';
import { COMMANDS, type CommandCtx } from './commands';
import type { CommandId } from './keymap';
import type { PlaybackEngine } from './playback';
import { useKeymap, type KeyHandlers } from './useKeymap';

const TRANSPORT: CommandId[] = [
  'transport.reverse', 'transport.stop', 'transport.forward', 'transport.toggle',
  'transport.stepBack', 'transport.stepForward', 'transport.stepBack5', 'transport.stepForward5',
];

/**
 * Nur Transport (J/K/L, ←/→, ⇧←/⇧→, Leertaste) für einen einzelnen Monitor, z. B. die
 * Entwicklungsseite. Die Werkstatt hängt die ganze `KEYMAP` über `useKeymap` an (keine Doppelbelegung).
 */
export function useTransportKeys(engine: PlaybackEngine | null): void {
  const handlers = useMemo<KeyHandlers>(() => {
    if (!engine) return {};
    const ctx: CommandCtx = { program: engine, source: null, active: () => 'program' };
    return Object.fromEntries(TRANSPORT.map((id) => [id, () => COMMANDS[id](ctx)]));
  }, [engine]);
  useKeymap(handlers, engine !== null);
}
