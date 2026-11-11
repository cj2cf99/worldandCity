// 平面局部地图（PRD §5.1 “局部国家／城市可使用更合适的视图”、§5.3–§5.4）。
// 显示分工：世界／大洲在地球仪（3D）；国家及以下在这里——以国家为中心的圆锥等积投影，正对屏幕，纯静态 SVG：
// 聚焦用 CSS 变换过渡，不逐帧同步、不用滤镜与脉冲动画（避免整屏重绘闪烁）。
// 只有“有子节点”的节点才加载下一级几何（/geo/cn/{adcode}.json，由 scripts/fetch-geo.mjs 生成）；节点按名称匹配要素。
import { geoConicEqualArea, geoPath, geoBounds, geoCentroid, geoArea } from 'd3-geo';
import { countries, ISO2_TO_NUM, viewRect } from './geo.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
const ROOT = { CN: ['cn', '100000'], JP: ['jp', '392'] }; // 国家 code → [几何目录, 其下一级几何文件]；没有几何的国家只画底图
const byNum = new Map(countries.map((f) => [f.id, f]));

// d3-geo 的外环绕向与 RFC 7946（DataV 数据）相反：不翻转会被当成“整个球面减去该区域”
const flip = (c) => (typeof c[0][0] === 'number' ? c.slice().reverse() : c.map(flip));
const rewind = (fc) => { for (const f of fc.features) if (geoArea(f) > 2 * Math.PI) f.geometry.coordinates = flip(f.geometry.coordinates); return fc; };

// 聚焦用：多部分区域（如东京都含远在南方的小笠原诸岛、海南省含岛礁）只取面积最大的一块，避免镜头被边远岛屿拉远
const mainPart = (f) => (f.geometry.type === 'MultiPolygon' && f.geometry.coordinates.length > 1 ? { type: 'Feature', geometry: { type: 'Polygon', coordinates: f.geometry.coordinates.reduce((a, b) => (geoArea({ type: 'Polygon', coordinates: b }) > geoArea({ type: 'Polygon', coordinates: a }) ? b : a)) } } : f);
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
/** 现实系自然色；dim 用于无数据／非当前层，直接降亮度（不用滤镜）。 */
const fill = (name, dim = 0) => { const h = hash(name); return `hsl(${[92, 108, 76, 128, 52, 38][h % 6]} ${26 + (h >> 3) % 12}% ${30 + (h >> 5) % 12 - dim}%)`; };

