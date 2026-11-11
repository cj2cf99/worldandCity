// 生成中国的省级与地级层级节点（读取 scripts/fetch-geo.mjs 下载的 web/public/geo/cn/*.json 里的名称与行政区划代码）写入公开种子。
// 只写名称与层级，不含几何（几何文件不入库）。西安市／未央区沿用原有节点。可重复执行。
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
const GEO = new URL('../web/public/geo/cn/', import.meta.url), SEED = new URL('../seed/nodes.public.json', import.meta.url);
const ISO = { 110000: 'BJ', 120000: 'TJ', 130000: 'HE', 140000: 'SX', 150000: 'NM', 210000: 'LN', 220000: 'JL', 230000: 'HL', 310000: 'SH', 320000: 'JS', 330000: 'ZJ', 340000: 'AH', 350000: 'FJ', 360000: 'JX', 370000: 'SD', 410000: 'HA', 420000: 'HB', 430000: 'HN', 440000: 'GD', 450000: 'GX', 460000: 'HI', 500000: 'CQ', 510000: 'SC', 520000: 'GZ', 530000: 'YN', 540000: 'XZ', 610000: 'SN', 620000: 'GS', 630000: 'QH', 640000: 'NX', 650000: 'XJ', 710000: 'TW', 810000: 'HK', 820000: 'MO' };
const TRI = { 110000: 'Beijing / 北京市', 120000: 'Tianjin / 天津市', 130000: 'Hebei / 河北省', 140000: 'Shanxi / 山西省', 150000: 'Inner Mongolia / 内モンゴル自治区', 210000: 'Liaoning / 遼寧省', 220000: 'Jilin / 吉林省', 230000: 'Heilongjiang / 黒竜江省', 310000: 'Shanghai / 上海市', 320000: 'Jiangsu / 江蘇省', 330000: 'Zhejiang / 浙江省', 340000: 'Anhui / 安徽省', 350000: 'Fujian / 福建省', 360000: 'Jiangxi / 江西省', 370000: 'Shandong / 山東省', 410000: 'Henan / 河南省', 420000: 'Hubei / 湖北省', 430000: 'Hunan / 湖南省', 440000: 'Guangdong / 広東省', 450000: 'Guangxi / 広西チワン族自治区', 460000: 'Hainan / 海南省', 500000: 'Chongqing / 重慶市', 510000: 'Sichuan / 四川省', 520000: 'Guizhou / 貴州省', 530000: 'Yunnan / 雲南省', 540000: 'Tibet / チベット自治区', 610000: 'Shaanxi / 陝西省', 620000: 'Gansu / 甘粛省', 630000: 'Qinghai / 青海省', 640000: 'Ningxia / 寧夏回族自治区', 650000: 'Xinjiang / 新疆ウイグル自治区', 710000: 'Taiwan / 台湾省', 810000: 'Hong Kong / 香港特別行政区', 820000: 'Macao / マカオ特別行政区' }; // 省级：English / 日本語（地级市暂无，显示时回退为中文）
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
  add.push({ id: pid, parent_id: 'geo.cn', realm: 'geo', kind: 'admin1', name: f.properties.name, name_local: TRI[code], code: `CN-${xx}`, sort_order: i });
  const kids = read(code); if (!kids) return;
  kids.features.forEach((k, j) => {
    const kc = String(k.properties.adcode), isXa = kc === '610100';
    if (!isXa) add.push({ id: `geo.cn-${kc}`, parent_id: pid, realm: 'geo', kind: DIRECT.has(code) ? 'district' : 'city', name: k.properties.name, sort_order: j });
    if (DIRECT.has(code)) return;                                // 直辖市／港澳的下一级就是区，不再往下
    const sub = read(kc); if (!sub) return;                      // 地级的下一级：区／县／县级市（先运行 scripts/fetch-cn-counties.mjs 下载）
    const cid = isXa ? 'geo.cn-sn-xa' : `geo.cn-${kc}`;
    sub.features.forEach((d, m) => { const dc = String(d.properties.adcode); if (dc === '610112') return; add.push({ id: `geo.cn-${dc}`, parent_id: cid, realm: 'geo', kind: 'district', name: d.properties.name, sort_order: m }); }); // 未央区沿用原有节点
  });
});
// 原有的陕西节点：补全 name 与排序以外保持不变（西安市挂在 geo.cn-sn 下）
for (const n of doc.nodes) { if (n.id === 'geo.cn-sn-xa') n.name_local = "Xi'an / 西安市"; if (n.id === 'geo.cn-sn-xa-wy') n.name_local = 'Weiyang / 未央区'; } // 沿用的原有节点补三语
const have = new Set(doc.nodes.map((n) => n.id));
doc.nodes.push(...add.filter((n) => !have.has(n.id)));
doc._version += 1;
writeFileSync(SEED, JSON.stringify(doc, null, 2) + '\n');
console.log(`省级 ${root.features.length}，新增节点 ${add.length}，种子版本 ${doc._version}`);
