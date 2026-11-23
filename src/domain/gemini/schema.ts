export type GeminiResult = {
  criteria: {
    key: 'bildaufbau' | 'einstellungsgroessen' | 'licht' | 'farbe' | 'briefing' | 'inhalt';
    verdict: string;
    reason: string;
    shift: number;
  }[];
  summary: string;
};
