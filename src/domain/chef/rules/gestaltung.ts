import type { Hook, VideoSpec } from '../../assignments/types';
import { fmtDe } from '../format';
import type { Rules } from '../rules';
import { makeDeduction, type Deduction, type VideoInput } from '../types';

/** Gestaltungs-Regeln (Spec §9.2) für eine Video-Abgabe. */
export function gestaltungRules(spec: VideoSpec, v: VideoInput, hook: Hook, rules: Rules, prefix: string): Deduction[] {
  const g = rules.deductions.gestaltung;
  const { segments } = v.measurements.video;
  const facts = v.facts;
  const out: Deduction[] = [];
  const add = (...a: [string, string, string, string, number, string, ('audio' | 'farbe' | 'export' | 'timeline' | 'medien')?]) =>
    out.push(makeDeduction(prefix, a[0], 'gestaltung', a[1], a[2], a[3], a[4], a[5], a[6]));
  const thr = g.overexposedThresholdPct;

  const over = segments.filter(s => s.highlightsPct > thr);
  if (over.length > 0) {
    add('overexposed', 'Überbelichtete Einstellungen', `höchstens ${fmtDe(thr, 0)} % ausgefressene Lichter`, `${over.length} von ${segments.length} Einstellungen (bis ${fmtDe(Math.max(...over.map(s => s.highlightsPct)), 1)} %)`,
      Math.max(g.overexposedMax, g.overexposed * over.length), 'Senke im Farbe-Bereich die Lichter ab, bis nichts mehr ausfrisst.', 'farbe');
  }
  const under = segments.filter(s => s.shadowsPct > thr);
  if (under.length > 0) {
    add('underexposed', 'Unterbelichtete Einstellungen', `höchstens ${fmtDe(thr, 0)} % abgesoffene Tiefen`, `${under.length} von ${segments.length} Einstellungen (bis ${fmtDe(Math.max(...under.map(s => s.shadowsPct)), 1)} %)`,
      Math.max(g.underexposedMax, g.underexposed * under.length), 'Hebe im Farbe-Bereich die Tiefen an, bis die dunklen Bildteile wieder Zeichnung haben.', 'farbe');
  }

  const longShotHook = hook.autoRule === 'longShot8s';
  const badShots = facts.shots.filter(s => {
    const d = s.end - s.start;
    return d < g.shotLengthMinSec || (!longShotHook && d > g.shotLengthMaxSec);
  });
  if (badShots.length > 0) {
    add('shotLength', 'Einstellungslänge außerhalb des Rhythmus', `${fmtDe(g.shotLengthMinSec, 1)}–${fmtDe(g.shotLengthMaxSec, 0)} s je Einstellung`, `${badShots.length} Einstellung${badShots.length === 1 ? '' : 'en'} außerhalb`,
      Math.max(g.shotLengthOutOfRangeMax, g.shotLengthOutOfRange * badShots.length), 'Kürze zu lange Einstellungen oder verlängere zu kurze in der Timeline, bis alle im Rahmen liegen.', 'timeline');
  }
  for (const size of spec.requiredShotSizes) {
    if (!facts.shots.some(s => s.shotSize === size)) {
      add('missingShotSize', `Pflicht-Einstellungsgröße „${size}“ fehlt`, `mindestens eine Einstellung „${size}“`, 'keine', g.missingShotSize,
        `Beschrifte im Medien-Bereich einen passenden Clip als „${size}“ und schneide ihn ein.`, 'medien');
    }
  }
  let jumps = 0;
  for (let i = 1; i < segments.length; i++) {
    const a = segments[i - 1];
    const b = segments[i];
    if (Math.abs(b.meanLuma - a.meanLuma) > g.colorJumpLumaThreshold || Math.abs(b.meanU - a.meanU) > g.colorJumpChromaThreshold || Math.abs(b.meanV - a.meanV) > g.colorJumpChromaThreshold) jumps++;
  }
  if (jumps > 0) {
    add('colorJump', 'Farbsprung zwischen Einstellungen', 'ähnliche Helligkeit und Farbe in Nachbar-Einstellungen', `${jumps} Sprung${jumps === 1 ? '' : 'e'}`,
      Math.max(g.colorJumpMax, g.colorJump * jumps), 'Gleiche im Farbe-Bereich Helligkeit und Farbstich der betroffenen Einstellungen an.', 'farbe');
  }
  if (facts.audioCutsWithoutFade > 0) {
    add('audioCutNoFade', 'Tonschnitt ohne Blende', 'jeder Tonschnitt mit Blende', `${facts.audioCutsWithoutFade} Tonschnitt${facts.audioCutsWithoutFade === 1 ? '' : 'e'}`,
      Math.max(g.audioCutNoFadeMax, g.audioCutNoFade * facts.audioCutsWithoutFade), 'Ziehe an den Tonschnitten kurze Ein- und Ausblenden auf, damit nichts klickt.', 'audio');
  }
  return out;
}