export function createLayers({ getKids, countryIdByNum, onPick, onHover }) {
  const svg = el('svg', { id: 'layers' });
  const g = el('g');
  svg.append(g);
  document.body.append(svg);
  const files = new Map();
  const load = (dir, code) => {
    const key = `${dir}/${code}`;
    if (!files.has(key)) files.set(key, fetch(`/geo/${dir}/${code}.json`).then((r) => (r.ok && /json/.test(r.headers.get('content-type') || '') ? r.json().then(rewind) : null)).catch(() => null));
    return files.get(key);
  };
  // 先以透明状态入文档，同步刷新一次样式后移除 pre：由 opacity 过渡完成淡入（不依赖 rAF，后台标签页也能正确收尾）
  const appear = (e) => { e.classList.add('pre'); void getComputedStyle(e).opacity; e.classList.remove('pre'); };
  let seq = 0, ctx = null, last = null, lastCtx = null;
  const groups = new Map(); // 已绘制的层级组（同一国家内复用）

  svg.addEventListener('pointerover', (e) => { const p = e.target.closest('path[data-name]'); onHover(p ? { name: p.dataset.name, hit: !!p.dataset.id } : null, e.clientX, e.clientY); });
  svg.addEventListener('pointermove', (e) => { const p = e.target.closest('path[data-name]'); if (p) onHover({ name: p.dataset.name, hit: !!p.dataset.id }, e.clientX, e.clientY); });
  svg.addEventListener('pointerout', () => onHover(null));
  svg.addEventListener('click', (e) => { const p = e.target.closest('path[data-id]'); if (p) onPick(p.dataset.id); });

  /** 可用区域：左侧面板半透明压在上面，顶部留出顶栏。 */
  const rect = () => viewRect(innerWidth, innerHeight);

  function buildContext(country) {
    const f = byNum.get(ISO2_TO_NUM[country.code]);
    if (!f) return null;
    const [[w, s], [e, n]] = geoBounds(f), [lon, lat] = geoCentroid(f), r = rect();
    const proj = geoConicEqualArea().rotate([-lon, 0]).center([0, lat]).parallels([s + (n - s) / 6, n - (n - s) / 6]).fitExtent([[r.x0, r.y0], [r.x1, r.y1]], f);
    const path = geoPath(proj).digits(1);
    const cache = new Map();
    const d = (feat) => { if (!cache.has(feat)) cache.set(feat, path(feat)); return cache.get(feat); };
    return { code: country.code, feat: f, proj, path, d, rect: r, W: innerWidth, H: innerHeight, box: [[w - 28, s - 22], [(e < w ? e + 360 : e) + 28, n + 22]], backdrop: null };
  }

  function backdrop(c) { // 邻国底图：只画与目标范围相邻的国家
    const frag = document.createDocumentFragment();
    const [[w0, s0], [e0, n0]] = c.box;
    for (const f of countries) {
      if (f === c.feat) continue;
      const [[w, s], [e, n]] = geoBounds(f);
      const ee = e < w ? e + 360 : e;
      if (ee < w0 || w > e0 || n < s0 || s > n0) continue;
      const nm = f.properties.name, id = countryIdByNum(f.id);
      const p = el('path', { d: c.d(f), 'data-name': nm });
      p.style.fill = fill(nm, 10);
      if (id) { p.dataset.id = id; p.classList.add('hit'); }
      frag.append(p);
    }
    return frag;
  }

  return {
    clear() { g.replaceChildren(); },
    /** chain: 根→当前节点。返回 { local }：选中节点在国家及以下时为 true。 */
    async update(chain) {
      last = chain;
      const my = ++seq;
      const country = chain.find((n) => n.kind === 'country');
      if (!country) { return { local: false }; }
      if (!ctx || ctx.code !== country.code || ctx.W !== innerWidth || ctx.H !== innerHeight) { ctx = buildContext(country); }
      const c = ctx;
      if (!c) return { local: false };
      svg.style.setProperty('--zo', `${(c.rect.x0 + c.rect.x1) / 2}px ${(c.rect.y0 + c.rect.y1) / 2}px`);

      // 逐级加载：有子节点才下钻
      const levels = [];
      const dir = ROOT[country.code]?.[0] ?? null;
      let code = ROOT[country.code]?.[1] ?? null;
      for (let i = chain.indexOf(country); i < chain.length && code; i++) {
        const n = chain[i];
        if (i > chain.indexOf(country)) { const f = levels.at(-1)?.fc.features.find((x) => x.properties.name === n.name); code = f?.properties.adcode ?? null; if (!code) break; }
        if (n.children.state === 'none') break;
        const fc = await load(dir, code);
        if (!fc) break;
        levels.push({ owner: n, fc, next: chain[i + 1] });
      }
      if (my !== seq) return null;
      const kids = levels.length ? new Map((await getKids(levels.at(-1).owner.id)).items.map((k) => [k.name, k.id])) : new Map();
      if (my !== seq) return null;

      const S = chain.at(-1);
      const fresh = c !== lastCtx; // 换了国家＝换了投影，整体重建
      if (fresh) { g.replaceChildren(); groups.clear(); lastCtx = c; }
      const fadeOut = (el0, key) => { el0.classList.add('out'); setTimeout(() => { if (el0.classList.contains('out')) { el0.remove(); if (key && groups.get(key) === el0) groups.delete(key); } }, 1500); };
      if (!groups.has('bd')) { // 底：邻国 + 目标国家本身（同一国家内不重建）
        const bd = el('g', { class: 'bd' }); bd.append(backdrop(c));
        const self = el('path', { d: c.d(c.feat), 'data-name': country.name });
        self.style.fill = fill(c.feat.properties.name, 0); self.classList.add('self'); bd.append(self);
        g.append(bd); groups.set('bd', bd); appear(bd);
      }
      const edges = [], keep = new Set(['bd']);
      let focus = S.kind === 'country' ? null : undefined;
      levels.forEach((lv, li) => {
        const deepest = li === levels.length - 1, key = `lv:${lv.owner.id}`;
        let lg = groups.get(key);
        if (!lg) { lg = el('g', { class: 'lv', 'data-key': key }); lg._p = new Map(); groups.set(key, lg); g.append(lg); appear(lg); } else lg.classList.remove('out');
        lg.classList.toggle('deep', deepest); lg.classList.toggle('up', !deepest);
        for (const f of lv.fc.features) {
          const nm = f.properties.name, on = lv.next && nm === lv.next.name, k = f.properties.adcode;
          let p = lg._p.get(k);
          if (!p) { p = el('path', { d: c.d(f), 'data-name': nm }); lg._p.set(k, p); lg.append(p); }
          const id = deepest ? kids.get(nm) : null;
          p.style.fill = fill(nm, deepest ? (id ? 0 : 8) : 6);
          if (id) { p.dataset.id = id; p.classList.add('hit'); } else { delete p.dataset.id; p.classList.remove('hit'); }
          if (on) edges.push(f);
          if (lv.next === S && on) focus = f;
        }
        keep.add(key);
      });
      if (focus === undefined && edges.length) focus = edges.at(-1); // 选中的节点没有自己的几何（如日本的市）：聚焦到它所属的最深一级有几何的区域
      for (const [k, lg] of groups) if (!keep.has(k)) fadeOut(lg, k);
      // 勾边：宽而淡的光晕 + 清晰细线（静态，无滤镜无脉冲）；旧勾边淡出、新勾边淡入
      g.querySelectorAll(':scope > g.edges:not(.out)').forEach((e) => fadeOut(e));
      const eg = el('g', { class: 'edges' });
      for (const f of edges) eg.append(el('path', { d: c.d(f), class: 'glow' }), el('path', { d: c.d(f), class: 'edge' }));
      if (S.kind === 'country') eg.append(el('path', { d: c.d(c.feat), class: 'glow' }), el('path', { d: c.d(c.feat), class: 'edge' }));
      g.append(eg); appear(eg);

      // 聚焦：把目标对象的全范围放进可用区域（CSS 变换过渡，正对屏幕）
      let t = 'translate(0px,0px) scale(1)';
      if (focus) {
        const [[bx0, by0], [bx1, by1]] = c.path.bounds(mainPart(focus)), r = c.rect;
        const s = Math.min(48, Math.max(1, 0.8 * Math.min((r.x1 - r.x0) / (bx1 - bx0), (r.y1 - r.y0) / (by1 - by0))));
        const tx = (r.x0 + r.x1) / 2 - s * (bx0 + bx1) / 2, ty = (r.y0 + r.y1) / 2 - s * (by0 + by1) / 2;
        t = `translate(${tx}px,${ty}px) scale(${s})`;
      }
      g.style.transform = t;
      return { local: true };
    },
    refresh() { if (last) this.update(last); },
    /** 进入宇宙系：移除 SVG、释放缓存（地球侧不再保留）。 */
    dispose() { seq++; svg.remove(); files.clear(); groups.clear(); ctx = lastCtx = last = null; },
  };
}
