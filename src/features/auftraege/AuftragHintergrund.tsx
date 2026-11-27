import type { Assignment } from '../../domain/assignments/types';

/** Steckbrief des erfundenen Kunden (Betriebs-Aufträge). Ältere Aufträge haben keinen: dann entfällt die Karte. */
export function SteckbriefKarte({ client }: { client: Assignment['client'] }) {
  const p = client.profile;
  if (!p) return null;
  const rows: [string, string][] = [
    ['Branche', client.branche],
    ['Ort', p.ort],
    ['Gegründet', String(p.gegruendet)],
    ['Mitarbeitende', String(p.mitarbeitende)],
    ['Angebot', p.angebot],
    ['Werte', p.werte.join(', ')],
    ['Zielgruppe', p.zielgruppe],
    ['Ansprechperson', `${p.ansprechperson.name}, ${p.ansprechperson.rolle}`],
    ['Besonderheit', p.besonderheit],
  ];
  return (
    <section className="card" aria-labelledby="steckbrief-h">
      <h2 id="steckbrief-h">Steckbrief</h2>
      <p className="muted hintergrund-note">Der Betrieb ist erfunden – alles Wichtige steht hier. Recherchiere Branche und Thema.</p>
      <dl className="steckbrief">
        {rows.map(([term, value]) => (
          <div key={term} className="steckbrief-row">
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Thema eines Themen-Auftrags: Hintergrund, Leitfragen und Einstieg in die Recherche (Quellenarten, keine Links). */
export function ThemaKarte({ topic }: { topic: NonNullable<Assignment['topic']> }) {
  return (
    <section className="card" aria-labelledby="thema-h">
      <h2 id="thema-h">Thema</h2>
      <p>{topic.hintergrund}</p>
      <h3>Leitfragen</h3>
      <ul className="bullet-list">
        {topic.leitfragen.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
      <h3>Recherche-Einstieg</h3>
      <ul className="bullet-list">
        {topic.einstieg.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      <p className="muted hintergrund-note hintergrund-note-end">Recherchiere den aktuellen Stand und gib deine Quellen an.</p>
    </section>
  );
}
