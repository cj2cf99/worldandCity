// 生成中国的省级与地级层级节点（读取 scripts/fetch-geo.mjs 下载的 web/public/geo/cn/*.json 里的名称与行政区划代码）写入公开种子。
// 只写名称与层级，不含几何（几何文件不入库）。西安市／未央区沿用原有节点。可重复执行。
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
const GEO = new URL('../web/public/geo/cn/', import.meta.url), SEED = new URL('../seed/nodes.public.json', import.meta.url);
const ISO = { 110000: 'BJ', 120000: 'TJ', 130000: 'HE', 140000: 'SX', 150000: 'NM', 210000: 'LN', 220000: 'JL', 230000: 'HL', 310000: 'SH', 320000: 'JS', 330000: 'ZJ', 340000: 'AH', 350000: 'FJ', 360000: 'JX', 370000: 'SD', 410000: 'HA', 420000: 'HB', 430000: 'HN', 440000: 'GD', 450000: 'GX', 460000: 'HI', 500000: 'CQ', 510000: 'SC', 520000: 'GZ', 530000: 'YN', 540000: 'XZ', 610000: 'SN', 620000: 'GS', 630000: 'QH', 640000: 'NX', 650000: 'XJ', 710000: 'TW', 810000: 'HK', 820000: 'MO' };
const DIRECT = new Set(['110000', '120000', '310000', '500000', '810000', '820000']); // 直辖市与特别行政区：下一级是“区”
const read = (c) => (existsSync(new URL(`${c}.json`, GEO)) ? JSON.parse(readFileSync(new URL(`${c}.json`, GEO), 'utf8')) : null);
const root = read('100000'); if (!root) throw new Error('缺少 web/public/geo/cn/100000.json，请先运行 node scripts/fetch-geo.mjs');
const doc = JSON.parse(readFileSync(SEED, 'utf8'));
const keepIds = new Set(['geo.cn-sn-xa', 'geo.cn-sn-xa-wy']);
const gen = (n) => /^geo\.cn-[a-z]{2}$/.test(n.id) || (/^geo\.cn-\d{6}$/.test(n.id) && !keepIds.has(n.id));
doc.nodes = doc.nodes.filter((n) => !gen(n));
const add = [];
root.features.forEach((f, i) => {
  const code = String(f.properties.adcode), xx = ISO[code]; if (!xx) throw new Error('缺少省级代码 ' + code);
  const pid = `geo.cn-${xx.toLowerCase()}`;
  add.push({ id: pid, parent_id: 'geo.cn', realm: 'geo', kind: 'admin1', name: f.properties.name, code: `CN-${xx}`, sort_order: i });
  const kids = read(code); if (!kids) return;
  kids.features.forEach((k, j) => { const kc = String(k.properties.adcode); if (kc === '610100') return; add.push({ id: `geo.cn-${kc}`, parent_id: pid, realm: 'geo', kind: DIRECT.has(code) ? 'district' : 'city', name: k.properties.name, sort_order: j }); });
});
// 原有的陕西节点：补全 name 与排序以外保持不变（西安市挂在 geo.cn-sn 下）
const have = new Set(doc.nodes.map((n) => n.id));
doc.nodes.push(...add.filter((n) => !have.has(n.id)));
doc._version += 1;
writeFileSync(SEED, JSON.stringify(doc, null, 2) + '\n');
console.log(`省级 ${root.features.length}，新增节点 ${add.length}，种子版本 ${doc._version}`);
