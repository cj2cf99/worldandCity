// 全球二层节点（各国的州／省／大区等一级行政区）：从 Natural Earth 10m 一级行政区（公有领域）生成节点与几何。
// 用法：node scripts/build-adm1.mjs <ne_10m_admin_1_states_provinces.geojson 路径>
// - 节点：写入公开种子（geo.<iso2>-<iso3166-2 后缀或 adm1 编码>），中文名取 name_zh、name_local＝“English / 日本語”，详情含类型、所属国家、ISO 3166-2、区域、面积（有则写）；
//   中国与日本沿用各自的专用数据（DataV／地球地图日本），这里跳过；国家节点没有对应国家（属地等）的要素跳过。
// - 几何：每个国家一个文件 web/public/geo/adm1/<ISO2>.json（不入库），名称与节点一致；坐标按国家大小取 2～3 位小数，统一绕向并去掉退化环。
// - 同时补全国家节点的简介（大洲、下设一级行政区个数）。可重复执行。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { geoArea } from 'd3-geo';

const src = process.argv[2];
if (!src) throw new Error('用法：node scripts/build-adm1.mjs <ne_10m_admin_1_states_provinces.geojson>');
const SEED = new URL('../seed/nodes.public.json', import.meta.url), OUT = new URL('../web/public/geo/adm1/', import.meta.url);
const SKIP = new Set(['CN', 'JP', 'TW', 'HK', 'MO']);
const TYPE_ZH = { State: '州', Province: '省', Region: '大区', 'Autonomous region': '自治区', 'Autonomous Region': '自治区', 'Autonomous Community': '自治区', 'Autonomous community': '自治区', County: '县', District: '区', Municipality: '市镇', Governorate: '省', Oblast: '州', Krai: '边疆区', Republic: '共和国', Prefecture: '县', Department: '省', Canton: '州', Parish: '教区', Emirate: '酋长国', Division: '专区', City: '市', 'Capital City': '首都市', 'Federal District': '联邦区', Territory: '领地', 'Union Territory': '中央直辖区', 'Capital Territory': '首都领地', 'Metropolitan region': '都会区', Voivodeship: '省', Land: '州', 'Autonomous Okrug': '自治区', 'Autonomous Oblast': '自治州', Okrug: '区', Raion: '区', Commune: '市镇', Comune: '市镇', Entity: '实体', Island: '岛屿', Atoll: '环礁', Sector: '区', Zone: '区', Regional: '大区', 'Special Region': '特区', Emirates: '酋长国', Municipalities: '市镇' };
const zhSort = new Intl.Collator('zh-Hans-CN-u-co-pinyin');

const doc = JSON.parse(readFileSync(SEED, 'utf8'));
const countries = new Map(doc.nodes.filter((n) => n.kind === 'country').map((n) => [n.code, n]));
const contName = new Map(doc.nodes.filter((n) => n.kind === 'continent').map((n) => [n.id, n.name]));
const ne = JSON.parse(readFileSync(src, 'utf8'));

// ---- 几何整理（与 build-jp.mjs 相同的做法）----
const dedupe = (r) => r.filter((p, i) => i === 0 || p[0] !== r[i - 1][0] || p[1] !== r[i - 1][1]);
const big = (r) => geoArea({ type: 'Polygon', coordinates: [r] }) > 2 * Math.PI;
function cleanGeom(g, dec) {
  const k = 10 ** dec, rd = (n) => Math.round(n * k) / k;
  const ring = (r) => { const q = dedupe(r.map((p) => [rd(p[0]), rd(p[1])])); if (q.length >= 3 && (q[0][0] !== q.at(-1)[0] || q[0][1] !== q.at(-1)[1])) q.push(q[0]); return q.length >= 4 ? q : null; };
  const poly = (rs) => {
    const q = rs.map(ring); if (!q[0]) return null;
    const fix = (r, i) => { if (!r) return null; const a = geoArea({ type: 'Polygon', coordinates: [r] }); if (a < 1e-10 || Math.abs(a - 4 * Math.PI) < 1e-10) return null; return (i === 0) === big(r) ? r.slice().reverse() : r; };
    const out = q.map((r, i) => fix(r, i)); return out[0] ? out.filter(Boolean) : null;
  };
  if (g.type === 'Polygon') { const p = poly(g.coordinates); return p && { type: 'Polygon', coordinates: p }; }
  const ps = g.coordinates.map(poly).filter(Boolean); return ps.length ? { type: 'MultiPolygon', coordinates: ps } : null;
}
const spanOf = (g) => { let w = 180, e = -180, s = 90, n = -90; const walk = (c) => { if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); } else c.forEach(walk); }; walk(g.coordinates); return Math.max(e - w, n - s); };

// ---- 分组 ----
const byCountry = new Map();
for (const f of ne.features) {
  const p = f.properties, a2 = p.iso_a2; if (!a2 || a2 === '-99' || SKIP.has(a2) || !countries.has(a2) || !f.geometry) continue;
  (byCountry.get(a2) ?? byCountry.set(a2, []).get(a2)).push(f);
}

