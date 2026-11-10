import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, migrate, MIGRATIONS_TABLE } from '../scripts/local-d1.mjs';

const MIGRATIONS = new URL('../migrations', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const tables = (db) =>
  db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().then((r) => r.results.map((x) => x.name));

test('迁移在空库上建立 wc_ 表与记录表', async () => {
  const db = openDb();
  const applied = migrate(db, MIGRATIONS);
  assert.deepEqual(applied, ['wc_0001_meta_nodes.sql']);
  const names = (await tables(db)).filter((n) => !n.startsWith('sqlite_'));
  assert.deepEqual(names, [MIGRATIONS_TABLE, 'wc_meta', 'wc_nodes'].sort());
  assert.ok(names.every((n) => n.startsWith('wc_')), '所有表必须带 wc_ 前缀（设计 §4.1）');
});

test('迁移幂等：重复执行不再应用、不报错', async () => {
  const db = openDb();
  migrate(db, MIGRATIONS);
  assert.deepEqual(migrate(db, MIGRATIONS), []);
  const n = await db.prepare(`SELECT count(*) c FROM ${MIGRATIONS_TABLE}`).first('c');
  assert.equal(n, 1);
});

test('失败的迁移整体回滚且不记入记录表', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wc-mig-'));
  try {
    writeFileSync(join(dir, 'wc_0001_ok.sql'), 'CREATE TABLE wc_a (x INTEGER);');
    writeFileSync(join(dir, 'wc_0002_bad.sql'), 'CREATE TABLE wc_b (x INTEGER); CREATE TABLE wc_b (x INTEGER);');
    const db = openDb();
    assert.throws(() => migrate(db, dir), /wc_0002_bad\.sql/);
    const names = await tables(db);
    assert.ok(names.includes('wc_a'));
    assert.ok(!names.includes('wc_b'), '失败迁移的建表必须回滚');
    const rec = await db.prepare(`SELECT name FROM ${MIGRATIONS_TABLE}`).all();
    assert.deepEqual(rec.results.map((r) => r.name), ['wc_0001_ok.sql']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('文件名不带 wc_ 前缀的迁移被拒绝（避免与同库其他项目重名）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wc-mig-'));
  try {
    writeFileSync(join(dir, '0001_x.sql'), 'SELECT 1;');
    assert.throws(() => migrate(openDb(), dir), /迁移文件名不合规/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const node = (o) => ({
  id: 'x', parent_id: null, path: '/x/', realm: 'geo', kind: 'world', name: 'X', origin: 'seed', ...o,
});
const insert = (db, n) =>
  db
    .prepare(
      `INSERT INTO wc_nodes (id,parent_id,path,realm,kind,name,origin,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,0,0)`,
    )
    .bind(n.id, n.parent_id, n.path, n.realm, n.kind, n.name, n.origin)
    .run();

test('wc_nodes 约束：合法根/子节点通过，非法值被拒', async () => {
  const db = openDb();
  migrate(db, MIGRATIONS);
  await insert(db, node({}));
  await insert(db, node({ id: 'c', parent_id: 'x', path: '/x/c/', kind: 'country' }));
  await assert.rejects(insert(db, node({ id: 'a/b', path: '/a/b/' })), /CHECK/);
  await assert.rejects(insert(db, node({ id: 'r1', path: '/r1/', realm: 'moon' })), /CHECK/);
  await assert.rejects(insert(db, node({ id: 'r2', path: '/r2/', origin: 'real' })), /CHECK/);
  await assert.rejects(insert(db, node({ id: 'p1', path: '/other/' })), /CHECK/, 'path 必须以自身 id 结尾');
  // id 含 LIKE 通配符 _ 时必须按字面比较（回归：曾用 LIKE 导致校验变宽松）
  await assert.rejects(insert(db, node({ id: 'a_c', path: '/abc/' })), /CHECK/);
  await insert(db, node({ id: 'a_c', path: '/a_c/' }));
  await assert.rejects(insert(db, node({ id: 'p2', parent_id: 'x', path: '/p2/' })), /CHECK/, '有父节点则 path 不能是根形态');
  await assert.rejects(insert(db, node({ id: 'p3', parent_id: 'nope', path: '/nope/p3/' })), /FOREIGN KEY/);
});

test('父节点有子节点时 RESTRICT 删除', async () => {
  const db = openDb();
  migrate(db, MIGRATIONS);
  await insert(db, node({}));
  await insert(db, node({ id: 'c', parent_id: 'x', path: '/x/c/', kind: 'country' }));
  await assert.rejects(db.prepare("DELETE FROM wc_nodes WHERE id='x'").run(), /FOREIGN KEY/);
});

test('子树范围比较走 path 索引且不用 LIKE（设计 §4.2/§4.4）', async () => {
  const db = openDb();
  migrate(db, MIGRATIONS);
  await insert(db, node({}));
  await insert(db, node({ id: 'c', parent_id: 'x', path: '/x/c/', kind: 'country' }));
  await insert(db, node({ id: 'cc', parent_id: 'c', path: '/x/c/cc/', kind: 'admin1' }));
  await insert(db, node({ id: 'y', path: '/y/' }));
  const sub = await db.prepare('SELECT id FROM wc_nodes WHERE path >= ? AND path < ? ORDER BY path').bind('/x/c/', '/x/c0').all();
  assert.deepEqual(sub.results.map((r) => r.id), ['c', 'cc']);
  const plan = await db.prepare('EXPLAIN QUERY PLAN SELECT id FROM wc_nodes WHERE path >= ? AND path < ?').bind('/x/c/', '/x/c0').all();
  assert.match(plan.results.map((r) => r.detail).join(';'), /USING INDEX wc_nodes_path/);
  const kids = await db.prepare('EXPLAIN QUERY PLAN SELECT id FROM wc_nodes WHERE parent_id=? ORDER BY sort_order').bind('x').all();
  assert.match(kids.results.map((r) => r.detail).join(';'), /USING (COVERING )?INDEX wc_nodes_children/);
});

test('batch 为原子事务：中途失败则全部回滚', async () => {
  const db = openDb();
  migrate(db, MIGRATIONS);
  await assert.rejects(
    db.batch([
      db.prepare("INSERT INTO wc_meta (key,value) VALUES ('a','1')"),
      db.prepare("INSERT INTO wc_meta (key,value) VALUES ('a','2')"),
    ]),
  );
  assert.equal(await db.prepare('SELECT count(*) c FROM wc_meta').first('c'), 0);
});
