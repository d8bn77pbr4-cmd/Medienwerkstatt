import { describe, expect, it } from 'vitest';
import { pick, rng, weighted } from '../../src/domain/rng';

describe('rng', () => {
  it('rng ist deterministisch', () => {
    expect(rng('a#1')()).toBe(rng('a#1')());
    const a = rng('a#1');
    const b = rng('a#1');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('verschiedene Seeds liefern verschiedene Folgen, Werte in [0,1)', () => {
    expect(rng('a#1')()).not.toBe(rng('a#2')());
    const r = rng('x');
    for (let i = 0; i < 200; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('pick wählt ein Element der Liste', () => {
    const items = ['a', 'b', 'c'];
    const r = rng('p');
    for (let i = 0; i < 50; i++) expect(items).toContain(pick(r, items));
  });
  it('weighted respektiert Gewichte (0 wird nie gezogen, Verteilung grob passend)', () => {
    const r = rng('w');
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 2000; i++) counts[weighted(r, [['a', 1], ['b', 3], ['c', 0]])]++;
    expect(counts.c).toBe(0);
    expect(counts.b / counts.a).toBeGreaterThan(2);
    expect(counts.b / counts.a).toBeLessThan(4.5);
  });
});
