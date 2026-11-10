import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPath, scanText, checkSeedHeader, checkDevDb, DEV_DB } from '../scripts/guard.mjs';
import { openDb, migrate } from '../scripts/local-d1.mjs';
import { importNodeSeed } from '../scripts/seed.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// 违禁样本在运行时拼接，避免仓库内出现会触发守卫自身的字面量。
const fake = {
  email: ['someone', 'example.com'].join('@'),
  mobile: '1' + '3800138000',
  key: ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' '),
  jwt: ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJ4eHh4eHgifQ', 'abcdefghij1234567890'].join('.'),
  cf: ['CLOUDFLARE', 'API', 'TOKEN'].join('_') + '=abc',
  token: 'aB3'.repeat(15),
};

test('路径规则：拒绝 .env、违禁扩展名与目录，放行 .env.example 与开发库', () => {
  for (const p of ['.env', '.env.local', 'a/.dev.vars', 'x/y.pem', 'k.key', 'data/x.sqlite', 'data/private.db', 'a.bak', 'run.log',
    'data/local/other.sqlite', 'data/local/worldandcity-dev.sqlite-wal', 'backup/a.json', 'exports/a.json', 'uploads/p.png', 'secrets/a.txt'])
    assert.ok(checkPath(p).length > 0, `应拒绝 ${p}`);
  for (const p of ['.env.example', 'README.md', 'seed/nodes.public.json', DEV_DB, 'scripts/backup-notes.md'])
    assert.deepEqual(checkPath(p), [], `应放行 ${p}`);
});

test('内容规则：逐类命中，且返回值不含命中文本', () => {
  const cases = { email: 'email', mobile: 'cn-mobile', key: 'private-key-block', jwt: 'jwt', cf: 'cloudflare-var-assignment', token: 'long-random-token' };
  for (const [k, rule] of Object.entries(cases)) {
    const hits = scanText(`第一行\nx ${fake[k]} y`);
    assert.ok(hits.some((h) => h.rule === rule && h.line === 2), `应命中 ${rule}`);
    assert.ok(!JSON.stringify(hits).includes(fake[k]), '结果不得回显命中内容');
  }
});

test('内容规则：正常文本、40 位小写哈希、长数字不误报', () => {
  const ok = ['普通文档 REPLACE_D1_ID 占位', 'a'.repeat(40), 'abcdef0123456789'.repeat(4), '2026111004474738138001', 'node scripts/guard.mjs --all'];
  for (const t of ok) assert.deepEqual(scanText(t), [], t);
});

test('种子头规则：缺 _origin／_license 或非法 JSON 被拒', () => {
  assert.deepEqual(checkSeedHeader('{"_origin":"public","_license":"x"}'), []);
  assert.deepEqual(checkSeedHeader('{"_origin":"demo","_license":"x"}'), []);
  assert.deepEqual(checkSeedHeader('{"_license":"x"}'), ['seed-missing-origin']);
  assert.deepEqual(checkSeedHeader('{"_origin":"private","_license":"x"}'), ['seed-missing-origin']);
  assert.deepEqual(checkSeedHeader('{"_origin":"public"}'), ['seed-missing-license']);
  assert.deepEqual(checkSeedHeader('{"_origin":"public","_license":"  "}'), ['seed-missing-license']);
  assert.deepEqual(checkSeedHeader('{bad'), ['seed-invalid-json']);
});

