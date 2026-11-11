// 底图数据与投影工具。内部数据始终为经纬度（设计 §8.2）；Mollweide 只在渲染层使用，最终投影未锁定，可替换。
import { feature } from 'topojson-client';
import { geoEquirectangular, geoPath, geoContains, geoCentroid, geoBounds, geoGraticule10, geoArea } from 'd3-geo';
import topo from 'world-atlas/countries-50m.json';
import { ISO2_TO_NUM } from './iso.js';

// 底图：world-atlas（Natural Earth 派生），来源登记于 web/SOURCES.md。去掉南极洲以保持展平后的轮廓整洁。
// 去掉南极洲；底图里个别要素共用同一个数字编码（澳大利亚与“阿什莫尔和卡捷岛”都是 036，后者在 Map 里会顶掉澳大利亚，导致点不了、取景错）：同编码只留面积最大的一个
const all = feature(topo, topo.objects.countries).features.filter((f) => f.id !== '010'), big = new Map();
for (const f of all) if (f.id != null && (!big.has(f.id) || geoArea(f) > geoArea(big.get(f.id)))) big.set(f.id, f);
export const countries = all.filter((f) => f.id == null || big.get(f.id) === f);
// 节点 code(ISO 3166-1 alpha-2) → 底图数字编码；随种子国家增加而补充。
export { ISO2_TO_NUM };
const byId = new Map(countries.map((f) => [f.id, f]));

const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** 现实系配色：自然、低饱和的绿／沙／赭，按国家编码稳定取色。 */
function landColor(id) {
  const h = hash(String(id ?? ""));
  const hue = [95, 110, 75, 130, 48, 36][h % 6];
  return `hsl(${hue} ${28 + (h >>> 3) % 14}% ${34 + (h >>> 5) % 14}%)`;
}

export function drawLand(canvas) {
  const { width: W, height: H } = canvas;
  const ctx = canvas.getContext('2d');
  const proj = geoEquirectangular().fitExtent([[0, 0], [W, H]], { type: 'Sphere' });
  const path = geoPath(proj, ctx);
  ctx.clearRect(0, 0, W, H);
  ctx.lineJoin = 'round';
  const k = W / 4096;
  // 经纬网（极淡）
  ctx.beginPath(); path(geoGraticule10()); ctx.strokeStyle = 'rgba(160,210,255,.10)'; ctx.lineWidth = k; ctx.stroke();
  for (const f of countries) {
    ctx.beginPath(); path(f);
    ctx.fillStyle = landColor(f.id ?? f.properties.name); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(235,245,255,.55)'; ctx.lineWidth = 1.6 * k;
  for (const f of countries) { ctx.beginPath(); path(f); ctx.stroke(); }
}

export function drawMask(canvas, numId) {
  const { width: W, height: H } = canvas;
  const ctx = canvas.getContext('2d');
  const path = geoPath(geoEquirectangular().fitExtent([[0, 0], [W, H]], { type: 'Sphere' }), ctx);
  ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const f = byId.get(numId);
  if (!f) return;
  // R=填充区域；G=描边（含外发光），着色器据此画勾边与光晕
  ctx.beginPath(); path(f); ctx.fillStyle = '#f00'; ctx.fill();
  // 无模糊：清晰细线，宽度随分辨率缩放
  ctx.lineJoin = 'round'; ctx.strokeStyle = '#0f0'; ctx.lineWidth = 4 * (W / 4096);
  ctx.beginPath(); path(f); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

/** 国家视图：质心（度）与包围盒跨度（度）。无几何返回 null。 */
/** 取国家的“主体”：去掉面积不足最大一块 0.5% 的远方小岛（澳大利亚的麦夸里岛、法国的海外领地碎片等），用于取景范围，避免主体被拉小、偏离中心。 */
export function mainFeature(f) {
  if (f.geometry.type !== 'MultiPolygon') return f;
  const a = f.geometry.coordinates.map((p) => geoArea({ type: 'Polygon', coordinates: p })), top = Math.max(...a);
  const keep = f.geometry.coordinates.filter((_, i) => a[i] >= top * 0.005);
  return keep.length === f.geometry.coordinates.length ? f : { type: 'Feature', id: f.id, properties: f.properties, geometry: { type: 'MultiPolygon', coordinates: keep } };
}
export function countryView(numId) {
  const f0 = byId.get(numId), f = f0 && mainFeature(f0);
  if (!f) return null;
  const [lon, lat] = geoCentroid(f);
  const [[w, s], [e, n]] = geoBounds(f);
  return { lon, lat, w, s, e: e < w ? e + 360 : e, n };
}

/** 经纬度命中哪个国家（只在给定的已配置国家集合内查找）。 */
export function hitCountry(lon, lat, ids) {
  for (const id of ids) { const f = byId.get(id); if (f && geoContains(f, [lon, lat])) return id; }
  return null;
}

// ---- 平面地图投影：墨卡托（等角，局部形状不拉伸、不扭曲；横向可无限左右拼接）----
export const FS = 0.78; // 平面地图缩放（单位球半径 = 1），3D 与 SVG 图层共用
const KM = 0.9, LATMAX = (80 * Math.PI) / 180; // 极区截断在 ±80°
export const FLAT_W = Math.PI * KM, FLAT_H = KM * Math.log(Math.tan(Math.PI / 4 + LATMAX / 2)); // 半宽、半高（单位球）
export function flatXY(lon, lat) {
  const p = Math.max(-LATMAX, Math.min(LATMAX, lat));
  return [KM * lon, KM * Math.log(Math.tan(Math.PI / 4 + p / 2))];
}
/** 平面坐标 → 经纬度（弧度）。x 超出一圈时按世界宽度折回（左右拼接）。 */
export function flatInv(x, y) {
  if (Math.abs(y) > FLAT_H) return null;
  const xw = x - 2 * FLAT_W * Math.round(x / (2 * FLAT_W));
  return [xw / KM, 2 * Math.atan(Math.exp(y / KM)) - Math.PI / 2];
}

/** 地图可用区域（像素）：左侧面板半透明压在上面，顶部留出顶栏。3D 俯冲收尾与局部 SVG 地图共用，保证对齐。 */
export function viewRect(W, H) {
  const x0 = W > 820 ? 140 : 12, y0 = 64, x1 = W - 24, y1 = H - 18;
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hw: (x1 - x0) / 2, hh: (y1 - y0) / 2 };
}
