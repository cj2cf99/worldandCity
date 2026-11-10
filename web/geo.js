// 底图数据与投影工具。内部数据始终为经纬度（设计 §8.2）；Mollweide 只在渲染层使用，最终投影未锁定，可替换。
import { feature } from 'topojson-client';
import { geoEquirectangular, geoPath, geoContains, geoCentroid, geoBounds, geoGraticule10 } from 'd3-geo';
import topo from 'world-atlas/countries-50m.json';

// 底图：world-atlas（Natural Earth 派生），来源登记于 web/SOURCES.md。去掉南极洲以保持展平后的轮廓整洁。
export const countries = feature(topo, topo.objects.countries).features.filter((f) => f.id !== '010');
// 节点 code(ISO 3166-1 alpha-2) → 底图数字编码；随种子国家增加而补充。
export const ISO2_TO_NUM = { CN: '156', FR: '250' };
const byId = new Map(countries.map((f) => [f.id, f]));

const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** 现实系配色：自然、低饱和的绿／沙／赭，按国家编码稳定取色。 */
function landColor(id) {
  const h = hash(String(id ?? ""));
  const hue = [95, 110, 75, 130, 48, 36][h % 6];
  return `hsl(${hue} ${28 + (h >> 3) % 14}% ${34 + (h >> 5) % 14}%)`;
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
export function countryView(numId) {
  const f = byId.get(numId);
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

// ---- Mollweide（两端窄、中间宽）----
export const FS = 0.78; // 平面地图缩放（单位球半径 = 1），3D 与 SVG 图层共用
export const MOLL_W = 2 * Math.SQRT2, MOLL_H = Math.SQRT2; // 半宽、半高（单位球）
export function mollweide(lon, lat) {
  let th = lat;
  for (let i = 0; i < 12 && Math.abs(Math.abs(lat) - Math.PI / 2) > 1e-6; i++) {
    const d = (2 * th + Math.sin(2 * th) - Math.PI * Math.sin(lat)) / (2 + 2 * Math.cos(2 * th));
    th -= d;
    if (Math.abs(d) < 1e-9) break;
  }
  if (Math.abs(Math.abs(lat) - Math.PI / 2) <= 1e-6) th = Math.sign(lat) * Math.PI / 2;
  return [(MOLL_W / Math.PI) * lon * Math.cos(th), MOLL_H * Math.sin(th)];
}
export function mollweideInv(x, y) {
  const s = y / MOLL_H;
  if (Math.abs(s) > 1) return null;
  const th = Math.asin(s);
  const lat = Math.asin((2 * th + Math.sin(2 * th)) / Math.PI);
  const lon = (Math.PI * x) / (MOLL_W * Math.cos(th));
  return Math.abs(lon) <= Math.PI ? [lon, lat] : null;
}

/** 地图可用区域（像素）：左侧面板半透明压在上面，顶部留出顶栏。3D 俯冲收尾与局部 SVG 地图共用，保证对齐。 */
export function viewRect(W, H) {
  const x0 = W > 820 ? 140 : 12, y0 = 64, x1 = W - 24, y1 = H - 18;
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hw: (x1 - x0) / 2, hh: (y1 - y0) / 2 };
}
