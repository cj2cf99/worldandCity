import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, migrate } from '../scripts/local-d1.mjs';
import { importNodeSeed } from '../scripts/seed.mjs';
import { createWorldCityHandler } from '../worker/host-handler.mjs';

const fromRoot = (p) => new URL(`../${p}`, import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
async function fixture() {
  const db = openDb(); migrate(db, fromRoot('migrations')); await importNodeSeed(db, fromRoot('seed/nodes.public.json'));
  const fetched = [];
  const env = { mymaindb: db, STOCKCHECK_ASSETS: { fetch: async (req) => { fetched.push(new URL(req.url).pathname); return new Response('asset', { headers: { ETag: 'x', 'Content-Length': '5' } }); } } };
  const authorize = async (req) => { const t = req.headers.get('x-test-user'); if (!t) { const e = new Error('no'); e.status = 401; throw e; } return { ownerId: t }; };
  const h = createWorldCityHandler({ authorize });
  const call = (path, init = {}) => h(new Request('https://site.test' + path, { ...init, headers: { 'x-test-user': 'me', ...(init.headers || {}) } }), env);
  return { h, call, env, fetched, db };
}

test('不属于本模块的路径返回 null，未登录返回 401', async () => {
  const { h, call, env } = await fixture();
  assert.equal(await call('/garden/'), null);
  assert.equal((await h(new Request('https://site.test/worldandcity/'), env)).status, 401);
  assert.equal((await h(new Request('https://site.test/api/worldandcity/v1/nodes?kind=country'), env)).status, 401);
});

test('页面与深链接回到同一个 index.html；静态文件只放行白名单；页面带 CSP', async () => {
  const { call, fetched } = await fixture();
  for (const p of ['/worldandcity/', '/worldandcity/n/geo.jp-40']) {
    const r = await call(p); assert.equal(r.status, 200); assert.match(r.headers.get('content-security-policy'), /default-src 'self'/); assert.equal(r.headers.get('etag'), null); assert.equal(r.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  }
  assert.equal(fetched.at(-1), '/worldandcity/index.html');
  assert.equal((await call('/worldandcity')).status, 308);
  assert.equal((await call('/worldandcity/assets/main-abc12345.js')).status, 200);
  assert.equal((await call('/worldandcity/assets/main-abc12345.js')).headers.get('referrer-policy'), 'no-referrer');
  assert.equal((await call('/worldandcity/geo/jp/JP-40.json')).status, 200);
  for (const bad of ['/worldandcity/nebula/a.jpg', '/worldandcity/geo/jp/japan.topojson', '/worldandcity/assets/../x.js', '/worldandcity/n/a/b', '/worldandcity/index.html']) assert.equal((await call(bad)).status, 404, bad);
  assert.equal((await call('/worldandcity/', { method: 'POST' })).status, 405);
});

test('接口：节点只读、标签读写，跨站写入被拒；数据落在 D1 绑定里', async () => {
  const { call, db } = await fixture();
  const list = await (await call('/api/worldandcity/v1/nodes?kind=country')).json();
  assert(list.items.length > 100);
  assert.equal((await call('/api/worldandcity/v1/nodes/geo.world')).status, 200);
  assert.equal((await call('/api/worldandcity/v1/nodes/nope')).status, 404);
  const body = JSON.stringify({ level: 'lv:test', lon: 1, lat: 2, type: '地点', text: '测试' });
  const post = await call('/api/worldandcity/v1/labels', { method: 'POST', body, headers: { 'content-type': 'application/json', origin: 'https://site.test' } });
  assert.equal(post.status, 201);
  const lab = await post.json();
  assert.equal((await call('/api/worldandcity/v1/labels')).status, 200);
  assert.equal((await call(`/api/worldandcity/v1/labels/${lab.id}`, { method: 'DELETE', headers: { origin: 'https://evil.test' } })).status, 403);
  assert.equal((await call(`/api/worldandcity/v1/labels/${lab.id}`, { method: 'DELETE', headers: { origin: 'https://site.test' } })).status, 200);
  assert.equal((await db.prepare('SELECT count(*) c FROM wc_labels').first()).c, 0);
});
