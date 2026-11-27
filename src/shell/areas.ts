export type Area = 'werkstatt' | 'auftraege' | 'chefbuero' | 'einstellungen';

export interface AreaInfo {
  id: Area;
  label: string;
  path: string;
  lead: string;
}

export const AREAS: readonly AreaInfo[] = [
  { id: 'werkstatt', label: 'Werkstatt', path: '/', lead: 'Hier schneidest du: Medien, Zeitleiste, Vorschau und Werkzeuge.' },
  { id: 'auftraege', label: 'Aufträge', path: '/auftraege', lead: 'Alle 72 Stunden ein neuer Kundenauftrag mit Frist.' },
  { id: 'chefbuero', label: 'Chefbüro', path: '/chefbuero', lead: 'Der Chef bewertet deine Abgaben nach festen Regeln.' },
  { id: 'einstellungen', label: 'Einstellungen', path: '/einstellungen', lead: 'Darstellung, Ablage und optionale Hilfen.' },
] as const;

export function areaForPath(pathname: string): AreaInfo {
  return AREAS.find((a) => a.path !== '/' && pathname.startsWith(a.path)) ?? AREAS[0];
}
