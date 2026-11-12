import { defineConfig } from 'vite';
import { copyFileSync, existsSync } from 'node:fs';
import { openDb } from './scripts/local-d1.mjs';
import { handle } from './worker/api.mjs';

// 开发期 /api/v1 由本地运行库提供（与 Worker 共用 worker/api.mjs）。运行库放在 data/private/（不入库，含个人标签）；
// 不存在时由仓库内的示例开发库复制出来。仓库内的开发库只放通用数据，不会被页面写入。
const RUN_DB = 'data/private/worldandcity.sqlite';
if (!existsSync(RUN_DB)) copyFileSync('data/local/worldandcity-dev.sqlite', RUN_DB);
const devApi = {
  name: 'wc-dev-api',
  configureServer(server) {
    const db = openDb(RUN_DB);
    server.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/api/v1/')) return next();
      const chunks = []; if (req.method !== 'GET' && req.method !== 'HEAD') for await (const c of req) chunks.push(c);
      const r = await handle(new Request(new URL(req.url, 'http://localhost'), { method: req.method, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) }), db);
      res.statusCode = r.status;
      r.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await r.text());
    });
  },
};

export default defineConfig({ root: 'web', plugins: [devApi], build: { outDir: '../dist', emptyOutDir: true } });
