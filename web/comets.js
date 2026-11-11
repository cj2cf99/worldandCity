// 三颗代表性彗星的轨道（J2000 黄道坐标，单位 AU / 年）。根数取自常见文献（JPL SBDB 一类来源的近似值，未现场对照 Horizons，机器无法联网）：
// a 半长轴、e 偏心率、i 倾角（°，哈雷 >90° 即逆行）、O 升交点黄经、w 近日点幅角、tp 过近日点时刻（距 J2000.0 的年数）。
// 位置用二体开普勒近似推进：距历元越远误差越大（行星摄动、非引力效应未计）；不是 Horizons 星历，不能当作精确回放。
const TAU = Math.PI * 2, D = Math.PI / 180;
export const GM = 4 * Math.PI * Math.PI; // AU³/年²
export const COMETS = [
  { id: 'cel.halley', name: '哈雷彗星', a: 17.834, e: 0.96714, i: 162.26, O: 58.42, w: 111.33, tp: -13.892, rAct: 6, act: 1, ion: 1.0, dust: 0.9, beta: 0.25, tag: '会飞回来：约 76 年一圈，逆着行星公转方向（下次近日点约 2061 年）' },
  { id: 'cel.hale-bopp', name: '海尔-波普彗星', a: 185.9, e: 0.99511, i: 89.43, O: 282.47, w: 130.59, tp: -2.752, rAct: 9, act: 1.4, ion: 1.3, dust: 1.5, beta: 0.35, tag: '会飞回来：约 2,500 年一圈，轨道几乎垂直于行星轨道面' },
  { id: 'cel.67p', name: '67P/丘留莫夫-格拉西缅科', a: 3.457, e: 0.6405, i: 7.04, O: 50.14, w: 12.78, tp: 15.614, rAct: 3.8, act: 0.7, ion: 0.5, dust: 0.6, beta: 0.15, tag: '短周期彗星：约 6.4 年一圈，罗塞塔号 2014–2016 年伴飞' },
];
export const cometPos = (c, yr) => {
  const n = TAU / Math.pow(c.a, 1.5), M = (((n * (yr - c.tp)) % TAU) + TAU) % TAU; let E = c.e > 0.8 ? Math.PI : M;
  for (let k = 0; k < 40; k++) E -= (E - c.e * Math.sin(E) - M) / (1 - c.e * Math.cos(E));
  const xp = c.a * (Math.cos(E) - c.e), yp = c.a * Math.sqrt(1 - c.e * c.e) * Math.sin(E), w = c.w * D, O = c.O * D, i = c.i * D;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i);
  return [(cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp, (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp, sw * si * xp + cw * si * yp];
};
export const cometVel = (c, yr) => { const h = 1e-3, p0 = cometPos(c, yr), p1 = cometPos(c, yr + h); return [(p1[0] - p0[0]) / h, (p1[1] - p0[1]) / h, (p1[2] - p0[2]) / h]; }; // AU/年
// 尘埃粒子相对彗核的位移：粒子在 yr−dl 时刻以彗核速度释放，受 (1−β) 倍太阳引力（辐射压）积分到 yr；与 β=0 的积分之差再加到彗核上，得到向后弯曲的尘埃尾
export const dustDelta = (c, yr, dl, beta) => {
  const x0 = cometPos(c, yr - dl), v0 = cometVel(c, yr - dl), S = 10, h = dl / S, run = (b) => {
    const x = x0.slice(), u = v0.slice();
    for (let s = 0; s < S; s++) { const r2 = x[0] * x[0] + x[1] * x[1] + x[2] * x[2], k = (-(1 - b) * GM) / (r2 * Math.sqrt(r2)); for (let j = 0; j < 3; j++) { u[j] += k * x[j] * h; x[j] += u[j] * h; } }
    return x;
  }, a = run(beta), b0 = run(0);
  return [a[0] - b0[0], a[1] - b0[1], a[2] - b0[2]];
};
