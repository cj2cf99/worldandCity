// 本地开发库命令行入口。默认只操作仓库内开发库；--db 指向其他路径需显式给出。
// 用法：node scripts/db.mjs migrate|seed [--db <path>]
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { openDb, migrate } from './local-d1.mjs';
import { importNodeSeed } from './seed.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEV_DB = join(root, 'data', 'local', 'worldandcity-dev.sqlite');
const MIGRATIONS_DIR = join(root, 'migrations');
const NODE_SEED = join(root, 'seed', 'nodes.public.json');

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  const i = rest.indexOf('--db');
  const path = i >= 0 ? resolve(rest[i + 1]) : DEV_DB;
  if (cmd !== 'migrate' && cmd !== 'seed') {
    console.error('用法：node scripts/db.mjs migrate|seed [--db <path>]');
    process.exit(2);
  }
  const db = openDb(path);
  const applied = migrate(db, MIGRATIONS_DIR);
  if (cmd === 'migrate') {
    console.log(applied.length ? `已应用：${applied.join(', ')}` : '无待应用迁移');
  } else {
    const r = await importNodeSeed(db, NODE_SEED);
    console.log(r.skipped ? '种子版本未变，跳过' : `已导入 ${r.count} 个种子节点`);
  }
  db.close();
}