function devDbBytes(setup) {
  const dir = mkdtempSync(join(tmpdir(), 'wc-gt-'));
  try {
    const f = join(dir, 'd.sqlite');
    const db = openDb(f);
    migrate(db, join(root, 'migrations'));
    setup(db);
    db.close();
    return readFileSync(f);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const addNode = (origin) => (db) =>
  db.exec(`INSERT INTO wc_nodes (id,path,realm,kind,name,origin,created_at,updated_at) VALUES ('n','/n/','geo','world','N','${origin}',0,0)`);

test('开发库规则：空库与 seed/demo 节点通过；user 节点、外来表、超大文件被拒', () => {
  assert.deepEqual(checkDevDb(devDbBytes(() => {})), []);
  assert.deepEqual(checkDevDb(devDbBytes(addNode('seed'))), []);
  assert.deepEqual(checkDevDb(devDbBytes(addNode('demo'))), []);
  assert.deepEqual(checkDevDb(devDbBytes(addNode('user'))), ['devdb-bad-origin:wc_nodes']);
  assert.deepEqual(checkDevDb(devDbBytes((db) => db.exec('CREATE TABLE other_project (x)'))), ['devdb-foreign-table']);
  assert.deepEqual(checkDevDb(Buffer.alloc(5 * 1024 * 1024 + 1)).includes('devdb-too-large'), true);
  assert.deepEqual(checkDevDb(Buffer.from('not a database')), ['devdb-unreadable']);
});

test('开发库规则：没有规则的 wc_ 表一旦有数据即拒绝（新增表必须补规则）', () => {
  const bytes = devDbBytes((db) => db.exec('CREATE TABLE wc_future (x); INSERT INTO wc_future VALUES (1)'));
  assert.deepEqual(checkDevDb(bytes), ['devdb-no-rule-for-table:wc_future']);
  assert.deepEqual(checkDevDb(devDbBytes((db) => db.exec('CREATE TABLE wc_future (x)'))), []);
});

// ---- 端到端：在临时 git 仓库里用真实的 --staged / --all ----
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'wc-repo-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  g('init', '-q');
  g('config', 'user.email', ['ci', 'invalid.test'].join('@'));
  g('config', 'user.name', 'ci');
  g('config', 'core.autocrlf', 'false');
  mkdirSync(join(dir, 'scripts'));
  for (const f of ['guard.mjs']) copyFileSync(join(root, 'scripts', f), join(dir, 'scripts', f));
  const put = (p, c) => {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), c);
  };
  const guard = (mode) => {
    try {
      const out = execFileSync('node', ['scripts/guard.mjs', mode], { cwd: dir, stdio: 'pipe' });
      return { code: 0, out: out.toString(), err: '' };
    } catch (e) {
      return { code: e.status, out: e.stdout.toString(), err: e.stderr.toString() };
    }
  };
  return { dir, g, put, guard, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test('端到端 --staged：拒绝违禁文件与缺头种子，放行合规文档与种子；输出不回显内容', () => {
  const r = repo();
  try {
    r.put('README.md', '# 文档\n');
    r.put('seed/nodes.public.json', '{"_origin":"public","_license":"x","nodes":[]}');
    r.g('add', '-A');
    assert.equal(r.guard('--staged').code, 0);
    r.g('commit', '-qm', 'ok');

    r.put('.env', 'A=1\n');
    r.put('data/other.sqlite', 'x');
    r.put('seed/bad.json', '{"nodes":[]}');
    r.put('notes.txt', `token ${fake.jwt}\n`);
    r.g('add', '-A');
    const res = r.guard('--staged');
    assert.equal(res.code, 1);
    for (const s of ['.env  [env-file]', 'data/other.sqlite', 'seed/bad.json  [seed-missing-origin]', 'notes.txt:1  [jwt]'])
      assert.ok(res.err.includes(s), `输出应含 ${s}\n${res.err}`);
    assert.ok(!res.err.includes(fake.jwt));
  } finally {
    r.done();
  }
});

test('端到端 --staged：只看暂存区内容，工作区里未暂存的违规不拦截', () => {
  const r = repo();
  try {
    r.put('a.md', 'clean\n');
    r.g('add', '-A');
    r.put('a.md', `dirty ${fake.email}\n`);
    assert.equal(r.guard('--staged').code, 0);
    r.g('add', '-A');
    assert.equal(r.guard('--staged').code, 1);
  } finally {
    r.done();
  }
});

test('端到端 --all：检查已跟踪文件', () => {
  const r = repo();
  try {
    r.put('a.md', `x ${fake.mobile}\n`);
    r.g('add', '-A');
    r.g('commit', '-qm', 'c');
    const res = r.guard('--all');
    assert.equal(res.code, 1);
    assert.ok(res.err.includes('a.md:1  [cn-mobile]'));
  } finally {
    r.done();
  }
});

test('本仓库当前已跟踪文件通过守卫（含入库开发库）', () => {
  const out = execFileSync('node', ['scripts/guard.mjs', '--all'], { cwd: root }).toString();
  assert.match(out, /通过/);
});

test('开发库与种子导入后仍通过开发库规则', async () => {
  const bytes = devDbBytes(() => {});
  assert.deepEqual(checkDevDb(bytes), []);
  const dir = mkdtempSync(join(tmpdir(), 'wc-gt-'));
  try {
    const f = join(dir, 'd.sqlite');
    const db = openDb(f);
    migrate(db, join(root, 'migrations'));
    await importNodeSeed(db, join(root, 'seed', 'nodes.public.json'));
    db.close();
    assert.deepEqual(checkDevDb(readFileSync(f)), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
