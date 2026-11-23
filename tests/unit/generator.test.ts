import { describe, expect, it } from 'vitest';
import { AVAILABLE_TYPES, generateAssignment, loadCatalogs } from '../../src/domain/assignments/generator';
import { fileNameFor, projectFolderFor, slugify } from '../../src/domain/assignments/naming';
import type { Assignment, AssignmentType, Deliverable, VideoSpec } from '../../src/domain/assignments/types';
import { loadRules, type Level } from '../../src/domain/chef/rules';

const catalogs = loadCatalogs();
const rules = loadRules();

function gen(install: string, n: number, level: Level = 2, available: AssignmentType[] = AVAILABLE_TYPES): Assignment {
  return generateAssignment(install, n, 1_700_000_000_000, level, available, catalogs, rules);
}
const specs = (a: Assignment): VideoSpec[] => a.deliverables.flatMap(d => (d.videoSpec ? [d.videoSpec] : []));
const videoSpec = (a: Assignment): VideoSpec => specs(a)[0];
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const LEVELS: Level[] = [1, 2, 3, 4, 5];
const anlassOf = (a: Assignment) => catalogs.anlaesse.find(x => a.occasion.endsWith(x.name))!;

describe('Kataloge', () => {
  it('Mengen', () => {
    expect(catalogs.kunden.length).toBeGreaterThanOrEqual(20);
    expect(catalogs.kunden.map(k => k.name)).toContain('Bäckerei Korn & Kruste');
    for (const k of catalogs.kanaele) expect(catalogs.anlaesse.filter(x => x.kanal === k.id).length).toBeGreaterThanOrEqual(8);
    expect(catalogs.haken.length).toBeGreaterThanOrEqual(15);
    expect(catalogs.haken.filter(h => h.verify === 'auto').map(h => h.autoRule).sort()).toEqual(['bothFormats', 'longShot8s']);
    for (const list of Object.values(catalogs.recherche)) expect(list.length).toBeGreaterThanOrEqual(5);
  });
  it('Anlass-Namen und Haken-IDs sind eindeutig, Anlässe liegen in 15 s – 3 min', () => {
    const names = catalogs.anlaesse.map(x => x.name);
    expect(new Set(names).size).toBe(names.length);
    const ids = catalogs.haken.map(h => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const x of catalogs.anlaesse) {
      expect(x.minSec).toBeGreaterThanOrEqual(15);
      expect(x.maxSec).toBeLessThanOrEqual(180);
      expect(x.minSec).toBeLessThanOrEqual(x.maxSec);
      expect(catalogs.kanaele.some(k => k.id === x.kanal)).toBe(true);
    }
  });
});

