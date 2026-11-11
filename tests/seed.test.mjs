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
  assert.equal(rows.length, 944); // 834 个地理节点（世界／6 大洲／196 国／中国 34 省＋地级／日本 47 都道府县＋主要城市）+ 110 个宇宙系天体节点
  const by = Object.fromEntries(rows.map((x) => [x.id, x]));
  assert.equal(by['geo.cn-sn-xa-wy'].path, '/geo.world/geo.asia/geo.cn/geo.cn-sn/geo.cn-sn-xa/geo.cn-sn-xa-wy/');
  assert.equal(by['geo.fr'].path, '/geo.world/geo.europe/geo.fr/');
  assert.ok(rows.every((x) => x.origin === 'seed'));
  assert.equal(await db.prepare("SELECT value FROM wc_meta WHERE key='seed_version'").first('value'), String(JSON.parse(readFileSync(SEED, 'utf8'))._version));
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
      d._version += 1; // 比随库种子版本高一版
      d.nodes.find((n) => n.id === 'geo.fr').name = '法兰西';
    },
    (f) => importNodeSeed(db, f),
  );
  assert.equal(await db.prepare("SELECT name FROM wc_nodes WHERE id='geo.fr'").first('name'), '法兰西');
  assert.equal(await db.prepare("SELECT name FROM wc_nodes WHERE id='u1'").first('name'), '我的节点');
  assert.equal(await db.prepare("SELECT value FROM wc_meta WHERE key='seed_version'").first('value'), String(JSON.parse(readFileSync(SEED, 'utf8'))._version + 1));
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
test('版本升级时删除种子里已移除的叶子节点，不动 user 节点', async () => {
  const db = fresh();
  await importNodeSeed(db, SEED);
  await db
    .prepare("INSERT INTO wc_nodes (id,parent_id,path,realm,kind,name,origin,created_at,updated_at) VALUES ('u2','geo.fr','/geo.world/geo.europe/geo.fr/u2/','geo','city','我的节点','user',1,1)")
    .run();
  await withSeedFile(
    (d) => {
      d._version += 1;
      d.nodes = d.nodes.filter((n) => n.id !== 'cel.hcb-wall'); // 种子里移除一个叶子节点
    },
    (f) => importNodeSeed(db, f),
  );
  const ids = (await db.prepare('SELECT id FROM wc_nodes').all()).results.map((r) => r.id);
  assert.ok(!ids.includes('cel.hcb-wall'), '已移除的种子叶子节点被删除');
  assert.ok(ids.includes('u2'), 'user 节点保留');
});

test('清理已移除的整条种子分支：数量超过单批上限（D1 每条语句 ≤100 个绑定参数），父子都被删净', async () => {
  const db = fresh();
  await importNodeSeed(db, SEED);
  const extra = [{ id: 'geo.zz', parent_id: 'geo.asia', realm: 'geo', kind: 'country', name: '测试国', code: 'ZZ', sort_order: 999 }];
  for (let i = 0; i < 250; i++) extra.push({ id: `geo.zz-${i}`, parent_id: 'geo.zz', realm: 'geo', kind: 'admin1', name: `测试省${i}`, sort_order: i });
  for (let i = 0; i < 120; i++) extra.push({ id: `geo.zz-0-${i}`, parent_id: 'geo.zz-0', realm: 'geo', kind: 'city', name: `测试市${i}`, sort_order: i });
  await withSeedFile((d) => { d._version += 1; d.nodes.push(...extra); }, (f) => importNodeSeed(db, f)); // 先导入 371 个额外节点
  const count = async () => (await db.prepare("SELECT COUNT(*) AS n FROM wc_nodes WHERE id LIKE 'geo.zz%'").first()).n;
  assert.equal(await count(), 371);
  let maxBinds = 0; const prep = db.prepare.bind(db);
  db.prepare = (sql) => { const st = prep(sql), bind = st.bind.bind(st); if (/^\s*DELETE/.test(sql)) st.bind = (...args) => { maxBinds = Math.max(maxBinds, args.length); return bind(...args); }; return st; };
  await withSeedFile((d) => { d._version += 2; }, (f) => importNodeSeed(db, f)); // 再导入不含它们的种子
  assert.equal(await count(), 0, '整条分支（父、子、孙）被清干净');
  assert.ok(maxBinds > 0 && maxBinds <= 100, `每条删除语句的绑定参数 ≤100（实际最大 ${maxBinds}）`);
});
