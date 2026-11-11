// 日本埼玉县、东京都、福冈县（及山口县的下关市）的市区町村：从国土数値情報「行政区域データ N03」（国土交通省，政府标准利用规约）生成节点与几何。
// 用法：node scripts/build-jp-detail.mjs <N03 geojson 所在目录>   目录里需要 N03-20240101_11.geojson、_13、_40、_35（从 nlftp.mlit.go.jp 下载并解压，不入库）。
// 先运行 build-jp.mjs（它会清掉所有 geo.jp- 节点再重建），再运行本脚本；可重复执行。
// 出处：国土交通省 国土数値情報（行政区域データ）を加工して作成。
import { readFileSync, writeFileSync } from 'node:fs';
import { geoArea } from 'd3-geo';

const dir = process.argv[2]; if (!dir) throw new Error('用法：node scripts/build-jp-detail.mjs <N03 geojson 目录>');
const SEED = new URL('../seed/nodes.public.json', import.meta.url), GEO = new URL('../web/public/geo/jp/', import.meta.url);
const NOTE = '行政区划轮廓：国土交通省 国土数値情報（行政区域データ N03，2024-01-01）を加工して作成；名称为日文汉字（区名已改简体写法的除外）；边界为简化示意。';
const SIMPLE = { 大宮区: '大宫区', 見沼区: '见沼区', 桜区: '樱区', 緑区: '绿区', 渋谷区: '涩谷区', 練馬区: '练马区', 豊島区: '丰岛区', 台東区: '台东区', 江東区: '江东区', 墨田区: '墨田区', 門司区: '门司区', 戸畑区: '户畑区', 小倉北区: '小仓北区', 小倉南区: '小仓南区', 八幡東区: '八幡东区', 八幡西区: '八幡西区', 東区: '东区', 中央区: '中央区', 城南区: '城南区', 早良区: '早良区', 下関市: '下关市', さいたま市: '埼玉市' };
const zhName = (ja) => SIMPLE[ja] || ja;
const zhSort = new Intl.Collator('zh-Hans-CN-u-co-pinyin');

// ---- 几何整理 ----
const dedupe = (r) => r.filter((p, i) => i === 0 || p[0] !== r[i - 1][0] || p[1] !== r[i - 1][1]);
const big = (r) => geoArea({ type: 'Polygon', coordinates: [r] }) > 2 * Math.PI;
function clean(polys, dec = 4) { // polys: [[ring,...],...]（GeoJSON 多边形坐标列表）
  const k = 10 ** dec, rd = (n) => Math.round(n * k) / k;
  const ring = (r) => { const q = dedupe(r.map((p) => [rd(p[0]), rd(p[1])])); if (q.length >= 3 && (q[0][0] !== q.at(-1)[0] || q[0][1] !== q.at(-1)[1])) q.push(q[0]); return q.length >= 4 ? q : null; };
  const poly = (rs) => { const q = rs.map(ring); if (!q[0]) return null; const fix = (r, i) => { if (!r) return null; const a = geoArea({ type: 'Polygon', coordinates: [r] }); if (a < 1e-12 || Math.abs(a - 4 * Math.PI) < 1e-12) return null; return (i === 0) === big(r) ? r.slice().reverse() : r; }; const out = q.map((r, i) => fix(r, i)); return out[0] ? out.filter(Boolean) : null; };
  const ps = polys.map(poly).filter(Boolean); if (!ps.length) return null;
  return ps.length === 1 ? { type: 'Polygon', coordinates: ps[0] } : { type: 'MultiPolygon', coordinates: ps };
}
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

// ---- 读 N03，按行政区划代码归并 ----
const munis = new Map(); // code → { code, pref, city, ward, name, polys }
for (const p of ['11', '13', '40', '35']) {
  const d = JSON.parse(readFileSync(`${dir}/N03-20240101_${p}.geojson`, 'utf8'));
  for (const f of d.features) {
    const q = f.properties, code = q.N03_007; if (!code || code.endsWith('000') || !q.N03_004 || !f.geometry) continue;
    const m = munis.get(code) ?? munis.set(code, { code, pref: p, city: q.N03_004, ward: q.N03_005 || null, polys: [] }).get(code);
    m.polys.push(...polysOf(f.geometry));
  }
}

