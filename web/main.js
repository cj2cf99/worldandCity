// 应用壳：层级导航、详情卡、深链接、纯观赏。3D 场景懒加载（设计 §8.1、§8.3）。
const $ = (s) => document.querySelector(s);
const ISO2_TO_NUM = { CN: '156', FR: '250' }; // 与 geo.js 一致；此处重复只为不在首屏壳里引入底图数据
const ICON = {
  world: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  continent: '<path d="M3 18l6-10 4 6 3-4 5 8z"/>',
  country: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  admin1: '<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5"/>',
  city: '<path d="M4 21V9h6v12M10 21V4h10v17M13 8h4M13 12h4M13 16h4"/>',
  supercluster_complex: '<circle cx="7" cy="8" r="2"/><circle cx="16" cy="7" r="2"/><circle cx="12" cy="16" r="2.4"/><path d="M8.5 9.5L11 14M14.8 8.8L13 14"/>',
  supercluster: '<circle cx="12" cy="12" r="2"/><circle cx="6" cy="8" r="1.3"/><circle cx="18" cy="9" r="1.3"/><circle cx="8" cy="17" r="1.3"/><circle cx="17" cy="17" r="1.3"/>',
  great_wall: '<path d="M3 15l4-4 4 3 5-6 5 4"/><path d="M3 19h18"/>',
  galaxy_group: '<circle cx="9" cy="10" r="3"/><circle cx="17" cy="14" r="2"/><circle cx="8" cy="18" r="1.2"/>',
  galaxy_cluster: '<circle cx="12" cy="12" r="5" stroke-dasharray="1.5 2"/><circle cx="12" cy="12" r="1.6"/>',
  universe: '<circle cx="12" cy="12" r="9" stroke-dasharray="2 3"/><circle cx="12" cy="12" r="2"/>',
  galaxy: '<path d="M12 12c2-4 7-3 8 1M12 12c-2 4-7 3-8-1M12 12c4 2 3 7-1 8M12 12c-4-2-3-7 1-8"/>',
  stellar_neighborhood: '<circle cx="7" cy="8" r="1"/><circle cx="16" cy="6" r="1"/><circle cx="12" cy="13" r="2"/><circle cx="18" cy="16" r="1"/><circle cx="6" cy="17" r="1"/>',
  star_system: '<circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="7"/>',
  star: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  system: '<circle cx="9" cy="12" r="4"/><circle cx="18" cy="8" r="1.6"/>',
  moon: '<path d="M20 14A8 8 0 1110 4a6 6 0 0010 10z"/>',
  district: '<path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
};
const KIND_ZH = { cosmic_web: '宇宙网', planet: '行星', dwarf_planet: '矮行星', asteroid_belt: '小行星带', comet_group: '彗星', comet: '彗星', shell: '球壳层', bubble: '星际泡', galactic_arm: '旋臂', superstructure: '超级结构', supercluster_complex: '超星系团复合体', supercluster: '超星系团', great_wall: '巨型长城', galaxy_group: '星系群', galaxy_cluster: '星系团', universe: '宇宙', galaxy: '星系', stellar_neighborhood: '恒星邻域', star_system: '恒星系统', star: '恒星', system: '天体系统', moon: '卫星', world: '世界', continent: '大洲', country: '国家', admin1: '一级行政区', city: '城市', district: '区' };
const icon = (k) => `<svg class="ic" viewBox="0 0 24 24">${ICON[k] || '<circle cx="12" cy="12" r="3"/>'}</svg>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---- API 客户端：同键并发合并，导航乱序由 navSeq 丢弃（设计 §8.3）----
const inflight = new Map(), cache = new Map();
function api(path, signal) {
  if (cache.has(path)) return Promise.resolve(cache.get(path));
  if (!inflight.has(path)) {
    inflight.set(path, fetch(`/api/v1${path}`, { signal }).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message || r.status);
      cache.set(path, j); return j;
    }).finally(() => inflight.delete(path)));
  }
  return inflight.get(path);
}
const getNode = (id, s) => api(`/nodes/${encodeURIComponent(id)}`, s);
const getKids = (id) => api(`/nodes/${encodeURIComponent(id)}/children?limit=100`);
const getAnc = (id, s) => api(`/nodes/${encodeURIComponent(id)}/ancestors`, s).then((r) => r.items);

// ---- 状态 ----
let realm = 'geo', cosmos = null, scene = null, layers = null, navSeq = 0, selId = null, ac = null;
const rows = new Map(); // id → {li, row, kids, state}

// ---- 层级导航 ----
function rowHtml(n) {
  const has = n.children.state !== 'none';
  return `${has ? '<svg class="chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>' : '<span class="dot">•</span>'}${icon(n.kind)}<span class="nm">${esc(n.name)}</span>${has ? `<span class="cnt">${n.children.count}</span>` : ''}`;
}
function mountNode(n, ul) {
  const li = document.createElement('li');
  const row = document.createElement('div');
  row.className = 'row'; row.dataset.k = n.kind; row.dataset.id = n.id; row.innerHTML = rowHtml(n);
  li.append(row); ul.append(li);
  const rec = { li, row, kids: null, node: n, loaded: false };
  rows.set(n.id, rec);
  row.addEventListener('click', () => { select(n.id, { push: true }); if (n.children.state !== 'none') toggle(n.id); });
  return rec;
}
async function toggle(id, force) {
  const rec = rows.get(id); if (!rec || rec.node.children.state === 'none') return;
  const open = force ?? !rec.row.classList.contains('open');
  if (open && !rec.loaded) {
    rec.row.classList.add('loading', 'open');
    try {
      const { items } = await getKids(id);
      rec.kids = document.createElement('ul'); rec.kids.className = 'kids'; rec.li.append(rec.kids);
      items.forEach((c) => mountNode(c, rec.kids)); rec.loaded = true; rec.row.classList.remove('err');
    } catch { rec.row.classList.add('err'); rec.row.classList.remove('open'); }
    rec.row.classList.remove('loading'); fitNav(); return;
  }
  rec.row.classList.toggle('open', open);
  if (rec.kids) rec.kids.style.display = open ? '' : 'none';
  fitNav();
}
// 面板宽度随树展开自动加宽（上限为视口宽），保证名称完整、可选择；窄屏由 CSS 接管
function fitNav() {
  if (innerWidth <= 820) return;
  const tree = $('#tree'), w = Math.min(innerWidth - 40, Math.max(250, tree.scrollWidth + 32));
  document.documentElement.style.setProperty('--panel', `${Math.ceil(w)}px`);
}
async function revealPath(chain) { for (const id of chain) { if (!rows.has(id)) break; await toggle(id, true); } fitNav(); }

// ---- 详情卡 ----
function renderCard(n, anc, hasGeom) {
  const intro = n.detail?.['简介'];
  const kv = Object.entries(n.detail || {}).filter(([k, v]) => k !== '简介' && v !== '' && v != null && !(Array.isArray(v) && !v.length));
  const ch = n.children.state === 'none' ? '<span class="tag"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/></svg>无下级</span>' : `<span class="tag info"><svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5z"/></svg>${n.children.count} 个下级</span>`;
  $('#card').innerHTML = `<div class="card-in">
    <div class="cardhead"><h2><svg viewBox="0 0 24 24">${ICON[n.kind] || ''}</svg>${esc(n.name)}</h2>${n.name_local ? `<small>${esc(n.name_local)}</small>` : ''}</div>
    <div class="tags"><span class="tag warn">${KIND_ZH[n.kind] || esc(n.kind)}</span>${n.code ? `<span class="tag">${esc(n.code)}</span>` : ''}${ch}
      ${n.realm === 'celestial' ? '' : hasGeom ? '<span class="tag ok"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>已绘制</span>' : n.kind === 'world' ? '' : '<span class="tag warn"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/></svg>几何待补</span>'}</div>
    ${intro ? `<p class="intro">${esc(intro)}</p>` : ''}
    ${kv.length ? `<div class="kv">${kv.map(([k, v]) => `<span>${esc(k)}</span><b>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</b>`).join('')}</div>` : ''}
  </div>`;
}

