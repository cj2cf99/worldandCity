// 平面局部地图（PRD §5.1 “局部国家／城市可使用更合适的视图”、§5.3–§5.4）。
// 显示分工：世界／大洲在地球仪（3D）；国家及以下在这里——以国家为中心的圆锥等积投影，正对屏幕，纯静态 SVG：
// 聚焦用 CSS 变换过渡，不逐帧同步、不用滤镜与脉冲动画（避免整屏重绘闪烁）。
// 只有“有子节点”的节点才加载下一级几何（/geo/cn/{adcode}.json，由 scripts/fetch-geo.mjs 生成）；节点按名称匹配要素。
import { geoConicEqualArea, geoPath, geoBounds, geoCentroid, geoArea } from 'd3-geo';
import { countries, ISO2_TO_NUM, viewRect, mainFeature } from './geo.js';
import { bindGestures } from './gesture.js';
import { labels, typeColor, firstChar } from './labels.js';
import { tileFor, TILE_URL, tilesAt, tileCorners, zoomForView } from './tiles.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
const ROOT = { CN: ['cn', '100000'], JP: ['jp', '392'] }; // 国家 code → [几何目录, 其下一级几何文件]；没有几何的国家只画底图
const byNum = new Map(countries.map((f) => [f.id, f]));

// d3-geo 的外环绕向与 RFC 7946（DataV 数据）相反：不翻转会被当成“整个球面减去该区域”
const flipPoly = (p) => p.map((r) => r.slice().reverse());
const inv = (p) => geoArea({ type: 'Polygon', coordinates: p }) > 2 * Math.PI;
// 逐个多边形校正绕向（源数据同一要素里各块的绕向可能不一致；不校正的块会被当成“整个球面减去该块”而铺满屏幕）
const rewind = (fc) => { for (const f of fc.features) { const g = f.geometry; if (g.type === 'Polygon') { if (inv(g.coordinates)) g.coordinates = flipPoly(g.coordinates); } else g.coordinates = g.coordinates.map((p) => (inv(p) ? flipPoly(p) : p)); } return fc; };

// 聚焦用：多部分区域（如东京都含远在南方的小笠原诸岛、海南省含岛礁）只取面积最大的一块，避免镜头被边远岛屿拉远
const mainPart = (f) => (f.geometry.type === 'MultiPolygon' && f.geometry.coordinates.length > 1 ? { type: 'Feature', geometry: { type: 'Polygon', coordinates: f.geometry.coordinates.reduce((a, b) => (geoArea({ type: 'Polygon', coordinates: b }) > geoArea({ type: 'Polygon', coordinates: a }) ? b : a)) } } : f);
/** 展示对象占可用区域的比例：默认 50%，对象很扁长（短边比例小）时放大到最多 80%（长边），使短边也接近 50%。fx、fy 为对象在可用区域里各边的占比（任意缩放下的比值即可）。 */
const SHOW_MIN = 0.5, SHOW_MAX = 0.8;
const showFrac = (fx, fy) => Math.min(SHOW_MAX, Math.max(SHOW_MIN, SHOW_MIN / Math.max(1e-3, Math.min(fx, fy) / Math.max(fx, fy))));
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
/** 现实系自然色；dim 用于无数据／非当前层，直接降亮度（不用滤镜）。 */
const fill = (name, dim = 0) => { const h = hash(name); return `hsl(${[92, 108, 76, 128, 52, 38][h % 6]} ${26 + (h >>> 3) % 12}% ${30 + (h >>> 5) % 12 - dim}%)`; };

