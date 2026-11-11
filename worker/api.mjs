// 节点读取路由（设计 §6.2）＋标签读写（独立于节点）。纯函数 handle(request, db)：Vite 开发中间件与 Worker 入口共用。
// 鉴权／Origin 校验属 M1，不在此处。
import { AppError } from './errors.mjs';
import { listLabels, createLabel, updateLabel, deleteLabel } from './labels.mjs';
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
  const lb = /^\/api\/v1\/labels(?:\/([^/]+))?$/.exec(url.pathname);
  if (lb) {
    try {
      const id = lb[1] && decodeURIComponent(lb[1]), body = () => request.json().catch(() => { throw new AppError('E_VALIDATION', '请求体不是 JSON'); });
      if (!id && request.method === 'GET') return json(await listLabels(db));
      if (!id && request.method === 'POST') return json(await createLabel(db, await body()), 201);
      if (id && request.method === 'PATCH') return json(await updateLabel(db, id, await body()));
      if (id && request.method === 'DELETE') return json(await deleteLabel(db, id));
    } catch (e) { return fail(e); }
    return json({ error: { code: 'E_NOT_FOUND', message: '未知端点' } }, 404);
  }
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
