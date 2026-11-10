// Spike S2 的本地部分（设计 §13）：触发器 + RAISE(ABORT) 在 node:sqlite 上的行为，及错误消息能否按"错误码前缀"解析。
// 只证明本地 SQLite 侧；D1 侧未验证（本机不安装 wrangler）。用法：node spikes/s2-local-trigger.mjs
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE rel (id INTEGER PRIMARY KEY, from_id TEXT, to_id TEXT, type TEXT);
  CREATE TRIGGER rel_limit BEFORE INSERT ON rel
  WHEN NEW.type = 'involves' AND (SELECT count(*) FROM rel WHERE from_id = NEW.from_id AND type = 'involves') >= 3
  BEGIN SELECT RAISE(ABORT, 'E_HISTORY_OBJECT_LIMIT: max 3'); END;
`);
const ins = (to) => db.prepare("INSERT INTO rel (from_id,to_id,type) VALUES ('h1',?,'involves')").run(to);
const result = { inserted: 0, rejected: null, rowsAfter: null, batchRolledBack: null };
for (const to of ['a', 'b', 'c', 'd']) {
  try {
    ins(to);
    result.inserted++;
  } catch (e) {
    result.rejected = { message: e.message, code: /^E_[A-Z_]+/.exec(e.message)?.[0] ?? null, errcode: e.errcode, errstr: e.errstr };
  }
}
result.rowsAfter = db.prepare('SELECT count(*) c FROM rel').get().c;

// 事务内第 4 条失败时，前面的写入应整体回滚
db.exec('DELETE FROM rel; BEGIN');
try {
  for (const to of ['a', 'b', 'c', 'd']) ins(to);
  db.exec('COMMIT');
} catch {
  db.exec('ROLLBACK');
}
result.batchRolledBack = db.prepare('SELECT count(*) c FROM rel').get().c === 0;
console.log(JSON.stringify(result, null, 2));
