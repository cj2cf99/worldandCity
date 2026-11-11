// 指定地区的“现势地图”底图：把 OpenStreetMap 标准栅格瓦片嵌进局部地图（在轮廓图形下面，随缩放／平移一起动）。
// 瓦片是浏览器按需加载的普通地图图片，不进仓库；© OpenStreetMap contributors（ODbL／CC BY-SA）。
// 中国的行政区轮廓来自高德（GCJ-02 坐标），OSM 瓦片是 WGS84：放置瓦片时把四角换算成 GCJ-02 再投影，二者才对得上。
export const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
// 启用底图的节点：值为 null＝用该节点自己轮廓的范围；数组＝手工给定范围 [西, 南, 东, 北]（没有自己轮廓的日本市）
export const TILE_NODES = {
  'geo.cn-610400': null, 'geo.cn-610426': null, 'geo.cn-610423': null,                                                                                         // 咸阳市、永寿县、泾阳县
  'geo.cn-sn-xa': null, 'geo.cn-610102': null, 'geo.cn-610103': null, 'geo.cn-610104': null, 'geo.cn-610111': null, 'geo.cn-sn-xa-wy': null, 'geo.cn-610113': null, 'geo.cn-610117': null, // 西安市及 7 区
  'geo.cn-320200': null, 'geo.cn-320205': null, 'geo.cn-320206': null, 'geo.cn-320211': null, 'geo.cn-320213': null, 'geo.cn-320214': null, 'geo.cn-320281': null, 'geo.cn-320282': null, // 无锡市及各区
  'geo.cn-150100': null, 'geo.cn-150102': null, 'geo.cn-150103': null, 'geo.cn-150104': null, 'geo.cn-150105': null, 'geo.cn-150121': null, 'geo.cn-150122': null, 'geo.cn-150123': null, 'geo.cn-150124': null, 'geo.cn-150125': null, // 呼和浩特市及各区县旗
  // 日本：埼玉市（含川口、浦和一带）、东京（全都的本岛部分）、福冈市、北九州（含对岸的下关）；其余埼玉／东京／福冈／山口的市区町村用自己的轮廓范围（见 tileFor）
  'geo.jp-11-saitama': [139.5, 35.76, 139.86, 36.0], 'geo.jp-13': [138.9, 35.45, 139.95, 35.92], 'geo.jp-40-kitakyushu': [130.5, 33.7, 131.22, 34.12], 'geo.jp-40-fukuoka': [130.2, 33.45, 130.62, 33.76],
  'geo.jp-11': null, 'geo.jp-40': null, 'geo.jp-35': null, 'geo.jp-35-shimonoseki': null,
};
const A = 6378245.0, EE = 0.00669342162296594323, PI = Math.PI;
const tLat = (x, y) => { let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x)); r += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3; r += ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3; r += ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3; return r; };
const tLon = (x, y) => { let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x)); r += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3; r += ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3; r += ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x / 30) * PI)) * 2) / 3; return r; };
/** WGS84 → GCJ-02（标准的公开近似算法；只对中国境内使用）。 */
export function wgs2gcj(lon, lat) {
  const dLat0 = tLat(lon - 105, lat - 35), dLon0 = tLon(lon - 105, lat - 35), rad = (lat / 180) * PI;
  let magic = Math.sin(rad); magic = 1 - EE * magic * magic; const sq = Math.sqrt(magic);
  return [lon + (dLon0 * 180) / ((A / sq) * Math.cos(rad) * PI), lat + (dLat0 * 180) / (((A * (1 - EE)) / (magic * sq)) * PI)];
}
const lonOf = (x, z) => (x / 2 ** z) * 360 - 180, latOf = (y, z) => (Math.atan(Math.sinh(PI * (1 - (2 * y) / 2 ** z))) * 180) / PI;
const tileX = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z), tileY = (lat, z) => Math.floor(((1 - Math.log(Math.tan((lat * PI) / 180) + 1 / Math.cos((lat * PI) / 180)) / PI) / 2) * 2 ** z);
/** 覆盖 bbox（四周放宽 25%）的瓦片清单：{ z, tiles:[{x,y,z}] }；瓦片数过多时自动降一级。 */
export function tilesFor([w, s, e, n]) {
  const px = (e - w) * 0.25, py = (n - s) * 0.25; w -= px; e += px; s -= py; n += py;
  let z = Math.min(17, Math.max(3, Math.ceil(Math.log2((5 * 360) / (e - w)))));
  for (;;) {
    const x0 = tileX(w, z), x1 = tileX(e, z), y0 = tileY(n, z), y1 = tileY(s, z), cnt = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (cnt > 80 && z > 3) { z--; continue; }
    const tiles = []; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push({ x, y, z }); return { z, tiles };
  }
}
/** 瓦片四角的经纬度（西北、东北、西南）；gcj＝true 时换算成 GCJ-02。 */
export function tileCorners({ x, y, z }, gcj) {
  const p = (lo, la) => (gcj ? wgs2gcj(lo, la) : [lo, la]);
  return { nw: p(lonOf(x, z), latOf(y, z)), ne: p(lonOf(x + 1, z), latOf(y, z)), sw: p(lonOf(x, z), latOf(y + 1, z)) };
}
/** 指定缩放级 z 下覆盖 bbox 的瓦片；超过 80 块时自动降一级。 */
export function tilesAt([w, s, e, n], z) {
  z = Math.min(18, Math.max(3, z));
  for (;;) {
    const x0 = tileX(w, z), x1 = tileX(e, z), y0 = tileY(n, z), y1 = tileY(s, z), cnt = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (cnt > 80 && z > 3) { z--; continue; }
    const tiles = []; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push({ x, y, z }); return { z, tiles };
  }
}
/** 选瓦片级别：让每块瓦片在屏幕上至少约 340 像素宽（OSM 瓦片里的街道、地名文字约 11～12 像素，放大到 1.3 倍以上，地图上的字才不小于导航菜单的 13 像素）。viewLonSpan＝屏幕宽度对应的经度跨度，W＝屏幕宽度（像素）。 */
export const MIN_TILE_PX = 340;
export const zoomForView = (viewLonSpan, W) => Math.floor(Math.log2(((W / MIN_TILE_PX) * 360) / Math.max(1e-6, viewLonSpan)));
/** 节点是否启用底图：undefined＝否；null＝用自己轮廓的范围；数组＝手工范围。日本埼玉／东京／福冈／山口下关的各市区町村、西安市（6101xx）的全部区县按编号自动启用。 */
export const tileFor = (id) => (id in TILE_NODES ? TILE_NODES[id] : /^geo\.jp-(11|13|40)(\d{3}|-)/.test(id) || /^geo\.cn-6101\d\d$/.test(id) ? null : undefined);
