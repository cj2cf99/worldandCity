// 下载中国每个地级行政区的下一级（区／县）几何：读公开种子里的地级节点，按行政区划代码从 DataV areas_v3 取 <code>_full.json，
// 写到 web/public/geo/cn/<code>.json（与 fetch-geo.mjs 同一格式、同一来源；几何不入库，见 web/SOURCES.md）。没有下一级的（省直辖县等）自动跳过。
// 用法：node scripts/fetch-cn-counties.mjs   （已存在的文件跳过；加 --force 重新下载）
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
const SEED = new URL('../seed/nodes.public.json', import.meta.url), OUT = new URL('../web/public/geo/cn/', import.meta.url);
const force = process.argv.includes('--force');
const nodes = JSON.parse(readFileSync(SEED, 'utf8')).nodes;
const codes = [...new Set([...nodes.filter((n) => n.kind === 'city' && /^geo\.cn-\d{6}$/.test(n.id)).map((n) => n.id.slice(7)), '610100'])];
const r3 = (n) => Math.round(n * 1000) / 1000, round = (c) => (typeof c[0] === 'number' ? c.map(r3) : c.map(round));
mkdirSync(OUT, { recursive: true });
let ok = 0, skip = 0, none = 0, i = 0;
async function one(code) {
  const f = new URL(`${code}.json`, OUT);
  if (!force && existsSync(f)) { skip++; return; }
  const res = await fetch(`https://geo.datav.aliyun.com/areas_v3/bound/${code}_full.json`).catch(() => null);
  if (!res || !res.ok) { none++; return; }
  const fc = await res.json().catch(() => null);
  const features = (fc?.features ?? []).filter((x) => /^\d+$/.test(String(x.properties.adcode)) && /Polygon/.test(x.geometry?.type)).map((x) => ({ type: 'Feature', properties: { adcode: String(x.properties.adcode), name: x.properties.name }, geometry: { type: x.geometry.type, coordinates: round(x.geometry.coordinates) } }));
  if (!features.length) { none++; return; }
  writeFileSync(f, JSON.stringify({ type: 'FeatureCollection', features })); ok++;
}
const workers = Array.from({ length: 6 }, async () => { while (i < codes.length) await one(codes[i++]); });
await Promise.all(workers);
console.log(`地级 ${codes.length} 个：下载 ${ok}，已有 ${skip}，无下一级 ${none}`);
