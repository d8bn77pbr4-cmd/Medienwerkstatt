import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Sidebar } from './shell/Sidebar';
import { TopBar } from './shell/TopBar';
import { AREAS, areaForPath } from './shell/areas';
import type { AreaInfo } from './shell/areas';
import { useAreaShortcuts } from './shell/useAreaShortcuts';

function AreaPage({ area }: { area: AreaInfo }) {
  if (area.id === 'werkstatt') {
    return (
      <main className="main werkstatt">
        <div className="werkstatt-page">
          <h1>{area.label}</h1>
          <p className="page-lead">{area.lead}</p>
        </div>
      </main>
    );
  }
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
  const collapsed = areaForPath(useLocation().pathname).id === 'werkstatt';
  return (
    <div className={`shell${collapsed ? ' is-collapsed' : ''}`}>
      <Sidebar />
      <div className="content">
        <TopBar />
        <Routes>
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
