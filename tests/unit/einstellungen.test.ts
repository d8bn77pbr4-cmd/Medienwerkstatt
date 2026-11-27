import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MockBackend } from '../../src/backend/MockBackend';
import { applyTheme } from '../../src/features/einstellungen/theme';
import { vacationRefusalText } from '../../src/features/einstellungen/vacationText';
import { resetAppForTests, useApp } from '../../src/state/appStore';

describe('Urlaub: Meldung zu jedem Ablehnungsgrund', () => {
  it('alle vier Gründe haben eigenen deutschen Text', () => {
    const texts = (['past', 'over14days', 'overlap', 'invalid'] as const).map(vacationRefusalText);
    expect(new Set(texts).size).toBe(4);
    expect(texts[0]).toMatch(/Vergangenheit|zurück/i);
    expect(texts[1]).toMatch(/14/);
    expect(texts[2]).toMatch(/überschneidet/i);
    expect(texts[3]).toMatch(/Ende|Datum/i);
  });
});

describe('Darstellung', () => {
  afterEach(() => document.documentElement.removeAttribute('data-theme'));
  it('hell/dunkel setzt data-theme, automatisch entfernt es', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    applyTheme('auto');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});

describe('Einstellungen im App-Zustand', () => {
  const app = () => useApp.getState();
  const t0 = Date.parse('2026-11-23T10:00:00+01:00');
  beforeEach(async () => {
    localStorage.clear();
    resetAppForTests();
    await app().init(new MockBackend(), { now: () => t0 }, { installId: 'x' });
  });
  afterEach(() => resetAppForTests());

  it('Gemini ist standardmäßig aus; Schalter und Modell werden gespeichert', () => {
    expect(app().state!.settings.gemini).toEqual({ enabled: false, model: null });
    app().setGeminiEnabled(true);
    app().setGeminiModel('gemini-2.5-flash');
    expect(app().state!.settings.gemini).toEqual({ enabled: true, model: 'gemini-2.5-flash' });
  });
  it('Theme wird gespeichert', () => {
    app().setTheme('dark');
    expect(app().state!.settings.theme).toBe('dark');
  });
  it('Urlaub ab heute (Mitternacht) wird angenommen, gestern bleibt „past“', () => {
    const day = 24 * 3_600_000;
    const d = new Date(t0);
    const today = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    expect(app().addVacation({ start: today - day, end: today + day })).toEqual({ ok: false, reason: 'past' });
    expect(app().addVacation({ start: today, end: today + 2 * day }).ok).toBe(true);
    expect(app().state!.schedule.vacations[0].start).toBe(t0);
  });
  it('Urlaub: nur künftige Einträge lassen sich entfernen', () => {
    const day = 24 * 3_600_000;
    expect(app().addVacation({ start: t0 + 5 * day, end: t0 + 7 * day }).ok).toBe(true);
    expect(app().addVacation({ start: t0 - day, end: t0 + day })).toEqual({ ok: false, reason: 'past' });
    app().removeVacation(t0 + 5 * day);
    expect(app().state!.schedule.vacations).toEqual([]);
  });
});
