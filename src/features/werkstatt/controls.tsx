import { useId } from 'react';
import { useProject } from '../../state/projectStore';

const fmt = (v: number, step: number) => (step < 1 ? v.toFixed(2) : String(Math.round(v))).replace('.', ',').replace('-', '−');

type SliderProps = {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
  /** Zahl neben dem Regler zum Eintippen (sonst nur Anzeige). */
  numberInput?: boolean;
  onChange(v: number): void;
};

/** Regler, der dem Zeiger 1:1 folgt; eine Geste (Ziehen/Tippen) ergibt einen Verlaufsschritt. */
export function Slider({ label, min, max, step, value, unit, numberInput, onChange }: SliderProps) {
  const id = useId();
  const end = () => useProject.getState().endGesture();
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="slider">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        onPointerUp={end}
        onKeyUp={end}
        onBlur={end}
      />
      {numberInput ? (
        <input
          type="number"
          className="slider-num"
          aria-label={`${label}${unit ? ` in ${unit}` : ''} als Zahl`}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(clamp(v));
          }}
          onBlur={end}
        />
      ) : (
        <output htmlFor={id} className="slider-val">
          {fmt(value, step)}
          {unit ? ` ${unit}` : ''}
        </output>
      )}
    </div>
  );
}

/** Ganzzahliges Feld (z. B. Bilder einer Blende). */
export function IntField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange(v: number): void }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => {
          const v = Math.round(Number(e.target.value));
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
        onBlur={() => useProject.getState().endGesture()}
      />
    </div>
  );
}