// ---- 种子 ----
const doc = JSON.parse(readFileSync(SEED, 'utf8'));
const mine = (n) => /^geo\.jp-\d{5}$/.test(n.id) || /^geo\.jp-(11-saitama|40-fukuoka|40-kitakyushu)-\d{5}$/.test(n.id) || n.id === 'geo.jp-35-shimonoseki';
doc.nodes = doc.nodes.filter((n) => !mine(n));
const byId = new Map(doc.nodes.map((n) => [n.id, n]));
const WARD13 = Object.fromEntries(['chiyoda', 'chuo', 'minato', 'shinjuku', 'bunkyo', 'taito', 'sumida', 'koto', 'shinagawa', 'meguro', 'ota', 'setagaya', 'shibuya', 'nakano', 'suginami', 'toshima', 'kita', 'arakawa', 'itabashi', 'nerima', 'adachi', 'katsushika', 'edogawa'].map((s, i) => [String(13101 + i), `geo.jp-13-${s}`]));
const add = [], feats = new Map(); // 文件名 → features
const put = (file, f) => { if (!feats.has(file)) feats.set(file, []); feats.get(file).push(f); };
const mk = (id, parent, kind, name, jaName, code, i) => { const n = { id, parent_id: parent, realm: 'geo', kind, name, ...(jaName && jaName !== name ? { name_local: jaName } : {}), sort_order: i, detail: { 类型: kind === 'district' && /区$/.test(jaName) ? '区' : /市$/.test(jaName) ? '市' : /町$/.test(jaName) ? '町' : /村$/.test(jaName) ? '村' : '区', 行政区划代码: code, 画面说明: NOTE } }; add.push(n); byId.set(id, n); return n; };
const geomOf = (m) => clean(m.polys);
const union = (list) => clean(list.flatMap((m) => m.polys));

const groups = { 11: { cityNode: 'geo.jp-11-saitama', wardCodes: [...Array(10)].map((_, i) => String(11101 + i)) }, 40: [{ node: 'geo.jp-40-kitakyushu', codes: ['40101', '40103', '40105', '40106', '40107', '40108', '40109'] }, { node: 'geo.jp-40-fukuoka', codes: [...Array(7)].map((_, i) => String(40131 + i)) }] };
const wardOf = new Map(); // code → { parentNode }
for (const c of groups[11].wardCodes) wardOf.set(c, groups[11].cityNode);
for (const g of groups[40]) for (const c of g.codes) wardOf.set(c, g.node);
const designated = [{ node: 'geo.jp-11-saitama', pref: '11', codes: groups[11].wardCodes }, ...groups[40].map((g) => ({ node: g.node, pref: '40', codes: g.codes }))];

// 1) 区（东京的 23 区用已有节点；埼玉／北九州／福冈的区新建）
const cityWards = new Map(); // 城市节点 → [{node, m}]
for (const [code, m] of [...munis].sort(([a], [b]) => (a < b ? -1 : 1))) {
  if (m.pref === '13' && WARD13[code]) { const n = byId.get(WARD13[code]); const g = geomOf(m); if (n && g) put('JP-13.json', { type: 'Feature', properties: { adcode: n.id, name: n.name }, geometry: g }); continue; }
  const parentCity = wardOf.get(code);
  if (parentCity) {
    const list = cityWards.get(parentCity) ?? cityWards.set(parentCity, []).get(parentCity), jaW = m.ward;
    const n = mk(`${parentCity}-${code}`, parentCity, 'district', zhName(jaW), jaW, code, list.length); list.push({ n, m });
    const g = geomOf(m); if (g) put(`${parentCity}.json`, { type: 'Feature', properties: { adcode: n.id, name: n.name }, geometry: g });
  }
}
// 2) 政令指定都市本身的轮廓（各区合并）放进所在都道府县的文件
for (const d of designated) { const n = byId.get(d.node), g = union(d.codes.map((c) => munis.get(c)).filter(Boolean)); if (n && g) put(`JP-${d.pref}.json`, { type: 'Feature', properties: { adcode: n.id, name: n.name }, geometry: g }); }
// 3) 其余市区町村
const prefNode = { 11: 'geo.jp-11', 13: 'geo.jp-13', 40: 'geo.jp-40', 35: 'geo.jp-35' };
const others = [...munis.values()].filter((m) => !wardOf.has(m.code) && !(m.pref === '13' && WARD13[m.code]) && (m.pref !== '35' || m.code === '35201' || m.code === '35203'));
others.sort((a, b) => (a.code < b.code ? -1 : 1));
const cnt = {};
for (const m of others) {
  const pn = prefNode[m.pref]; cnt[pn] = (cnt[pn] ?? 0) + 1;
  let n;
  if (m.code === '35203') n = byId.get('geo.jp-35-yamaguchi');              // 山口市：已有节点
  else if (m.code === '35201') n = mk('geo.jp-35-shimonoseki', pn, 'city', '下关市', '下関市', m.code, 1);
  else n = mk(`geo.jp-${m.code}`, pn, /[市]$/.test(m.city) ? 'city' : 'district', zhName(m.city), m.city, m.code, cnt[pn]);
  const g = geomOf(m); if (n && g) put(`JP-${m.pref}.json`, { type: 'Feature', properties: { adcode: n.id, name: n.name }, geometry: g });
}
doc.nodes.push(...add);
doc._version += 1;
writeFileSync(SEED, JSON.stringify(doc, null, 2) + '\n');
let bytes = 0;
for (const [file, fs] of feats) { const t = JSON.stringify({ type: 'FeatureCollection', features: fs }); writeFileSync(new URL(file, GEO), t); bytes += t.length; console.log(file, fs.length, (t.length / 1e6).toFixed(2) + ' MB'); }
console.log(`新增节点 ${add.length}，几何文件 ${feats.size} 个共 ${(bytes / 1e6).toFixed(1)} MB，种子版本 ${doc._version}，总节点 ${doc.nodes.length}`);
