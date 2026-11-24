import { useState, type MouseEvent } from 'react';
import { version } from '../../../package.json';
import { useApp } from '../../state/appStore';
import { ExternalLink } from './ExternalLink';
import { SettingsView } from './SettingsView';

const H = 3_600_000;
const DEV_KEY = 'mw-dev';

/** Entwickler-Abschnitt für diese Sitzung gemerkt (⌥-Klick auf die Versionszeile); ohne Speicher: aus. */
function readDev(): boolean {
  try {
    return sessionStorage.getItem(DEV_KEY) === '1';
  } catch {
    return false;
  }
}
function writeDev(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(DEV_KEY, '1');
    else sessionStorage.removeItem(DEV_KEY);
  } catch {
    /* privates Fenster: gilt nur bis zum Neuladen */
  }
}

/** Über die App und Lizenzen (Spec §11). ⌥-Klick auf die Versionszeile schaltet den Entwickler-Abschnitt. */
function About({ onAltClick }: { onAltClick(): void }) {
  const onClick = (e: MouseEvent) => {
    if (e.altKey) onAltClick();
  };
  return (
    <section className="card about" aria-labelledby="about-h">
      <h2 id="about-h">Über</h2>
      <p className="about-version" data-testid="app-version" onClick={onClick}>
        Medienwerkstatt {version}
      </p>
      <ul className="about-list">
        <li>
          Enthält ffmpeg 9.1 (evermeet.cx), lizenziert unter der GNU GPL; separates Programm im App-Bundle. Quelltext:{' '}
          <ExternalLink href="https://ffmpeg.org/download.html">ffmpeg.org</ExternalLink> und{' '}
          <ExternalLink href="https://evermeet.cx/ffmpeg/">evermeet.cx</ExternalLink>, Lizenztext:{' '}
          <ExternalLink href="https://www.gnu.org/licenses/gpl-3.0.html">GNU GPL</ExternalLink>.
        </li>
        <li>
          Symbole: Lucide, lizenziert unter der ISC-Lizenz (<ExternalLink href="https://github.com/lucide-icons/lucide/blob/main/LICENSE">Lizenztext</ExternalLink>).
        </li>
        <li>Adobe-Produktnamen werden nur beschreibend genannt („So heißt das bei Adobe“); die App hat keine Verbindung zu Adobe.</li>
      </ul>
    </section>
  );
}

/** Entwickler-Zeitsimulation (mit `?dev=1` oder ⌥-Klick auf die Versionszeile). */
function DevTime() {
  const offset = useApp((s) => s.state?.settings.devTimeOffsetMs ?? 0);
  const setOffset = useApp((s) => s.setDevTimeOffset);
  const [hours, setHours] = useState(String(offset / H));
  return (
    <section className="card" aria-labelledby="dev-h">
      <h2 id="dev-h">Entwickler</h2>
      <form
        className="dev-form"
        onSubmit={(e) => {
          e.preventDefault();
          const h = Number(hours.replace(',', '.'));
          if (Number.isFinite(h)) setOffset(Math.round(h * H));
        }}
      >
        <div className="field">
          <label htmlFor="dev-hours">Zeit vorspulen (Stunden)</label>
          <input id="dev-hours" type="number" step="any" value={hours} onChange={(e) => setHours(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary pressable">
          Übernehmen
        </button>
      </form>
    </section>
  );
}

/** Einstellungen: Darstellung, Urlaub, Gemini, Über; Entwickler-Zeitsimulation mit `?dev=1` oder ⌥-Klick auf die Version. */
export function Einstellungen({ label, lead }: { label: string; lead: string }) {
  const fromUrl = new URLSearchParams(window.location.search).get('dev') === '1';
  const [toggled, setToggled] = useState(readDev);
  const dev = fromUrl || toggled;
  const toggleDev = () => {
    const next = !dev;
    writeDev(next);
    setToggled(next);
  };
  return (
    <main className="main">
      <div className="page">
        <p className="page-kicker">{label}</p>
        <h1>{label}</h1>
        <p className="page-lead">{lead}</p>
        <SettingsView />
        <About onAltClick={toggleDev} />
        {dev && <DevTime />}
      </div>
    </main>
  );
}
