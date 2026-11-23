import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AREAS } from './areas';

/** ⌘1/⌘2/⌘3 wechseln Werkstatt, Aufträge und Chefbüro. Nie animiert. */
export function useAreaShortcuts(): void {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const index = ['1', '2', '3'].indexOf(e.key);
      if (index < 0) return;
      e.preventDefault();
      navigate(AREAS[index].path);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}
