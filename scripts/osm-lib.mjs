// OpenStreetMap Overpass 客户端与关系（multipolygon）环拼接：供 scripts/fetch-osm-detail.mjs 使用。
// 数据许可 ODbL（© OpenStreetMap contributors）；几何文件只放 web/public/geo/（不入库）。
import { setTimeout as sleep } from 'node:timers/promises';
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const UA = 'geo-explorer-dev/1.0 (local development tool)';

/** 带退避重试与镜像轮换的 Overpass 查询；返回解析后的 JSON。 */
export async function overpass(query, { tries = 8, timeoutMs = 240000 } = {}) {
  let wait = 8000;
  for (let i = 0; i < tries; i++) {
    const url = ENDPOINTS[i % ENDPOINTS.length];
    try {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), timeoutMs);
      const res = await fetch(url, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: 'data=' + encodeURIComponent(query), signal: ctl.signal });
      clearTimeout(tm);
      if (res.ok) { const text = await res.text(); try { return JSON.parse(text); } catch { /* 返回了非 JSON（服务器繁忙提示）：重试 */ } }
    } catch { /* 超时／网络错误：重试 */ }
    await sleep(wait); wait = Math.min(wait * 1.7, 90000);
  }
  throw new Error('Overpass 查询多次失败（服务器繁忙），稍后重试：' + query.split('\n')[1]);
}

const eq = (a, b) => a[0] === b[0] && a[1] === b[1];
function stitch(ways) { // 把首尾相接的路径拼成闭合环
  const pool = ways.filter((w) => w.length >= 2).map((w) => w.slice()), rings = [];
  while (pool.length) {
    const ring = pool.pop();
    for (let guard = 0; !eq(ring[0], ring.at(-1)) && guard < 100000; guard++) {
      const end = ring.at(-1); let k = -1, rev = false;
      for (let i = 0; i < pool.length; i++) { if (eq(pool[i][0], end)) { k = i; break; } if (eq(pool[i].at(-1), end)) { k = i; rev = true; break; } }
      if (k < 0) break;
      const w = pool.splice(k, 1)[0]; if (rev) w.reverse(); ring.push(...w.slice(1));
    }
    if (eq(ring[0], ring.at(-1)) && ring.length >= 4) rings.push(ring);
  }
  return rings;
}
const inRing = (pt, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };

/** Overpass `out geom` 的关系 → GeoJSON Polygon／MultiPolygon（拼不成环的返回 null）。 */
export function relationGeometry(rel) {
  if (!rel.members) return null;
  const way = (role) => rel.members.filter((m) => m.type === 'way' && (m.role === role || (role === 'outer' && m.role === '')) && m.geometry).map((m) => m.geometry.map((p) => [p.lon, p.lat]));
  const outers = stitch(way('outer')), inners = stitch(way('inner'));
  if (!outers.length) return null;
  const polys = outers.map((o) => [o]);
  for (const ih of inners) { const home = polys.find((p) => inRing(ih[0], p[0])); if (home) home.push(ih); }
  return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
}
