import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuftraegeView } from './features/auftraege/AuftraegeView';
import { AuftragDetail } from './features/auftraege/AuftragDetail';
import { ResearchForm } from './features/auftraege/ResearchForm';
import { Einstellungen } from './features/einstellungen/Einstellungen';
import { Werkstatt } from './features/werkstatt/Werkstatt';
import { RestoreBanner } from './shell/RestoreBanner';
import { attachLifecycle } from './state/lifecycle';
import { startApp } from './state/bootstrap';
import { Sidebar } from './shell/Sidebar';
import { TopBar } from './shell/TopBar';
import { AREAS, areaForPath } from './shell/areas';
import type { AreaInfo } from './shell/areas';
import { useAreaShortcuts } from './shell/useAreaShortcuts';

/** Nur im Entwicklungsserver: Testseite für Wiedergabe, Monitor und Scopes. */
const DevWiedergabe = import.meta.env.DEV ? lazy(() => import('./features/werkstatt/DevWiedergabe')) : null;

function AreaPage({ area }: { area: AreaInfo }) {
  if (area.id === 'werkstatt') return <Werkstatt />;
  if (area.id === 'auftraege') return <AuftraegeView lead={area.lead} />;
  if (area.id === 'einstellungen') return <Einstellungen label={area.label} lead={area.lead} />;
  return (
    <main className="main">
      <div className="page">
        <p className="page-kicker">{area.label}</p>
        <h1>{area.label}</h1>
        <p className="page-lead">{area.lead}</p>
      </div>
    </main>
  );
}

function Shell() {
  useAreaShortcuts();
  useEffect(() => {
    void startApp();
    return attachLifecycle();
  }, []);
  // In der Werkstatt klappt die Seitenleiste auf Symbole zusammen und die ganze Shell wird dunkel.
  const werkstatt = areaForPath(useLocation().pathname).id === 'werkstatt';
  return (
    <div className={`shell${werkstatt ? ' is-collapsed is-werkstatt' : ''}`}>
      <Sidebar />
      <div className="content">
        <TopBar />
        <RestoreBanner />
        <Routes>
          <Route path="/auftraege/:id" element={<AuftragDetail />} />
          <Route path="/auftraege/:id/recherche/:deliverableId" element={<ResearchForm />} />
          {DevWiedergabe && (
            <Route
              path="/_dev/wiedergabe"
              element={
                <Suspense fallback={null}>
                  <DevWiedergabe />
                </Suspense>
              }
            />
          )}
          {AREAS.map((a) => (
            <Route key={a.id} path={a.path} element={<AreaPage area={a} />} />
          ))}
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
