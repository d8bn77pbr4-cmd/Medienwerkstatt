import { describe, expect, it } from 'vitest';
import type { ResearchDoc } from '../../src/domain/chef/research';
import {
  containsAny,
  countStems,
  functionWordShare,
  implausibleShare,
  isGibberish,
  isImplausible,
  isKnownWord,
  looksLikeList,
  similarity,
  tokens,
  typeTokenRatio,
} from '../../src/domain/chef/textQuality';
import { COMMON_WORDS, FUNCTION_WORDS } from '../../src/domain/chef/wordlists';
import drehplan from '../fixtures/research/drehplan-schreinerei.json';
import expose from '../fixtures/research/expose-schreinerei.json';
import junk from '../fixtures/research/gibberish.json';
import kaufberatung from '../fixtures/research/kaufberatung-mikrofon.json';

const samples = [expose, drehplan, kaufberatung] as ResearchDoc[];

describe('tokens', () => {
  it('Kleinbuchstaben, Umlaute und ß gehören zum Wort; Ziffern und Zeichen trennen', () => {
    expect(tokens('Größe: Über 50 Bäume, Straße & Café')).toEqual(['größe', 'über', 'bäume', 'straße', 'café']);
    expect(tokens('J-Cut, 16:9')).toEqual(['j', 'cut']);
    expect(tokens('   ')).toEqual([]);
  });
});

describe('Wortlisten', () => {
  it('Grundwortliste im vorgesehenen Umfang, ohne lateinische Füllwörter', () => {
    expect(COMMON_WORDS.size).toBeGreaterThanOrEqual(250);
    expect(FUNCTION_WORDS.size).toBeGreaterThan(150);
    for (const latin of ['et', 'ut', 'sed', 'sit', 'est', 'non', 'ad', 'ex', 'id', 'qui', 'quis', 'amet', 'dolor', 'lorem', 'ipsum']) {
      expect(COMMON_WORDS.has(latin), latin).toBe(false);
    }
  });
  it('bekannte Wörter: Grundform, gebeugte Formen, Fachwörter, Kürzel', () => {
    for (const w of ['und', 'der', 'neuen', 'großen', 'kamera', 'gegenlicht', 'dslr', 'mwst']) expect(isKnownWord(w), w).toBe(true);
    for (const w of ['asdf', 'lorem', 'holzwerk', 'jfkd']) expect(isKnownWord(w), w).toBe(false);
  });
});

describe('Plausibilität einzelner Wörter', () => {
  it('ohne Vokal ab 4 Buchstaben, 3+ gleiche Buchstaben, Tastenreihe, Platzhalter, j/q-Folgen', () => {
    for (const w of ['hgfd', 'sdfsdf', 'aaaa', 'xxx', 'mmmmh', 'qwertz', 'asdf', 'yxcv', 'jklö', 'uiop', 'lkjh', 'test', 'lorem', 'jfkdla', 'qwd']) {
      expect(isImplausible(w), w).toBe(true);
    }
  });
  it('echte Wörter bleiben plausibel (auch mit „wert“, „Hertz“, drei gleichen Buchstaben in langen Wörtern, Kürzeln)', () => {
    for (const w of ['bewertung', 'mehrwert', 'kilohertz', 'schifffahrt', 'brennnessel', 'kontrolllampe', 'herbst', 'strumpf', 'schnitt', 'dslr', 'jpg', 'projekt', 'jung', 'quelle', 'brandt', 'holzwerk', 'ich', 'tv']) {
      expect(isImplausible(w), w).toBe(false);
    }
  });
});

describe('Kennzahlen', () => {
  it('Funktionswort-Anteil: deutscher Text hoch, Lorem ipsum und Tastatursalat niedrig', () => {
    expect(functionWordShare(expose.fields.inhalt)).toBeGreaterThan(0.3);
    expect(functionWordShare(junk.loremIpsum)).toBeLessThan(0.12);
    expect(functionWordShare(junk.loremIpsumKurz)).toBeLessThan(0.12);
    expect(functionWordShare(junk.tastatursalatLang)).toBeLessThan(0.12);
    expect(functionWordShare('')).toBe(0);
  });
  it('Anteil unplausibler Wörter, Zahlen zählen als plausibel', () => {
    expect(implausibleShare('asdf hallo')).toBe(0.5);
    expect(implausibleShare('asdf 90')).toBe(0.5);
    expect(implausibleShare(expose.fields.inhalt)).toBe(0);
  });
  it('Verhältnis verschiedener Wörter', () => {
    expect(typeTokenRatio('test test test test')).toBe(0.25);
    expect(typeTokenRatio('ein zwei drei')).toBe(1);
    expect(typeTokenRatio('')).toBe(1);
  });
  it('Listen erkennen: Komma-Reihen und groß geschriebene Nomen, nicht aber Fließtext oder Lorem ipsum', () => {
    expect(looksLikeList(drehplan.fields.motive)).toBe(true);
    expect(looksLikeList('werkstatt, hobelbank, maschinenhalle, holzlager, hof, büro')).toBe(true);
    expect(looksLikeList('Werkstatt Hobelbank Maschinenhalle Holzlager Firmenschild Büro')).toBe(true);
    expect(looksLikeList(expose.fields.inhalt)).toBe(false);
    expect(looksLikeList(junk.loremIpsum)).toBe(false);
    expect(looksLikeList(junk.tastatursalatLang)).toBe(false);
  });
});

