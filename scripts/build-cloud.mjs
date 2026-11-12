// 生成“挂进主站”所需的全部产物（不部署、不连数据库）：
//   dist/hosted/            页面与静态文件（base=/worldandcity/，接口=/api/worldandcity/v1，带“返回首页”按钮；不含 nebula 图片与 topojson）
//   dist/cloud/schema.sql   建表（来自 migrations/）
//   dist/cloud/seed.sql     公开节点种子（取自仓库内开发库，只含 origin=seed/demo 的行）
// 用法：node scripts/build-cloud.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hosted = join(root, 'dist', 'hosted'), cloud = join(root, 'dist', 'cloud');
rmSync(hosted, { recursive: true, force: true }); rmSync(cloud, { recursive: true, force: true });
mkdirSync(cloud, { recursive: true });

// 1) 页面
execFileSync(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--base=/worldandcity/', '--outDir', hosted, '--emptyOutDir'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, VITE_HOSTED: '1', VITE_API: '/api/worldandcity/v1' },
});
rmSync(join(hosted, 'nebula'), { recursive: true, force: true }); // 观测图来源与许可未核实，不随主站发布
for (const d of ['jp', 'cn', 'adm1']) {
  const dir = join(hosted, 'geo', d);
  for (const f of readdirSync(dir)) if (!f.endsWith('.json')) rmSync(join(dir, f)); // 只留前端实际读取的 .json（如 japan.topojson 是生成中间件）
}

// 2) 建表 SQL：沿用迁移文件内容
const migs = readdirSync(join(root, 'migrations')).filter((f) => /^wc_\d{4}_.*\.sql$/.test(f)).sort();
writeFileSync(join(cloud, 'schema.sql'), migs.map((f) => `-- ${f}\n${readFileSync(join(root, 'migrations', f), 'utf8').trim()}\n`).join('\n'));

// 3) 种子 SQL：从公开开发库导出（先确认全是公开来源）
const db = new DatabaseSync(join(root, 'data', 'local', 'worldandcity-dev.sqlite'), { readOnly: true });
if (db.prepare("SELECT count(*) c FROM wc_nodes WHERE origin NOT IN ('seed','demo')").get().c) throw new Error('开发库含非公开节点，停止');
if (db.prepare('SELECT count(*) c FROM wc_labels').get().c) throw new Error('开发库含标签（个人数据），停止');
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const NODE_COLS = ['id', 'parent_id', 'path', 'realm', 'kind', 'name', 'name_local', 'code', 'geom_ref', 'bbox_w', 'bbox_s', 'bbox_e', 'bbox_n', 'detail', 'sort_order', 'search_norm', 'origin', 'created_at', 'updated_at'];
const out = ['PRAGMA defer_foreign_keys=ON;'];
for (const r of db.prepare('SELECT key, value FROM wc_meta ORDER BY key').all()) out.push(`INSERT INTO wc_meta (key, value) VALUES (${q(r.key)}, ${q(r.value)});`);
for (const r of db.prepare('SELECT * FROM wc_nodes ORDER BY length(path), id').all()) out.push(`INSERT INTO wc_nodes (${NODE_COLS.join(', ')}) VALUES (${NODE_COLS.map((c) => q(r[c])).join(', ')});`);
writeFileSync(join(cloud, 'seed.sql'), out.join('\n') + '\n');
const n = db.prepare('SELECT count(*) c FROM wc_nodes').get().c; db.close();

const size = (d) => readdirSync(d, { recursive: true }).reduce((a, f) => { const p = join(d, f); return a + (statSync(p).isFile() ? statSync(p).size : 0); }, 0);
console.log(`hosted ${(size(hosted) / 1e6).toFixed(1)} MB；seed ${n} 个节点；schema ${migs.length} 个迁移`);