const isOld = (n) => /^geo\.[a-z]{2}-/.test(n.id) && !/^geo\.(cn|jp)-/.test(n.id);
doc.nodes = doc.nodes.filter((n) => !isOld(n));
const add = [], used = new Set(doc.nodes.map((n) => n.id)), usedCode = new Set(doc.nodes.map((n) => n.code).filter(Boolean)); // wc_nodes.code 全库唯一：重复的 ISO 码只给第一个
mkdirSync(OUT, { recursive: true });
let nGeo = 0, bytes = 0;
for (const [a2, feats] of [...byCountry].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
  const cn = countries.get(a2), lc = a2.toLowerCase(), rows = [];
  const seenName = new Map();
  for (const f of feats) {
    const p = f.properties, en = p.name_en || p.name || p.gn_name || '', ja = p.name_ja || en;
    let zh = p.name_zh || en || p.name || p.name_local || p.gn_name || p.iso_3166_2 || p.adm1_code; if (!zh) continue; // 个别要素没有任何名称：跳过
    let enOut = en;
    if (seenName.has(zh)) { const alt = p.name && p.name !== zh && p.name !== en ? p.name : en; if (alt && alt !== zh) { zh = `${zh}（${alt}）`; if (alt !== en) enOut = `${en}（${alt}）`; } } // 同国重名（Natural Earth 个别国家把几个区都写成同一个旧省名，如马达加斯加）：附当地语名称区分，仍重名再加序号
    for (let i = 2; seenName.has(zh); i++) zh = `${zh.replace(/（\d+）$/, '')}（${i}）`;
    seenName.set(zh, 1);
    const iso = p.iso_3166_2 && !p.iso_3166_2.includes('~') && p.iso_3166_2.startsWith(a2 + '-') ? p.iso_3166_2 : null;
    let suffix = (iso ? iso.slice(3) : String(p.adm1_code || p.ne_id).replace(/^[A-Z]{3}-/, 'x')).toLowerCase().replace(/[^a-z0-9]+/g, '');
    let id = `geo.${lc}-${suffix}`; for (let i = 2; used.has(id); i++) id = `geo.${lc}-${suffix}${i}`; used.add(id);
    rows.push({ f, id, iso, zh, en: enOut, ja, type: TYPE_ZH[p.type_en] || p.type_en || '一级行政区', region: p.region, area: Number(p.area_sqkm) || 0 });
  }
  rows.sort((x, y) => zhSort.compare(x.zh, y.zh));
  rows.forEach((r, i) => {
    const detail = { 类型: r.type, 所属国家: cn.name };
    if (r.iso) detail['ISO 3166-2'] = r.iso;
    if (r.region && r.region !== r.zh) detail['区域'] = r.region;
    if (r.area > 0) detail['面积（估计）'] = `约 ${Math.round(r.area).toLocaleString('en-US')} 平方公里`;
    detail['画面说明'] = '行政区划名称与轮廓取自 Natural Earth（公有领域，10m 精度，边界为简化示意，不代表任何立场）。';
    add.push({ id: r.id, parent_id: cn.id, realm: 'geo', kind: 'admin1', name: r.zh, name_local: `${r.en} / ${r.ja}`, ...(r.iso && !usedCode.has(r.iso) ? (usedCode.add(r.iso), { code: r.iso }) : {}), sort_order: i, detail });
  });
  // 国家节点：补简介
  const nodeC = doc.nodes.find((n) => n.id === cn.id);
  nodeC.detail = { ...(nodeC.detail || {}), 简介: `${cn.name}（${(cn.name_local || '').replace(/ \/ .*/, '')}），${contName.get(cn.parent_id) ?? ''}国家；下设 ${rows.length} 个一级行政区。`, 下级: `${rows.length} 个一级行政区`, 画面说明: '一级行政区取自 Natural Earth（公有领域）。' };
  // 几何文件
  const span = Math.max(...feats.map((f) => spanOf(f.geometry))), dec = span < 3 ? 3 : 2;
  const fc = { type: 'FeatureCollection', features: [] };
  rows.forEach((r) => { const g = cleanGeom(r.f.geometry, dec); if (g) fc.features.push({ type: 'Feature', properties: { adcode: r.id, name: r.zh }, geometry: g }); });
  const text = JSON.stringify(fc); writeFileSync(new URL(`${a2}.json`, OUT), text); bytes += text.length; nGeo++;
}
doc.nodes.push(...add);
doc._version += 1;
writeFileSync(SEED, JSON.stringify(doc, null, 2) + '\n');
console.log(`国家 ${nGeo} 个，新增二层节点 ${add.length}，几何共 ${(bytes / 1e6).toFixed(1)} MB，种子版本 ${doc._version}，总节点 ${doc.nodes.length}`);