describe('generateAssignment', () => {
  it('gleicher Seed → gleicher Auftrag', () => expect(gen('x', 7)).toEqual(gen('x', 7)));
  it('andere Installations-ID → anderer Auftrag', () => {
    const same = range(30).filter(n => JSON.stringify(gen('x', n)) === JSON.stringify(gen('y', n)));
    expect(same.length).toBeLessThan(5);
  });
  it('nur verfügbare Typen', () => {
    for (let n = 1; n <= 200; n++) expect(['video', 'research', 'kombi']).toContain(gen('x', n).type);
  });
  it('nur Recherche verfügbar → nur Recherche', () => {
    for (let n = 1; n <= 50; n++) expect(gen('x', n, 3, ['research']).type).toBe('research');
  });
  it('nicht unterstützte Typen werden ignoriert', () => {
    for (let n = 1; n <= 50; n++) expect(['video', 'research', 'kombi']).toContain(gen('x', n, 2, ['video', 'research', 'ton', 'bild', 'motion']).type);
  });
  it('Stufe 1 hat keine Kombi-Aufträge', () => {
    for (let n = 1; n <= 100; n++) expect(gen('x', n, 1).type).not.toBe('kombi');
  });
  it('ab Stufe 2 gibt es etwa 30 % Kombi', () => {
    const k = range(300).filter(n => gen('x', n, 3).type === 'kombi').length;
    expect(k).toBeGreaterThan(60);
    expect(k).toBeLessThan(120);
  });
  it('Typgewichte: Video häufiger als Recherche (40:20)', () => {
    const t = range(400).map(n => gen('x', n, 1).type);
    const v = t.filter(x => x === 'video').length;
    expect(v).toBeGreaterThan(t.filter(x => x === 'research').length);
    expect(v / 400).toBeGreaterThan(0.55);
    expect(v / 400).toBeLessThan(0.78);
  });
  it('Platzhalter für Fristen und Status', () => {
    const a = gen('x', 3);
    expect(a.deadline).toBe(a.issuedAt);
    expect(a.expiresAt).toBe(a.issuedAt);
    expect(a.status).toBe('open');
    expect(a.submissions).toEqual([]);
    expect(a.number).toBe(3);
    expect(a.level).toBe(2);
  });
  it('Toleranz sinkt mit der Stufe', () => expect(videoSpec(gen('x', 3, 5)).toleranceSec).toBeLessThan(videoSpec(gen('x', 3, 1)).toleranceSec));
  it('Toleranz = Dauer × Prozent der Stufe', () => {
    for (const level of LEVELS) {
      for (const n of range(40)) {
        const a = gen('x', n, level);
        for (const s of specs(a)) expect(s.toleranceSec).toBeCloseTo((s.durationSec * rules.lengthTolerancePct[level - 1]) / 100, 10);
      }
    }
  });
  it('Hochformat 9:16 hat 1080×1920 (und die übrigen Formate stimmen)', () => {
    let vertical = 0;
    for (const level of LEVELS) {
      for (let n = 1; n <= 200; n++) {
        for (const s of specs(gen('x', n, level))) {
          if (s.aspect === '9:16') {
            vertical++;
            expect([s.width, s.height]).toEqual([1080, 1920]);
          } else if (s.aspect === '1:1') expect([s.width, s.height]).toEqual([1080, 1080]);
          else expect([[1920, 1080], [3840, 2160]]).toContainEqual([s.width, s.height]);
        }
      }
    }
    expect(vertical).toBeGreaterThan(50);
  });
  it('Technik: Dauer, Lautheit nach Kanal, Bildrate, Codec, True Peak', () => {
    const seen = { fps50: 0, fps30: 0, fps24: 0, prores: 0, uhd: 0 };
    for (const level of LEVELS) {
      for (let n = 1; n <= 200; n++) {
        const a = gen('x', n, level);
        for (const s of specs(a)) {
          const anlass = anlassOf(a);
          const kanal = catalogs.kanaele.find(k => k.id === anlass.kanal)!;
          expect(s.durationSec).toBeGreaterThanOrEqual(Math.max(15, anlass.minSec));
          expect(s.durationSec).toBeLessThanOrEqual(Math.min(180, anlass.maxSec));
          expect(s.loudnessLufs).toBe(kanal.loudnessLufs);
          expect(s.truePeakMax).toBe(-1);
          if (s.fps === 50) { expect(level).toBeGreaterThanOrEqual(3); seen.fps50++; }
          if (s.fps === 30 || s.fps === 24) { expect(anlass.fps).toBe(s.fps); if (s.fps === 30) seen.fps30++; else seen.fps24++; }
          else if (s.fps === 25) expect(anlass.fps).toBeUndefined();
          if (s.codec === 'prores') { expect(level).toBeGreaterThanOrEqual(4); expect(anlass.master).toBe(true); expect(s.fileName.endsWith('.mov')).toBe(true); seen.prores++; }
          else expect(s.fileName.endsWith('.mp4')).toBe(true);
          if (s.height === 2160) { expect(level).toBeGreaterThanOrEqual(4); seen.uhd++; }
        }
      }
    }
    expect(seen.fps50).toBeGreaterThan(0);
    expect(seen.fps30 + seen.fps24).toBeGreaterThan(0);
    expect(seen.prores).toBeGreaterThan(0);
    expect(seen.uhd).toBeGreaterThan(0);
  });
  it('VideoSpec.fileName = fileNameFor(a, d, 1)', () => {
    for (let n = 1; n <= 100; n++) {
      const a = gen('x', n, 4);
      for (const d of a.deliverables) if (d.videoSpec) expect(d.videoSpec.fileName).toBe(fileNameFor(a, d, 1));
    }
  });
  it('Stufeneffekte: Einstellungen, Größen, J-Cut, Bauchbinde', () => {
    for (const level of LEVELS) {
      for (let n = 1; n <= 150; n++) {
        const a = gen('x', n, level);
        const anlass = anlassOf(a);
        for (const s of specs(a)) {
          expect(s.requiredShotSizes.length).toBe([1, 2, 2, 3, 3][level - 1]);
          expect(new Set(s.requiredShotSizes).size).toBe(s.requiredShotSizes.length);
          expect(s.minShots).toBeGreaterThanOrEqual(3);
          expect(s.requireJCut).toBe(level >= 2 && anlass.kind === 'interview');
          expect(s.requireLowerThird).toBe(anlass.kind === 'interview' || anlass.kind === 'bericht');
        }
      }
    }
  });
  it('minShots wächst mit Dauer und Stufe', () => {
    const find = (level: Level, pred: (s: VideoSpec) => boolean) => range(300).flatMap(n => specs(gen('x', n, level))).filter(pred);
    const short1 = find(1, s => s.durationSec <= 30)[0];
    const long1 = find(1, s => s.durationSec >= 120)[0];
    expect(long1.minShots).toBeGreaterThan(short1.minShots);
    const same = (level: Level) => videoSpec(gen('x', 5, level)).minShots;
    expect(same(5)).toBeGreaterThan(same(1));
  });
  it('Haken passt zum Haupttyp und zur Anlass-Art', () => {
    for (const level of LEVELS) {
      for (let n = 1; n <= 150; n++) {
        const a = gen('x', n, level);
        const eintrag = catalogs.haken.find(h => h.id === a.hook.id)!;
        expect(eintrag.appliesTo).toContain(a.type === 'research' ? 'research' : 'video');
        expect(a.hook).toEqual({ id: eintrag.id, text: eintrag.text, verify: eintrag.verify, ...(eintrag.autoRule ? { autoRule: eintrag.autoRule } : {}) });
        if (a.type !== 'research') {
          expect(eintrag.excludeKinds ?? []).not.toContain(anlassOf(a).kind);
          expect(eintrag.minDurationSec ?? 0).toBeLessThanOrEqual(videoSpec(a).durationSec);
        }
      }
    }
  });
  it('bothFormats → zwei Video-Abgaben 16:9 und 9:16 desselben Films', () => {
    const list = range(400).map(n => gen('x', n, 3)).filter(a => a.hook.autoRule === 'bothFormats');
    expect(list.length).toBeGreaterThan(0);
    for (const a of list) {
      const v = a.deliverables.filter(d => d.kind === 'video');
      expect(v.map(d => d.videoSpec!.aspect)).toEqual(['16:9', '9:16']);
      expect(v[0].videoSpec!.durationSec).toBe(v[1].videoSpec!.durationSec);
      expect(v[0].id).not.toBe(v[1].id);
      expect(v[0].videoSpec!.fileName).not.toBe(v[1].videoSpec!.fileName);
      expect(v[1].videoSpec!.fileName).toContain('_9x16_v01_');
      expect(v[0].videoSpec!.fileName).not.toContain('9x16');
    }
  });
  it('Recherche-Auftrag: eine Recherche-Abgabe, keine Drehhinweise, Thema im Briefing', () => {
    const list = range(200).map(n => gen('x', n, 1)).filter(a => a.type === 'research');
    expect(list.length).toBeGreaterThan(10);
    const seenTemplates = new Set<string>();
    for (const a of list) {
      expect(a.shootingNotes).toEqual([]);
      expect(a.deliverables).toHaveLength(1);
      const d = a.deliverables[0];
      expect(d.kind).toBe('research');
      expect(d.videoSpec).toBeUndefined();
      seenTemplates.add(d.researchTemplate!);
      expect(catalogs.recherche[d.researchTemplate!].some(t => a.briefing.includes(t))).toBe(true);
    }
    expect(seenTemplates.size).toBeGreaterThanOrEqual(5);
  });
  it('Kombi: Video-Abgabe plus Recherche-Abgabe (Shotlist oder Drehplan)', () => {
    const list = range(200).map(n => gen('x', n, 3)).filter(a => a.type === 'kombi');
    expect(list.length).toBeGreaterThan(10);
    for (const a of list) {
      expect(a.deliverables.filter(d => d.kind === 'research')).toHaveLength(1);
      expect(a.deliverables.some(d => d.kind === 'video')).toBe(true);
      expect(['shotlist', 'drehplan']).toContain(a.deliverables.find(d => d.kind === 'research')!.researchTemplate);
      expect(a.shootingNotes).toHaveLength(3);
    }
  });
  it('Drehhinweise immer, passend zu Bildrate und Format', () => {
    for (let n = 1; n <= 200; n++) {
      const a = gen('x', n, 3);
      if (a.type === 'research') continue;
      const s = videoSpec(a);
      expect(a.shootingNotes).toEqual([
        'HDR-Video aus',
        `Bildrate ${s.fps} fps`,
        s.aspect === '9:16' ? 'Hochformat halten' : 'Querformat halten',
      ]);
    }
  });
  it('Briefing: 2–4 deutsche Sätze mit Kunde, Titel vorhanden', () => {
    for (const level of LEVELS) {
      for (let n = 1; n <= 100; n++) {
        const a = gen('x', n, level);
        const sentences = a.briefing.split(/(?<=[.!?])\s+/).filter(Boolean);
        expect(sentences.length).toBeGreaterThanOrEqual(2);
        expect(sentences.length).toBeLessThanOrEqual(4);
        expect(a.briefing).toContain(a.client.name);
        expect(a.briefing.toLowerCase()).not.toContain('lorem');
        expect(a.briefing).toContain(a.hook.text);
        expect(a.title.length).toBeGreaterThan(3);
        expect(a.occasion.length).toBeGreaterThan(3);
        expect(catalogs.kunden).toContainEqual(a.client);
      }
    }
  });
  it('Klartext-Hinweis: Anzahl Einstellungen steht im Briefing', () => {
    const a = gen('x', 4, 3, ['video']);
    expect(a.briefing).toContain(`${videoSpec(a).minShots} Einstellungen`);
  });
});

