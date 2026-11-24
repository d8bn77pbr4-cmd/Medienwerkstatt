export const HISTORY_CAP = 100;

/**
 * Verlauf aus unveränderlichen Schnappschüssen (strukturelle Teilung kommt von Immer in den Operationen).
 * Höchstens `cap` Schritte lassen sich rückgängig machen, der älteste fällt heraus.
 */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private current: T;

  constructor(initial: T, private readonly cap: number = HISTORY_CAP) {
    this.current = initial;
  }

  get present(): T {
    return this.current;
  }
  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }

  push(next: T): void {
    if (next === this.current) return;
    this.past.push(this.current);
    if (this.past.length > this.cap) this.past.shift();
    this.current = next;
    this.future = [];
  }
  /** Ersetzt den aktuellen Stand ohne neuen Schritt (z. B. fortlaufendes Ziehen eines Reglers). */
  replace(next: T): void {
    this.current = next;
    this.future = [];
  }
  undo(): T {
    const prev = this.past.pop();
    if (prev !== undefined) {
      this.future.push(this.current);
      this.current = prev;
    }
    return this.current;
  }
  redo(): T {
    const next = this.future.pop();
    if (next !== undefined) {
      this.past.push(this.current);
      this.current = next;
    }
    return this.current;
  }
}
