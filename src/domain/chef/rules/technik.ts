import type { VideoSpec } from '../../assignments/types';
import { fmtDe, fmtTol } from '../format';
import type { Rules } from '../rules';
import { makeDeduction, type Deduction, type ProjectFacts, type VideoInput } from '../types';

const EPS = 1e-9;
const norm = (name: string) => name.replace(/_v\d{2,3}_/, '_v##_');
const iv = (i: { start: number; end: number }) => `${fmtDe(i.start, 1)}–${fmtDe(i.end, 1)} s`;

/** Technik-Regeln (Spec §9.2) für eine Video-Abgabe. `prefix` kennzeichnet die Abgabe bei mehreren Videos. */
export function technikRules(spec: VideoSpec, v: VideoInput, rules: Rules, prefix: string): Deduction[] {
  const r = rules.deductions.technik;
  const { format, audio, video } = v.measurements;
  const facts: ProjectFacts = v.facts;
  const out: Deduction[] = [];
  const add = (...a: [string, string, string, string, number, string, ('audio' | 'farbe' | 'export' | 'timeline' | 'medien')?]) =>
    out.push(makeDeduction(prefix, a[0], 'technik', a[1], a[2], a[3], a[4], a[5], a[6]));

  if (format.width !== spec.width || format.height !== spec.height) {
    add('resolution', 'Auflösung oder Seitenverhältnis falsch', `${spec.width}×${spec.height}`, `${format.width}×${format.height}`, r.resolutionOrAspect,
      `Stelle in der Sequenz- und Export-Einstellung die Auflösung auf ${spec.width}×${spec.height} (${spec.aspect}) ein.`, 'export');
  }
  if (Math.abs(format.fps - spec.fps) > 0.01) {
    add('fps', 'Bildrate falsch', `${spec.fps} fps`, `${fmtDe(format.fps, 2)} fps`, r.fps,
      `Stelle die Bildrate der Sequenz und des Exports auf ${spec.fps} fps.`, 'export');
  }
  if (facts.fpsMismatch) {
    add('mixedFps', 'Bildraten gemischt ohne Anpassung', 'einheitliche Bildrate', 'gemischte Bildraten', r.mixedFps,
      'Wandle Clips mit abweichender Bildrate im Medien-Bereich auf die Bildrate der Sequenz um.', 'medien');
  }
  const beyond = Math.abs(format.durationSec - spec.durationSec) - spec.toleranceSec;
  if (beyond > EPS) {
    add('length', 'Länge außerhalb der Toleranz', `${fmtDe(spec.durationSec, 1)} s ±${fmtTol(spec.toleranceSec)}`, `${fmtDe(format.durationSec, 1)} s`,
      Math.max(r.lengthMax, r.lengthPerSecond * Math.ceil(beyond - EPS)),
      format.durationSec > spec.durationSec
        ? `Kürze den Film in der Timeline um mindestens ${fmtDe(Math.ceil(beyond - EPS), 0)} Sekunden.`
        : `Verlängere den Film in der Timeline um mindestens ${fmtDe(Math.ceil(beyond - EPS), 0)} Sekunden.`, 'timeline');
  }

  const soll = `${fmtDe(spec.loudnessLufs, 0)} LUFS ±${fmtTol(r.loudnessToleranceLU)}`;
  if (audio.integratedLufs === null) {
    add('loudness', 'Kein Ton im Film', soll, 'kein Ton', r.loudnessMax,
      'Prüfe, ob im Export eine Tonspur aktiv ist, und lege Ton auf die Timeline.', 'audio');
  } else {
    const delta = audio.integratedLufs - spec.loudnessLufs;
    if (Math.abs(delta) > r.loudnessToleranceLU + EPS) {
      const loud = delta > 0;
      add('loudness', loud ? 'Ton zu laut' : 'Ton zu leise', soll, `${fmtDe(audio.integratedLufs, 1)} LUFS`,
        Math.max(r.loudnessMax, r.loudnessPerLU * Math.ceil(Math.abs(delta) - EPS)),
        `${loud ? 'Senke' : 'Hebe'} den Master-Pegel im Ton-Inspektor, bis die integrierte Lautheit bei ${fmtDe(spec.loudnessLufs, 0)} LUFS liegt.`, 'audio');
    }
    if (audio.truePeakDbtp !== null && audio.truePeakDbtp > r.truePeakLimitDbtp) {
      add('truePeak', 'True Peak zu hoch', `≤ ${fmtDe(r.truePeakLimitDbtp, 0)} dBTP`, `${fmtDe(audio.truePeakDbtp, 1)} dBTP`, r.truePeak,
        `Setze den Limiter im Ton-Inspektor auf ${fmtDe(r.truePeakLimitDbtp, 0)} dBTP.`, 'audio');
    }
  }
  if (audio.clippedSamples > 0) {
    add('clipping', 'Ton übersteuert (Clipping)', 'keine übersteuerten Samples', `${audio.clippedSamples} Samples`, r.clipping,
      'Senke die lauten Stellen im Ton-Inspektor ab, bis nichts mehr übersteuert.', 'audio');
  }
  for (const [kind, list] of [['Schwarzbild', video.black], ['Standbild', video.freeze]] as const) {
    for (const i of list) {
      add('blackOrFreeze', `Unbeabsichtigtes ${kind}`, `kein ${kind}`, iv(i), r.blackOrFreeze,
        `Schneide das ${kind} bei ${iv(i)} in der Timeline heraus oder fülle die Lücke mit Material.`, 'timeline');
    }
  }
  const codecOk = format.videoCodec === spec.codec;
  const nameOk = norm(v.fileName) === norm(spec.fileName);
  if (!codecOk || !nameOk) {
    add('codecOrFileName', !codecOk ? 'Falscher Codec' : 'Falscher Dateiname', !codecOk ? spec.codec : spec.fileName, !codecOk ? format.videoCodec : v.fileName, r.codecOrFileName,
      !codecOk ? `Wähle im Export den Codec ${spec.codec}.` : `Benenne die Datei nach dem Schema „${spec.fileName}“ (Version darf abweichen).`, 'export');
  }
  return out;
}
