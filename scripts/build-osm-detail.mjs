// 把 scripts/fetch-osm-detail.mjs 缓存的 OSM 最细行政边界变成种子节点与几何文件。
//  - 节点：街道／乡镇（kind=town）、村／社区（kind=village）；日本的区（district）、町（town）、丁目（village）。id＝`<父 id>-o<OSM 关系编号>`。
//  - 几何：web/public/geo/cn|jp/<文件名>.json（不入库）。文件名＝上一级要素的 adcode；本脚本生成的要素 adcode 一律是 `o<OSM 关系编号>`（日本城市为节点 id）。
// 数据 © OpenStreetMap contributors，ODbL（见 web/SOURCES.md）。可重复执行。
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { geoArea, geoCentroid, geoContains } from 'd3-geo';

const SEED = new URL('../seed/nodes.public.json', import.meta.url), RAW = new URL('../web/public/geo/osm-raw/', import.meta.url), GEO = new URL('../web/public/geo/', import.meta.url);
mkdirSync(new URL('cn/', GEO), { recursive: true }); mkdirSync(new URL('jp/', GEO), { recursive: true });
const zhSort = new Intl.Collator('zh-Hans-CN-u-co-pinyin');
const SIMPLE = { 大宮区: '大宫区', 見沼区: '见沼区', 桜区: '樱区', 緑区: '绿区', 門司区: '门司区', 戸畑区: '户畑区', 小倉北区: '小仓北区', 小倉南区: '小仓南区', 八幡東区: '八幡东区', 八幡西区: '八幡西区', さいたま市: '埼玉市' }; // 日本区名的简体写法（其余汉字相同）

// ---- 几何整理（绕向统一、去退化环、按精度取整）----
const dedupe = (r) => r.filter((p, i) => i === 0 || p[0] !== r[i - 1][0] || p[1] !== r[i - 1][1]);
const big = (r) => geoArea({ type: 'Polygon', coordinates: [r] }) > 2 * Math.PI;
function clean(g, dec = 4) {
  const k = 10 ** dec, rd = (n) => Math.round(n * k) / k;
  const ring = (r) => { const q = dedupe(r.map((p) => [rd(p[0]), rd(p[1])])); if (q.length >= 3 && (q[0][0] !== q.at(-1)[0] || q[0][1] !== q.at(-1)[1])) q.push(q[0]); return q.length >= 4 ? q : null; };
  const poly = (rs) => { const q = rs.map(ring); if (!q[0]) return null; const fix = (r, i) => { if (!r) return null; const a = geoArea({ type: 'Polygon', coordinates: [r] }); if (a < 1e-12 || Math.abs(a - 4 * Math.PI) < 1e-12) return null; return (i === 0) === big(r) ? r.slice().reverse() : r; }; const out = q.map((r, i) => fix(r, i)); return out[0] ? out.filter(Boolean) : null; };
  if (g.type === 'Polygon') { const p = poly(g.coordinates); return p && { type: 'Polygon', coordinates: p }; }
  const ps = g.coordinates.map(poly).filter(Boolean); return ps.length ? { type: 'MultiPolygon', coordinates: ps } : null;
}
const feat = (g) => ({ type: 'Feature', properties: {}, geometry: g });
const contains = (parentG, childG) => { try { return geoContains(feat(parentG), geoCentroid(feat(childG))); } catch { return false; } };

const doc = JSON.parse(readFileSync(SEED, 'utf8'));
const OSM_NOTE = '行政区划名称与边界取自 OpenStreetMap contributors（ODbL，www.openstreetmap.org/copyright）；边界为简化示意，覆盖与名称可能不完整。';
// 清掉上一次生成的节点（id 含 -o<数字> 段）
doc.nodes = doc.nodes.filter((n) => !/-o\d+(-o\d+)*$/.test(n.id));
const byId = new Map(doc.nodes.map((n) => [n.id, n])), add = [];
const files = new Map(); // 文件相对路径 → FeatureCollection
const put = (path, f) => { if (!files.has(path)) files.set(path, { type: 'FeatureCollection', features: [] }); files.get(path).features.push(f); };
const nameOf = (t, jp) => (jp ? SIMPLE[t.name] || t['name:zh'] || t.name : t['name:zh-Hans'] || t['name:zh'] || t.name);
const localOf = (t, jp) => { const en = t['name:en'] || t['name:pinyin'] || t['name:ja_rm'] || '', ja = t['name:ja'] || (jp ? t.name : '') || ''; return en || ja ? `${en} / ${ja}` : undefined; }; // English / 日本語（有才写）

