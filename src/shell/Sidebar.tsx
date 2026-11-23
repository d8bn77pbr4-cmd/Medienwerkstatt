import { Fragment, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Spring } from '../design/spring';
import { AREAS, areaForPath } from './areas';
import type { Area } from './areas';

const icons: Record<Area, ReactNode> = {
  werkstatt: <path d="M3 17l6-6 4 4 8-8M14 7h7v7" />,
  auftraege: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  chefbuero: <><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></>,
  einstellungen: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>,
};

export function Sidebar() {
  const { pathname } = useLocation();
  const current = areaForPath(pathname).id;
  const navRef = useRef<HTMLElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const spring = useRef(new Spring({ damping: 1, response: 0.38 }, 0));
  const placed = useRef(false);
  const instant = (useLocation().state as { instant?: boolean } | null)?.instant === true;

  const linkTop = useCallback(() => navRef.current?.querySelector<HTMLElement>(`[data-area="${current}"]`)?.offsetTop, [current]);

  useLayoutEffect(() => {
    const top = linkTop();
    const marker = markerRef.current;
    if (top === undefined || !marker) return;
    const apply = (y: number) => {
      marker.style.transform = `translateY(${y}px)`;
    };
    const snap = () => {
      spring.current.stop();
      spring.current.value = top;
      spring.current.velocity = 0;
      apply(top);
    };
    if (!placed.current) {
      placed.current = true;
      snap();
    } else if (instant) {
      // Tastenkürzel werden nie animiert.
      snap();
    } else if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Bewegung reduzieren: 150-ms-Überblendung statt Gleiten.
      snap();
      marker.classList.remove('is-fading');
      void marker.offsetWidth;
      marker.classList.add('is-fading');
    } else {
      spring.current.to(top, apply);
    }
  }, [current, instant, linkTop]);

  // Fensterhöhe ändert die Lage von „Einstellungen“: Markierung folgt sofort.
  useEffect(() => {
    const nav = navRef.current;
    const marker = markerRef.current;
    if (!nav || !marker || typeof ResizeObserver === 'undefined') return;
    let lastHeight = nav.offsetHeight;
    const ro = new ResizeObserver(() => {
      if (nav.offsetHeight === lastHeight) return; // nur Höhenänderungen verschieben die Links
      lastHeight = nav.offsetHeight;
      const top = linkTop();
      if (top === undefined) return;
      spring.current.stop();
      spring.current.value = top;
      spring.current.velocity = 0;
      marker.style.transform = `translateY(${top}px)`;
    });
    ro.observe(nav);
    return () => ro.disconnect();
  }, [linkTop]);

  return (
    <aside className="sidebar">
      <div className="sidebar-drag" data-tauri-drag-region />
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 18V8l7 6 7-6v10" />
          </svg>
        </span>
        <span className="brand-name">Medienwerkstatt</span>
      </div>
      <nav className="nav" aria-label="Bereiche" ref={navRef}>
        <div className="nav-marker" ref={markerRef} aria-hidden="true" />
        {AREAS.map((a) => (
          <Fragment key={a.id}>
            {a.id === 'einstellungen' && <div className="nav-spacer" />}
            <NavItem id={a.id} label={a.label} path={a.path} active={current === a.id} />
          </Fragment>
        ))}
      </nav>
    </aside>
  );
}

function NavItem({ id, label, path, active }: { id: Area; label: string; path: string; active: boolean }) {
  return (
    <Link to={path} className="nav-link pressable" data-area={id} aria-current={active ? 'page' : undefined} title={label}>
      <span className="nav-tile" aria-hidden="true">
        <svg viewBox="0 0 24 24">{icons[id]}</svg>
      </span>
      <span className="nav-label">{label}</span>
    </Link>
  );
}
