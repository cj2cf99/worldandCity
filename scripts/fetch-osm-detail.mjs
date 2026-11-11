// 从 OpenStreetMap（Overpass）下载指定地区的最细行政边界（街道／乡镇、村／社区；日本为区、町丁目），缓存到 web/public/geo/osm-raw/（不入库）。
// 用法：node scripts/fetch-osm-detail.mjs [目标键 ...]   不给参数＝全部目标；已缓存的跳过（加 --force 重下）。
// 目标：中国（咸阳永寿县／泾阳县，西安 7 区，无锡各区，呼和浩特各区县旗）、日本（埼玉市、东京 23 区、北九州市）。
// 许可：数据 © OpenStreetMap contributors，ODbL；使用需署名（见 web/SOURCES.md）。服务器繁忙时脚本会自动退避重试，可能耗时较长。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { geoCentroid, geoContains, geoArea } from 'd3-geo';
import { overpass, relationGeometry } from './osm-lib.mjs';

const CN = new URL('../web/public/geo/cn/', import.meta.url), RAW = new URL('../web/public/geo/osm-raw/', import.meta.url);
mkdirSync(RAW, { recursive: true });
const force = process.argv.includes('--force'), only = process.argv.slice(2).filter((a) => !a.startsWith('--'));

// ---- 目标（中国：行政区划代码 → 所在地级文件）----
const CN_TARGETS = [
  ['610426', '610400'], ['610423', '610400'],                                                   // 咸阳：永寿县、泾阳县
  ['610102', '610100'], ['610103', '610100'], ['610104', '610100'], ['610111', '610100'], ['610112', '610100'], ['610113', '610100'], ['610117', '610100'], // 西安：新城、碑林、莲湖、灞桥、未央、雁塔、高陵
  ['320205', '320200'], ['320206', '320200'], ['320211', '320200'], ['320213', '320200'], ['320214', '320200'], ['320281', '320200'], ['320282', '320200'], // 无锡：锡山、惠山、滨湖、梁溪、新吴、江阴、宜兴
  ['150102', '150100'], ['150103', '150100'], ['150104', '150100'], ['150105', '150100'], ['150121', '150100'], ['150122', '150100'], ['150123', '150100'], ['150124', '150100'], ['150125', '150100'], // 呼和浩特
];
// ---- 目标（日本：城市名 → 查询范围 [西, 南, 东, 北]）----
const JP_TARGETS = { saitama: { name: 'さいたま市', bbox: [139.42, 35.76, 139.84, 36.05], cityLevel: 7, wardLevels: '8' }, kitakyushu: { name: '北九州市', bbox: [130.66, 33.7, 131.14, 34.08], cityLevel: 7, wardLevels: '8' }, tokyo: { name: '東京', bbox: [139.55, 35.52, 139.93, 35.84], cityLevel: null, wardLevels: '7' } };

// ---- 几何小工具（d3 的绕向约定）----
const flipP = (p) => p.map((r) => r.slice().reverse()), inv = (p) => geoArea({ type: 'Polygon', coordinates: p }) > 2 * Math.PI;
const fixGeom = (g) => (g.type === 'Polygon' ? { ...g, coordinates: inv(g.coordinates) ? flipP(g.coordinates) : g.coordinates } : { ...g, coordinates: g.coordinates.map((p) => (inv(p) ? flipP(p) : p)) });
const feat = (g, props = {}) => ({ type: 'Feature', properties: props, geometry: fixGeom(g) });
const bboxOf = (g) => { let w = 180, e = -180, s = 90, n = -90; const walk = (c) => { if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); } else c.forEach(walk); }; walk(g.coordinates); return [w, s, e, n]; };
const inside = (parentFeat, g) => { try { return geoContains(parentFeat, geoCentroid(feat(g))); } catch { return false; } };
const keepTags = (t) => { const o = {}; for (const k of ['name', 'name:zh', 'name:zh-Hans', 'name:en', 'name:ja', 'name:ja_rm', 'name:pinyin', 'admin_level', 'place', 'ref', 'official_name', 'wikidata']) if (t[k]) o[k] = t[k]; return o; };

async function children(bbox, levels, parent) { // bbox 内指定级别的行政关系；只留“中心点落在 parent 内”的
  const [w, s, e, n] = bbox;
  const data = await overpass(`[out:json][timeout:240];\nrel["boundary"="administrative"]["admin_level"~"^(${levels})$"](${s},${w},${n},${e});\nout geom tags;`);
  const out = [];
  for (const r of data.elements ?? []) { const g = relationGeometry(r); if (!g) continue; if (parent && !inside(parent, g)) continue; out.push({ id: r.id, level: Number(r.tags.admin_level), tags: keepTags(r.tags), geometry: g }); }
  return out;
}
const save = (key, obj) => writeFileSync(new URL(`${key}.json`, RAW), JSON.stringify(obj));

// ---- 中国 ----
for (const [code, cityCode] of CN_TARGETS) {
  const key = `cn-${code}`; if ((only.length && !only.includes(key) && !only.includes(code)) || (!force && existsSync(new URL(`${key}.json`, RAW)))) continue;
  const fc = JSON.parse(readFileSync(new URL(`${cityCode}.json`, CN), 'utf8')), pf = fc.features.find((f) => f.properties.adcode === code);
  if (!pf) { console.warn('找不到', code); continue; }
  const parent = feat(pf.geometry), kids = await children(bboxOf(pf.geometry), '7|8|9|10', parent);
  save(key, { key, region: 'cn', code, name: pf.properties.name, children: kids });
  console.log(key, pf.properties.name, '子级', kids.length, '个；级别', [...new Set(kids.map((k) => k.level))].join(','));
}
// ---- 日本 ----
for (const [k, T] of Object.entries(JP_TARGETS)) {
  const key = `jp-${k}`; if ((only.length && !only.includes(key)) || (!force && existsSync(new URL(`${key}.json`, RAW)))) continue;
  // 阶段 1：城市（若有）与各区
  const top = await children(T.bbox, T.cityLevel ? `${T.cityLevel}|${T.wardLevels}` : T.wardLevels, null);
  const city = T.cityLevel ? top.find((x) => x.level === T.cityLevel && x.tags.name === T.name) : null;
  const cityFeat = city ? feat(city.geometry) : null;
  const wards = top.filter((x) => String(x.level) === T.wardLevels.split('|')[0] && (!cityFeat || inside(cityFeat, x.geometry)));
  console.log(key, '区', wards.length, '个：', wards.map((w) => w.tags.name).join('、'));
  // 阶段 2：每个区内的町丁
  for (const w of wards) w.children = await children(bboxOf(w.geometry), k === 'tokyo' ? '8|9|10' : '9|10', feat(w.geometry));
  save(key, { key, region: 'jp', name: T.name, city: city && { id: city.id, tags: city.tags, geometry: city.geometry }, wards });
  console.log(key, '完成；町丁共', wards.reduce((a, w) => a + w.children.length, 0));
}
