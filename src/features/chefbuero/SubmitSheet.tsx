import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBackend } from '../../backend';
import type { Assignment } from '../../domain/assignments/types';
import { canCorrect, correctionBlockedText } from '../../domain/chef/correction';
import { countedSources, RESEARCH_TEMPLATES } from '../../domain/chef/research';
import { loadRules } from '../../domain/chef/rules';
import type { Evaluation } from '../../domain/chef/types';
import type { Project } from '../../domain/timeline/types';
import { Sheet } from '../../shell/Sheet';
import { GeminiConsent } from '../einstellungen/GeminiConsent';
import { geminiNotReady, type GeminiChoice } from '../../state/gemini';
import type { GeminiPreparation } from '../../state/geminiFrames';
import { researchKey, useApp } from '../../state/appStore';
import { loadProjectFor } from '../../state/projectAccess';
import { exportStale, latestExport } from '../../state/submission';
import { useNow } from '../../state/useNow';
import './chefbuero.css';

type Line = { id: string; label: string; ok: boolean; stale?: boolean; text: string; action?: { label: string; to: string } };

/** Abgabe-Blatt: Liste der Abgaben mit Status, Haken-Bestätigung, Primärbutton „Abgeben“ (bzw. beim Nachbessern „Korrektur abgeben“). */
export function SubmitSheet({ assignment, onClose, onDone }: { assignment: Assignment; onClose(): void; onDone?(e: Evaluation): void }) {
  const navigate = useNavigate();
  const rules = loadRules();
  const research = useApp((s) => s.state?.research);
  const evaluations = useApp((s) => s.state?.evaluations);
  const now = useNow();
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [hookDone, setHookDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Gemini ist aktiv: vor dem Senden die Standbilder zeigen und um Einwilligung bitten. */
  const [consent, setConsent] = useState<GeminiPreparation | null>(null);
  const geminiSettings = useApp((s) => s.state?.settings.gemini);
  const geminiOn = geminiSettings?.enabled ?? false;
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  // Schlüsselstatus nur lesen, wenn Gemini eingeschaltet ist (aus = kein Gemini-Aufruf).
  useEffect(() => {
    if (!geminiOn) return;
    let alive = true;
    getBackend().gemini.hasKey().then((k) => alive && setHasKey(k), () => alive && setHasKey(false));
    return () => {
      alive = false;
    };
  }, [geminiOn]);
  const geminiNotice = geminiSettings && geminiNotReady(geminiSettings, hasKey);

  useEffect(() => {
    let alive = true;
    loadProjectFor(assignment, getBackend())
      .then((r) => alive && setProject(r.project))
      .catch(() => alive && setProject(null));
    return () => {
      alive = false;
    };
  }, [assignment]);

  // Beim Öffnen festhalten: Mit dem Abgeben wird der Auftrag „bewertet“, das Blatt soll nicht umspringen.
  const [correction] = useState(assignment.status === 'evaluated');
  const check = useMemo(() => (correction ? canCorrect(assignment, evaluations ?? [], now, rules) : { ok: true as const }), [correction, assignment, evaluations, now, rules]);

  const lines = useMemo<Line[]>(
    () =>
      assignment.deliverables.map((d) => {
        if (d.kind === 'video') {
          const rec = latestExport(project ?? null, d.id);
          return rec
            ? { id: d.id, label: d.label, ok: true, stale: exportStale(project ?? null, rec), text: `Version ${rec.version} · ${rec.fileName}` }
            : { id: d.id, label: d.label, ok: false, text: 'Noch nicht exportiert – ohne diese Abgabe gibt es Abzug.' };
        }
        const doc = research?.[researchKey(assignment.id, d.id)];
        const tpl = d.researchTemplate ? RESEARCH_TEMPLATES[d.researchTemplate] : null;
        const filled = tpl ? tpl.fields.filter((f) => f.required && (doc?.fields[f.key] ?? '').trim() !== '').length : 0;
        const required = tpl ? tpl.fields.filter((f) => f.required).length : 0;
        return {
          id: d.id,
          label: d.label,
          ok: !!doc,
          text: doc ? `${filled} von ${required} Pflichtfeldern, ${countedSources(doc.sources)} Quellen` : 'Noch nichts geschrieben – ohne diese Abgabe gibt es Abzug.',
          action: { label: 'Recherche bearbeiten', to: `/auftraege/${assignment.id}/recherche/${d.id}` },
        };
      }),
    [assignment, project, research],
  );
  const missing = lines.filter((l) => !l.ok).length;
  const selfHook = assignment.hook.verify === 'self';
  const missingPoints = assignment.deliverables.some((d) => d.kind === 'video') ? rules.deductions.auftrag.missingDeliverable : rules.deductions.researchOnly.missingDeliverable;

  /** Erst Gemini vorbereiten (nur wenn eingeschaltet); die Abgabe selbst folgt nach der Einwilligung. */
  const start = async () => {
    setBusy(true);
    setError(null);
    setMessage('Bereite Standbilder vor …');
    try {
      const prep = await useApp.getState().prepareGemini(assignment.id);
      if (prep && !prep.error) {
        setConsent(prep);
        setBusy(false);
        return;
      }
      await submit(prep?.error ? { consent: false, note: prep.error } : undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const submit = async (choice?: GeminiChoice) => {
    setBusy(true);
    setError(null);
    setConsent(null);
    setMessage('Prüfe Abgaben …');
    try {
      const app = useApp.getState();
      const checks = { hookDone };
      let evaluation: Evaluation;
      if (correction) {
        const r = await app.correction(assignment.id, checks, setMessage, choice);
        if (!r.ok) {
          setError(r.reason === 'busy' ? 'Die Abgabe läuft schon.' : correctionBlockedText(r.reason, rules));
          setBusy(false);
          return;
        }
        evaluation = r.evaluation;
      } else {
        evaluation = await app.submit(assignment.id, checks, setMessage, choice);
      }
      setBusy(false);
      if (onDone) onDone(evaluation);
      else navigate(`/chefbuero/${encodeURIComponent(evaluation.id)}`, { state: { fresh: true } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Sheet
      id="submit-h"
      title={consent ? 'Gemini-Begutachtung' : correction ? 'Nachbessern abgeben' : 'Abgeben'}
      busy={busy}
      onClose={onClose}
      footer={
        check.ok && !consent ? (
          <button type="button" className="btn btn-primary pressable" data-autofocus disabled={busy} onClick={() => void start()}>
            {busy ? 'Wird bewertet …' : correction ? 'Korrektur abgeben' : 'Abgeben'}
          </button>
        ) : null
      }
    >
      {consent ? (
        <GeminiConsent frames={consent.frames} onSend={() => void submit({ consent: true, frames: consent.frames })} onDecline={() => void submit({ consent: false })} />
      ) : (
        <div className="submit-body">
          <p className="muted">
            Auftrag #{assignment.number}: {assignment.title}
          </p>
          {correction && check.ok && (
            <p className="submit-note">Das Ergebnis ist bei einer Korrektur auf höchstens {rules.correction.maxScore} Punkte gedeckelt; die bessere Bewertung zählt.</p>
          )}
          {!check.ok && (
            <p className="submit-note" role="alert">
              {correctionBlockedText(check.reason, rules)}
            </p>
          )}
          <h3>Abgaben</h3>
          <ul className="submit-list">
            {lines.map((l) => (
              <li key={l.id} className={l.ok ? 'is-ok' : 'is-missing'}>
                {l.ok ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
                <span>
                  <strong>{l.label}</strong> · <span className="submit-state">{l.ok ? 'bereit' : 'fehlt'}</span>
                  <span className="submit-detail">{l.text}</span>
                  {l.stale && (
                    <span className="submit-stale" role="status">
                      <TriangleAlert aria-hidden="true" /> Seit dem Export geändert – bitte neu exportieren
                    </span>
                  )}
                  {!l.ok && l.action && (
                    <button type="button" className="inline-link" onClick={() => navigate(l.action!.to)}>
                      {l.action.label}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {missing > 0 && check.ok && (
            <p className="submit-note" role="status">
              Du kannst trotzdem abgeben. Jede fehlende Abgabe kostet {Math.abs(missingPoints)} Punkte.
            </p>
          )}
          {geminiNotice && (
            <p className="submit-note" role="status">
              <TriangleAlert aria-hidden="true" className="note-icon" /> Gemini ist eingeschaltet, aber nicht bereit (Schlüssel oder Modell fehlt) – nur Regeln.
            </p>
          )}
          <h3>Haken</h3>
          {selfHook ? (
            <label className="submit-check">
              <input type="checkbox" checked={hookDone} onChange={(e) => setHookDone(e.target.checked)} />
              <span>Haken umgesetzt: {assignment.hook.text}</span>
            </label>
          ) : (
            <p className="muted">{assignment.hook.text} – das prüft der Chef selbst.</p>
          )}
          <p className="submit-progress" role="status" aria-live="polite">
            {busy ? message : ''}
          </p>
          {error && (
            <p className="submit-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