const tri = (name, loc) => (loc ? `${name} / ${loc}` : name); // 地图互动展示位：中文 / English / 日本語（菜单固定中文）
export function createLayers({ getKids, countryIdByNum, countryNameByNum, onPick, onEnter, onHover, onLabelPlace, onLabelEdit, onLabelMove }) {
  const svg = el('svg', { id: 'layers' });
  const g = el('g'), zg = el('g', { class: 'zoomg' }); // zg：主动放大（滑块）只缩放地图内容，海洋底色始终铺满整屏
  zg.append(g); svg.append(zg);
  document.body.append(svg);
  const files = new Map();
  const load = (dir, code) => {
    const key = `${dir}/${code}`;
    if (!files.has(key)) files.set(key, fetch(`/geo/${dir}/${code}.json`).then((r) => (r.ok && /json/.test(r.headers.get('content-type') || '') ? r.json().then(rewind) : null)).catch(() => null));
    return files.get(key);
  };
  // 先以透明状态入文档，同步刷新一次样式后移除 pre：由 opacity 过渡完成淡入（不依赖 rAF，后台标签页也能正确收尾）
  const appear = (e) => { e.classList.add('pre'); void getComputedStyle(e).opacity; e.classList.remove('pre'); };
  let lastDepth = -1, seq = 0, ctx = null, last = null, lastCtx = null;
  const groups = new Map(); // 已绘制的层级组（同一国家内复用）

  svg.addEventListener('pointerover', (e) => { if (labelMode) return; const p = e.target.closest('path[data-name], g.lab'); onHover(p ? { name: p.dataset.name, hit: !!p.dataset.id || p.classList.contains('lab') } : null, e.clientX, e.clientY); });
  svg.addEventListener('pointermove', (e) => { if (labelMode) return; const p = e.target.closest('path[data-name], g.lab'); if (p) onHover({ name: p.dataset.name, hit: !!p.dataset.id || p.classList.contains('lab') }, e.clientX, e.clientY); });
  svg.addEventListener('pointerout', () => onHover(null));
  // 拖拽平移：超过 5 像素才算拖（不影响点选）；平移量限制在邻国底图覆盖范围内；每次换对象／换级自动回正
  let dragged = false, dn = null, pan = { x: 0, y: 0 }, focusS = 1;
  const setPan = (x, y) => {
    const f = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zf')) || 1, kx = 1.7 * innerWidth * f * focusS - 0.5 * innerWidth, ky = 1.7 * innerHeight * f * focusS - 0.5 * innerHeight;
    pan = { x: Math.max(-kx, Math.min(kx, x)), y: Math.max(-ky, Math.min(ky, y)) };
    svg.style.setProperty('--px', pan.x + 'px'); svg.style.setProperty('--py', pan.y + 'px'); scheduleTiles();
  };
  svg.addEventListener('pointerdown', (e) => { if (labelMode || e.target.closest?.('g.lab')) return; if (e.isPrimary && e.button === 0) { dn = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, id: e.pointerId, on: false }; dragged = false; } });
  svg.addEventListener('pointermove', (e) => {
    if (!dn || e.pointerId !== dn.id) return;
    const dx = e.clientX - dn.x, dy = e.clientY - dn.y;
    if (!dn.on && Math.hypot(dx, dy) < 5) return;
    if (!dn.on) { dn.on = true; dragged = true; svg.classList.add('dragging'); try { svg.setPointerCapture(e.pointerId); } catch { /* 忽略 */ } onHover(null); }
    setPan(dn.px + dx, dn.py + dy);
  });
  const endDrag = () => { dn = null; svg.classList.remove('dragging'); };
  // 手势统一（见 gesture.js）：单击＝聚焦选中；双击／连点／长按＝进入下一层；邻国始终是“进入”（换国家）
  const pathAt = (pt) => document.elementFromPoint(pt.clientX, pt.clientY)?.closest?.('path[data-id]');
  bindGestures(svg, { ready: () => !labelMode, hit: (pt) => pathAt(pt)?.dataset.id ?? null, focus: (id) => { if (!id) return; (svg.querySelector(`path.nb[data-id="${id}"]`) ? onEnter : onPick)(id); }, enter: (id) => onEnter(id), moved: () => dragged });
  svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);

  /** 可用区域：左侧面板半透明压在上面，顶部留出顶栏。 */
  const rect = () => viewRect(innerWidth, innerHeight);

  function buildContext(country) {
    const f = byNum.get(ISO2_TO_NUM[country.code]);
    if (!f) return null;
    const fm = mainFeature(f); // 取景只看国家主体（去掉远方小岛）
    const [[w, s], [e, n]] = geoBounds(fm), [lon, lat] = geoCentroid(fm), r = rect();
    const proj = geoConicEqualArea().rotate([-lon, 0]).center([0, lat]).parallels([s + (n - s) / 6, n - (n - s) / 6]);
    const path = geoPath(proj).digits(3), cache = new Map();
    const d = (feat) => { if (!cache.has(feat)) cache.set(feat, path(feat)); return cache.get(feat); };
    const c = { code: country.code, feat: f, proj, path, d, rect: r, W: innerWidth, H: innerHeight, box: null, backdrop: null, refit: false };
    // 取景：对象在可用区域里占 50%（扁长的最多 80%）——先按整个区域拟合量出长宽占比，再缩到对应的居中小矩形里；邻国底图范围随之重算
    c.fit = (target) => {
      proj.fitExtent([[r.x0, r.y0], [r.x1, r.y1]], target);
      const [[bx0, by0], [bx1, by1]] = path.bounds(target), m = showFrac((bx1 - bx0) / (r.x1 - r.x0), (by1 - by0) / (r.y1 - r.y0));
      proj.fitExtent([[r.cx - m * r.hw, r.cy - m * r.hh], [r.cx + m * r.hw, r.cy + m * r.hh]], target);
      cache.clear();
      // 邻国底图范围：至少覆盖“缩小到最小（-200%＝1/3）”时的整屏（把整屏以放大中心为原点扩大 3.4 倍后反算经纬度范围）
      const ox = (r.x0 + r.x1) / 2, oy = (r.y0 + r.y1) / 2, ls = [], bs = [];
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) { const ll = proj.invert([ox + ((i / 4) * innerWidth - ox) * 3.4, oy + ((j / 4) * innerHeight - oy) * 3.4]); if (ll && isFinite(ll[0]) && isFinite(ll[1])) { ls.push(((ll[0] - lon + 540) % 360) - 180 + lon); bs.push(ll[1]); } }
      c.box = [[Math.min(w - 28, ...ls), Math.min(s - 22, ...bs)], [Math.max((e < w ? e + 360 : e) + 28, ...ls), Math.max(n + 22, ...bs)]];
    };
    c.fit(fm);
    return c;
  }

  function backdrop(c) { // 邻国底图：只画与目标范围相邻的国家
    const frag = document.createDocumentFragment();
    const [[w0, s0], [e0, n0]] = c.box;
    for (const f of countries) {
      if (f === c.feat) continue;
      const [[w, s], [e, n]] = geoBounds(f);
      const ee = e < w ? e + 360 : e;
      if (ee < w0 || w > e0 || n < s0 || s > n0) continue;
      const nm = countryNameByNum?.(f.id) ?? f.properties.name, id = countryIdByNum(f.id);
      const p = el('path', { d: c.d(f), 'data-name': nm });
      p.style.fill = fill(nm, 10);
      if (id) { p.dataset.id = id; p.classList.add('hit', 'nb'); }
      frag.append(p);
    }
    return frag;
  }

  // 进入下一层：用笔把内部 SVG 的边缘画出来（1 秒）——笔尖沿各区域轮廓依次移动，边缘随笔尖从无到有；画完区域填色淡入
  // ---- 指定地区的现势地图底图（OSM 瓦片，见 tiles.js）：放在轮廓下面；放大／平移后按可见范围补更细一级的瓦片 ----
  let tileState = null, curT = { tx: 0, ty: 0, s: 1 }, tTimer = 0;
  const tg = el('g', { class: 'tiles' }), tgBase = el('g'), tgDetail = el('g'); tg.append(tgBase, tgDetail);
  const attr = Object.assign(document.createElement('div'), { id: 'mapAttr', textContent: '底图 © OpenStreetMap contributors' }); document.body.append(attr);
  const tileEls = new Map(); // key → <image>
  function putTiles(group, list, c, gcj) {
    const keep = new Set(list.tiles.map((t) => `${t.z}/${t.x}/${t.y}`));
    for (const [k, e] of tileEls) if (e.parentNode === group && !keep.has(k)) { e.remove(); tileEls.delete(k); }
    for (const t of list.tiles) {
      const k = `${t.z}/${t.x}/${t.y}`; if (tileEls.has(k)) continue;
      const { nw, ne, sw } = tileCorners(t, gcj), a = c.proj(nw), b = c.proj(ne), d = c.proj(sw); if (!a || !b || !d) continue;
      const m = [(b[0] - a[0]) / 256, (b[1] - a[1]) / 256, (d[0] - a[0]) / 256, (d[1] - a[1]) / 256, a[0], a[1]];
      const im = el('image', { href: TILE_URL(t.z, t.x, t.y), width: 257, height: 257, transform: `matrix(${m.join(' ')})`, preserveAspectRatio: 'none' }); // 257：相邻瓦片略重叠，避免缝隙
      group.append(im); tileEls.set(k, im);
    }
  }
  function refreshTiles() {
    if (!tileState) return;
    const { c, gcj } = tileState;
    // 可见范围（屏幕四角反算回经纬度）：按它选瓦片级别，使每块瓦片在屏幕上约 256 像素；底下再垫一层低 2 级的瓦片，放大／平移时先有东西可看
    const f = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zf')) || 1, O = [(c.rect.x0 + c.rect.x1) / 2, (c.rect.y0 + c.rect.y1) / 2];
    const ll = []; for (const [sx, sy] of [[0, 0], [innerWidth, 0], [0, innerHeight], [innerWidth, innerHeight], [innerWidth / 2, innerHeight / 2]]) { const gx = (sx - pan.x - O[0]) / f + O[0], gy = (sy - pan.y - O[1]) / f + O[1], p = c.proj.invert([(gx - curT.tx) / curT.s, (gy - curT.ty) / curT.s]); if (p && isFinite(p[0]) && isFinite(p[1])) ll.push(p); }
    if (ll.length < 3) return;
    let vw = Math.min(...ll.map((p) => p[0])), ve = Math.max(...ll.map((p) => p[0])), vs = Math.min(...ll.map((p) => p[1])), vn = Math.max(...ll.map((p) => p[1]));
    const z = zoomForView(ve - vw, innerWidth), px = (ve - vw) * 0.15, py = (vn - vs) * 0.15; vw -= px; ve += px; vs -= py; vn += py; // 四周多取 15%，平移时少重载
    putTiles(tgBase, tilesAt([vw, vs, ve, vn], z - 2), c, gcj);
    putTiles(tgDetail, tilesAt([vw, vs, ve, vn], z), c, gcj);
  }
  const scheduleTiles = () => { clearTimeout(tTimer); tTimer = setTimeout(refreshTiles, 220); };
  addEventListener('viewzoom', scheduleTiles);
  // ---- 标签：垂直于地图表面的向下箭头（尾部图标＝内容第一个字，上下弹跳，悬浮显示内容）；只在创建它的那一层显示，按经纬度固定 ----
  let labelMode = false, lastDeepKey = null;
  const tgLab = el('g', { class: 'labs' });
  const labF = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zf')) || 1;
  const toContent = (sx, sy) => { const O = ctx ? [(ctx.rect.x0 + ctx.rect.x1) / 2, (ctx.rect.y0 + ctx.rect.y1) / 2] : [0, 0], f = labF(); return [((sx - pan.x - O[0]) / f + O[0] - curT.tx) / curT.s, ((sy - pan.y - O[1]) / f + O[1] - curT.ty) / curT.s]; };
  function makeLab(item) {
    const ge = el('g', { class: 'lab', 'data-name': item.text || '' }); ge.dataset.lid = item.id || ''; ge.style.setProperty('--c', typeColor(item.type));
    ge.innerHTML = '<g class="bob"><path class="halo" d="M0 -9V-34"/><path class="stem" d="M0 -9V-34"/><path class="head" d="M-7.5 -12L0 0L7.5 -12Z"/><circle class="ico" cx="0" cy="-52.6" r="19.6"/><text x="0" y="-52" text-anchor="middle" dominant-baseline="central"></text></g>';
    ge.querySelector('text').textContent = firstChar(item.text);
    return ge;
  }
  const placeLab = (ge, x, y) => { ge._p = [x, y]; ge.setAttribute('transform', `translate(${x},${y}) scale(${1 / (curT.s * labF())})`); };
  function updateLabScale() { for (const ge of tgLab.querySelectorAll('g.lab')) if (ge._p) placeLab(ge, ge._p[0], ge._p[1]); }
  function renderLabels() {
    tgLab.replaceChildren();
    if (!ctx || !labels.visible || !lastDeepKey) return;
    for (const it of labels.forLevel(lastDeepKey)) { const p = ctx.proj([it.lon, it.lat]); if (!p) continue; const ge = makeLab(it); placeLab(ge, p[0], p[1]); tgLab.append(ge); }
  }
  addEventListener('viewzoom', updateLabScale); addEventListener('labelschange', renderLabels);
  let labMoved = false, ld = null;
  svg.addEventListener('click', (e) => { const lb = e.target.closest('g.lab'); if (labMoved) { labMoved = false; return; } if (lb && lb.dataset.lid && !labelMode && !dragged) onLabelEdit?.(lb.dataset.lid); });
  // 已有标签：按住拖动可重新定位；松开后先二次确认（防误触），确认才更新位置，取消则回到原处
  svg.addEventListener('pointerdown', (e) => { const lb = e.target.closest?.('g.lab:not(.ghost)'); if (!lb || labelMode || !e.isPrimary || e.button !== 0 || !lb.dataset.lid) return; ld = { el: lb, id: lb.dataset.lid, x: e.clientX, y: e.clientY, on: false, pid: e.pointerId }; });
  svg.addEventListener('pointermove', (e) => {
    if (!ld || e.pointerId !== ld.pid) return;
    if (!ld.on && Math.hypot(e.clientX - ld.x, e.clientY - ld.y) < 6) return;
    if (!ld.on) { ld.on = true; labMoved = true; try { svg.setPointerCapture(e.pointerId); } catch { /* 忽略 */ } ld.el.classList.add('moving'); onHover(null); }
    const [x, y] = toContent(e.clientX, e.clientY); placeLab(ld.el, x, y);
  });
  const endLabMove = async (e) => {
    if (!ld) return; const cur = ld; ld = null; if (!cur.on) return;
    cur.el.classList.remove('moving');
    if (e.type === 'pointercancel' || !ctx) { renderLabels(); return; }
    const ll = ctx.proj.invert(toContent(e.clientX, e.clientY));
    const ok = ll && isFinite(ll[0]) && isFinite(ll[1]) && (await onLabelMove?.(cur.id, { lon: ll[0], lat: ll[1] }));
    renderLabels(); // 确认后位置已更新；取消则按原坐标重画（回到原处）
  };
  svg.addEventListener('pointerup', endLabMove); svg.addEventListener('pointercancel', endLabMove);
  // 标签模式：按住拖拽把箭头放到想要的位置，松开即弹出输入框
  let ghost = null;
  svg.addEventListener('pointerdown', (e) => {
    if (!labelMode || !e.isPrimary || e.button !== 0) return;
    e.preventDefault(); try { svg.setPointerCapture(e.pointerId); } catch { /* 忽略 */ }
    ghost = makeLab({ text: '＋', type: '' }); ghost.classList.add('ghost'); tgLab.append(ghost); const [x, y] = toContent(e.clientX, e.clientY); placeLab(ghost, x, y);
  });
  svg.addEventListener('pointermove', (e) => { if (labelMode && ghost) { const [x, y] = toContent(e.clientX, e.clientY); placeLab(ghost, x, y); } });
  const dropGhost = (e) => {
    if (!ghost) return; ghost.remove(); ghost = null;
    if (e.type === 'pointercancel' || !ctx) return;
    const ll = ctx.proj.invert(toContent(e.clientX, e.clientY)); if (!ll || !isFinite(ll[0]) || !isFinite(ll[1])) return;
    onLabelPlace?.({ lon: ll[0], lat: ll[1], level: lastDeepKey, node: (lastDeepKey || '').slice(3) });
  };
  svg.addEventListener('pointerup', dropGhost); svg.addEventListener('pointercancel', dropGhost);
  let inkFinish = null, pendingInk = null;
  function startInk(lg) {
    const ps = [...lg.querySelectorAll('path')], lens = ps.map((p) => p.getTotalLength?.() || 0), total = lens.reduce((a, b) => a + b, 0);
    if (!ps.length || !total) { lg.classList.remove('inking'); return; }
    ps.forEach((p, i) => { p.style.strokeDasharray = `${lens[i]} ${lens[i] + 1}`; p.style.strokeDashoffset = lens[i]; });
    const f = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zf')) || 1, k = 1 / (Math.max(0.5, focusS) * f);
    const pen = el('g', { class: 'pen' });
    pen.innerHTML = '<g transform="rotate(38)"><path d="M0 0L-3 -11H3Z" fill="#2b2f3a"/><rect x="-4.6" y="-15" width="9.2" height="3" fill="#cfd3da"/><rect x="-4" y="-50" width="8" height="35" rx="2" fill="#f2c15e"/><rect x="-4" y="-50" width="8" height="8" rx="2" fill="#d9534f"/></g><circle r="2.6" fill="#fffbe0"/><circle r="7" fill="#ffd36b" opacity=".35"/>';
    g.append(pen);
    const t0 = performance.now(), D = 1000;
    let done = false;
    const place = (u) => { // u：0…1，整体进度；按各区域长度依次描
      let acc = u * total, i = 0; while (i < ps.length - 1 && acc > lens[i]) { acc -= lens[i]; i++; }
      ps.forEach((p, j) => { p.style.strokeDashoffset = j < i ? 0 : j === i ? lens[j] - Math.min(lens[j], acc) : lens[j]; });
      const pt = ps[i].getPointAtLength(Math.min(lens[i], acc)); pen.setAttribute('transform', `translate(${pt.x},${pt.y}) scale(${k})`);
    };
    const finish = () => { if (done) return; done = true; inkFinish = null; clearTimeout(tm); pen.remove(); ps.forEach((p) => { p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; }); lg.classList.remove('inking'); };
    inkFinish = finish;
    const step = () => { if (done) return; const u = Math.min(1, (performance.now() - t0) / D); place(u); if (u < 1) requestAnimationFrame(step); else finish(); };
    const tm = setTimeout(finish, D + 150); // 后台标签页没有动画帧时也保证收尾
    place(0); requestAnimationFrame(step);
  }

  return {
    /** 标签模式开关：开启后按住拖拽放置箭头，松开触发 onLabelPlace。 */
    setLabelMode(on) { labelMode = !!on; svg.classList.toggle('labeling', labelMode); if (!labelMode && ghost) { ghost.remove(); ghost = null; } },
    renderLabels,
    /** 局部地图淡入时调用：开始画等待中的那一级。 */
    playPending() { if (pendingInk) { const lg = pendingInk; pendingInk = null; startInk(lg); } },
    clear() { g.replaceChildren(); },
    /** chain: 根→当前节点。返回 { local }：选中节点在国家及以下时为 true。 */
    async update(chain, { peek = false } = {}) { // peek：只聚焦选中的节点（不加载它自己的下一级）
      const prevDepth = lastDepth, t0 = performance.now(), prevCountry = last?.find((n) => n.kind === 'country')?.id; last = chain;
      const my = ++seq;
      // 每进入更深一级（或换国家）至少用 1 秒的进场动画衔接：几何在这一秒里加载，不出现卡顿或突兀的跳变
      const depth = chain.length - (peek ? 1 : 0), deeper = !peek && (depth > prevDepth || chain.find((n) => n.kind === 'country')?.id !== prevCountry); lastDepth = depth;

      const country = chain.find((n) => n.kind === 'country');
      if (!country) { return { local: false }; }
      if (!ctx || ctx.code !== country.code || ctx.W !== innerWidth || ctx.H !== innerHeight) { ctx = buildContext(country); }
      const c = ctx;
      if (!c) return { local: false };
      inkFinish?.(); // 上一次未完成的描绘立即收尾
      if (pendingInk) { pendingInk.classList.remove('inking'); pendingInk = null; }
      zg.style.transformOrigin = `${(c.rect.x0 + c.rect.x1) / 2}px ${(c.rect.y0 + c.rect.y1) / 2}px`;

      // 逐级加载：有子节点才下钻
      const levels = [];
      const root = ROOT[country.code] ?? ['adm1', country.code]; // 中国／日本有专用数据；其他国家用 Natural Earth 一级行政区（web/public/geo/adm1/<ISO2>.json）
      const dir = root[0];
      let code = root[1];
      for (let i = chain.indexOf(country); i < chain.length && code; i++) {
        const n = chain[i];
        if (i > chain.indexOf(country)) { const f = levels.at(-1)?.fc.features.find((x) => x.properties.name === n.name); code = f?.properties.adcode ?? null; if (!code) break; }
        if (n.children.state === 'none' || (peek && i === chain.length - 1)) break;
        const fc = await load(dir, code);
        if (!fc) break;
        levels.push({ owner: n, fc, next: chain[i + 1] });
      }
      if (my !== seq) return null;
      if (levels.length && !c.refit) { c.refit = true; c.fit({ type: 'FeatureCollection', features: levels[0].fc.features.map(mainPart) }); } // 有下一级几何时，以它的范围取景（DataV 的中国含南海诸岛范围，与底图的国家范围不同）
      const kidsPerLevel = await Promise.all(levels.map(async (lv) => { const it = (await getKids(lv.owner.id)).items; return { ids: new Map(it.map((k) => [k.name, k.id])), locals: new Map(it.map((k) => [k.name, k.name_local])) }; })); // 每一级的子节点：上层的兄弟区域也能直接双击切换
      if (my !== seq) return null;

      const S = chain.at(-1);
      let inkG = null; const c0 = lastCtx; // inkG：这次新出现的最深一级（由笔描出）；c0：更新前已显示的上下文
      const fresh = c !== lastCtx; // 换了国家＝换了投影，整体重建
      if (fresh) { g.replaceChildren(); groups.clear(); lastCtx = c; lastDeepKey = null; }
      const fadeOut = (el0, key) => { el0.classList.add('out'); setTimeout(() => { if (el0.classList.contains('out')) { el0.remove(); if (key && groups.get(key) === el0) groups.delete(key); } }, 1500); };
      if (!groups.has('bd')) { // 底：邻国 + 目标国家本身（同一国家内不重建）
        const bd = el('g', { class: 'bd' }); bd.append(backdrop(c));
        const self = el('path', { d: c.d(c.feat), 'data-name': tri(country.name, country.name_local) });
        self.style.fill = levels.length ? 'none' : fill(c.feat.properties.name, 0); self.classList.add('self'); if (levels.length) self.style.stroke = 'none'; bd.append(self); // 有下一级几何时，国家整体轮廓（底图精度不同）不再填色／描边：否则放大后会盖住海面、与各区域对不上
        g.append(bd); groups.set('bd', bd); appear(bd);
      }
      const edges = [], keep = new Set(['bd']);
      let focus = S.kind === 'country' ? null : undefined;
      levels.forEach((lv, li) => {
        const deepest = li === levels.length - 1, key = `lv:${lv.owner.id}`;
        let lg = groups.get(key);
        if (!lg) { lg = el('g', { class: 'lv', 'data-key': key }); lg._p = new Map(); groups.set(key, lg); g.append(lg); appear(lg); } else lg.classList.remove('out');
        lg.classList.toggle('deep', deepest); lg.classList.toggle('up', !deepest);
        if (deepest && key !== lastDeepKey) { inkG = lg; lg.classList.add('inking'); } // 最深一级换了（进入、返回上一级、换国家）：用笔重新画出这一级
        for (const f of lv.fc.features) {
          const nm = f.properties.name, on = lv.next && nm === lv.next.name, k = f.properties.adcode;
          let p = lg._p.get(k);
          if (!p) { p = el('path', { d: c.d(f), 'data-name': tri(nm, kidsPerLevel[li].locals.get(nm)) }); lg._p.set(k, p); lg.append(p); }
          const id = kidsPerLevel[li].ids.get(nm);
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
      let t = 'translate(0px,0px) scale(1)', tT = { tx: 0, ty: 0, s: 1 };
      const tn = tileFor(S.id); // 现势地图底图：undefined＝不启用；null＝用该节点自己轮廓的范围；数组＝手工范围（没有自己轮廓的日本市）
      let box = null;
      if (Array.isArray(tn)) { const q = [[tn[0], tn[1]], [tn[2], tn[1]], [tn[0], tn[3]], [tn[2], tn[3]]].map((p) => c.proj(p)); box = [[Math.min(...q.map((p) => p[0])), Math.min(...q.map((p) => p[1]))], [Math.max(...q.map((p) => p[0])), Math.max(...q.map((p) => p[1]))]]; }
      if (focus || box) {
        const [[bx0, by0], [bx1, by1]] = box ?? c.path.bounds(mainPart(focus)), r = c.rect;
        const fxx = (bx1 - bx0) / (r.x1 - r.x0), fyy = (by1 - by0) / (r.y1 - r.y0), s = Math.min(3000, Math.max(0.5, showFrac(fxx, fyy) / Math.max(fxx, fyy))); // 同样 50%（扁长的最多 80%）
        const tx = (r.x0 + r.x1) / 2 - s * (bx0 + bx1) / 2, ty = (r.y0 + r.y1) / 2 - s * (by0 + by1) / 2;
        t = `translate(${tx}px,${ty}px) scale(${s})`; tT = { tx, ty, s };
      }
      g.style.transform = t; focusS = focus || box ? Math.min(3000, Math.max(0.5, tT.s)) : 1; curT = tT;
      setPan(0, 0); // 换对象／换级：回正（带过渡）
      if (tn !== undefined && (Array.isArray(tn) || focus)) { // 嵌入现势地图底图
        const gb = Array.isArray(tn) ? tn : (([[w, s], [e, n]]) => [w, s, e, n])(geoBounds(focus));
        tileState = { c, bbox: gb, gcj: c.code === 'CN' }; g.prepend(tg); svg.classList.add('tiled'); attr.style.display = 'block'; refreshTiles();
      } else { tileState = null; tg.remove(); tgBase.replaceChildren(); tgDetail.replaceChildren(); tileEls.clear(); svg.classList.remove('tiled'); attr.style.display = 'none'; }
      if (levels.length) lastDeepKey = `lv:${levels.at(-1).owner.id}`;
      g.append(tgLab); renderLabels(); // 标签在最上层；只显示创建它的那一层的
      if (inkG) { if (!document.body.classList.contains('local')) pendingInk = inkG; else startInk(inkG); } // 局部地图尚未显示（从 3D 世界图刚进入）：等它淡入时再开始画
      return { local: true };
    },
    refresh() { if (last) this.update(last); },
    /** 进入宇宙系：移除 SVG、释放缓存（地球侧不再保留）。 */
    dispose() { seq++; attr.remove(); svg.remove(); files.clear(); groups.clear(); inkFinish?.(); pendingInk = null; ctx = lastCtx = last = null; lastDepth = -1; lastDeepKey = null; },
  };
}
