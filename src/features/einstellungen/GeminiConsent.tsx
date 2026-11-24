import { useState } from 'react';
import { getBackend } from '../../backend';
import type { GeminiFrame } from '../../domain/gemini/frames';
import { GEMINI_PRIVACY } from './privacy';

const SHOT_LABEL: Record<string, string> = { totale: 'Totale', halbtotale: 'Halbtotale', halbnah: 'Halbnah', nah: 'Nah', gross: 'Groß', detail: 'Detail' };
const sec = (t: number) => `${t.toFixed(1).replace('.', ',')} s`;

type Props = { frames: GeminiFrame[]; onSend(): void; onDecline(): void };

/**
 * Einwilligung vor jedem Senden (Spec §9.5): Vorschau der Standbilder, Datenschutz-Hinweis, Pflicht-Häkchen.
 * Ohne Häkchen bleibt „Senden“ gesperrt; „Ohne Gemini abgeben“ gibt nur mit Regeln ab.
 */
export function GeminiConsent({ frames, onSend, onDecline }: Props) {
  const [people, setPeople] = useState(false);
  const backend = getBackend();
  return (
    <div className="consent">
      <p>
        <strong>{GEMINI_PRIVACY.headline}</strong>
      </p>
      <p className="muted">{GEMINI_PRIVACY.sent}</p>
      {frames.length > 0 ? (
        <>
          <h3>Diese {frames.length} Standbilder gehen an Google</h3>
          <ul className="consent-frames" aria-label="Standbilder">
            {frames.map((f, i) => (
              <li key={`${f.deliverableId}-${f.time}-${i}`}>
                <img src={backend.mediaUrl(f.path)} alt={`Standbild bei ${sec(f.time)}${f.shotSize ? `, ${SHOT_LABEL[f.shotSize]}` : ''}`} loading="lazy" />
                <span>{sec(f.time)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="submit-note">Es gehen keine Bilder an Google, nur dein Text.</p>
      )}
      <label className="submit-check">
        <input type="checkbox" checked={people} onChange={(e) => setPeople(e.target.checked)} />
        <span>Alle erkennbaren Personen haben zugestimmt</span>
      </label>
      <p className="muted consent-hint">{GEMINI_PRIVACY.people}</p>
      <div className="consent-actions">
        <button type="button" className="btn pressable" onClick={onDecline}>
          Ohne Gemini abgeben
        </button>
        <button type="button" className="btn btn-primary pressable" data-autofocus disabled={!people} onClick={onSend}>
          Senden
        </button>
      </div>
    </div>
  );
}