document.addEventListener('cosmos-go', (e) => select(e.detail, { push: true })); // 宇宙场景里的标签点击 → 跳转到对应节点
async function select(id, { push = false } = {}) {
  const seq = ++navSeq; ac?.abort(); ac = new AbortController();
  selId = id;
  document.querySelectorAll('.row.sel').forEach((r) => r.classList.remove('sel'));
  rows.get(id)?.row.classList.add('sel');
  $('#card').innerHTML = '<div class="skel" style="width:60%"></div><div class="skel" style="width:40%"></div><div class="skel" style="width:75%"></div>';
  try {
    const [n, anc] = await Promise.all([getNode(id, ac.signal), getAnc(id, ac.signal)]);
    if (seq !== navSeq) return; // 旧响应不覆盖新场景
    const country = n.kind === 'country' ? n : anc.find((a) => a.kind === 'country');
    const num = country && ISO2_TO_NUM[country.code];
    const hasGeom = !!num && n.kind === 'country';
    if (n.realm !== realm) { await switchRealm(n.realm); if (seq !== navSeq) return; }
    cur = n;
    renderCard(n, anc, hasGeom);
    if (n.realm === 'celestial') { // 宇宙系：只聚焦宇宙场景，不触碰任何地球侧内容
      cosmos?.focus(n.id);
      await revealPath(anc.map((a) => a.id));
      rows.get(id)?.row.classList.add('sel');
      rows.get(id)?.row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      history[push ? 'pushState' : 'replaceState']({}, '', `/n/${encodeURIComponent(id)}`);
      return;
    }
    // 显示分工：世界／大洲在地球仪上；国家及以下一律自动展开为平面地图
    if (n.kind !== 'world' && n.kind !== 'continent') document.body.classList.add('map'); // 不展开 3D 世界图：由 setLocal 俯冲接替
    const lay = layers && (await layers.update([...anc, n]));
    if (seq !== navSeq) return;
    scene?.select(num || null);
    setLocal(!!lay?.local);
    await revealPath(anc.map((a) => a.id));
    rows.get(id)?.row.classList.add('sel');
    rows.get(id)?.row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const url = `/n/${encodeURIComponent(id)}${document.body.classList.contains('map') ? '?s=geo' : ''}`;
    history[push ? 'pushState' : 'replaceState']({}, '', url);
  } catch (e) {
    if (e.name === 'AbortError' || seq !== navSeq) return;
    $('#card').innerHTML = `<div class="cardhead"><h2>加载失败</h2><small>${esc(e.message)}</small></div>`;
  }
}