/** 把一批 {id,level,tags,geometry} 挂到 parentId 下：最小级别为第一层（kind1），更深的挂到包含它的第一层下（kind2）。 */
function attach(parentId, items, region, dirKey, kind1, kind2) {
  const jp = region === 'jp', dir = region, parent = byId.get(parentId) ?? add.find((n) => n.id === parentId);
  if (!items.length) return;
  const L1 = Math.min(...items.map((x) => x.level)), first = items.filter((x) => x.level === L1), deeper = items.filter((x) => x.level > L1);
  const seen = new Set(), mk = (x, pid, i, kind) => { let zh = nameOf(x.tags, jp) || `#${x.id}`; if (seen.has(pid + zh)) zh = `${zh}（${x.id}）`; seen.add(pid + zh); const detail = { 类型: kind === 'district' ? '区' : kind === 'town' ? (jp ? '町' : '街道／乡镇') : (jp ? '丁目／大字' : '村／社区'), 所属: parent?.name ?? '', 'OSM 关系': String(x.id), 画面说明: OSM_NOTE }; return { id: `${pid}-o${x.id}`, parent_id: pid, realm: 'geo', kind, name: zh, ...(localOf(x.tags, jp) ? { name_local: localOf(x.tags, jp) } : {}), sort_order: i, detail }; };
  const nodes1 = first.sort((a, b) => zhSort.compare(nameOf(a.tags, jp) || '', nameOf(b.tags, jp) || '')).map((x, i) => mk(x, parentId, i, kind1));
  add.push(...nodes1);
  first.forEach((x, i) => { const g = clean(x.geometry); if (g) put(`${dir}/${dirKey}.json`, { type: 'Feature', properties: { adcode: `o${x.id}`, name: nodes1[i].name }, geometry: g }); });
  if (!deeper.length) return;
  const sub = new Map(first.map((x) => [x.id, []]));
  for (const d of deeper) { const home = first.find((x) => contains(x.geometry, d.geometry)); if (home) sub.get(home.id).push(d); }
  first.forEach((x, i) => { const list = sub.get(x.id); if (!list.length) return; const pid = nodes1[i].id; const lv = Math.min(...list.map((d) => d.level)); const own = list.filter((d) => d.level === lv); const kids = own.sort((a, b) => zhSort.compare(nameOf(a.tags, jp) || '', nameOf(b.tags, jp) || '')).map((d, j) => mk(d, pid, j, kind2)); add.push(...kids); own.forEach((d, j) => { const g = clean(d.geometry); if (g) put(`${dir}/o${x.id}.json`, { type: 'Feature', properties: { adcode: `o${d.id}`, name: kids[j].name }, geometry: g }); }); });
}

for (const f of readdirSync(RAW).filter((x) => x.endsWith('.json'))) {
  const raw = JSON.parse(readFileSync(new URL(f, RAW), 'utf8'));
  if (raw.region === 'cn') {
    const parentId = raw.code === '610112' ? 'geo.cn-sn-xa-wy' : `geo.cn-${raw.code}`;
    if (!byId.has(parentId)) { console.warn('种子里没有', parentId); continue; }
    attach(parentId, raw.children, 'cn', raw.code, 'town', 'village');
  } else if (raw.key === 'jp-tokyo') {
    const wardNodes = doc.nodes.filter((n) => n.parent_id === 'geo.jp-13' && n.kind === 'district');
    for (const w of raw.wards) {
      const node = wardNodes.find((n) => n.name === w.tags.name); if (!node) { console.warn('东京：种子里没有区', w.tags.name); continue; }
      const g = clean(w.geometry); if (g) put('jp/JP-13.json', { type: 'Feature', properties: { adcode: node.id, name: node.name }, geometry: g });
      attach(node.id, w.children ?? [], 'jp', node.id, 'town', 'village');
    }
  } else if (raw.region === 'jp') { // 埼玉市、北九州市：城市节点已在种子里
    const cityId = raw.key === 'jp-saitama' ? 'geo.jp-11-saitama' : 'geo.jp-40-kitakyushu', pref = raw.key === 'jp-saitama' ? 'JP-11' : 'JP-40', city = byId.get(cityId);
    if (!city || !raw.city) { console.warn('缺城市', raw.key); continue; }
    const cg = clean(raw.city.geometry); if (cg) put(`jp/${pref}.json`, { type: 'Feature', properties: { adcode: cityId, name: city.name }, geometry: cg });
    const wardItems = raw.wards.map((w) => ({ id: w.id, level: w.level, tags: w.tags, geometry: w.geometry }));
    attach(cityId, wardItems, 'jp', cityId, 'district', 'town'); // 先挂区（level 8）与第一层
    // 区下的町丁：每个区各自一份文件
    for (const w of raw.wards) attachWard(cityId, w);
  }
}
function attachWard(cityId, w) { // 区 → 町（最小级别）→ 丁目
  const wardNode = add.find((n) => n.parent_id === cityId && n.detail?.['OSM 关系'] === String(w.id)); if (!wardNode || !w.children?.length) return;
  attach(wardNode.id, w.children, 'jp', `o${w.id}`, 'town', 'village');
}

doc.nodes.push(...add);
doc._version += 1;
writeFileSync(SEED, JSON.stringify(doc, null, 2) + '\n');
for (const [path, fc] of files) writeFileSync(new URL(path, GEO), JSON.stringify(fc));
const cnt = (k) => add.filter((n) => n.kind === k).length;
console.log(`新增节点 ${add.length}（区 ${cnt('district')}、街道／乡镇／町 ${cnt('town')}、村／社区／丁目 ${cnt('village')}），几何文件 ${files.size} 个，种子版本 ${doc._version}，总节点 ${doc.nodes.length}`);
