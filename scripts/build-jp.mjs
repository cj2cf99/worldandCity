// 日本：47 个都道府县＋主要城市（政令指定都市、各县厅所在地、东京 23 区）写入公开种子；并把 japan.topojson 转成前端用的 web/public/geo/jp/392.json。
// 几何来源：github.com/dataofjapan/land（基于地球地图日本，需标注出处；文件不入库，见 web/SOURCES.md）。先下载到 web/public/geo/jp/japan.topojson 再运行。
// 市级节点只有名称与层级，没有几何（选中时聚焦到所属都道府县）。中文名为本项目写入。可重复执行。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { feature } from 'topojson-client';
const GEO = new URL('../web/public/geo/jp/', import.meta.url), SEED = new URL('../seed/nodes.public.json', import.meta.url);
const PREF = '北海道 青森县 岩手县 宫城县 秋田县 山形县 福岛县 茨城县 栃木县 群马县 埼玉县 千叶县 东京都 神奈川县 新潟县 富山县 石川县 福井县 山梨县 长野县 岐阜县 静冈县 爱知县 三重县 滋贺县 京都府 大阪府 兵库县 奈良县 和歌山县 鸟取县 岛根县 冈山县 广岛县 山口县 德岛县 香川县 爱媛县 高知县 福冈县 佐贺县 长崎县 熊本县 大分县 宫崎县 鹿儿岛县 冲绳县'.split(' ');
// [都道府县编号, 名称, id 后缀, 类型]
const CITY = [[1, '札幌市', 'sapporo'], [4, '仙台市', 'sendai'], [11, '埼玉市', 'saitama'], [12, '千叶市', 'chiba'], [14, '横滨市', 'yokohama'], [14, '川崎市', 'kawasaki'], [14, '相模原市', 'sagamihara'], [15, '新潟市', 'niigata'], [22, '静冈市', 'shizuoka'], [22, '滨松市', 'hamamatsu'], [23, '名古屋市', 'nagoya'], [26, '京都市', 'kyoto'], [27, '大阪市', 'osaka'], [27, '堺市', 'sakai'], [28, '神户市', 'kobe'], [33, '冈山市', 'okayama'], [34, '广岛市', 'hiroshima'], [40, '北九州市', 'kitakyushu'], [40, '福冈市', 'fukuoka'], [43, '熊本市', 'kumamoto'], // 政令指定都市（20）
  [2, '青森市', 'aomori'], [3, '盛冈市', 'morioka'], [5, '秋田市', 'akita'], [6, '山形市', 'yamagata'], [7, '福岛市', 'fukushima'], [8, '水户市', 'mito'], [9, '宇都宫市', 'utsunomiya'], [10, '前桥市', 'maebashi'], [16, '富山市', 'toyama'], [17, '金泽市', 'kanazawa'], [18, '福井市', 'fukui'], [19, '甲府市', 'kofu'], [20, '长野市', 'nagano'], [21, '岐阜市', 'gifu'], [24, '津市', 'tsu'], [25, '大津市', 'otsu'], [29, '奈良市', 'nara'], [30, '和歌山市', 'wakayama'], [31, '鸟取市', 'tottori'], [32, '松江市', 'matsue'], [35, '山口市', 'yamaguchi'], [36, '德岛市', 'tokushima'], [37, '高松市', 'takamatsu'], [38, '松山市', 'matsuyama'], [39, '高知市', 'kochi'], [41, '佐贺市', 'saga'], [42, '长崎市', 'nagasaki'], [44, '大分市', 'oita'], [45, '宫崎市', 'miyazaki'], [46, '鹿儿岛市', 'kagoshima'], [47, '那霸市', 'naha']]; // 各县厅所在地
const WARDS = '千代田区:chiyoda 中央区:chuo 港区:minato 新宿区:shinjuku 文京区:bunkyo 台东区:taito 墨田区:sumida 江东区:koto 品川区:shinagawa 目黑区:meguro 大田区:ota 世田谷区:setagaya 涩谷区:shibuya 中野区:nakano 杉并区:suginami 丰岛区:toshima 北区:kita 荒川区:arakawa 板桥区:itabashi 练马区:nerima 足立区:adachi 葛饰区:katsushika 江户川区:edogawa'.split(' ').map((s) => s.split(':'));
const r2 = (n) => Math.round(n * 100) / 100, dedupe = (ring) => ring.filter((p, i) => i === 0 || p[0] !== ring[i - 1][0] || p[1] !== ring[i - 1][1]);
const ring = (r) => { const q = dedupe(r.map((p) => p.map(r2))); if (q.length >= 4 && (q[0][0] !== q.at(-1)[0] || q[0][1] !== q.at(-1)[1])) q.push(q[0]); return q.length >= 4 ? q : null; }; // 保留约 1 公里精度，去掉连续重复点与退化小环
const poly = (rs) => { const q = rs.map(ring); return q[0] ? q.filter(Boolean) : null; };
const geom = (g) => { if (g.type === 'Polygon') { const p = poly(g.coordinates); return p && { type: 'Polygon', coordinates: p }; } const ps = g.coordinates.map(poly).filter(Boolean); return ps.length ? { type: 'MultiPolygon', coordinates: ps } : null; };
const pp = (n) => String(n).padStart(2, '0');

const doc = JSON.parse(readFileSync(SEED, 'utf8'));
doc.nodes = doc.nodes.filter((n) => !/^geo\.jp-/.test(n.id));
const add = [];
PREF.forEach((name, i) => add.push({ id: `geo.jp-${pp(i + 1)}`, parent_id: 'geo.jp', realm: 'geo', kind: 'admin1', name, code: `JP-${pp(i + 1)}`, sort_order: i }));
const cnt = {};
for (const [p, name, slug] of CITY) { cnt[p] = (cnt[p] ?? 0) + 1; add.push({ id: `geo.jp-${pp(p)}-${slug}`, parent_id: `geo.jp-${pp(p)}`, realm: 'geo', kind: 'city', name, sort_order: cnt[p] - 1 }); }
WARDS.forEach(([name, slug], j) => add.push({ id: `geo.jp-13-${slug}`, parent_id: 'geo.jp-13', realm: 'geo', kind: 'district', name, sort_order: j }));
doc.nodes.push(...add);
doc._version += 1;
writeFileSync(SEED, JSON.stringify(doc, null, 2) + '\n');
console.log(`都道府县 47，市／区 ${add.length - 47}，种子版本 ${doc._version}`);

const src = new URL('japan.topojson', GEO);
if (existsSync(src)) {
  const t = JSON.parse(readFileSync(src, 'utf8')), fc = feature(t, t.objects.japan);
  const out = { type: 'FeatureCollection', features: fc.features.map((f) => ({ type: 'Feature', properties: { adcode: `JP-${pp(f.properties.id)}`, name: PREF[f.properties.id - 1] }, geometry: geom(f.geometry) })) };
  if (out.features.length !== 47 || out.features.some((f) => !f.properties.name)) throw new Error('japan.topojson 要素数或编号不符');
  writeFileSync(new URL('392.json', GEO), JSON.stringify(out));
  console.log('已生成 web/public/geo/jp/392.json');
} else console.warn('未找到 japan.topojson，只写了节点；地图上不会显示都道府县轮廓');
