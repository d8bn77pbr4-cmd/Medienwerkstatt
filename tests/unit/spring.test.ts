import { describe, expect, it } from 'vitest';
import { Spring } from '../../src/design/spring';

function run(spring: Spring, steps: number, dt = 1 / 60) {
  // deterministische Simulation: Spring.step wird direkt getrieben
  for (let i = 0; i < steps; i++) spring.step(dt);
}

describe('Spring', () => {
  it('erreicht das Ziel und meldet Frames', () => {
    const frames: number[] = [];
    const s = new Spring({ response: 0.38 }, 0);
    s.to(100, (v) => frames.push(v), false);
    run(s, 120);
    expect(frames.length).toBeGreaterThan(5);
    expect(frames[frames.length - 1]).toBeCloseTo(100, 1);
    expect(s.value).toBeCloseTo(100, 1);
  });

  it('überschwingt bei Dämpfung 1 nicht', () => {
    const s = new Spring({ damping: 1, response: 0.38 }, 0);
    let max = 0;
    s.to(100, (v) => (max = Math.max(max, v)), false);
    run(s, 120);
    expect(max).toBeLessThanOrEqual(100.0001);
  });

  it('ist unterbrechbar und läuft vom aktuellen Wert/Tempo weiter', () => {
    const s = new Spring({}, 0);
    s.to(100, () => {}, false);
    run(s, 8);
    const mid = s.value;
    const vel = s.velocity;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
    expect(vel).toBeGreaterThan(0);
    s.to(0, () => {}, false);
    expect(s.value).toBe(mid);
    expect(s.velocity).toBe(vel);
    run(s, 240);
    expect(s.value).toBeCloseTo(0, 1);
  });
});