$('#nav .ph').addEventListener('click', () => $('#nav').classList.toggle('min'));
if (innerWidth <= 820) $('#nav').classList.add('min'); // 窄屏默认收起，地图为主

// ---- 手势：滚轮／触摸缩放 = 上一级／默认下一级（放大进入第一个子节点，缩小回父节点；世界处缩小回到地球仪）----
let cur = null, stepAt = 0;
async function step(dir) {
  const now = performance.now();
  if (!cur || now - stepAt < 1500) return; // 一次手势只走一级（滚轮惯性、连续事件合并）
  stepAt = now;
  if (dir > 0) {
    if (cur.id === 'cel.earth-moon') return select('geo.world', { push: true }); // 向内放大回到地球
    if (cur.children.state === 'none') return;
    const { items } = await getKids(cur.id);
    if (items[0]) select(items[0].id, { push: true });
  } else if (cur.parent_id) select(cur.parent_id, { push: true });
  else if (cur.id === 'geo.world') { if (document.body.classList.contains('map')) exitMap(); else select('cel.earth-moon', { push: true }); } // 地球仪处继续缩小 → 宇宙系
}
addEventListener('wheel', (e) => {
  if (e.target.closest?.('.panel')) return; // 面板内保留原生滚动
  e.preventDefault();
  wheelAcc += e.deltaY; clearTimeout(wheelT); wheelT = setTimeout(() => (wheelAcc = 0), 180);
  if (Math.abs(wheelAcc) > 30) { step(wheelAcc < 0 ? 1 : -1); wheelAcc = 0; }
}, { passive: false });
let wheelAcc = 0, wheelT = 0, pinch0 = 0;
const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
addEventListener('touchstart', (e) => { pinch0 = e.touches.length === 2 && !e.target.closest('.panel') ? dist(e.touches) : 0; }, { passive: true });
addEventListener('touchmove', (e) => {
  if (!pinch0 || e.touches.length !== 2) return;
  e.preventDefault();
  const k = dist(e.touches) / pinch0;
  if (k > 1.25) { pinch0 = 0; step(1); } else if (k < 0.8) { pinch0 = 0; step(-1); }
}, { passive: false });
addEventListener('touchend', () => { pinch0 = 0; }, { passive: true });

