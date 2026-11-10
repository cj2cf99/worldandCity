import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, migrate } from '../scripts/local-d1.mjs';
import { importNodeSeed, loadNodeSeed } from '../scripts/seed.mjs';

const fromRoot = (p) => new URL(`../${p}`, import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const SEED = fromRoot('seed/nodes.public.json');
const fresh = () => {
  const db = openDb();
  migrate(db, fromRoot('migrations'));
  return db;
};
const dump = async (db) => (await db.prepare('SELECT * FROM wc_nodes ORDER BY id').all()).results;

function withSeedFile(mutate, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'wc-seed-'));
  try {
    const doc = JSON.parse(readFileSync(SEED, 'utf8'));
    mutate(doc);
    const f = join(dir, 'seed.json');
    writeFileSync(f, JSON.stringify(doc));
    return fn(f);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('导入后节点齐全，path 由父链计算，origin 全为 seed', async () => {
  const db = fresh();
  const r = await importNodeSeed(db, SEED);
  assert.equal(r.skipped, false);
  const rows = await dump(db);
  assert.equal(rows.length, 8);
  const by = Object.fromEntries(rows.map((x) => [x.id, x]));
  assert.equal(by['geo.cn-sn-xa-wy'].path, '/geo.world/geo.asia/geo.cn/geo.cn-sn/geo.cn-sn-xa/geo.cn-sn-xa-wy/');
  assert.equal(by['geo.fr'].path, '/geo.world/geo.europe/geo.fr/');
  assert.ok(rows.every((x) => x.origin === 'seed'));
  assert.equal(await db.prepare("SELECT value FROM wc_meta WHERE key='seed_version'").first('value'), '1');
});

test('深度差异：陕西路径深入到区，法国止于国家；节点表无关注类字段（FR-N3）', async () => {
  const db = fresh();
  await importNodeSeed(db, SEED);
  const kids = async (id) => (await db.prepare('SELECT id FROM wc_nodes WHERE parent_id=?').bind(id).all()).results.length;
  assert.equal(await kids('geo.fr'), 0, '法国无子节点（稀疏树）');
  assert.equal(await kids('geo.cn-sn-xa'), 1);
  const cols = (await db.prepare('PRAGMA table_info(wc_nodes)').all()).results.map((c) => c.name);
  assert.ok(!cols.some((c) => /follow|favorite|focus/i.test(c)));
});

test('幂等：重复导入不改变结果，版本未变直接跳过', async () => {
  const db = fresh();
  await importNodeSeed(db, SEED);
  const before = await dump(db);
  const r2 = await importNodeSeed(db, SEED);
  assert.equal(r2.skipped, true);
  assert.deepEqual(await dump(db), before);
});

test('版本升级时更新 seed 行，但不改动 user 节点', async () => {
  const db = fresh();
  await importNodeSeed(db, SEED);
  await db
    .prepare("INSERT INTO wc_nodes (id,parent_id,path,realm,kind,name,origin,created_at,updated_at) VALUES ('u1','geo.fr','/geo.world/geo.europe/geo.fr/u1/','geo','city','我的节点','user',1,1)")
    .run();
  await withSeedFile(
    (d) => {
      d._version = 2;
      d.nodes.find((n) => n.id === 'geo.fr').name = '法兰西';
    },
    (f) => importNodeSeed(db, f),
  );
  assert.equal(await db.prepare("SELECT name FROM wc_nodes WHERE id='geo.fr'").first('name'), '法兰西');
  assert.equal(await db.prepare("SELECT name FROM wc_nodes WHERE id='u1'").first('name'), '我的节点');
  assert.equal(await db.prepare("SELECT value FROM wc_meta WHERE key='seed_version'").first('value'), '2');
});

test('版本升级不覆盖与种子 id 冲突的 user 节点', async () => {
  const db = fresh();
  await db
    .prepare("INSERT INTO wc_nodes (id,parent_id,path,realm,kind,name,origin,created_at,updated_at) VALUES ('geo.world',NULL,'/geo.world/','geo','world','我的世界','user',1,1)")
    .run();
  await importNodeSeed(db, SEED);
  assert.equal(await db.prepare("SELECT name FROM wc_nodes WHERE id='geo.world'").first('name'), '我的世界');
});

test('种子文件头缺失或结构非法时拒绝，且不写库', async () => {
  const cases = [
    [(d) => delete d._origin, /_origin/],
    [(d) => (d._origin = 'private'), /_origin/],
    [(d) => delete d._license, /_license/],
    [(d) => delete d._version, /_version/],
    [(d) => (d._stamp = 'x'), /_stamp/],
    [(d) => d.nodes.push({ ...d.nodes[0] }), /重复/],
    [(d) => (d.nodes[1].parent_id = 'nope'), /父节点/],
    [(d) => ((d.nodes[0].parent_id = 'geo.asia')), /环/],
  ];
  for (const [mutate, re] of cases) {
    const db = fresh();
    await assert.rejects(withSeedFile(mutate, (f) => importNodeSeed(db, f)), re);
    assert.equal((await dump(db)).length, 0);
  }
});

test('loadNodeSeed 返回的节点父先于子', () => {
  const { nodes } = loadNodeSeed(SEED);
  const seen = new Set();
  for (const n of nodes) {
    assert.ok(n.parent_id == null || seen.has(n.parent_id), `${n.id} 的父节点应先出现`);
    seen.add(n.id);
  }
});

test('种子节点数据不含个人关注标记与敏感形态（PRD §0-4、§0-12）', () => {
  const text = readFileSync(SEED, 'utf8');
  const nodes = JSON.stringify(JSON.parse(text).nodes);
  assert.doesNotMatch(nodes, /follow|favorite|focus|关注|收藏/i, '仅检查节点数据；说明性 _note 允许提到"不记录关注偏好"');
  assert.doesNotMatch(text, /@[\w.-]+\.\w+|\b1[3-9]\d{9}\b|-----BEGIN/);
});