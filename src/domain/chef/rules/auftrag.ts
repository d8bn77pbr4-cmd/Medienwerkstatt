import type { Assignment, VideoSpec } from '../../assignments/types';
import { fmtDe } from '../format';
import type { Rules } from '../rules';
import { makeDeduction, type Deduction, type VideoInput } from '../types';

/** Pflicht-Elemente einer Video-Abgabe (Mindestzahl Einstellungen, J-Cut, Bauchbinde). */
export function elementRules(spec: VideoSpec, v: VideoInput, rules: Rules, prefix: string): Deduction[] {
  const r = rules.deductions.auftrag;
  const out: Deduction[] = [];
  const add = (label: string, soll: string, ist: string, fix: string, panel: 'timeline' | 'medien') =>
    out.push(makeDeduction(prefix, 'missingElement', 'auftrag', label, soll, ist, r.missingElement, fix, panel));
  if (v.facts.shots.length < spec.minShots) {
    add('Zu wenige Einstellungen', `mindestens ${spec.minShots} Einstellungen`, `${v.facts.shots.length} Einstellungen`, `Schneide weitere Einstellungen ein, bis es mindestens ${spec.minShots} sind.`, 'timeline');
  }
  if (spec.requireJCut && !v.facts.hasJOrLCut) {
    add('J- oder L-Cut fehlt', 'ein J- oder L-Cut', 'keiner', 'Verschiebe den Tonschnitt an einer Stelle vor oder hinter den Bildschnitt (J-/L-Cut).', 'timeline');
  }
  if (spec.requireLowerThird && v.facts.lowerThirds === 0) {
    add('Bauchbinde fehlt', 'eine Bauchbinde', 'keine', 'Lege eine Bauchbinde (Lower Third) mit dem Namen auf eine Titelspur.', 'timeline');
  }
  return out;
}

/** Haken, Fehlende Abgaben. Gibt nur Abzüge der Kategorie Auftrag zurück (Recherche-Texte bewertet evaluate separat). */
export function hookAndDeliverableRules(a: Assignment, videos: Record<string, VideoInput | null>, research: Record<string, unknown>, hookDone: boolean, rules: Rules): Deduction[] {
  const r = rules.deductions.auftrag;
  const out: Deduction[] = [];
  for (const d of a.deliverables) {
    const present = d.kind === 'video' ? videos[d.id] != null : research[d.id] != null;
    if (!present) {
      out.push(makeDeduction('', 'missingDeliverable', 'auftrag', `Abgabe „${d.label}“ fehlt`, 'abgegeben', 'fehlt', r.missingDeliverable, `Erstelle die Abgabe „${d.label}“ und gib sie mit ab.`, d.kind === 'video' ? 'export' : undefined));
    }
  }
  const present = a.deliverables.flatMap(d => (d.kind === 'video' && videos[d.id] ? [videos[d.id]!] : []));
  if (a.hook.verify === 'self') {
    if (!hookDone) {
      out.push(makeDeduction('', 'hookNotMet', 'auftrag', 'Haken nicht umgesetzt', a.hook.text, 'nicht bestätigt', r.hookNotMet, `Setze den Haken „${a.hook.text}“ um und bestätige ihn bei der Abgabe.`));
    }
  } else if (a.hook.autoRule === 'longShot8s' && present.length > 0) {
    const longest = Math.max(...present.map(v => v.facts.longestShotSec));
    if (longest < r.longShotMinSec) {
      out.push(makeDeduction('', 'hookNotMet', 'auftrag', 'Haken nicht umgesetzt: keine lange Einstellung', `eine Einstellung ≥ ${fmtDe(r.longShotMinSec, 0)} s`, `längste ${fmtDe(longest, 1)} s`, r.hookNotMet, `Verlängere eine Einstellung in der Timeline auf mindestens ${r.longShotMinSec} Sekunden.`, 'timeline'));
    }
  }
  return out;
}
