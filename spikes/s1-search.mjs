// Spike S1（设计 §13）：search_norm + LIKE 基线对中文检索的效果；顺带探测 FTS5 trigram。
// 只用虚构词条；仅在本地 node:sqlite 上运行，不代表 D1。用法：node spikes/s1-search.mjs
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
const rows = ['西安市', '未央区', '西安钟楼', '西宁市', '示例面馆（西安）', '太平洋台风 示例', '岛国东北部疫情 示例', 'Paris', 'paris café'];
db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, title TEXT, search_norm TEXT)');
const norm = (s) => s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]+/gu, '');
rows.forEach((r, i) => db.prepare('INSERT INTO t VALUES (?,?,?)').run(i, r, norm(r)));

const like = (q) => db.prepare("SELECT title FROM t WHERE search_norm LIKE '%' || ? || '%' ORDER BY id").all(norm(q)).map((r) => r.title);
const out = { like: {}, fts5: {} };
for (const q of ['西安', '安', '西安钟楼', '面馆', 'PARIS', 'Café', '示例', '（西安）']) out.like[q] = like(q);

try {
  db.exec("CREATE VIRTUAL TABLE f USING fts5(title, tokenize='trigram')");
  rows.forEach((r, i) => db.prepare('INSERT INTO f(rowid,title) VALUES (?,?)').run(i, r));
  const m = (q) => db.prepare('SELECT title FROM f WHERE f MATCH ? ORDER BY rowid').all(`"${q}"`).map((r) => r.title);
  out.fts5.available = true;
  for (const q of ['西安', '西安钟', '西安钟楼']) out.fts5[q] = m(q);
} catch (e) {
  out.fts5.available = false;
  out.fts5.error = String(e.message);
}
console.log(JSON.stringify(out, null, 2));
