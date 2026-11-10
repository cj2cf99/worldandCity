import { defineConfig } from 'vite';
import { openDb } from './scripts/local-d1.mjs';
import { handle } from './worker/api.mjs';

// 开发期 /api/v1 由本地开发库直接提供（与 Worker 共用 worker/api.mjs）。
const devApi = {
  name: 'wc-dev-api',
  configureServer(server) {
    const db = openDb('data/local/worldandcity-dev.sqlite');
    server.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/api/v1/')) return next();
      const r = await handle(new Request(new URL(req.url, 'http://localhost')), db);
      res.statusCode = r.status;
      r.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await r.text());
    });
  },
};

export default defineConfig({ root: 'web', plugins: [devApi], build: { outDir: '../dist', emptyOutDir: true } });