// ---- 模式 ----
function enterMap() { document.body.classList.add('map'); scene?.enterMap(); history.replaceState({}, '', location.pathname + '?s=geo'); }
// 平面局部地图（国家及以下）：先让 3D 把选中对象转正、推近到与局部地图同样的位置和大小（落定），再淡入 SVG；
// 之后 3D 画布淡出并暂停渲染（省电，也避免叠层重绘闪烁）
let pauseT = 0, localTok = 0;
function setLocal(on) {
  const b = document.body, tok = ++localTok;
  clearTimeout(pauseT);
  if (on) {
    b.style.setProperty('--ld', '0s');
    const go = () => { if (tok !== localTok) return; b.classList.add('local'); pauseT = setTimeout(() => b.classList.contains('local') && scene?.pause(), 2400); };
    if (b.classList.contains('local')) return go(); // 局部地图内换级：直接重排
    if (scene.progress <= 0.95) scene.dive(true);   // 在地球仪上：俯冲；已在世界平面图：等镜头缩放落定
    scene.settled(go);
  } else { if (b.classList.contains('local')) { b.classList.remove('local'); scene?.resume(); } scene?.dive(false); }
}
function exitMap() { setLocal(false); document.body.classList.remove('map'); scene?.exitMap(); history.replaceState({}, '', location.pathname); }

// ---- 纯观赏：手动 + 空闲自动进入（空闲时长为默认常量，后续进入 cfg:public 的 ui.idleSeconds）----
const IDLE_MS = 90_000, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let idle = 0;
const zen = (on) => document.body.classList.toggle('zen', on);
const wake = () => { clearTimeout(idle); if (document.body.classList.contains('zen') && !wake.manual) zen(false); if (!reduce) idle = setTimeout(() => { wake.manual = false; zen(true); }, IDLE_MS); };
['pointermove', 'keydown', 'wheel', 'touchstart'].forEach((e) => addEventListener(e, wake, { passive: true }));
$('#zenBtn').addEventListener('click', (ev) => { ev.stopPropagation(); const on = !document.body.classList.contains('zen'); wake.manual = on; zen(on); });

// ---- 时钟（东京时间）----
const fmt = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Tokyo', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
setInterval(() => { $('#clock').textContent = `${fmt.format(new Date())} JST`; }, 1000);
$('#clock').textContent = `${fmt.format(new Date())} JST`;

// ---- 领域：地球系（地球仪／平面地图）与宇宙系（宇宙场景）互不加载 ----
const tip = $('#tip');
let countryNodes = [];
const hover = (txt, x, y) => { if (!txt) { tip.classList.remove('on'); return; } tip.textContent = txt; tip.style.left = `${x}px`; tip.style.top = `${y}px`; tip.classList.add('on'); };

