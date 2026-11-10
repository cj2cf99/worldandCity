// 节点读取服务（设计 §6.2 节点端点；FR-N1、N2、N3、N5）。入参 db 为 D1 形接口，本地与线上共用。
import { AppError } from './errors.mjs';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// 不返回 path／search_norm／origin／时间戳等内部列；也没有任何关注类字段（FR-N3）。
const PUBLIC_COLS = 'id, parent_id, realm, kind, name, name_local, code, geom_ref, bbox_w, bbox_s, bbox_e, bbox_n, detail, sort_order';
const CHILD_COUNT = '(SELECT count(*) FROM wc_nodes c WHERE c.parent_id = n.id) AS child_count';

/** children 状态（FR-N2）：确无子节点 = none；有子节点但本响应未附带 = not_loaded。 */
function toNode(row) {
  const { child_count, detail, ...rest } = row;
  return {
    ...rest,
    detail: JSON.parse(detail),
    children: child_count === 0 ? { state: 'none' } : { state: 'not_loaded', count: child_count },
  };
}

function parseLimit(limit) {
  if (limit === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new AppError('E_VALIDATION', `limit 必须是 1–${MAX_LIMIT} 的整数`, { field: 'limit' });
  }
  return limit;
}

/** 游标 = "排序值:id"，按第一个冒号切分（id 可含冒号）。调用方应视为不透明字符串。 */
function parseCursor(cursor) {
  if (cursor === undefined) return null;
  const i = typeof cursor === 'string' ? cursor.indexOf(':') : -1;
  const order = i > 0 ? Number(cursor.slice(0, i)) : NaN;
  if (!Number.isInteger(order) || i === cursor.length - 1) {
    throw new AppError('E_VALIDATION', 'cursor 无效', { field: 'cursor' });
  }
  return { order, id: cursor.slice(i + 1) };
}

async function mustGet(db, id) {
  const row = await db.prepare(`SELECT ${PUBLIC_COLS}, path, ${CHILD_COUNT} FROM wc_nodes n WHERE id = ?`).bind(id).first();
  if (!row) throw new AppError('E_NOT_FOUND', '节点不存在', { id });
  return row;
}

export async function getNode(db, id) {
  const { path: _path, ...row } = await mustGet(db, id);
  return toNode(row);
}

/** 子节点分页，仅返回已配置节点。按 (sort_order, id) 稳定排序。 */
export async function listChildren(db, id, { limit, cursor } = {}) {
  const n = parseLimit(limit);
  const after = parseCursor(cursor);
  await mustGet(db, id);
  const where = after ? 'AND (n.sort_order, n.id) > (?, ?)' : '';
  const binds = after ? [id, after.order, after.id, n + 1] : [id, n + 1];
  const { results } = await db
    .prepare(`SELECT ${PUBLIC_COLS}, ${CHILD_COUNT} FROM wc_nodes n WHERE n.parent_id = ? ${where} ORDER BY n.sort_order, n.id LIMIT ?`)
    .bind(...binds)
    .all();
  const page = results.slice(0, n);
  const last = page[page.length - 1];
  return {
    items: page.map(toNode),
    next_cursor: results.length > n ? `${last.sort_order}:${last.id}` : null,
  };
}

/** 面包屑：根→父，不含自身。由 path 拆分后一次 IN 查询（设计 §4.2）。 */
export async function getAncestors(db, id) {
  const { path } = await mustGet(db, id);
  const ids = path.split('/').filter(Boolean).slice(0, -1);
  if (ids.length === 0) return [];
  const marks = ids.map(() => '?').join(',');
  const { results } = await db
    .prepare(`SELECT ${PUBLIC_COLS}, ${CHILD_COUNT} FROM wc_nodes n WHERE n.id IN (${marks})`)
    .bind(...ids)
    .all();
  const byId = new Map(results.map((r) => [r.id, r]));
  return ids.map((x) => toNode(byId.get(x)));
}
