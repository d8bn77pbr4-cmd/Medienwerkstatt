export interface SpringOptions {
  /** Dämpfungsverhältnis: 1 = kritisch gedämpft (kein Überschwingen). */
  damping?: number;
  /** Antwortzeit in Sekunden (Periodendauer der ungedämpften Feder). */
  response?: number;
}

type Frame = (value: number) => void;

/**
 * Unterbrechbare Feder (Spec §10.4). Ein neuer Aufruf von `to` läuft vom
 * aktuellen Wert und Tempo weiter. Bei `prefers-reduced-motion` springt der
 * Wert sofort ans Ziel.
 */
export class Spring {
  value: number;
  velocity = 0;
  private target: number;
  private readonly stiffness: number;
  private readonly drag: number;
  private onFrame: Frame = () => {};
  private raf = 0;
  private last = 0;

  constructor({ damping = 1, response = 0.38 }: SpringOptions = {}, initial = 0) {
    const omega = (2 * Math.PI) / response;
    this.stiffness = omega * omega;
    this.drag = 2 * damping * omega;
    this.value = initial;
    this.target = initial;
  }

  /** Setzt ein neues Ziel. `animate = false` treibt die Feder nicht selbst (für Tests: `step`). */
  to(target: number, onFrame: Frame, animate = true): void {
    this.target = target;
    this.onFrame = onFrame;
    if (!animate) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.stop();
      this.value = target;
      this.velocity = 0;
      onFrame(target);
      return;
    }
    if (this.raf) return;
    this.last = performance.now();
    const tick = (now: number) => {
      const running = this.step(Math.min((now - this.last) / 1000, 1 / 30));
      this.last = now;
      this.raf = running ? requestAnimationFrame(tick) : 0;
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Ein Zeitschritt (Sekunden). Gibt true zurück, solange die Feder noch läuft. */
  step(dt: number): boolean {
    const substeps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / substeps;
    for (let i = 0; i < substeps; i++) {
      const accel = this.stiffness * (this.target - this.value) - this.drag * this.velocity;
      this.velocity += accel * h;
      this.value += this.velocity * h;
    }
    const settled = Math.abs(this.target - this.value) < 0.01 && Math.abs(this.velocity) < 0.05;
    if (settled) {
      this.value = this.target;
      this.velocity = 0;
    }
    this.onFrame(this.value);
    return !settled;
  }
}
