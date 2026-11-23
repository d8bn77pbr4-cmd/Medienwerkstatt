import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuftraegeView } from './features/auftraege/AuftraegeView';
import { AuftragDetail } from './features/auftraege/AuftragDetail';
import { ResearchForm } from './features/auftraege/ResearchForm';
import { Einstellungen } from './features/einstellungen/Einstellungen';
import { RestoreBanner } from './shell/RestoreBanner';
import { attachLifecycle } from './state/lifecycle';
import { startApp } from './state/bootstrap';
import { Sidebar } from './shell/Sidebar';
import { TopBar } from './shell/TopBar';
import { AREAS, areaForPath } from './shell/areas';
import type { AreaInfo } from './shell/areas';
import { useAreaShortcuts } from './shell/useAreaShortcuts';
import { useApp } from './state/appStore';

function WerkstattPlatzhalter({ area }: { area: AreaInfo }) {
  const assignmentId = (useLocation().state as { assignmentId?: string } | null)?.assignmentId;
  const assignment = useApp((s) => s.state?.assignments.find((a) => a.id === assignmentId));
  return (
    <main className="main werkstatt">
      <div className="werkstatt-page">
        <h1>{area.label}</h1>
        <p className="page-lead">{area.lead}</p>
        {assignment && (
          <p className="page-lead">
            Auftrag #{assignment.number}: {assignment.title}
          </p>
        )}
      </div>
    </main>
  );
}

function AreaPage({ area }: { area: AreaInfo }) {
  if (area.id === 'werkstatt') return <WerkstattPlatzhalter area={area} />;
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
  const collapsed = areaForPath(useLocation().pathname).id === 'werkstatt';
  return (
    <div className={`shell${collapsed ? ' is-collapsed' : ''}`}>
      <Sidebar />
      <div className="content">
        <TopBar />
        <RestoreBanner />
        <Routes>
          <Route path="/auftraege/:id" element={<AuftragDetail />} />
          <Route path="/auftraege/:id/recherche/:deliverableId" element={<ResearchForm />} />
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
