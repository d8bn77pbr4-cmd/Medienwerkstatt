import { describe, expect, it, vi } from 'vitest';
import type { Backend } from '../../src/backend/Backend';
import { MockBackend, mockUrlCheck } from '../../src/backend/MockBackend';
import type { Assignment } from '../../src/backend/types';
import { SOURCE_NOTE_OFFLINE } from '../../src/domain/chef/evaluate';
import type { ResearchDoc } from '../../src/domain/chef/research';
import { loadRules } from '../../src/domain/chef/rules';
import { checkSources, runSubmission } from '../../src/state/submission';
import exposeFixture from '../fixtures/research/expose-schreinerei.json';

const rules = loadRules();
const H = 3_600_000;
const DEADLINE = Date.UTC(2026, 10, 26, 17, 0, 0);
const doc = (sources: string[]): ResearchDoc => ({ ...(JSON.parse(JSON.stringify(exposeFixture)) as ResearchDoc), sources });
const assignment: Assignment = {
  id: 'A01', number: 1, issuedAt: DEADLINE - 72 * H, deadline: DEADLINE, expiresAt: DEADLINE + 72 * H, level: 1, type: 'research',
  client: { name: 'Schreinerei Holzwerk Brandt', branche: 'Handwerk' }, occasion: 'Recherche: Exposé', title: 'Exposé für Schreinerei Holzwerk Brandt',
  briefing: 'Es geht um einen Film zu einem anstehenden Jubiläum.', hook: { id: 'h', text: 'x', verify: 'self' },
  deliverables: [{ id: 'r', kind: 'research', label: 'Exposé', researchTemplate: 'expose' }], shootingNotes: [], status: 'open', submissions: [],
};

describe('Mock-Link-Prüfung', () => {
  it('/404 → notFound, Host mit „offline“ → unreachable, kein http(s) → unreachable, sonst ok', () => {
    expect(mockUrlCheck('https://www.zdf.de/doku', false)).toBe('ok');
    expect(mockUrlCheck('https://www.zdf.de/404', false)).toBe('notFound');
    expect(mockUrlCheck('https://offline.example.net/x', false)).toBe('unreachable');
    expect(mockUrlCheck('ftp://zdf.de/x', false)).toBe('unreachable');
    expect(mockUrlCheck('kein link', false)).toBe('unreachable');
  });
  it('Schalter „alles offline“ und höchstens sechs Links', async () => {
    const b = new MockBackend();
    const urls = Array.from({ length: 8 }, (_, i) => `https://s${i}.de/`);
    const on = await b.checkUrls(urls);
    expect(on).toHaveLength(6);
    expect(on.every(x => x.result === 'ok')).toBe(true);
    b.setLinksOffline(true);
    expect((await b.checkUrls(urls.slice(0, 2))).map(x => x.result)).toEqual(['unreachable', 'unreachable']);
  });
});

describe('checkSources', () => {
  it('prüft nur echte Quellen, je Adresse einmal, und meldet die Ergebnisse je Link', async () => {
    const b = new MockBackend();
    const spy = vi.spyOn(b, 'checkUrls');
    const r = await checkSources(b, { r: doc(['https://www.zdf.de/a', 'https://www.zdf.de/a', 'https://example.com', 'https://ard.de/404']), x: null });
    expect(spy).toHaveBeenCalledWith(['https://www.zdf.de/a', 'https://ard.de/404']);
    expect(r).toEqual({ sourceCheck: { 'https://www.zdf.de/a': 'ok', 'https://ard.de/404': 'notFound' }, sourcesOffline: false });
  });
  it('ohne prüfbare Links kein Aufruf', async () => {
    const b = new MockBackend();
    const spy = vi.spyOn(b, 'checkUrls');
    expect(await checkSources(b, { r: doc(['https://example.com', 'www.zdf.de']) })).toEqual({});
    expect(spy).not.toHaveBeenCalled();
  });
  it('offline = alle unerreichbar oder die Prüfung schlägt fehl', async () => {
    const b = new MockBackend();
    b.setLinksOffline(true);
    expect((await checkSources(b, { r: doc(['https://www.zdf.de/a']) })).sourcesOffline).toBe(true);
    const broken = { checkUrls: () => Promise.reject(new Error('kaputt')) } as unknown as Backend;
    expect(await checkSources(broken, { r: doc(['https://www.zdf.de/a']) })).toEqual({ sourcesOffline: true });
  });
});

describe('Abgabe mit Link-Prüfung', () => {
  const submit = (backend: Backend, research: ResearchDoc, messages: string[] = []) =>
    runSubmission({ backend, rules, assignment, project: null, research: { r: research }, selfChecks: { hookDone: true }, isCorrection: false, submittedAt: DEADLINE - H, onProgress: m => messages.push(m) });

  it('prüft die Links vor der Bewertung; 404 kostet Punkte', async () => {
    const messages: string[] = [];
    const e = await submit(new MockBackend(), doc(['https://www.handwerk.de/berufe/tischler', 'https://de.wikipedia.org/404']), messages);
    expect(messages).toEqual(['Prüfe Abgaben …', 'Prüfe Links …', 'Bewerte …']);
    expect(e.categories.auftrag.deductions.map(d => d.ruleId)).toEqual(['researchSourceNotFound']);
    expect(e.total).toBe(100 + rules.researchQuality.researchOnly.sourceNotFound);
    expect(e.sourceNote).toBeUndefined();
  });
  it('alles offline: kein Abzug, Hinweis im Protokoll', async () => {
    const b = new MockBackend();
    b.setLinksOffline(true);
    const e = await submit(b, doc(['https://www.handwerk.de/berufe/tischler', 'https://de.wikipedia.org/404']));
    expect(e.categories.auftrag.deductions).toEqual([]);
    expect(e.total).toBe(100);
    expect(e.sourceNote).toBe(SOURCE_NOTE_OFFLINE);
  });
});
