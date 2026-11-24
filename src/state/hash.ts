import type { Sequence } from '../domain/timeline/types';

/** Kurzer, stabiler Hash (FNV-1a, 32 Bit) für Dateinamen im Cache und Änderungserkennung. */
export function hashOf(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Hash des gesamten Sequenz-Inhalts: ändert sich bei jeder Bearbeitung (Clips, Bereich, Format, Name). */
export const sequenceHash = (seq: Sequence): string => hashOf(seq);
