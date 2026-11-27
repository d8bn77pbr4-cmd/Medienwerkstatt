const pad = (n: number): string => String(n).padStart(2, '0');

/** Zeitcode `HH:MM:SS:FF` (Bilder nach nomineller Bildrate, z. B. 30 bei 29,97). */
export function formatTimecode(frame: number, fps: number): string {
  const nominal = Math.max(1, Math.round(fps));
  const f = Math.max(0, Math.floor(frame));
  const secs = Math.floor(f / nominal);
  return `${pad(Math.floor(secs / 3600))}:${pad(Math.floor(secs / 60) % 60)}:${pad(secs % 60)}:${pad(f % nominal)}`;
}
