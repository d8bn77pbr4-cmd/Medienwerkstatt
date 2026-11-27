import { describe, expect, it } from 'vitest';
import { LoudnessMeter, formatDb, meanSquare, msToLufs, peakDb } from '../../src/features/werkstatt/meterMath';

describe('Pegel', () => {
  it('peakDb: dBFS des größten Betrags', () => {
    expect(peakDb(new Float32Array([0.5, -1, 0.2]))).toBeCloseTo(0);
    expect(peakDb(new Float32Array([0.5, -0.25]))).toBeCloseTo(-6.02, 1);
    expect(peakDb(new Float32Array([0, 0]))).toBe(-Infinity);
  });
  it('meanSquare und msToLufs (≈ BS.1770 ohne K-Filter)', () => {
    expect(meanSquare(new Float32Array([1, -1, 1, -1]))).toBe(1);
    expect(msToLufs(1)).toBeCloseTo(-0.691);
    expect(msToLufs(0)).toBe(-Infinity);
  });
  it('formatDb: deutsches Komma, echtes Minus, −∞', () => {
    expect(formatDb(-12.34)).toBe('−12,3');
    expect(formatDb(0)).toBe('0,0');
    expect(formatDb(-Infinity)).toBe('−∞');
    expect(formatDb(null)).toBe('–');
  });
});

describe('LoudnessMeter', () => {
  it('Kurzzeit-Lautheit über die letzten 3 s', () => {
    const m = new LoudnessMeter();
    expect(m.shortTerm()).toBeNull();
    m.push(0.01, 0); // −20,7
    m.push(0.01, 1000);
    expect(m.shortTerm()!).toBeCloseTo(msToLufs(0.01));
    m.push(1, 5000); // alte Blöcke fallen aus dem Fenster
    expect(m.shortTerm()!).toBeCloseTo(msToLufs(1));
  });
  it('integriert über alles, Stille (< −70) zählt nicht', () => {
    const m = new LoudnessMeter();
    m.push(0.01, 0);
    m.push(0, 100);
    m.push(1e-9, 200);
    m.push(0.01, 300);
    expect(m.integrated()!).toBeCloseTo(msToLufs(0.01));
    m.reset();
    expect(m.integrated()).toBeNull();
  });
});
