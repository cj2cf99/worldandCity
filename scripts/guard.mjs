// 提交守卫（设计 §3.3）。同一份脚本供本地 pre-commit 钩子与 CI 共用。
// 用法：node scripts/guard.mjs --staged   检查暂存区内容（钩子）
//       node scripts/guard.mjs --all      检查所有已跟踪文件（CI）
// 输出只含路径、行号与规则名，不回显命中内容，避免守卫自己把疑似密钥写进日志。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const DEV_DB = 'data/local/worldandcity-dev.sqlite';
const DEV_DB_MAX_BYTES = 5 * 1024 * 1024;

const FORBIDDEN_EXT = /\.(pem|key|db|sqlite|sqlite3|bak|log)$/;
const SQLITE_SIDECAR = /\.(sqlite|sqlite3|db)-(wal|shm|journal)$/;
const FORBIDDEN_DIRS = new Set(['backup', 'backups', 'export', 'exports', 'uploads', 'private', 'secrets', 'node_modules', '.wrangler']);
const SEED_JSON = /^(seed|config\/defaults|geo)\/.*\.json$/;

const CONTENT_RULES = [
  ['email', /[\w.+-]+@[\w-]+\.[\w.-]+/],
  ['cn-mobile', /(?<!\d)1[3-9]\d{9}(?!\d)/],
  ['private-key-block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['jwt', /eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/],
  ['cloudflare-var-assignment', /\b(CF|CLOUDFLARE)_[A-Z0-9_]*\s*[=:]\s*\S+/],
];
// 长随机令牌：纯字母数字且同时含大写、小写、数字（排除 40/64 位小写十六进制哈希）
const LONG_TOKEN = /[A-Za-z0-9]{40,}/g;
const looksRandom = (s) => /[A-Z]/.test(s) && /[a-z]/.test(s) && /\d/.test(s);

/** 路径级规则。 */
export function checkPath(path) {
  if (path === DEV_DB) return [];
  const v = [];
  const parts = path.toLowerCase().split('/');
  const base = parts[parts.length - 1];
  if (/^\.env($|\.)/.test(base) && base !== '.env.example') v.push('env-file');
  if (base === '.dev.vars') v.push('env-file');
  if (FORBIDDEN_EXT.test(base) || SQLITE_SIDECAR.test(base)) v.push('forbidden-extension');
  if (parts.slice(0, -1).some((p) => FORBIDDEN_DIRS.has(p))) v.push('forbidden-directory');
  return v;
}

/** 文本内容规则，返回 [{line, rule}]；不含命中文本。 */
export function scanText(text) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const [rule, re] of CONTENT_RULES) if (re.test(line)) out.push({ line: i + 1, rule });
    for (const m of line.matchAll(LONG_TOKEN)) if (looksRandom(m[0])) out.push({ line: i + 1, rule: 'long-random-token' });
  });
  return out;
}

/** 种子／配置／底图 JSON 的文件头规则。 */
export function checkSeedHeader(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return ['seed-invalid-json'];
  }
  const v = [];
  if (doc === null || typeof doc !== 'object') return ['seed-invalid-json'];
  if (doc._origin !== 'public' && doc._origin !== 'demo') v.push('seed-missing-origin');
  if (typeof doc._license !== 'string' || !doc._license.trim()) v.push('seed-missing-license');
  return v;
}

// 每个允许有数据的 wc_ 表必须有"违规行数"查询；没有规则的 wc_ 表只要有数据就拒绝，
// 新增表时必须同步补规则（设计 §3.2）。
const ANY_DATA_OK = new Set(['wc_meta', 'wc_d1_migrations']);
const DB_RULES = {
  wc_nodes: "SELECT count(*) AS c FROM wc_nodes WHERE origin NOT IN ('seed','demo')",
};

/** 开发库专项检查，入参为文件内容。 */
export function checkDevDb(buf) {
  const v = [];
  if (buf.length > DEV_DB_MAX_BYTES) v.push('devdb-too-large');
  const dir = mkdtempSync(join(tmpdir(), 'wc-guard-'));
  try {
    const f = join(dir, 'dev.sqlite');
    writeFileSync(f, buf);
    const db = new DatabaseSync(f, { readOnly: true });
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
      for (const t of tables) {
        if (t.startsWith('sqlite_')) continue;
        if (!t.startsWith('wc_')) {
          v.push('devdb-foreign-table');
          continue;
        }
        if (ANY_DATA_OK.has(t)) continue;
        if (DB_RULES[t]) {
          if (db.prepare(DB_RULES[t]).get().c > 0) v.push(`devdb-bad-origin:${t}`);
        } else if (db.prepare(`SELECT count(*) AS c FROM "${t}"`).get().c > 0) {
          v.push(`devdb-no-rule-for-table:${t}`);
        }
      }
    } finally {
      db.close();
    }
  } catch {
    v.push('devdb-unreadable');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return v;
}

/** 对一批文件执行全部规则。read(path) 返回 Buffer。返回 [{path, line?, rule}]。 */
export function checkFiles(paths, read) {
  const out = [];
  for (const path of paths) {
    const add = (rule, line) => out.push(line ? { path, line, rule } : { path, rule });
    checkPath(path).forEach((r) => add(r));
    if (path === 'package-lock.json') continue; // 内容是 npm 的完整性哈希（sha512），会被“长随机串”规则误报；路径规则上面已检查
    const buf = read(path);
    if (path === DEV_DB) {
      checkDevDb(buf).forEach((r) => add(r));
      continue;
    }
    if (buf.includes(0)) {
      add('binary-file');
      continue;
    }
    const text = buf.toString('utf8');
    scanText(text).forEach(({ line, rule }) => add(rule, line));
    if (SEED_JSON.test(path)) checkSeedHeader(text).forEach((r) => add(r));
  }
  return out;
}

const git = (args) => execFileSync('git', args, { maxBuffer: 256 * 1024 * 1024 });
const names = (buf) => buf.toString('utf8').split('\0').filter(Boolean);

function main(mode) {
  const root = git(['rev-parse', '--show-toplevel']).toString('utf8').trim();
  process.chdir(root);
  let paths;
  let read;
  if (mode === '--staged') {
    paths = names(git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']));
    read = (p) => git(['show', `:${p}`]);
  } else {
    paths = names(git(['ls-files', '-z'])).filter((p) => existsSync(p));
    read = (p) => readFileSync(p);
  }
  const violations = checkFiles(paths, read);
  if (violations.length === 0) {
    console.log(`guard: 通过（${paths.length} 个文件）`);
    return 0;
  }
  console.error(`guard: 发现 ${violations.length} 处违规（不显示命中内容）：`);
  for (const x of violations) console.error(`  ${x.path}${x.line ? `:${x.line}` : ''}  [${x.rule}]`);
  console.error('若是误提交的真实数据或凭据：先轮换凭据，再处理历史（见 README 公开仓库声明）。');
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode !== '--staged' && mode !== '--all') {
    console.error('用法：node scripts/guard.mjs --staged | --all');
    process.exit(2);
  }
  process.exit(main(mode));
}
