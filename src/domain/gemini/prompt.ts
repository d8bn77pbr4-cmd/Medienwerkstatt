import type { Assignment, ShotSize, VideoSpec } from '../assignments/types';
import { fmtDe } from '../chef/format';
import { RESEARCH_TEMPLATES } from '../chef/research';
import { loadRules } from '../chef/rules';
import type { Deduction, EvaluationInput, VideoInput } from '../chef/types';
import type { GeminiFrame } from './frames';

const SHOT_LABEL: Record<ShotSize, string> = {
  totale: 'Totale',
  halbtotale: 'Halbtotale',
  halbnah: 'Halbnah',
  nah: 'Nah',
  gross: 'Groß',
  detail: 'Detail',
};

/** Zeit als „1,5 s“ mit Dezimalkomma. */
const sec = (t: number) => `${fmtDe(t, 1)} s`;

function specLines(s: VideoSpec): string {
  return [
    `Format ${s.width}×${s.height} (${s.aspect}), ${s.fps} Bilder/s, ${s.durationSec} s ± ${s.toleranceSec} s`,
    `Lautheit ${s.loudnessLufs} LUFS, Codec ${s.codec}, mindestens ${s.minShots} Einstellungen`,
    s.requiredShotSizes.length ? `Pflicht-Einstellungsgrößen: ${s.requiredShotSizes.map((x) => SHOT_LABEL[x]).join(', ')}` : '',
    s.requireJCut ? 'Pflicht: J-/L-Schnitt' : '',
    s.requireLowerThird ? 'Pflicht: Bauchbinde' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

function measurementLines(v: VideoInput): string {
  const m = v.measurements;
  const parts = [
    `${m.format.width}×${m.format.height}, ${fmtDe(m.format.fps, 2)} Bilder/s, ${fmtDe(m.format.durationSec, 1)} s`,
    m.audio.integratedLufs === null ? 'kein Ton' : `Lautheit ${fmtDe(m.audio.integratedLufs, 1)} LUFS, True Peak ${m.audio.truePeakDbtp === null ? '–' : fmtDe(m.audio.truePeakDbtp, 1)} dBTP`,
    `${v.facts.shots.length} Einstellungen, längste ${fmtDe(v.facts.longestShotSec, 1)} s`,
    `${v.facts.transitions} Blenden, ${v.facts.lowerThirds} Bauchbinden${v.facts.hasJOrLCut ? ', J-/L-Schnitt vorhanden' : ''}`,
  ];
  const segs = m.video.segments;
  if (segs.length) {
    const luma = segs.map((s) => s.meanLuma);
    parts.push(`mittlere Helligkeit je Einstellung ${fmtDe(Math.min(...luma), 2)}–${fmtDe(Math.max(...luma), 2)}`);
  }
  return parts.join('; ');
}

/**
 * Anweisung für Gemini (Spec §9.5): Rolle, Briefing, Vorgaben, Messwerte, Abzüge des Regel-Chefs und die Liste der
 * Standbilder. Beurteilt werden nur Gestaltung und Auftragstreue; Technik ist bereits gemessen.
 */
export function buildGeminiPrompt(a: Assignment, input: EvaluationInput, ruleDeductions: Deduction[], frames: GeminiFrame[] = []): string {
  const max = loadRules().gemini.maxShift;
  const out: string[] = [];
  out.push(
    'Du bist ein erfahrener Producer und Ausbilder (Mediengestalter Bild und Ton). Du begutachtest die Abgabe eines Auszubildenden sachlich und direkt, ohne Floskeln.',
    '',
    `## Auftrag #${a.number}: ${a.title}`,
    `Kunde: ${a.client.name} (${a.client.branche}). Anlass: ${a.occasion}`,
    `Briefing: ${a.briefing}`,
    `Haken (Zusatzaufgabe): ${a.hook.text}`,
  );
  for (const d of a.deliverables) {
    out.push('', `## Abgabe „${d.label}“`);
    if (d.kind === 'video' && d.videoSpec) {
      out.push(`Vorgaben: ${specLines(d.videoSpec)}`);
      const v = input.videos[d.id];
      out.push(v ? `Messwerte: ${measurementLines(v)}` : 'Es wurde kein Film abgegeben.');
      const fs = frames.filter((f) => f.deliverableId === d.id);
      if (fs.length) {
        out.push(`Standbilder (in dieser Reihenfolge angehängt, je Einstellung die Bildmitte):`);
        fs.forEach((f, i) => out.push(`${i + 1}. bei ${sec(f.time)}, Einstellungsgröße laut Etikett: ${f.shotSize ? SHOT_LABEL[f.shotSize] : 'nicht etikettiert'}`));
      }
    } else if (d.kind === 'research') {
      const doc = input.research[d.id];
      const tpl = RESEARCH_TEMPLATES[d.researchTemplate ?? doc?.templateId ?? 'expose'];
      if (!doc) out.push('Es wurde nichts abgegeben.');
      else {
        out.push(`Vorlage: ${tpl.label}. Kein Bildmaterial, nur Text.`);
        for (const f of tpl.fields) out.push(`${f.label}: ${(doc.fields[f.key] ?? '').trim() || '(leer)'}`);
        out.push(`Quellen: ${doc.sources.filter((s) => s.trim()).join('; ') || '(keine)'}`);
      }
    }
  }
  out.push('', '## Bereits gemessene Abzüge des Regel-Chefs (Technik ist erledigt)');
  if (ruleDeductions.length === 0) out.push('Keine.');
  for (const d of ruleDeductions) out.push(`- ${d.label}: Soll ${d.soll}, Ist ${d.ist} (${d.points} Punkte)`);
  out.push(
    '',
    '## Deine Aufgabe',
    'Beurteile nur Gestaltung (Bildaufbau, Einstellungsgrößen, Licht, Farbe) und Auftragstreue (Briefing; bei Recherche: Inhalt und Logik). Technik ist bereits gemessen – beurteile sie nicht.',
    'Gib je Kriterium ein knappes Urteil, eine Begründung in ein bis zwei Sätzen und eine Punktanpassung (shift) zwischen −10 und 10. Wähle nur Kriterien, die du anhand des Materials wirklich beurteilen kannst.',
    `Die Summe aller Anpassungen wird auf höchstens ±${max} Punkte begrenzt. Sei also sparsam: 0 heißt „passt wie geregelt“.`,
    'Antworte ausschließlich im vorgegebenen JSON-Schema, auf Deutsch. Im Feld summary fasst du in zwei bis drei Sätzen zusammen.',
  );
  return out.join('\n');
}
