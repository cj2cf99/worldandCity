import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, migrate } from '../scripts/local-d1.mjs';
import { handle } from '../worker/api.mjs';

const ROOT = new URL('../migrations', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const call = (db, method, path, body) => handle(new Request('http://x' + path, { method, ...(body ? { body: JSON.stringify(body) } : {}) }), db);

test('标签增删改查，且与导航树互不影响', async () => {
  const db = openDb(); migrate(db, ROOT);
  let r = await call(db, 'POST', '/api/v1/labels', { level: 'lv:a', node: 'geo.x', lon: 1.5, lat: 2.5, type: '景点', text: '钟楼' });
  assert.equal(r.status, 201);
  const it = await r.json();
  assert.equal(it.text, '钟楼');
  r = await call(db, 'PATCH', `/api/v1/labels/${it.id}`, { lon: 3, text: '新钟楼' });
  assert.equal((await r.json()).lon, 3);
  assert.equal((await (await call(db, 'GET', '/api/v1/labels')).json()).items.length, 1);
  assert.equal((await call(db, 'POST', '/api/v1/labels', { level: 'a', lon: 'x', lat: 1, type: 't', text: 't' })).status, 400);
  assert.equal((await call(db, 'DELETE', `/api/v1/labels/${it.id}`)).status, 200);
  assert.equal((await call(db, 'DELETE', `/api/v1/labels/${it.id}`)).status, 404);
  assert.equal(await db.prepare('SELECT count(*) c FROM wc_nodes').first('c'), 0);
});
