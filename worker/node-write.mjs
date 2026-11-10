// 节点写入服务（设计 §6.2：POST/PATCH/DELETE /nodes；§4.2；§7.7）。
// 只创建/修改/删除 origin='user' 的节点；不支持移动（改父节点）。
import { AppError } from './errors.mjs';
import { getNode } from './nodes.mjs';
import { normalize } from './search-norm.mjs';

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const KIND = /^[a-z][a-z0-9_]{0,31}$/;
const CODE = /^[A-Za-z0-9._-]{1,32}$/;
const NAME_MAX = 100;
const DETAIL_MAX_BYTES = 64 * 1024;

const bad = (field, message) => new AppError('E_VALIDATION', message, { field });

function name(field, v, required) {
  if (v === undefined || v === null) {
    if (required) throw bad(field, `${field} 必填`);
    return null;
  }
  if (typeof v !== 'string') throw bad(field, `${field} 必须是字符串`);
  const s = v.trim();
  if (s.length === 0 || [...s].length > NAME_MAX) throw bad(field, `${field} 长度需在 1–${NAME_MAX} 个字符`);
  // 规范化后为空（如纯标点）的名称永远检索不到，直接拒绝
  if (normalize(s) === '') throw bad(field, `${field} 必须包含可检索的字符`);
  return s;
}

function detailJson(v) {
  if (v === undefined) return undefined;
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw bad('detail', 'detail 必须是对象');
  const s = JSON.stringify(v);
  if (new TextEncoder().encode(s).length > DETAIL_MAX_BYTES) throw bad('detail', `detail 超过 ${DETAIL_MAX_BYTES} 字节`);
  return s;
}

function sortOrder(v) {
  if (v === undefined) return undefined;
  if (!Number.isInteger(v)) throw bad('sort_order', 'sort_order 必须是整数');
  return v;
}

const searchNorm = (n, local) => normalize(`${n} ${local ?? ''}`);
const isUnique = (e) => /UNIQUE constraint failed/i.test(String(e?.message));

/** 创建用户节点。id 由客户端生成（ULID），同 id 且内容一致的重复提交返回已存在资源（设计 §6.1）。 */
export async function createNode(db, input) {
  if (input === null || typeof input !== 'object') throw bad('body', '请求体必须是对象');
  const allowed = ['id', 'parent_id', 'kind', 'name', 'name_local', 'code', 'detail', 'sort_order'];
  for (const k of Object.keys(input)) if (!allowed.includes(k)) throw bad(k, `不支持的字段 ${k}`);

  if (typeof input.id !== 'string' || !ULID.test(input.id)) throw bad('id', 'id 必须是 26 位 ULID');
  if (typeof input.parent_id !== 'string' || input.parent_id === '') throw bad('parent_id', '用户节点必须有父节点');
  if (typeof input.kind !== 'string' || !KIND.test(input.kind)) throw bad('kind', 'kind 格式不合法');
  const n = name('name', input.name, true);
  const local = name('name_local', input.name_local, false);
  if (input.code !== undefined && input.code !== null && (typeof input.code !== 'string' || !CODE.test(input.code))) throw bad('code', 'code 格式不合法');
  const code = input.code ?? null;
  const detail = detailJson(input.detail) ?? '{}';
  const order = sortOrder(input.sort_order) ?? 0;

  const parent = await db.prepare('SELECT id, path, realm FROM wc_nodes WHERE id = ?').bind(input.parent_id).first();
  if (!parent) throw new AppError('E_NOT_FOUND', '父节点不存在', { field: 'parent_id', id: input.parent_id });

  const existing = await db.prepare('SELECT id, parent_id, kind, name, name_local, code, origin FROM wc_nodes WHERE id = ?').bind(input.id).first();
  if (existing) {
    const same = existing.origin === 'user' && existing.parent_id === input.parent_id && existing.kind === input.kind
      && existing.name === n && existing.name_local === local && existing.code === code;
    if (!same) throw new AppError('E_CONFLICT', 'id 已被占用', { field: 'id' });
    return { node: await getNode(db, input.id), created: false };
  }
  if (code !== null && (await db.prepare('SELECT 1 AS x FROM wc_nodes WHERE code = ?').bind(code).first())) {
    throw new AppError('E_CONFLICT', 'code 已被占用', { field: 'code' });
  }

  const now = Date.now();
  try {
    await db
      .prepare(`INSERT INTO wc_nodes (id, parent_id, path, realm, kind, name, name_local, code, detail, sort_order, search_norm, origin, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', ?, ?)`)
      .bind(input.id, parent.id, `${parent.path}${input.id}/`, parent.realm, input.kind, n, local, code, detail, order, searchNorm(n, local), now, now)
      .run();
  } catch (e) {
    if (isUnique(e)) throw new AppError('E_CONFLICT', 'id 或 code 已被占用');
    throw e;
  }
  return { node: await getNode(db, input.id), created: true };
}

async function mustBeUser(db, id) {
  const row = await db.prepare('SELECT id, name, name_local, origin FROM wc_nodes WHERE id = ?').bind(id).first();
  if (!row) throw new AppError('E_NOT_FOUND', '节点不存在', { id });
  if (row.origin !== 'user') throw new AppError('E_FORBIDDEN_OP', '种子／示例节点不可修改', { reason: 'seed_node_readonly', id });
  return row;
}

/** 改名与详情。parent_id、kind、code、realm 等不可改（不支持移动）。 */
export async function patchNode(db, id, patch) {
  if (patch === null || typeof patch !== 'object') throw bad('body', '请求体必须是对象');
  const editable = ['name', 'name_local', 'detail', 'sort_order'];
  for (const k of Object.keys(patch)) {
    if (!editable.includes(k)) throw new AppError('E_VALIDATION', `字段 ${k} 不可修改`, { field: k, reason: 'immutable' });
  }
  if (Object.keys(patch).length === 0) throw bad('body', '没有可修改的字段');
  const cur = await mustBeUser(db, id);

  const n = 'name' in patch ? name('name', patch.name, true) : cur.name;
  const local = 'name_local' in patch ? name('name_local', patch.name_local, false) : cur.name_local;
  const sets = ['name = ?', 'name_local = ?', 'search_norm = ?', 'updated_at = ?'];
  const binds = [n, local, searchNorm(n, local), Date.now()];
  if ('detail' in patch) {
    const d = detailJson(patch.detail);
    if (d === undefined) throw bad('detail', 'detail 不能为空');
    sets.push('detail = ?');
    binds.push(d);
  }
  if ('sort_order' in patch) {
    const o = sortOrder(patch.sort_order);
    if (o === undefined) throw bad('sort_order', 'sort_order 不能为空');
    sets.push('sort_order = ?');
    binds.push(o);
  }
  await db.prepare(`UPDATE wc_nodes SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, id).run();
  return getNode(db, id);
}

/** 硬删除（设计 §7.7）。有子节点时拒绝。位置绑定检查随 wc_item_locations 迁移（M4）加入。 */
export async function deleteNode(db, id) {
  await mustBeUser(db, id);
  const kids = await db.prepare('SELECT count(*) AS c FROM wc_nodes WHERE parent_id = ?').bind(id).first('c');
  if (kids > 0) throw new AppError('E_NODE_IN_USE', '节点仍有子节点', { reason: 'has_children', id, count: kids });
  await db.prepare('DELETE FROM wc_nodes WHERE id = ?').bind(id).run();
}
