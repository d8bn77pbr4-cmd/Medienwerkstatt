import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const FIXTURE_DIR = path.resolve(__dirname, 'tests/fixtures/media');
const TYPES: Record<string, string> = { '.webm': 'video/webm', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.wav': 'audio/wav' };

/** Nur Entwicklungsserver: stellt `tests/fixtures/media/` unter `/fixtures/` bereit (mit Range-Anfragen für Videos). */
function fixtures(): Plugin {
  return {
    name: 'mw-fixtures',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/fixtures', (req, res, next) => {
        const name = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        const file = path.resolve(FIXTURE_DIR, name);
        const type = TYPES[path.extname(file).toLowerCase()];
        let size = 0;
        try {
          if (!type || path.dirname(file) !== FIXTURE_DIR) return next();
          size = statSync(file).size;
        } catch {
          return next();
        }
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
        let [start, end] = [0, size - 1];
        if (range) {
          if (range[1] !== '') start = Number(range[1]);
          if (range[2] !== '') end = Math.min(size - 1, Number(range[2]));
          if (range[1] === '' && range[2] !== '') [start, end] = [Math.max(0, size - Number(range[2])), size - 1];
        }
        if (start > end || start >= size) {
          res.statusCode = 416;
          res.setHeader('Content-Range', `bytes */${size}`);
          return res.end();
        }
        res.statusCode = range ? 206 : 200;
        res.setHeader('Content-Type', type);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', String(end - start + 1));
        if (range) res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        if (req.method === 'HEAD') return res.end();
        createReadStream(file, { start, end }).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), fixtures()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: '127.0.0.1' },
  build: { target: 'safari15' },
});
