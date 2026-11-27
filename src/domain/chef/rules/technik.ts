import type { VideoSpec } from '../../assignments/types';
import { defaultPresetFor, getPreset } from '../../render/presets';
import { fmtDe, fmtTol } from '../format';
import type { Rules } from '../rules';
import { makeDeduction, type Deduction, type ProjectFacts, type VideoInput } from '../types';

const EPS = 1e-9;
const norm = (name: string) => name.replace(/_v\d{2,3}_/, '_v##_');
const iv = (i: { start: number; end: number }) => `${fmtDe(i.start, 1)}–${fmtDe(i.end, 1)} s`;
/** Namen der echten Bedienelemente, auf die die Hinweise zeigen. */
const SEQ_SETTINGS = 'die Sequenz (Inspektor → Reiter „Sequenz“)';
const GAIN = '„Pegel (Gain)“ im Inspektor (Reiter „Clip“)';
export const LIMITER_LABEL = 'Sicherheits-Limiter (−2 dBFS)';

/** Technik-Regeln (Spec §9.2) für eine Video-Abgabe. `prefix` kennzeichnet die Abgabe bei mehreren Videos. */
export function technikRules(spec: VideoSpec, v: VideoInput, rules: Rules, prefix: string): Deduction[] {
  const r = rules.deductions.technik;
  const { format, audio, video } = v.measurements;
  const facts: ProjectFacts = v.facts;
  const out: Deduction[] = [];
  const add = (...a: [string, string, string, string, number, string, ('audio' | 'farbe' | 'export' | 'timeline' | 'medien')?]) =>
    out.push(makeDeduction(prefix, a[0], 'technik', a[1], a[2], a[3], a[4], a[5], a[6]));

  const preset = getPreset(defaultPresetFor(spec));
  if (format.width !== spec.width || format.height !== spec.height) {
    add('resolution', 'Auflösung oder Seitenverhältnis falsch', `${spec.width}×${spec.height}`, `${format.width}×${format.height}`, r.resolutionOrAspect,
      preset.size
        ? `Wähle im Export die Vorlage „${preset.label}“ bzw. stelle ${SEQ_SETTINGS} auf ${spec.width}×${spec.height} (${spec.aspect}).`
        : `Stelle ${SEQ_SETTINGS} auf ${spec.width}×${spec.height} (${spec.aspect}); die Vorlage „${preset.label}“ übernimmt die Sequenzgröße.`, 'export');
  }
  if (Math.abs(format.fps - spec.fps) > 0.01) {
    add('fps', 'Bildrate falsch', `${spec.fps} fps`, `${fmtDe(format.fps, 2)} fps`, r.fps,
      `Stelle ${SEQ_SETTINGS} auf ${spec.fps} fps; der Export übernimmt die Bildrate der Sequenz.`, 'export');
  }
  if (facts.fpsMismatch) {
    add('mixedFps', 'Bildraten gemischt ohne Anpassung', 'einheitliche Bildrate', 'gemischte Bildraten', r.mixedFps,
      `Drehe am Handy mit ${spec.fps} fps und ersetze die Clips, die die Medienbibliothek mit abweichender Bildrate markiert.`, 'medien');
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
      'Lege Ton auf die Timeline und prüfe, dass die Tonspuren nicht stummgeschaltet sind (Lautsprecher-Knopf am Spurkopf).', 'audio');
  } else {
    const delta = audio.integratedLufs - spec.loudnessLufs;
    if (Math.abs(delta) > r.loudnessToleranceLU + EPS) {
      const loud = delta > 0;
      add('loudness', loud ? 'Ton zu laut' : 'Ton zu leise', soll, `${fmtDe(audio.integratedLufs, 1)} LUFS`,
        Math.max(r.loudnessMax, r.loudnessPerLU * Math.ceil(Math.abs(delta) - EPS)),
        `${loud ? 'Senke' : 'Hebe'} den ${GAIN} der Ton-Clips um etwa ${fmtDe(Math.abs(delta), 0)} dB, bis die integrierte Lautheit bei ${fmtDe(spec.loudnessLufs, 0)} LUFS liegt.`, 'audio');
    }
    if (audio.truePeakDbtp !== null && audio.truePeakDbtp > r.truePeakLimitDbtp) {
      add('truePeak', 'True Peak zu hoch', `≤ ${fmtDe(r.truePeakLimitDbtp, 0)} dBTP`, `${fmtDe(audio.truePeakDbtp, 1)} dBTP`, r.truePeak,
        `Lass im Export den „${LIMITER_LABEL}“ eingeschaltet oder senke den ${GAIN} der lautesten Clips.`, 'audio');
    }
  }
  if (audio.clippedSamples > 0) {
    add('clipping', 'Ton übersteuert (Clipping)', 'keine übersteuerten Samples', `${audio.clippedSamples} Samples`, r.clipping,
      `Senke den ${GAIN} der lauten Clips, bis nichts mehr übersteuert, oder schalte im Export den „${LIMITER_LABEL}“ ein.`, 'audio');
  }
  // Gewolltes Schwarz/Standbild (Titel über leerer Spur, Bild-Clips): Funde, die zu ≥ 50 % darin liegen, zählen nicht.
  const exempt = facts.exemptIntervals ?? [];
  const intended = (i: { start: number; end: number }) => {
    const len = i.end - i.start;
    const covered = exempt.reduce((s, x) => s + Math.max(0, Math.min(i.end, x.end) - Math.max(i.start, x.start)), 0);
    return len <= EPS ? exempt.some((x) => i.start >= x.start && i.start <= x.end) : covered >= 0.5 * len - EPS;
  };
  for (const [kind, list] of [['Schwarzbild', video.black], ['Standbild', video.freeze]] as const) {
    for (const i of list.filter((x) => !intended(x))) {
      add('blackOrFreeze', `Unbeabsichtigtes ${kind}`, `kein ${kind}`, iv(i), r.blackOrFreeze,
        `Schneide das ${kind} bei ${iv(i)} in der Timeline heraus oder fülle die Lücke mit Material.`, 'timeline');
    }
  }
  const codecOk = format.videoCodec === spec.codec;
  const nameOk = norm(v.fileName) === norm(spec.fileName);
  if (!codecOk || !nameOk) {
    add('codecOrFileName', !codecOk ? 'Falscher Codec' : 'Falscher Dateiname', !codecOk ? spec.codec : spec.fileName, !codecOk ? format.videoCodec : v.fileName, r.codecOrFileName,
      !codecOk ? `Wähle im Export die Vorlage „${preset.label}“ (Codec ${spec.codec}).` : `Benenne die Datei nach dem Schema „${spec.fileName}“ (Version darf abweichen).`, 'export');
  }
  return out;
}
