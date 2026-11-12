// 离线优化 web/public/geo/**/*.json（几何文件不入库，可重复运行）：
// ① 逐多边形统一绕向（运行时不必再逐块算球面面积）；② Douglas–Peucker 折线简化（容差为度）；③ 压缩成单行；
// 处理过的文件带 "rewound":true，layers.js 见到就跳过运行时校正。
// 原件放在 data/private/geo-orig/（不入库）；每次都从原件重新生成，所以可以随时改容差再运行。首次运行会把当前 web/public/geo 当作原件备份。
// 用法：node scripts/optimize-geo.mjs [容差倍率，默认 1]
import { readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { geoArea } from 'd3-geo';

const ROOT = new URL('../web/public/geo/', import.meta.url);
const ORIG = new URL('../data/private/geo-orig/', import.meta.url);
const TOL = { jp: 0.00005, cn: 0, adm1: 0.003 }; // 度。jp／cn 带 OSM 瓦片底图，最大放大 1000% 时 1 像素约 0.00004°，所以 jp 取约 5 m、cn 不简化；adm1 无瓦片底图，约 300 m
const mul = Number(process.argv[2] || 1);
const inv = (p) => geoArea({ type: 'Polygon', coordinates: p }) > 2 * Math.PI;
const flip = (p) => p.map((r) => r.slice().reverse());
const fixPoly = (p) => (inv(p) ? flip(p) : p);

function rdp(pts, tol) {
  const n = pts.length, keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); if (b <= a + 1) continue;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    let m = -1, md = tol;
    for (let i = a + 1; i < b; i++) {
      const d = L < 1e-12 ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay) : Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / L;
      if (d > md) { md = d; m = i; }
    }
    if (m > 0) { keep[m] = 1; stack.push([a, m], [m, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// 闭合环：以最远点为界拆成两段分别简化，避免起点被强行保留成尖角。
// 简化后若环的球面面积变化超过 2%（或绕向被弄反：细长环简化后可能自交），就保留原环，宁可不简化也不能画错。
const ringArea = (r) => geoArea({ type: 'Polygon', coordinates: [r] });
function simpRing(r, tol) {
  if (r.length < 8 || tol === 0) return r;
  let k = 0, md = -1; for (let i = 1; i < r.length - 1; i++) { const d = Math.hypot(r[i][0] - r[0][0], r[i][1] - r[0][1]); if (d > md) { md = d; k = i; } }
  const q = [...rdp(r.slice(0, k + 1), tol), ...rdp(r.slice(k), tol).slice(1)];
  if (q.length < 4) return r;
  const a0 = ringArea(r), a1 = ringArea(q);
  return (a0 > 2 * Math.PI) === (a1 > 2 * Math.PI) && Math.abs(a1 - a0) <= 0.02 * Math.max(a0, 1e-12) ? q : r;
}
const simpPoly = (p, tol) => p.map((r, i) => { const q = simpRing(r, tol); return i === 0 || q.length >= 4 ? q : null; }).filter(Boolean);

if (!existsSync(ORIG)) { mkdirSync(ORIG, { recursive: true }); for (const d of ['jp', 'cn', 'adm1']) cpSync(new URL(`${d}/`, ROOT), new URL(`${d}/`, ORIG), { recursive: true }); }
let before = 0, after = 0;
for (const dir of ['jp', 'cn', 'adm1']) {
  for (const f of readdirSync(new URL(`${dir}/`, ROOT))) {
    if (!f.endsWith('.json')) continue;
    const u = new URL(`${dir}/${f}`, ROOT), raw = readFileSync(new URL(`${dir}/${f}`, ORIG), 'utf8'), fc = JSON.parse(raw);
    if (fc.type !== 'FeatureCollection') continue;
    const tol = TOL[dir] * mul;
    for (const ft of fc.features) {
      const g = ft.geometry; if (!g) continue;
      if (g.type === 'Polygon') g.coordinates = simpPoly(fixPoly(g.coordinates), tol);
      else g.coordinates = g.coordinates.map((p) => simpPoly(fixPoly(p), tol));
    }
    for (const ft of fc.features) if (ft.geometry && geoArea(ft) > 2 * Math.PI) throw new Error(`${dir}/${f} ${ft.properties?.name}：优化后绕向仍是反的，停止（不写入）`); // 自检：任何要素面积超过半个球面就是画错了
    fc.rewound = true;
    const out = JSON.stringify(fc); writeFileSync(u, out);
    before += raw.length; after += out.length;
  }
}
console.log(`几何文件 ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB`);
