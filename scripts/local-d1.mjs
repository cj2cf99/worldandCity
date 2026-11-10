// 本地 SQLite 的 D1 形薄封装 + 迁移执行器（设计 §2.3、§4.5）。
// 仅依赖 Node 内置 node:sqlite；不引用其他项目的代码或数据。
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const MIGRATIONS_TABLE = 'wc_d1_migrations';
const MIGRATION_FILE = /^wc_\d{4}_[a-z0-9_]+\.sql$/;

class Statement {
  #db;
  #sql;
  #params = [];
  constructor(db, sql) {
    this.#db = db;
    this.#sql = sql;
  }
  bind(...params) {
    this.#params = params;
    return this;
  }
  /** 同步执行，供 batch 在事务内使用。 */
  _runSync() {
    const stmt = this.#db.prepare(this.#sql);
    if (stmt.columns().length > 0) {
      return { results: stmt.all(...this.#params), success: true, meta: { changes: 0 } };
    }
    const { changes, lastInsertRowid } = stmt.run(...this.#params);
    return {
      results: [],
      success: true,
      meta: { changes: Number(changes), last_row_id: Number(lastInsertRowid) },
    };
  }
  async all() {
    return this._runSync();
  }
  async first(column) {
    const row = this.#db.prepare(this.#sql).get(...this.#params) ?? null;
    return row && column ? row[column] : row;
  }
  async run() {
    return this._runSync();
  }
}

export class LocalD1 {
  #db;
  constructor(db) {
    this.#db = db;
  }
  prepare(sql) {
    return new Statement(this.#db, sql);
  }
  /** 与 D1 一致：整批在一个事务内，任一失败则全部回滚。 */
  async batch(statements) {
    this.#db.exec('BEGIN');
    try {
      const out = statements.map((s) => s._runSync());
      this.#db.exec('COMMIT');
      return out;
    } catch (err) {
      this.#db.exec('ROLLBACK');
      throw err;
    }
  }
  exec(sql) {
    this.#db.exec(sql);
  }
  close() {
    this.#db.close();
  }
}

/** 打开本地库。文件库用 journal_mode=DELETE，写入落在单一主文件（设计 §2.2-4）。 */
export function openDb(path = ':memory:') {
  const db = new DatabaseSync(path);
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = DELETE');
  db.exec('PRAGMA foreign_keys = ON');
  return new LocalD1(db);
}

/** 按文件名顺序执行未记录的迁移，返回本次新应用的文件名。已执行的不重复执行（幂等）。 */
export function migrate(db, dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (!MIGRATION_FILE.test(f)) throw new Error(`迁移文件名不合规（应为 wc_NNNN_描述.sql）：${f}`);
  }
  // 表结构与 wrangler 默认记录表一致，仅改名（设计 §4.5）。
  db.exec(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`);
  const done = new Set(
    db.prepare(`SELECT name FROM ${MIGRATIONS_TABLE}`)._runSync().results.map((r) => r.name),
  );
  const applied = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = readFileSync(join(dir, f), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.exec(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES ('${f}')`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`迁移 ${f} 失败：${err.message}`);
    }
    applied.push(f);
  }
  return applied;
}

