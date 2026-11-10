// 节点读取路由（设计 §6.2）。纯函数 handle(request, db)：Vite 开发中间件与 Worker 入口共用。
// 鉴权／Origin 校验属 M1，不在此处；本路由只读。
import { AppError } from './errors.mjs';
import { getNode, listChildren, getAncestors, listByKind } from './nodes.mjs';

const STATUS = { E_VALIDATION: 400, E_NOT_FOUND: 404 };
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private' } });

function fail(e) {
  if (e instanceof AppError) return json({ error: { code: e.code, message: e.message, details: e.details } }, STATUS[e.code] ?? 400);
  throw e;
}

export async function handle(request, db) {
  const url = new URL(request.url);
  if (url.pathname === '/api/v1/nodes' && request.method === 'GET') {
    try { return json(await listByKind(db, url.searchParams.get('kind'))); } catch (e) { return fail(e); }
  }
  const m = /^\/api\/v1\/nodes\/([^/]+)(?:\/(children|ancestors))?$/.exec(url.pathname);
  if (!m || request.method !== 'GET') return json({ error: { code: 'E_NOT_FOUND', message: '未知端点' } }, 404);
  try {
    const id = decodeURIComponent(m[1]);
    if (m[2] === 'children') {
      const limit = url.searchParams.get('limit');
      return json(await listChildren(db, id, { limit: limit ? Number(limit) : undefined, cursor: url.searchParams.get('cursor') ?? undefined }));
    }
    if (m[2] === 'ancestors') return json({ items: await getAncestors(db, id) });
    return json(await getNode(db, id));
  } catch (e) {
    return fail(e);
  }
}
