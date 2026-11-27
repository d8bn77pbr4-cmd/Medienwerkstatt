import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uuid } from '../../src/domain/uuid';
import { renderTitlePngDefault } from '../../src/state/exporter';
import type { TitleParams } from '../../src/domain/timeline/types';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('uuid (macOS 12 / Safari 15.0 ohne crypto.randomUUID)', () => {
  it('nutzt randomUUID, wenn vorhanden', () => {
    const spy = vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-2222-4333-8444-555555555555');
    expect(uuid()).toBe('11111111-2222-4333-8444-555555555555');
    expect(spy).toHaveBeenCalledOnce();
  });
  it('fällt ohne randomUUID auf getRandomValues zurück (Version 4, eindeutig)', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => real.getRandomValues(a) });
    const ids = new Set(Array.from({ length: 200 }, () => uuid()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(V4);
  });
});

describe('Titel-PNG ohne OffscreenCanvas (macOS 12 / Safari 15)', () => {
  const title: TitleParams = { style: 'titel', line1: 'Hallo', line2: '', font: 'SF Pro', size: 64, color: '#ffffff', x: 0.5, y: 0.5, fadeIn: 0, fadeOut: 0 };
  it('zeichnet in ein DOM-Canvas und liefert das PNG über toBlob', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    const calls: string[] = [];
    const ctx = {
      fillStyle: '', font: '', textAlign: 'left', textBaseline: 'alphabetic',
      save: () => calls.push('save'), restore: () => calls.push('restore'),
      clearRect: () => calls.push('clear'), fillRect: () => calls.push('rect'),
      fillText: (t: string) => calls.push(`text:${t}`), measureText: (t: string) => ({ width: t.length * 10 }),
    };
    const canvas = {
      width: 0, height: 0,
      getContext: (k: string) => (k === '2d' ? ctx : null),
      toBlob: (cb: (b: Blob | null) => void, type: string) => cb(new Blob([new Uint8Array([137, 80, 78, 71])], { type })),
    };
    const create = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      expect(tag).toBe('canvas');
      return canvas as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);
    const png = await renderTitlePngDefault(title, 1080, 1080);
    expect(create).toHaveBeenCalledWith('canvas');
    expect([canvas.width, canvas.height]).toEqual([1080, 1080]);
    expect(Array.from(png)).toEqual([137, 80, 78, 71]);
    expect(calls).toContain('text:Hallo');
  });
  it('OffscreenCanvas ohne convertToBlob (Safari 16.0) nutzt ebenfalls das DOM-Canvas', async () => {
    class NoBlob {
      getContext() {
        return null;
      }
    }
    vi.stubGlobal('OffscreenCanvas', NoBlob);
    const canvas = {
      width: 0, height: 0,
      getContext: () => ({ save() {}, restore() {}, clearRect() {}, fillRect() {}, fillText() {}, measureText: () => ({ width: 1 }) }),
      toBlob: (cb: (b: Blob | null) => void) => cb(new Blob([new Uint8Array([1, 2])])),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement);
    expect(Array.from(await renderTitlePngDefault(title, 100, 50))).toEqual([1, 2]);
  });
});

describe('CSS für Safari 15', () => {
  it('jede color-mix-Angabe hat davor eine einfache Farbe für dieselbe Eigenschaft', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(d, e.name));
        else if (e.name.endsWith('.css')) files.push(join(d, e.name));
      }
    };
    walk('src');
    let checked = 0;
    for (const f of files) {
      const decls = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split(/[;{}]/).map((x) => x.trim());
      decls.forEach((d, i) => {
        if (!d.includes('color-mix(')) return;
        const prop = d.split(':')[0].trim();
        const prev = decls[i - 1] ?? '';
        expect(prev.startsWith(`${prop}:`) && !prev.includes('color-mix('), `${f}: ${d.slice(0, 60)}`).toBe(true);
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(0);
  });
});
