// 本地开发库命令行入口。默认只操作仓库内开发库；--db 指向其他路径需显式给出。
// 用法：node scripts/db.mjs migrate [--db <path>]
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { openDb, migrate } from './local-d1.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DEV_DB = join(root, 'data', 'local', 'worldandcity-dev.sqlite');
export const MIGRATIONS_DIR = join(root, 'migrations');

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  const i = rest.indexOf('--db');
  const path = i >= 0 ? resolve(rest[i + 1]) : DEV_DB;
  if (cmd !== 'migrate') {
    console.error('用法：node scripts/db.mjs migrate [--db <path>]');
    process.exit(2);
  }
  const db = openDb(path);
  const applied = migrate(db, MIGRATIONS_DIR);
  db.close();
  console.log(applied.length ? `已应用：${applied.join(', ')}` : '无待应用迁移');
}