async function initEarth() { // 地球侧：3D 地球仪＋局部地图图层（懒加载）
  const countriesP = countryNodes.length ? null : api('/nodes?kind=country');
  const [{ createScene }, { createLayers }] = await Promise.all([import('./globe.js'), import('./layers.js')]);
  layers = createLayers({
    getKids,
    countryIdByNum: (num) => countryNodes.find((c) => ISO2_TO_NUM[c.code] === num)?.id,
    onPick: (id) => select(id, { push: true }),
    onHover: (h, x, y) => hover(h && (h.hit ? h.name : `${h.name}（暂无数据）`), x, y),
  });
  scene = await createScene($('#stage'), {
    onEnter: enterMap,
    onQuality: (q) => { $('#qTxt').textContent = q; },
    onHover: (num, x, y) => hover(num && countryNodes.find((n) => ISO2_TO_NUM[n.code] === num)?.name, x, y),
    onPick: (num) => { tip.classList.remove('on'); const c = num && countryNodes.find((n) => ISO2_TO_NUM[n.code] === num); if (c) select(c.id, { push: true }); },
  });
  $('#qTxt').textContent = scene.quality();
  if (countriesP) countryNodes = (await countriesP).items;
  scene.setConfigured(countryNodes.map((n) => ISO2_TO_NUM[n.code]).filter(Boolean));
}
function disposeEarth() { // 释放地球侧：场景、纹理、图层、局部地图缓存
  scene?.dispose(); layers?.dispose(); scene = layers = null;
  clearTimeout(pauseT); localTok++;
  document.body.classList.remove('map', 'local');
}
async function initCosmos(opt) {
  const { createCosmos } = await import('./cosmos.js');
  cosmos = await createCosmos($('#cstage'), opt);
}
async function rebuildTree(rootId) {
  $('#tree').replaceChildren(); rows.clear();
  const root = await getNode(rootId);
  mountNode(root, $('#tree'));
  await toggle(root.id, true);
}
/** 切换领域：先在底层建好新场景，再用 2 秒交叉淡化，之后释放旧场景。 */
async function switchRealm(r) {
  if (r === realm) return;
  const b = document.body;
  realm = r;
  b.classList.add('switching');
  if (r === 'celestial') {
    await initCosmos({ level: 0.55, rings: true }); // 从地球近处拉远；天轨仪的环随之收起
    b.classList.add('cosmic', 'incosmos');
    $('#backBtn span').textContent = '回到地球';
    setTimeout(() => { if (realm === 'celestial') disposeEarth(); }, 2600);
    await rebuildTree('cel.observable');
  } else {
    await initEarth();
    b.classList.remove('cosmic', 'incosmos');
    $('#backBtn span').textContent = '地球仪';
    setTimeout(() => { if (realm === 'geo') { cosmos?.dispose(); cosmos = null; } }, 2600);
    await rebuildTree('geo.world');
  }
  b.classList.remove('switching');
}

// ---- 启动 ----
async function boot() {
  const m = /^\/n\/([^/]+)/.exec(location.pathname);
  const startId = m ? decodeURIComponent(m[1]) : 'geo.world';
  const start = await getNode(startId);
  realm = start.realm;
  const wantMap = new URLSearchParams(location.search).get('s') === 'geo'; // select 会改写 URL，须先读取
  if (realm === 'celestial') { // 直接深链接到宇宙系：完全不加载地球侧
    document.body.classList.add('cosmic', 'incosmos');
    $('#backBtn span').textContent = '回到地球';
    await initCosmos({ node: startId });
    await rebuildTree('cel.observable');
  } else {
    await initEarth();
    await rebuildTree('geo.world');
    if (wantMap) document.body.classList.add('map');
  }
  await select(startId);
  if (realm === 'geo' && wantMap && !document.body.classList.contains('local')) enterMap();
  $('#loader').classList.add('done');
  wake();
}
$('#backBtn').addEventListener('click', () => (realm === 'celestial' ? select('geo.world', { push: true }) : exitMap()));
$('#qBtn').addEventListener('click', () => { if (!scene) return; const o = ['high', 'mid', 'low'], q = o[(o.indexOf(scene.quality()) + 1) % 3]; scene.setQuality(q); $('#qTxt').textContent = q; });
document.addEventListener('visibilitychange', () => {
  const hid = document.hidden;
  hid ? (scene?.pause(), cosmos?.pause()) : (document.body.classList.contains('local') ? 0 : scene?.resume(), cosmos?.resume());
});
let rz = 0; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => document.body.classList.contains('local') && layers?.refresh(), 250); });
boot().catch((e) => { $('#loader p').textContent = `启动失败：${e.message}`; console.error(e); });
