// 生成“所有国家的基础层”：六大洲＋主权国家节点写入公开种子（geo.<iso2>），并输出前端用的 ISO2→底图数字编码表 web/iso.js。
// 国家名单＝联合国会员国＋梵蒂冈＋巴勒斯坦＋科索沃；属地（格陵兰、波多黎各等）、台湾／港／澳（归在中国节点之下）不单列。
// 中文名取自 Node 的 Intl.DisplayNames（CLDR，Unicode 许可）；英文名放进 name_local。可重复执行。
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const topo = require('world-atlas/countries-50m.json');

const CONT = {
  asia: ['亚洲', 'AF AM AZ BH BD BT BN KH CN CY GE IN ID IR IQ IL JP JO KZ KW KG LA LB MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TJ TH TL TR TM AE UZ VN YE'],
  europe: ['欧洲', 'AL AD AT BY BE BA BG HR CZ DK EE FI FR DE GR HU IS IE IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA'],
  africa: ['非洲', 'DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW'],
  'north-america': ['北美洲', 'AG BS BB BZ CA CR CU DM DO SV GD GT HT HN JM MX NI PA KN LC VC TT US'],
  'south-america': ['南美洲', 'AR BO BR CL CO EC GY PY PE SR UY VE'],
  oceania: ['大洋洲', 'AU FJ KI MH FM NR NZ PW PG WS SB TO TV VU'],
};
// 底图（Natural Earth 派生）的简写名 → ISO 3166-1 alpha-2
const OVERRIDE = { Vatican: 'VA', 'Marshall Is.': 'MH', 'United States of America': 'US', Turkey: 'TR', 'Trinidad and Tobago': 'TT', 'S. Sudan': 'SS', 'Solomon Is.': 'SB', 'São Tomé and Principe': 'ST', 'St. Vin. and Gren.': 'VC', 'Saint Lucia': 'LC', 'St. Kitts and Nevis': 'KN', Macedonia: 'MK', Palestine: 'PS', 'Eq. Guinea': 'GQ', 'Dominican Rep.': 'DO', "Côte d'Ivoire": 'CI', 'Dem. Rep. Congo': 'CD', Congo: 'CG', 'Central African Rep.': 'CF', 'Cabo Verde': 'CV', Myanmar: 'MM', 'Bosnia and Herz.': 'BA', 'Antigua and Barb.': 'AG', Kosovo: 'XK' };

const en = new Intl.DisplayNames('en', { type: 'region' }), zh = new Intl.DisplayNames('zh-CN', { type: 'region' });
const byEn = new Map();
const ALL = Object.values(CONT).flatMap(([, l]) => l.split(' '));
for (let a = 65; a < 91; a++) for (let b = 65; b < 91; b++) { const c = String.fromCharCode(a, b); if (!ALL.includes(c)) continue; try { const n = en.of(c); if (n && n !== c) byEn.set(n.toLowerCase(), c); } catch { /* 无此区域码 */ } }
const num = new Map(); // alpha2 → 底图数字编码
for (const g of topo.objects.countries.geometries) { if (g.id == null) continue; const a2 = OVERRIDE[g.properties.name] ?? byEn.get(g.properties.name.toLowerCase()); if (a2) num.set(a2, g.id); }

const all = Object.values(CONT).flatMap(([, s]) => s.split(' '));
const dup = all.filter((c, i) => all.indexOf(c) !== i); if (dup.length) throw new Error('大洲名单重复：' + dup);
const missing = all.filter((c) => !num.has(c)); if (missing.length) console.warn('底图里找不到（仍建节点，无法点选）：', missing.join(' '));

const SEED = new URL('../seed/nodes.public.json', import.meta.url), doc = JSON.parse(readFileSync(SEED, 'utf8'));
const isGen = (n) => /^geo\.(asia|europe|africa|north-america|south-america|oceania)$/.test(n.id) || (n.kind === 'country' && /^geo\.[a-z]{2}$/.test(n.id));
const keep = doc.nodes.filter((n) => !isGen(n)), sorter = new Intl.Collator('zh-Hans-CN-u-co-pinyin');
const gen = [];
Object.entries(CONT).forEach(([k, [name, list]], i) => {
  gen.push({ id: `geo.${k}`, parent_id: 'geo.world', realm: 'geo', kind: 'continent', name, sort_order: (i + 1) * 10 });
  list.split(' ').map((c) => ({ c, n: zh.of(c), e: en.of(c) })).sort((a, b) => sorter.compare(a.n, b.n)).forEach((x, j) => gen.push({ id: `geo.${x.c.toLowerCase()}`, parent_id: `geo.${k}`, realm: 'geo', kind: 'country', name: x.n, name_local: x.e, code: x.c, sort_order: j }));
});
// 保持“父在前”的顺序：世界 → 大洲 → 国家 → 其余（省／市／区）
const world = keep.filter((n) => n.id === 'geo.world'), rest = keep.filter((n) => n.id !== 'geo.world');
const geoOld = rest.filter((n) => n.realm === 'geo'), other = rest.filter((n) => n.realm !== 'geo');
doc.nodes = [...world, ...gen, ...geoOld, ...other];
doc._version += 1;
writeFileSync(SEED, JSON.stringify(doc, null, 2) + '\n');

const map = Object.fromEntries([...num].sort(([a], [b]) => (a < b ? -1 : 1)).filter(([c]) => all.includes(c)));
writeFileSync(new URL('../web/iso.js', import.meta.url), `// 由 scripts/build-countries.mjs 生成：节点 code(ISO 3166-1 alpha-2) → world-atlas 底图数字编码。首屏壳与底图模块共用，勿手改。\nexport const ISO2_TO_NUM = ${JSON.stringify(map)};\n`);
console.log(`大洲 ${Object.keys(CONT).length}，国家 ${all.length}（可点选 ${Object.keys(map).length}），种子版本 ${doc._version}`);
