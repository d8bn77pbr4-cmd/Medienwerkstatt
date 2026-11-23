import type { Assignment, Deliverable, ShotSize, VideoSpec } from '../../domain/assignments/types';
import { RESEARCH_TEMPLATES } from '../../domain/chef/research';
import { loadRules } from '../../domain/chef/rules';

export type Vorgabe = { id: string; text: string };
export type VorgabenGruppe = { id: string; heading: string | null; items: Vorgabe[] };

const SIZE_LABEL: Record<ShotSize, string> = {
  totale: 'Totale',
  halbtotale: 'Halbtotale',
  halbnah: 'Halbnah',
  nah: 'Nah',
  gross: 'Groß',
  detail: 'Detail',
};

const num = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
const minus = (n: number) => String(n).replace('-', '−');

export function lengthLabel(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m === 0 ? `${s} s` : `${m}:${String(s).padStart(2, '0')} min`;
}

export function videoVorgaben(d: Deliverable, spec: VideoSpec): Vorgabe[] {
  const p = (key: string, text: string): Vorgabe => ({ id: `${d.id}:${key}`, text });
  const out: Vorgabe[] = [
    p('format', `Format: ${spec.aspect}, ${spec.width} × ${spec.height} Pixel`),
    p('fps', `Bildrate: ${spec.fps} fps`),
    p('laenge', `Länge: ${lengthLabel(spec.durationSec)} ± ${num(spec.toleranceSec)} s`),
    p('lautheit', `Lautheit: ${minus(spec.loudnessLufs)} LUFS (integriert)`),
    p('truepeak', `True Peak: höchstens ${minus(spec.truePeakMax)} dBTP`),
    p('codec', `Codec und Dateiname: ${spec.codec === 'h264' ? 'H.264' : 'Apple ProRes'}, ${spec.fileName}`),
    p('einstellungen', `Mindestens ${spec.minShots} Einstellungen`),
    p('groessen', `Pflicht-Einstellungsgrößen: ${spec.requiredShotSizes.map((s) => SIZE_LABEL[s]).join(', ')}`),
  ];
  if (spec.requireJCut) out.push(p('jcut', 'J-Cut: Ton setzt vor dem Bild ein'));
  if (spec.requireLowerThird) out.push(p('bauchbinde', 'Bauchbinde mit Name und Funktion'));
  return out;
}

export function researchVorgaben(d: Deliverable): Vorgabe[] {
  const rules = loadRules();
  const t = d.researchTemplate ? RESEARCH_TEMPLATES[d.researchTemplate] : null;
  const required = t ? t.fields.filter((f) => f.required).map((f) => f.label) : [];
  const out: Vorgabe[] = [];
  if (required.length) out.push({ id: `${d.id}:pflicht`, text: `Pflichtfelder ausfüllen: ${required.join(', ')}` });
  out.push({ id: `${d.id}:laenge`, text: 'Texte im Längenrahmen des jeweiligen Felds halten' });
  out.push({ id: `${d.id}:quellen`, text: `Mindestens ${rules.deductions.auftrag.researchMinSources} Quellen mit vollständigem Link (https://…)` });
  return out;
}

/** Vorgaben je Abgabe, am Ende der Hinweis (Haken) des Auftrags. */
export function vorgabenFor(a: Assignment): VorgabenGruppe[] {
  const groups: VorgabenGruppe[] = a.deliverables.map((d) => ({
    id: d.id,
    heading: a.deliverables.length > 1 ? d.label : null,
    items: d.videoSpec ? videoVorgaben(d, d.videoSpec) : researchVorgaben(d),
  }));
  groups.push({ id: 'haken', heading: a.deliverables.length > 1 ? 'Besonderheit' : null, items: [{ id: `haken:${a.hook.id}`, text: `Besonderheit: ${a.hook.text}` }] });
  return groups;
}
