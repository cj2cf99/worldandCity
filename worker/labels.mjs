// 地图标签读写（独立于导航树）。校验只做必要的几项。
import { AppError } from './errors.mjs';

const COLS = 'id, level, node, lon, lat, type, text, created_at AS t';
const str = (v, f, max) => { if (typeof v !== 'string' || !v.trim() || v.length > max) throw new AppError('E_VALIDATION', `${f} 无效`); return v; };
const num = (v, f) => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new AppError('E_VALIDATION', `${f} 无效`); return v; };

export async function listLabels(db) {
  return { items: (await db.prepare(`SELECT ${COLS} FROM wc_labels ORDER BY created_at, id`).all()).results };
}

export async function createLabel(db, b = {}) {
  const now = Date.now(), id = typeof b.id === 'string' && /^lb[a-z0-9]{4,32}$/.test(b.id) ? b.id : 'lb' + now.toString(36) + Math.random().toString(36).slice(2, 6);
  await db.prepare('INSERT INTO wc_labels (id, level, node, lon, lat, type, text, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(id, str(b.level, 'level', 300), typeof b.node === 'string' ? b.node : null, num(b.lon, 'lon'), num(b.lat, 'lat'), str(b.type, 'type', 40), str(b.text, 'text', 200), Number.isFinite(b.t) ? b.t : now, now).run();
  return db.prepare(`SELECT ${COLS} FROM wc_labels WHERE id = ?`).bind(id).first();
}

export async function updateLabel(db, id, b = {}) {
  const sets = [], vals = [];
  if ('lon' in b) { sets.push('lon = ?'); vals.push(num(b.lon, 'lon')); }
  if ('lat' in b) { sets.push('lat = ?'); vals.push(num(b.lat, 'lat')); }
  if ('type' in b) { sets.push('type = ?'); vals.push(str(b.type, 'type', 40)); }
  if ('text' in b) { sets.push('text = ?'); vals.push(str(b.text, 'text', 200)); }
  if (!sets.length) throw new AppError('E_VALIDATION', '没有可更新的字段');
  const r = await db.prepare(`UPDATE wc_labels SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).bind(...vals, Date.now(), id).run();
  if (!r.meta.changes) throw new AppError('E_NOT_FOUND', '标签不存在');
  return db.prepare(`SELECT ${COLS} FROM wc_labels WHERE id = ?`).bind(id).first();
}

export async function deleteLabel(db, id) {
  const r = await db.prepare('DELETE FROM wc_labels WHERE id = ?').bind(id).run();
  if (!r.meta.changes) throw new AppError('E_NOT_FOUND', '标签不存在');
  return { ok: true };
}