describe('isGibberish', () => {
  it('Schutz vor Fehlalarm: kein Feld der echten Beispieltexte gilt als Unsinn', () => {
    for (const doc of samples) {
      for (const [key, text] of Object.entries(doc.fields)) expect(isGibberish(text), `${doc.templateId}.${key}: ${text}`).toBe(false);
    }
  });
  it('weitere echte Feldtexte (Listen, Technik, Codecs, Kleinschreibung) sind kein Unsinn', () => {
    const texts = [
      'Sony FX30, Rode NTG5, DJI RS3 Mini, Aputure Amaran 200x, SanDisk Extreme Pro 128 GB, Manfrotto Befree',
      'H.264 ist stark komprimiert und eignet sich für Web und Social Media. ProRes 422 HQ ist fast verlustfrei, die Dateien sind aber etwa zehnmal so groß.',
      'wir drehen am samstag in der werkstatt, zuerst das interview mit der chefin und danach die bilder von den maschinen',
      '- Totale Werkstatt\n- Halbnah Meisterin an der Hobelbank\n- Detail Hände mit Hobel\n- Nah Azubi im Holzlager\n- Totale Hof mit Schild',
      'Musik: „Morgenholz“ von Lena Feld, CC BY 4.0, Namensnennung im Abspann, kommerzielle Nutzung erlaubt.',
      'Für Familien, Kinder ab 6 Jahren und alle, die gern selbst etwas bauen.',
    ];
    for (const t of texts) expect(isGibberish(t), t).toBe(false);
  });
  it('kurze echte Angaben sind kein Unsinn', () => {
    for (const t of ['90 s', '1:30', '150 €', 'TV', '14.03.2027', 'Familien', 'Holzwerk Brandt', 'H.264 und ProRes', 'JPG und PNG', 'DSLM oder DSLR', 'CC BY 4.0', 'https://www.zdf.de/doku', 'Schifffahrt']) {
      expect(isGibberish(t), t).toBe(false);
    }
  });
  it('Tastatursalat, Zufallsbuchstaben, Wiederholung und Lorem ipsum sind Unsinn', () => {
    for (const t of [junk.tastatursalatLang, junk.zufallsbuchstaben, junk.wiederholt, junk.wiederholtLang, junk.loremIpsum, junk.loremIpsumKurz, ...junk.kurzSalat]) {
      expect(isGibberish(t), t).toBe(true);
    }
  });
  it('Lorem ipsum fällt über den niedrigen Funktionswort-Anteil (nicht über unplausible Wörter)', () => {
    expect(implausibleShare(junk.loremIpsum)).toBeLessThan(0.35);
    expect(isGibberish(junk.loremIpsum)).toBe(true);
  });
  it('lange Wiederholung fällt über das Verhältnis verschiedener Wörter', () => {
    const text = 'die werkstatt ist schön die werkstatt ist schön die werkstatt ist schön die werkstatt ist schön';
    expect(typeTokenRatio(text)).toBeLessThan(0.3);
    expect(isGibberish(text)).toBe(true);
  });
  it('leerer Text ist kein Unsinn (dafür gilt „leer“)', () => {
    expect(isGibberish('')).toBe(false);
    expect(isGibberish('   ')).toBe(false);
  });
  it('minWords verschiebt die Grenze zu den Regeln für längere Texte', () => {
    const fiveNouns = 'Hobelbank Maschinenhalle Holzlager Firmenschild Ausstellungsraum';
    expect(isGibberish(fiveNouns)).toBe(false);
    expect(isGibberish('hobelbank maschinenhalle holzlager firmenschild ausstellungsraum', 5)).toBe(true);
  });
});

describe('similarity', () => {
  it('Jaccard über die Wortmengen', () => {
    expect(similarity('Der Hund bellt', 'der hund bellt')).toBe(1);
    expect(similarity('a b c d', 'a b x y')).toBeCloseTo(2 / 6);
    expect(similarity('', '')).toBe(0);
    expect(similarity(expose.fields.inhalt, expose.fields.gestaltung)).toBeLessThan(0.3);
  });
});

describe('containsAny / countStems', () => {
  it('ohne Groß-/Kleinschreibung; ab 4 Buchstaben auch mitten im Wort, kürzere am Wortanfang', () => {
    expect(containsAny('Wir filmen im GEGENLICHT', ['licht'])).toBe(true);
    expect(containsAny('Die Stammkunden kommen', ['kund'])).toBe(true);
    expect(containsAny('Eine Tonspur', ['ton'])).toBe(true);
    expect(containsAny('Der Beton ist grau', ['ton'])).toBe(false);
    expect(containsAny('Schnitt mit J-Cuts und O-Ton', ['j-cut'])).toBe(true);
    expect(containsAny('Format 16:9', ['16:9'])).toBe(true);
    expect(containsAny('nichts davon', ['kamera', ''])).toBe(false);
  });
  it('zählt jeden Stamm einmal', () => {
    expect(countStems('Kamera, Kamera und noch eine Kamera', ['kamera', 'licht'])).toBe(1);
    expect(countStems(expose.fields.gestaltung, ['totale', 'gimbal', 'stativ', 'j-cut', 'atmo', 'zoom'])).toBe(5);
  });
});