describe('Fix-Runde 1', () => {
  it('kein Briefing verlangt ein Logo (Stufen 1–5, Nummern 1..300)', () => {
    for (const level of LEVELS) for (let n = 1; n <= 300; n++) expect(gen('x', n, level).briefing).not.toContain('Logo');
  });
  it('Recherche-Briefings enthalten keine Kanal-Zielgruppe', () => {
    const audiences = catalogs.kanaele.flatMap(k => k.zielgruppen);
    const seen = new Set<string>();
    for (const level of LEVELS) {
      for (let n = 1; n <= 300; n++) {
        const a = gen('x', n, level, ['research']);
        seen.add(a.deliverables[0].researchTemplate!);
        for (const z of audiences) expect(a.briefing).not.toContain(z);
      }
    }
    for (const t of ['kaufberatung', 'rechte', 'formatvergleich']) expect(seen.has(t)).toBe(true);
  });
  it('bothFormats nur auf erlaubten Kanälen, mit 16:9 und 9:16', () => {
    const hook = catalogs.haken.find(h => h.autoRule === 'bothFormats')!;
    let count = 0;
    for (const level of LEVELS) {
      for (let n = 1; n <= 300; n++) {
        const a = gen('x', n, level);
        if (a.hook.autoRule !== 'bothFormats') continue;
        count++;
        expect(hook.onlyChannels).toContain(anlassOf(a).kanal);
        expect(a.deliverables.filter(d => d.kind === 'video').map(d => d.videoSpec!.aspect)).toEqual(['16:9', '9:16']);
      }
    }
    expect(count).toBeGreaterThan(0);
    expect(hook.onlyChannels).not.toContain('lokal-tv');
    expect(hook.onlyChannels).not.toContain('messe-loop');
  });
});

