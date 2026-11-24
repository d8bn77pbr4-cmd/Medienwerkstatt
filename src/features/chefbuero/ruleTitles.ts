/** Kurzname je Regel für das Abnahmeprotokoll (die Texte der Abzüge selbst kommen aus dem Regel-Chef). */
export const RULE_TITLES: Record<string, string> = {
  resolution: 'Auflösung',
  fps: 'Bildrate',
  mixedFps: 'Bildraten gemischt',
  length: 'Länge',
  loudness: 'Lautheit',
  truePeak: 'True Peak',
  clipping: 'Clipping',
  blackOrFreeze: 'Schwarz- oder Standbild',
  codecOrFileName: 'Codec und Dateiname',
  overexposed: 'Belichtung (zu hell)',
  underexposed: 'Belichtung (zu dunkel)',
  shotLength: 'Einstellungslänge',
  missingShotSize: 'Einstellungsgröße',
  colorJump: 'Farbsprung',
  audioCutNoFade: 'Tonschnitt ohne Blende',
  missingDeliverable: 'Abgabe fehlt',
  missingElement: 'Pflicht-Element',
  hookNotMet: 'Haken',
  researchEmptyField: 'Pflichtfeld',
  researchLength: 'Textlänge',
  researchSources: 'Quellen',
  noVideoTechnik: 'Kein Film',
  noVideoGestaltung: 'Kein Film',
  late: 'Frist',
  early24h: 'Früh abgegeben',
  allTechPerfect: 'Technik perfekt',
};

export const CATEGORY_TITLES = { technik: 'Technik', gestaltung: 'Gestaltung', auftrag: 'Auftrag' } as const;

export const GEMINI_TITLES: Record<string, string> = {
  bildaufbau: 'Bildaufbau',
  einstellungsgroessen: 'Einstellungsgrößen',
  licht: 'Licht',
  farbe: 'Farbe',
  briefing: 'Briefing-Treue',
  inhalt: 'Inhalt und Logik',
};
