// 公开种子导入（设计 §4.5、§3.2）。可重复执行：版本未变则不写库；版本变化则只更新 origin='seed' 的行。
import { readFileSync } from 'node:fs';

/** 校验种子文件头与节点树，返回按深度排序、带计算后 path 的节点。 */
export function loadNodeSeed(file) {
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  if (doc._origin !== 'public') throw new Error(`${file}: 缺少 _origin: "public"`);
  if (typeof doc._license !== 'string' || !doc._license.trim()) throw new Error(`${file}: 缺少 _license`);
  if (!Number.isInteger(doc._version) || doc._version < 1) throw new Error(`${file}: _version 必须是正整数`);
  const stamp = Date.parse(doc._stamp);
  if (Number.isNaN(stamp)) throw new Error(`${file}: _stamp 必须是 ISO 8601 时间`);
  if (!Array.isArray(doc.nodes) || doc.nodes.length === 0) throw new Error(`${file}: nodes 不能为空`);

  const byId = new Map();
  for (const n of doc.nodes) {
    if (byId.has(n.id)) throw new Error(`${file}: 重复的节点 id ${n.id}`);
    byId.set(n.id, n);
  }
  const paths = new Map();
  const pathOf = (n, seen = new Set()) => {
    if (paths.has(n.id)) return paths.get(n.id);
    if (seen.has(n.id)) throw new Error(`${file}: 节点 ${n.id} 的父链存在环`);
    seen.add(n.id);
    let p;
    if (n.parent_id == null) {
      p = `/${n.id}/`;
    } else {
      const parent = byId.get(n.parent_id);
      if (!parent) throw new Error(`${file}: 节点 ${n.id} 的父节点 ${n.parent_id} 不在种子内`);
      p = `${pathOf(parent, seen)}${n.id}/`;
    }
    paths.set(n.id, p);
    return p;
  };
  const nodes = doc.nodes.map((n) => ({ ...n, path: pathOf(n) }));
  nodes.sort((a, b) => a.path.split('/').length - b.path.split('/').length);
  return { version: doc._version, stamp, nodes };
}

/** 导入节点种子。返回 { skipped, count }。 */
export async function importNodeSeed(db, file) {
  const { version, stamp, nodes } = loadNodeSeed(file);
  const current = await db.prepare("SELECT value FROM wc_meta WHERE key = 'seed_version'").first('value');
  if (current === String(version)) return { skipped: true, count: 0 };

  const upsert = `INSERT INTO wc_nodes
      (id, parent_id, path, realm, kind, name, name_local, code, sort_order, detail, origin, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      parent_id = excluded.parent_id, path = excluded.path, realm = excluded.realm, kind = excluded.kind,
      name = excluded.name, name_local = excluded.name_local, code = excluded.code,
      sort_order = excluded.sort_order, detail = excluded.detail, updated_at = excluded.updated_at
    WHERE wc_nodes.origin = 'seed'`;
  await db.batch([
    ...nodes.map((n) =>
      db
        .prepare(upsert)
        .bind(n.id, n.parent_id ?? null, n.path, n.realm, n.kind, n.name, n.name_local ?? null, n.code ?? null, n.sort_order ?? 0, JSON.stringify(n.detail ?? {}), stamp, stamp),
    ),
    db.prepare("INSERT INTO wc_meta (key, value) VALUES ('seed_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(String(version)),
  ]);
  return { skipped: false, count: nodes.length };
}
