import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, migrate } from '../scripts/local-d1.mjs';
import { importNodeSeed } from '../scripts/seed.mjs';
import { getNode, listChildren, getAncestors, listByKind } from '../worker/nodes.mjs';
import { AppError, ERROR_CODES } from '../worker/errors.mjs';

const fromRoot = (p) => new URL(`../${p}`, import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
async function seeded() {
  const db = openDb();
  migrate(db, fromRoot('migrations'));
  await importNodeSeed(db, fromRoot('seed/nodes.public.json'));
  return db;
}
const code = (p) => p.then(() => null, (e) => (e instanceof AppError ? e.code : `非 AppError：${e.message}`));

test('AppError 只接受设计 §6.3 登记的 13 个错误码', () => {
  assert.equal(ERROR_CODES.length, 13);
  assert.throws(() => new AppError('E_NOPE', 'x'), /未登记/);
  assert.equal(new AppError('E_VALIDATION', 'x', { a: 1 }).details.a, 1);
});

test('getNode：区分"确无子节点"与"有子节点但未加载"（FR-N2）', async () => {
  const db = await seeded();
  assert.deepEqual((await getNode(db, 'geo.fr')).children, { state: 'none' });
  assert.deepEqual((await getNode(db, 'geo.cn-sn-xa-wy')).children, { state: 'none' });
  assert.deepEqual((await getNode(db, 'geo.cn')).children, { state: 'not_loaded', count: 1 });
  assert.deepEqual((await getNode(db, 'geo.world')).children, { state: 'not_loaded', count: 2 });
});

test('getNode：detail 解析为对象；不暴露 path／origin／search_norm／时间戳，也无关注类字段（FR-N3）', async () => {
  const db = await seeded();
  const n = await getNode(db, 'geo.cn');
  assert.deepEqual(n.detail, {});
  assert.equal(n.name, '中国');
  assert.equal(n.code, 'CN');
  for (const k of ['path', 'origin', 'search_norm', 'created_at', 'updated_at'])
    assert.ok(!(k in n), `不应返回 ${k}`);
  assert.ok(!Object.keys(n).some((k) => /follow|favorite|focus/i.test(k)));
});

test('getNode：不存在返回 E_NOT_FOUND', async () => {
  assert.equal(await code(getNode(await seeded(), 'nope')), 'E_NOT_FOUND');
});

test('listChildren：按 sort_order 排序，子节点自带 children 状态', async () => {
  const db = await seeded();
  const r = await listChildren(db, 'geo.world');
  assert.deepEqual(r.items.map((x) => x.id), ['geo.asia', 'geo.europe']);
  assert.equal(r.next_cursor, null);
  assert.deepEqual(r.items[1].children, { state: 'not_loaded', count: 1 });
  const none = await listChildren(db, 'geo.fr');
  assert.deepEqual(none, { items: [], next_cursor: null });
});

test('listChildren：游标分页完整且不重复，含 sort_order 相同的同级节点', async () => {
  const db = await seeded();
  for (const [i, id] of ['b', 'a', 'c', 'd', 'e'].entries()) {
    await db.prepare(`INSERT INTO wc_nodes (id,parent_id,path,realm,kind,name,origin,sort_order,created_at,updated_at)
      VALUES (?, 'geo.fr', ?, 'geo','city',?, 'user', ?, 0, 0)`).bind(id, `/geo.world/geo.europe/geo.fr/${id}/`, id, i < 3 ? 0 : 1).run();
  }
  const seen = [];
  let cursor;
  let pages = 0;
  do {
    const r = await listChildren(db, 'geo.fr', { limit: 2, cursor });
    seen.push(...r.items.map((x) => x.id));
    cursor = r.next_cursor ?? undefined;
    pages++;
  } while (cursor && pages < 10);
  assert.deepEqual(seen, ['a', 'b', 'c', 'd', 'e']);
  assert.equal(pages, 3);
});

test('listChildren：非法 limit／cursor 返回 E_VALIDATION，父节点不存在返回 E_NOT_FOUND', async () => {
  const db = await seeded();
  for (const limit of [0, 101, 1.5, '5']) assert.equal(await code(listChildren(db, 'geo.world', { limit })), 'E_VALIDATION');
  for (const cursor of ['x', ':a', '1:', 5, '1.5:a']) assert.equal(await code(listChildren(db, 'geo.world', { cursor })), 'E_VALIDATION');
  assert.equal(await code(listChildren(db, 'nope')), 'E_NOT_FOUND');
});

test('getAncestors：根→父顺序，不含自身；根节点返回空', async () => {
  const db = await seeded();
  assert.deepEqual((await getAncestors(db, 'geo.cn-sn-xa-wy')).map((x) => x.id), ['geo.world', 'geo.asia', 'geo.cn', 'geo.cn-sn', 'geo.cn-sn-xa']);
  assert.deepEqual((await getAncestors(db, 'geo.fr')).map((x) => x.id), ['geo.world', 'geo.europe']);
  assert.deepEqual(await getAncestors(db, 'geo.world'), []);
  assert.equal(await code(getAncestors(db, 'nope')), 'E_NOT_FOUND');
});

test('查询计划：子节点列表与祖先查询不做全表扫描（设计 §4.4、§11）', async () => {
  const db = await seeded();
  const plan = async (sql, ...b) =>
    (await db.prepare(`EXPLAIN QUERY PLAN ${sql}`).bind(...b).all()).results.map((r) => r.detail).join(' ; ');
  const kids = await plan('SELECT id FROM wc_nodes n WHERE n.parent_id = ? ORDER BY n.sort_order, n.id LIMIT 21', 'geo.world');
  assert.match(kids, /USING (COVERING )?INDEX wc_nodes_children/);
  assert.doesNotMatch(kids, /SCAN n\b(?! USING)/);
  const anc = await plan('SELECT id FROM wc_nodes n WHERE n.id IN (?,?)', 'a', 'b');
  assert.doesNotMatch(anc, /SCAN/);
});

test('listByKind：列出国家；非法 kind 拒绝', async () => {
  const db = await seeded();
  const { items } = await listByKind(db, 'country');
  assert.deepEqual(items.map((n) => n.code).sort(), ['CN', 'FR']);
  assert.equal(await code(listByKind(db, 'Bad Kind')), 'E_VALIDATION');
});
