import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, migrate } from '../scripts/local-d1.mjs';
import { importNodeSeed } from '../scripts/seed.mjs';
import { createNode, patchNode, deleteNode } from '../worker/node-write.mjs';
import { getNode, listChildren, getAncestors } from '../worker/nodes.mjs';
import { normalize } from '../worker/search-norm.mjs';
import { AppError } from '../worker/errors.mjs';

const fromRoot = (p) => new URL(`../${p}`, import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
async function seeded() {
  const db = openDb();
  migrate(db, fromRoot('migrations'));
  await importNodeSeed(db, fromRoot('seed/nodes.public.json'));
  await db.prepare("DELETE FROM wc_nodes WHERE parent_id = 'geo.fr'").run(); // 测试专用：让法国成为“止于国家”的稀疏分支（种子里法国已有一级行政区）
  return db;
}
// 固定的合法 ULID 样本（Crockford base32，26 位）
const U = (n) => `01JTEST${String(n).padStart(19, '0')}`; // 字母表 0-9A-HJKMNP-TV-Z；J、T、E、S 均合法
const code = (p) => p.then(() => null, (e) => (e instanceof AppError ? e.code : `非 AppError：${e.message}`));
const details = (p) => p.then(() => null, (e) => e.details);
const base = (o = {}) => ({ id: U(1), parent_id: 'geo.fr', kind: 'city', name: '示例城市', ...o });

test('样本 ULID 合法（防止测试夹具本身写错）', () => {
  assert.match(U(1), /^[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.equal(U(1).length, 26);
});

test('创建：path = 父.path + id + "/"，realm 继承父节点，origin=user，可被子树范围查询找到', async () => {
  const db = await seeded();
  const { node, created } = await createNode(db, base({ name: ' 里昂 ', name_local: 'Lyon', code: 'FR-LYO' }));
  assert.equal(created, true);
  assert.equal(node.name, '里昂');
  assert.equal(node.name_local, 'Lyon');
  assert.equal(node.realm, 'geo');
  assert.deepEqual(node.children, { state: 'none' });
  const row = await db.prepare('SELECT path, origin, search_norm FROM wc_nodes WHERE id = ?').bind(U(1)).first();
  assert.equal(row.path, `/geo.world/geo.europe/geo.fr/${U(1)}/`);
  assert.equal(row.origin, 'user');
  assert.equal(row.search_norm, normalize('里昂 Lyon'));
  const sub = await db.prepare('SELECT id FROM wc_nodes WHERE path >= ? AND path < ?').bind('/geo.world/geo.europe/', '/geo.world/geo.europe0').all();
  assert.ok(sub.results.some((r) => r.id === U(1)));
  assert.deepEqual((await getAncestors(db, U(1))).map((x) => x.id), ['geo.world', 'geo.europe', 'geo.fr']);
  assert.deepEqual((await getNode(db, 'geo.fr')).children, { state: 'not_loaded', count: 1 });
});

test('创建：深路径（挂在“区”之下）同样成立；不强制层数（FR-N5）', async () => {
  const db = await seeded();
  await createNode(db, base({ id: U(2), parent_id: 'geo.cn-sn-xa-wy', kind: 'area', name: '示例片区' }));
  assert.equal((await getAncestors(db, U(2))).length, 6);
});

test('创建幂等：同 id 同内容重复提交返回已存在资源；同 id 不同内容为 E_CONFLICT', async () => {
  const db = await seeded();
  await createNode(db, base());
  const again = await createNode(db, base());
  assert.equal(again.created, false);
  assert.equal(await db.prepare('SELECT count(*) c FROM wc_nodes WHERE id = ?').bind(U(1)).first('c'), 1);
  assert.equal(await code(createNode(db, base({ name: '别的名字' }))), 'E_CONFLICT');
  assert.equal(await code(createNode(db, base({ id: 'geo.fr', name: '法国' }))), 'E_VALIDATION', 'ULID 格式不符');
});

test('创建：code 冲突为 E_CONFLICT；父节点不存在为 E_NOT_FOUND', async () => {
  const db = await seeded();
  assert.equal(await code(createNode(db, base({ code: 'FR' }))), 'E_CONFLICT');
  assert.equal(await code(createNode(db, base({ parent_id: 'nope' }))), 'E_NOT_FOUND');
});

test('创建：校验失败一律 E_VALIDATION 且带 field，且不写库', async () => {
  const db = await seeded();
  const cases = [
    [{ id: 'abc' }, 'id'], [{ id: undefined }, 'id'], [{ parent_id: undefined }, 'parent_id'], [{ parent_id: null }, 'parent_id'],
    [{ kind: 'Bad Kind' }, 'kind'], [{ kind: '' }, 'kind'], [{ name: '' }, 'name'], [{ name: '   ' }, 'name'], [{ name: undefined }, 'name'],
    [{ name: 5 }, 'name'], [{ name: '——' }, 'name'], [{ name: '()' }, 'name'], [{ name: 'ok', name_local: '——' }, 'name_local'], [{ name: '字'.repeat(101) }, 'name'], [{ code: 'a b' }, 'code'], [{ detail: [] }, 'detail'], [{ detail: 'x' }, 'detail'],
    [{ detail: { a: 'x'.repeat(65 * 1024) } }, 'detail'], [{ sort_order: 1.5 }, 'sort_order'], [{ sort_order: '1' }, 'sort_order'],
    [{ path: '/x/' }, 'path'], [{ realm: 'celestial' }, 'realm'], [{ origin: 'seed' }, 'origin'],
  ];
  for (const [o, field] of cases) {
    const d = await details(createNode(db, base(o)));
    assert.equal(d?.field, field, `${JSON.stringify(o).slice(0, 40)} 应拒绝并指出 ${field}`);
  }
  assert.equal(await code(createNode(db, null)), 'E_VALIDATION');
  assert.equal(await db.prepare("SELECT count(*) c FROM wc_nodes WHERE origin='user'").first('c'), 0);
});

test('创建：客户端无法指定 path／realm／origin（防止伪造种子身份）', async () => {
  const db = await seeded();
  for (const k of ['path', 'realm', 'origin', 'search_norm', 'created_at']) {
    assert.equal(await code(createNode(db, base({ [k]: 'x' }))), 'E_VALIDATION', k);
  }
});

test('patch：可改名／别名／详情／排序，并同步 search_norm 与 updated_at；不可改的字段拒绝', async () => {
  const db = await seeded();
  await createNode(db, base());
  const before = await db.prepare('SELECT updated_at FROM wc_nodes WHERE id = ?').bind(U(1)).first('updated_at');
  await new Promise((r) => setTimeout(r, 3));
  const n = await patchNode(db, U(1), { name: '里昂市', name_local: null, detail: { 特色: '美食' }, sort_order: 5 });
  assert.equal(n.name, '里昂市');
  assert.equal(n.name_local, null);
  assert.deepEqual(n.detail, { 特色: '美食' });
  assert.equal(n.sort_order, 5);
  const row = await db.prepare('SELECT search_norm, updated_at FROM wc_nodes WHERE id = ?').bind(U(1)).first();
  assert.equal(row.search_norm, normalize('里昂市'));
  assert.ok(row.updated_at > before);
  for (const k of ['parent_id', 'kind', 'code', 'realm', 'path', 'id', 'origin']) {
    const d = await details(patchNode(db, U(1), { [k]: 'x' }));
    assert.equal(d?.reason, 'immutable', `${k} 不可改（不支持移动）`);
  }
  assert.equal(await code(patchNode(db, U(1), {})), 'E_VALIDATION');
  assert.equal(await code(patchNode(db, U(1), { name: '' })), 'E_VALIDATION');
  assert.equal(await code(patchNode(db, U(1), { detail: null })), 'E_VALIDATION');
  assert.equal(await code(patchNode(db, U(1), { sort_order: null })), 'E_VALIDATION');
  assert.equal((await getNode(db, U(1))).name, '里昂市', '失败的 patch 不改变数据');
});

test('patch／delete：种子节点只读（E_FORBIDDEN_OP），不存在为 E_NOT_FOUND', async () => {
  const db = await seeded();
  assert.equal(await code(patchNode(db, 'geo.fr', { name: 'X' })), 'E_FORBIDDEN_OP');
  assert.equal(await code(deleteNode(db, 'geo.fr')), 'E_FORBIDDEN_OP');
  assert.equal(await code(patchNode(db, 'nope', { name: 'X' })), 'E_NOT_FOUND');
  assert.equal(await code(deleteNode(db, 'nope')), 'E_NOT_FOUND');
  assert.equal((await getNode(db, 'geo.fr')).name, '法国');
});

test('delete：有子节点时 E_NODE_IN_USE(has_children)；删掉子节点后可删；父节点计数恢复', async () => {
  const db = await seeded();
  await createNode(db, base());
  await createNode(db, base({ id: U(2), parent_id: U(1), kind: 'district', name: '一区' }));
  assert.deepEqual(await details(deleteNode(db, U(1))), { reason: 'has_children', id: U(1), count: 1 });
  await deleteNode(db, U(2));
  await deleteNode(db, U(1));
  assert.equal(await code(getNode(db, U(1))), 'E_NOT_FOUND');
  assert.deepEqual((await getNode(db, 'geo.fr')).children, { state: 'none' });
});

test('用户节点出现在 listChildren 且排在同 sort_order 的种子节点之后按 id 稳定排序', async () => {
  const db = await seeded();
  await createNode(db, base({ id: U(3), name: 'B', sort_order: 1 }));
  await createNode(db, base({ id: U(2), name: 'A', sort_order: 1 }));
  assert.deepEqual((await listChildren(db, 'geo.fr')).items.map((x) => x.id), [U(2), U(3)]);
});
