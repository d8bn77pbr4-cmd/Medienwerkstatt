import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { getBackend } from '../../backend';
import { defaultModel } from '../../domain/gemini/models';
import { Sheet } from '../../shell/Sheet';
import { useApp } from '../../state/appStore';
import { ExternalLink } from './ExternalLink';
import { GEMINI_KEY_URL, GEMINI_PRIVACY } from './privacy';

const codeOf = (e: unknown) => (e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '');
function modelError(e: unknown): string {
  const c = codeOf(e);
  if (c === 'invalid_key') return 'Google hat den Schlüssel abgelehnt. Prüfe ihn oder hole einen neuen.';
  if (c === 'rate_limited') return 'Das Gratis-Limit ist gerade erreicht. Versuch es später noch einmal.';
  if (c === 'offline') return 'Keine Verbindung zu Google.';
  return 'Die Modelle konnten nicht geladen werden.';
}

/** Gemini: Schalter (aus), Datenschutz-Hinweis beim Einschalten, Schlüssel (nur Schlüsselbund), Modellwahl. */
export function GeminiSection() {
  const gemini = useApp((s) => s.state?.settings.gemini);
  const setEnabled = useApp((s) => s.setGeminiEnabled);
  const setModel = useApp((s) => s.setGeminiModel);
  const enabled = gemini?.enabled ?? false;
  const model = gemini?.model ?? null;
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [models, setModels] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(false);

  // Der Schlüsselstatus (Schlüsselbund) wird erst gelesen, wenn Gemini eingeschaltet ist: aus = kein Gemini-Aufruf.
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    getBackend()
      .gemini.hasKey()
      .then((k) => alive && setHasKey(k))
      .catch(() => alive && setHasKey(false));
    return () => {
      alive = false;
    };
  }, [enabled]);

  // Modelle nur holen, wenn Gemini an ist und ein Schlüssel vorliegt (das ist eine Anfrage an Google).
  const loadModels = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await getBackend().gemini.listModels();
      setModels(list);
      const current = useApp.getState().state?.settings.gemini.model ?? null;
      if (!current || !list.includes(current)) useApp.getState().setGeminiModel(defaultModel(list));
    } catch (e) {
      setLoadError(modelError(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (enabled && hasKey) void loadModels();
  }, [enabled, hasKey, loadModels]);

  const saveKey = async (e: FormEvent) => {
    e.preventDefault();
    const k = keyInput.trim();
    if (!k) return setKeyError('Bitte füge deinen Schlüssel ein.');
    try {
      await getBackend().gemini.setKey(k);
      setKeyInput('');
      setKeyError(null);
      setHasKey(true);
    } catch {
      setKeyError('Der Schlüssel konnte nicht im Schlüsselbund gespeichert werden.');
    }
  };
  const removeKey = async () => {
    try {
      await getBackend().gemini.setKey(null);
      setHasKey(false);
      setModels(null);
      setKeyError(null);
    } catch {
      setKeyError('Der Schlüssel konnte nicht entfernt werden.');
    }
  };

  return (
    <section className="card" aria-labelledby="gemini-h">
      <h2 id="gemini-h">Gemini</h2>
      <p className="muted set-lead">
        Optional: Gemini schaut sich deine Standbilder an und ergänzt die Bewertung von Gestaltung und Auftragstreue um höchstens ±10 Punkte. Die Technik misst weiter allein der Chef. Standardmäßig aus – dann geht nichts ins Netz.
      </p>
      <div className="set-row">
        <span id="gemini-switch-l">Gestaltung von Gemini begutachten lassen</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="gemini-switch-l"
          className="switch pressable"
          onClick={() => (enabled ? setEnabled(false) : setNotice(true))}
        >
          <span className="switch-thumb" aria-hidden="true" />
        </button>
      </div>

      {enabled && hasKey === false && (
        <form className="key-form" onSubmit={(e) => void saveKey(e)}>
          <div className="field">
            <label htmlFor="gemini-key">Gemini-Schlüssel</label>
            <input id="gemini-key" type="password" autoComplete="off" spellCheck={false} value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
            <span className="muted set-help">Der Schlüssel liegt nur im macOS-Schlüsselbund und wird nie wieder angezeigt.</span>
          </div>
          <button type="submit" className="btn btn-primary pressable">
            Speichern
          </button>
        </form>
      )}
      {enabled && hasKey === true && (
        <div className="set-row">
          <span className="key-ok">Schlüssel gespeichert</span>
          <button type="button" className="btn pressable" onClick={() => void removeKey()}>
            Entfernen
          </button>
        </div>
      )}
      {keyError && (
        <p className="set-error" role="alert">
          {keyError}
        </p>
      )}

      {enabled && hasKey === true && (
        <div className="model-row">
          <div className="field">
            <label htmlFor="gemini-model">Modell</label>
            <select id="gemini-model" value={model ?? ''} onChange={(e) => setModel(e.target.value || null)} disabled={models === null && !model}>
              {model && !(models ?? []).includes(model) && <option value={model}>{model}</option>}
              {!model && <option value="">{loading ? 'Lade Modelle …' : 'Kein Modell gewählt'}</option>}
              {(models ?? []).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="icon-btn pressable" aria-label="Modelle aktualisieren" disabled={loading} onClick={() => void loadModels()}>
            <RefreshCw aria-hidden="true" />
          </button>
        </div>
      )}
      {enabled && hasKey === true && !model && !loading && (
        <div className="set-warn" role="status">
          <TriangleAlert aria-hidden="true" />
          <span>
            Kein Modell gewählt – Gemini bleibt aus.{' '}
            {models && models.length > 0 ? 'Wähle ein Modell aus der Liste.' : 'Die Modellliste ist leer oder konnte nicht geladen werden.'}
          </span>
          <button type="button" className="btn pressable" onClick={() => void loadModels()}>
            Erneut laden
          </button>
        </div>
      )}
      {loadError && (
        <p className="set-error" role="alert">
          {loadError}
        </p>
      )}

      <p className="set-help">
        <ExternalLink href={GEMINI_KEY_URL}>Gratis-Schlüssel holen</ExternalLink>
      </p>

      {notice && (
        <Sheet
          id="privacy-h"
          title="Datenschutz-Hinweis"
          onClose={() => setNotice(false)}
          footer={
            <>
              <button type="button" className="btn pressable" onClick={() => setNotice(false)}>
                Abbrechen
              </button>
              <button
                type="button"
                className="btn btn-primary pressable"
                data-autofocus
                onClick={() => {
                  setEnabled(true);
                  setNotice(false);
                }}
              >
                Verstanden, einschalten
              </button>
            </>
          }
        >
          <div className="consent">
            <p>
              <strong>{GEMINI_PRIVACY.headline}</strong>
            </p>
            <p>{GEMINI_PRIVACY.sent}</p>
            <p>{GEMINI_PRIVACY.people}</p>
            <p className="muted">Vor jedem Senden siehst du die Bilder und bestätigst es noch einmal. Ohne deine Bestätigung bewertet nur der Chef.</p>
          </div>
        </Sheet>
      )}
    </section>
  );
}