describe('Dateinamen', () => {
  const spec: VideoSpec = {
    aspect: '16:9', width: 1920, height: 1080, fps: 25, durationSec: 60, toleranceSec: 6, loudnessLufs: -14, truePeakMax: -1,
    codec: 'h264', fileName: '', minShots: 5, requiredShotSizes: ['totale'], requireJCut: false, requireLowerThird: false,
  };
  const base = gen('x', 7, 1, ['video']);
  const d: Deliverable = { id: 'film', kind: 'video', label: 'Film', videoSpec: spec };
  const a: Assignment = { ...base, number: 7, client: { name: 'Bäckerei Korn & Kruste', branche: 'Bäckerei' }, hook: { id: 'x', text: 'x', verify: 'self' }, deliverables: [d] };

  it('Dateiname nach Konvention', () => expect(fileNameFor(a, d, 1)).toBe('A07_Baeckerei-Korn-und-Kruste_v01_1080p25.mp4'));
  it('Projektordner', () => expect(projectFolderFor(a)).toBe('A07_Baeckerei-Korn-und-Kruste'));
  it('Version zweistellig', () => expect(fileNameFor(a, d, 12)).toBe('A07_Baeckerei-Korn-und-Kruste_v12_1080p25.mp4'));
  it('Nummer ab 100 dreistellig', () => expect(projectFolderFor({ ...a, number: 100 })).toBe('A100_Baeckerei-Korn-und-Kruste'));
  it('Hochformat → 1080p, 4K → 2160p, ProRes → .mov', () => {
    const v = { ...d, videoSpec: { ...spec, aspect: '9:16' as const, width: 1080, height: 1920 } };
    expect(fileNameFor(a, v, 1)).toBe('A07_Baeckerei-Korn-und-Kruste_v01_1080p25.mp4');
    const uhd = { ...d, videoSpec: { ...spec, width: 3840, height: 2160, fps: 50 as const, codec: 'prores' as const } };
    expect(fileNameFor(a, uhd, 2)).toBe('A07_Baeckerei-Korn-und-Kruste_v02_2160p50.mov');
  });
  it('bothFormats: zweite Abgabe mit _9x16', () => {
    const both: Assignment = { ...a, hook: { id: 'b', text: 'b', verify: 'auto', autoRule: 'bothFormats' } };
    const v = { ...d, videoSpec: { ...spec, aspect: '9:16' as const, width: 1080, height: 1920 } };
    expect(fileNameFor(both, v, 1)).toBe('A07_Baeckerei-Korn-und-Kruste_9x16_v01_1080p25.mp4');
    expect(fileNameFor(both, d, 1)).toBe('A07_Baeckerei-Korn-und-Kruste_v01_1080p25.mp4');
  });
  it('Slug-Regeln', () => {
    expect(slugify('Café Morgenrot')).toBe('Cafe-Morgenrot');
    expect(slugify('Müller & Söhne – Groß!')).toBe('Mueller-und-Soehne-Gross');
    expect(slugify('Repair-Café  Werkbank')).toBe('Repair-Cafe-Werkbank');
  });
  it('Recherche-Abgaben haben keinen Dateinamen', () => {
    expect(() => fileNameFor(a, { id: 'r', kind: 'research', label: 'x', researchTemplate: 'expose' }, 1)).toThrow();
  });
});
