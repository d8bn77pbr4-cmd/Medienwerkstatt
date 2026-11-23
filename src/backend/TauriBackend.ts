import { MockBackend } from './MockBackend';

/**
 * Tauri-Backend. Die echten Befehle (invoke) kommen in späteren Tasks; bis dahin
 * erbt es das Mock-Verhalten, damit die App im Fenster startet.
 */
export class TauriBackend extends MockBackend {}
