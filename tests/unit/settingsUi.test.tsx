import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBackend, resetBackendForTests } from '../../src/backend';
import { GeminiSection } from '../../src/features/einstellungen/GeminiSection';
import { SettingsView } from '../../src/features/einstellungen/SettingsView';
import { geminiNotReady } from '../../src/state/gemini';
import { resetAppForTests, useApp } from '../../src/state/appStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const t0 = Date.parse('2026-11-23T10:00:00+01:00');
let host: HTMLDivElement;
let root: Root;

async function mount(ui: React.ReactNode) {
  await act(async () => {
    root.render(ui);
  });
  await act(async () => {});
}

beforeEach(async () => {
  localStorage.clear();
  resetAppForTests();
  resetBackendForTests();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await useApp.getState().init(getBackend(), { now: () => t0 }, { installId: 'x' });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  resetAppForTests();
  resetBackendForTests();
});

const spyAll = () => {
  const g = getBackend().gemini;
  return { hasKey: vi.spyOn(g, 'hasKey'), setKey: vi.spyOn(g, 'setKey'), listModels: vi.spyOn(g, 'listModels'), generate: vi.spyOn(g, 'generate') };
};

describe('Einstellungen öffnen', () => {
  it('Gemini aus: keine einzige Gemini-Methode wird aufgerufen (auch kein Schlüsselbund-Zugriff)', async () => {
    const s = spyAll();
    await mount(<SettingsView />);
    expect(host.textContent).toContain('Gemini');
    for (const spy of Object.values(s)) expect(spy).not.toHaveBeenCalled();
  });

  it('Gemini an: Schlüssel wird gelesen, Modelle nur mit Schlüssel', async () => {
    await getBackend().gemini.setKey('k');
    useApp.getState().setGeminiEnabled(true);
    const s = spyAll();
    await mount(<GeminiSection />);
    expect(s.hasKey).toHaveBeenCalled();
    expect(s.listModels).toHaveBeenCalled();
    expect(s.generate).not.toHaveBeenCalled();
  });
});

describe('Kein Modell gewählt', () => {
  it('zeigt Hinweis mit „Erneut laden“, wenn die Liste kein Flash-Modell enthält', async () => {
    await getBackend().gemini.setKey('k');
    useApp.getState().setGeminiEnabled(true);
    vi.spyOn(getBackend().gemini, 'listModels').mockResolvedValue(['gemini-2.5-pro']);
    await mount(<GeminiSection />);
    expect(host.textContent).toContain('Kein Modell gewählt – Gemini bleibt aus');
    expect(host.textContent).toContain('Erneut laden');
    expect([...host.querySelectorAll('option')].map((o) => o.value)).toContain('gemini-2.5-pro');
  });

  it('zeigt Hinweis, wenn listModels scheitert', async () => {
    await getBackend().gemini.setKey('k');
    useApp.getState().setGeminiEnabled(true);
    vi.spyOn(getBackend().gemini, 'listModels').mockRejectedValue({ code: 'offline' });
    await mount(<GeminiSection />);
    expect(host.textContent).toContain('Kein Modell gewählt – Gemini bleibt aus');
  });

  it('kein Hinweis, sobald ein Modell gewählt ist', async () => {
    await getBackend().gemini.setKey('k');
    useApp.getState().setGeminiEnabled(true);
    await mount(<GeminiSection />);
    expect(host.textContent).not.toContain('Kein Modell gewählt');
  });
});

describe('geminiNotReady', () => {
  it('nur bei eingeschaltetem Gemini ohne Schlüssel oder Modell', () => {
    expect(geminiNotReady({ enabled: false, model: null }, false)).toBe(false);
    expect(geminiNotReady({ enabled: true, model: 'm' }, true)).toBe(false);
    expect(geminiNotReady({ enabled: true, model: null }, true)).toBe(true);
    expect(geminiNotReady({ enabled: true, model: 'm' }, false)).toBe(true);
    expect(geminiNotReady({ enabled: true, model: 'm' }, null)).toBe(false);
  });
});
