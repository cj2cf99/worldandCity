// 地图标签（独立于节点树的小系统）：存在本地数据库 wc_labels（经 /api/v1/labels），页面里留一份内存副本，读同步、写即时更新再异步同步到库。
// 每个标签记下“所在层级 + 经纬度 + 类型 + 内容”，只在创建它的那一层显示，位置按经纬度固定；经纬度是该层地图自己的坐标系（中国是高德 GCJ-02），原样存、原样读。
// 显示/隐藏开关只是视图偏好，仍放浏览器 localStorage（wc.labels.v1.visible）。
const KEY = 'wc.labels.v1', API = '/api/v1/labels';
let items = [], visible = true;
try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) visible = s.visible !== false; } catch { /* 忽略 */ }
const saveView = () => { try { localStorage.setItem(KEY, JSON.stringify({ visible })); } catch { /* 忽略 */ } };
const changed = () => dispatchEvent(new Event('labelschange'));
const api = (method, path = '', body) => fetch(API + path, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) }).then((r) => { if (!r.ok) throw new Error(method + ' ' + r.status); return r.json(); });
const sync = (p) => p.catch((e) => console.warn('标签同步失败：', e.message));

// 启动：读库
api('GET').then((r) => { items = r.items; changed(); }).catch((e) => console.warn('标签读取失败：', e.message));

export const TYPES = ['地点', '景点', '美食', '住宿', '交通', '工作', '活动', '其他'];
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
// 在米色／灰色的地图底图上也清楚：只用深而饱和的颜色（红、蓝、绿、橙、紫、青、棕红），按类型名取色
const PALETTE = ['#d7263d', '#1b5fe0', '#0a8f5c', '#e07b00', '#7a2fc0', '#008b9c', '#b3361b', '#c2185b'];
export const typeColor = (t) => PALETTE[hash(t || '其他') % PALETTE.length];
export const firstChar = (t) => Array.from(String(t || '')).find((c) => c.trim()) ?? '·';

export const labels = {
  get visible() { return visible; },
  setVisible(v) { visible = !!v; saveView(); changed(); },
  forLevel: (level) => items.filter((i) => i.level === level),
  get: (id) => items.find((i) => i.id === id),
  add(it) {
    const item = { id: 'lb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...it, t: Date.now() }; items.push(item); changed();
    sync(api('POST', '', item)); return item;
  },
  update(id, patch) { const i = items.find((x) => x.id === id); if (i) { Object.assign(i, patch); changed(); sync(api('PATCH', '/' + id, patch)); } },
  remove(id) { items = items.filter((i) => i.id !== id); changed(); sync(api('DELETE', '/' + id)); },
};

/** 弹出输入框：类型（可选预设也可自己输入）＋内容。返回 { type, text } ／ { del: true } ／ null（取消）。 */
export function askLabel({ title = '新标签', type = '', text = '', canDelete = false } = {}) {
  return new Promise((resolve) => {
    const box = document.createElement('div'); box.id = 'labDlg';
    box.innerHTML = `<form><h3></h3><label>类型<input name="type" list="labTypes" autocomplete="off" placeholder="如：景点"></label><label>内容<input name="text" autocomplete="off" placeholder="标签内容（图标取第一个字）"></label><datalist id="labTypes">${TYPES.map((t) => `<option value="${t}">`).join('')}</datalist><div class="row"><button type="submit" class="ok">确定</button><button type="button" class="no">取消</button>${canDelete ? '<button type="button" class="del">删除</button>' : ''}</div></form>`;
    box.querySelector('h3').textContent = title;
    const f = box.querySelector('form'), end = (v) => { document.removeEventListener('keydown', key, true); box.remove(); resolve(v); };
    f.type.value = type; f.text.value = text;
    f.onsubmit = (e) => { e.preventDefault(); const t = f.text.value.trim(); if (!t) { f.text.focus(); return; } end({ type: f.type.value.trim() || '其他', text: t }); };
    f.querySelector('.no').onclick = () => end(null);
    const del = f.querySelector('.del'); if (del) del.onclick = () => end({ del: true });
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); end(null); } };
    document.addEventListener('keydown', key, true);
    box.addEventListener('pointerdown', (e) => { if (e.target === box) end(null); });
    document.body.append(box); (type ? f.text : f.type).focus();
  });
}

/** 二次确认：返回 true／false（点遮罩、Esc 都算取消）。 */
export function askConfirm(message, { ok = '确定', no = '取消' } = {}) {
  return new Promise((resolve) => {
    const box = document.createElement('div'); box.id = 'labDlg';
    box.innerHTML = '<form><h3></h3><div class="row"><button type="submit" class="ok"></button><button type="button" class="no"></button></div></form>';
    box.querySelector('h3').textContent = message; box.querySelector('.ok').textContent = ok; box.querySelector('.no').textContent = no;
    const end = (v) => { document.removeEventListener('keydown', key, true); box.remove(); resolve(v); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); end(false); } };
    document.addEventListener('keydown', key, true);
    box.querySelector('form').onsubmit = (e) => { e.preventDefault(); end(true); };
    box.querySelector('.no').onclick = () => end(false);
    box.addEventListener('pointerdown', (e) => { if (e.target === box) end(false); });
    document.body.append(box); box.querySelector('.ok').focus();
  });
}
