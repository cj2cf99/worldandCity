// 下载中国行政区划几何（阿里云 DataV areas_v3，高德来源）到 web/public/geo/cn/，供前端分层 SVG 使用。
// ⚠ 许可未明确允许再分发，因此输出目录被 .gitignore 排除，不入库（PRD §22.3）；换数据源时只改此脚本。
// 用法：node scripts/fetch-geo.mjs [adcode ...]   默认：全国(100000)、陕西(610000)、西安(610100)
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../web/public/geo/cn/', import.meta.url);
const codes = process.argv.length > 2 ? process.argv.slice(2) : ['100000', '610000', '610100'];
const r3 = (n) => Math.round(n * 1000) / 1000;
const round = (c) => (typeof c[0] === 'number' ? c.map(r3) : c.map(round));
mkdirSync(OUT, { recursive: true });
for (const code of codes) {
  const res = await fetch(`https://geo.datav.aliyun.com/areas_v3/bound/${code}_full.json`);
  if (!res.ok) throw new Error(`${code}: HTTP ${res.status}`);
  const fc = await res.json();
  const features = fc.features
    .filter((f) => /^\d+$/.test(String(f.properties.adcode)) && /Polygon/.test(f.geometry?.type)) // 去掉九段线等线要素
    .map((f) => ({ type: 'Feature', properties: { adcode: String(f.properties.adcode), name: f.properties.name }, geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) } }));
  writeFileSync(new URL(`${code}.json`, OUT), JSON.stringify({ type: 'FeatureCollection', features }));
  console.log(code, features.length, '个区域');
}
