import { AUTOSAVE_CHOICES, DEFAULT_AUTOSAVE_MINUTES, type Settings } from '../../backend/types';
import { useApp } from '../../state/appStore';
import { GeminiSection } from './GeminiSection';
import { VacationSection } from './VacationSection';
import './einstellungen.css';

const THEMES: { id: Settings['theme']; label: string }[] = [
  { id: 'auto', label: 'Automatisch' },
  { id: 'light', label: 'Hell' },
  { id: 'dark', label: 'Dunkel' },
];

function ThemeSection() {
  const theme = useApp((s) => s.state?.settings.theme ?? 'auto');
  const setTheme = useApp((s) => s.setTheme);
  return (
    <section className="card" aria-labelledby="darstellung-h">
      <h2 id="darstellung-h">Darstellung</h2>
      <p className="muted set-lead">Automatisch folgt der Einstellung deines Macs. Die Werkstatt bleibt immer dunkel.</p>
      <div className="segmented" role="radiogroup" aria-label="Darstellung">
        {THEMES.map((t) => (
          <label key={t.id} className="segmented-item pressable">
            <input type="radio" name="theme" value={t.id} checked={theme === t.id} onChange={() => setTheme(t.id)} />
            <span>{t.label}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

function AutosaveSection() {
  const minutes = useApp((s) => s.state?.settings.autosaveMinutes ?? DEFAULT_AUTOSAVE_MINUTES);
  const setMinutes = useApp((s) => s.setAutosaveMinutes);
  return (
    <section className="card" aria-labelledby="sichern-h">
      <h2 id="sichern-h">Sichern</h2>
      <p className="muted set-lead" id="sichern-lead">
        Alle {minutes} Minuten legt die App eine Sicherungsversion an (die letzten 20 bleiben). Das passiert nur, wenn sich seit der letzten etwas geändert hat. Mit ⌘S geht es sofort; in der Werkstatt holst du über „Ältere Version …“ einen früheren Stand zurück.
      </p>
      <div className="segmented" role="radiogroup" aria-label="Sicherungsversion alle" aria-describedby="sichern-lead">
        {AUTOSAVE_CHOICES.map((n) => (
          <label key={n} className="segmented-item pressable">
            <input type="radio" name="autosave" value={n} checked={minutes === n} onChange={() => setMinutes(n)} />
            <span>{n} min</span>
          </label>
        ))}
      </div>
    </section>
  );
}

/** Die Abschnitte der Einstellungen: Darstellung, Sichern, Urlaub, Gemini (Sparplan-Look, je Abschnitt eine Hauptaktion). */
export function SettingsView() {
  return (
    <>
      <ThemeSection />
      <AutosaveSection />
      <VacationSection />
      <GeminiSection />
    </>
  );
}
