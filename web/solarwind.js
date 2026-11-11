// 太阳风：持续向外传播的等离子体流（GPU 粒子 + 少量流束 + 极短拖尾），太阳近景与太阳系尺度共用一套实现。
// 70% 科学 + 30% 艺术：径向外流、带轻微偏转；若干方向上有稍亮稍快的“流束”（高速风偏冷蓝，慢速风偏暖白）；太阳系尺度可叠加少量帕克螺旋辅助线。
// 说明：粒子是示意——真实太阳风肉眼不可见，速度约 300–800 km/s，这里的流动速度是为观察而压缩的；帕克螺旋按“1 AU 处约 45°”的理想形状绘制。
// 低干扰：亮度远低于太阳本体；不画在日面正前方；在行星附近自动变淡；显示档位 关 / 标准 / 增强（设置面板与太阳页 HUD 共用）。
import { FX } from './fx.js';

export const SOLAR_WIND = {
  solarWindVisibility: 1, //        总可见度系数（0–1.5）
  solarWindDensityNear: 2600, //    太阳近景粒子数（增强档全部显示，标准档约 60%）
  solarWindDensityFar: 2200, //     太阳系尺度粒子数
  solarWindSpeed: 1, //             流动速度系数
  solarWindTailLength: 1, //        拖尾长度系数
  solarWindOpacity: 1, //           不透明度系数
  solarWindColorWarm: [1, 0.9, 0.72], // 慢速风：暖白/淡金白
  solarWindColorCool: [0.78, 0.88, 1], // 高速风：淡蓝白
  solarWindInterferenceReduction: 1, // 行星附近的避让强度（0–1）
  parkerSpiralEnabled: true,
  parkerSpiralOpacity: 0.07,
  parkerSpiralCount: 4,
};

const VS = /* glsl */ `attribute vec3 aDir; attribute float aSeed; attribute float aPh; attribute float aStream; attribute float aEnd;
uniform float uT; uniform float uR0; uniform float uR1; uniform float uSpeed; uniform float uMap; uniform float uSize; uniform float uPR; uniform float uTail; uniform float uOcc; uniform float uOp; uniform float uCurl; uniform float uInt; uniform float uPlR;
uniform vec3 uWarm; uniform vec3 uCool; uniform vec3 uPl[8]; varying vec3 vC; varying float vA;
void main(){
  float f=fract(aPh+uT*uSpeed*(.55+.5*aSeed+.6*aStream)), ft=f-aEnd*uTail*(.6+aStream); float valid=step(0.,ft); ft=max(ft,0.);
  float x=mix(uR0,uR1,ft), rad=uMap<.5?1.15*sqrt(x)+.1:(uMap<1.5?.2*x:x);   // 太阳系：展示比例（平方根压缩）/ 真实距离比例；近景：直接用半径
  float ang=uCurl*ft, cs=cos(ang), sn=sin(ang); vec3 d=vec3(aDir.x*cs-aDir.z*sn,aDir.y,aDir.x*sn+aDir.z*cs); vec3 pos=d*rad;
  vec4 wp=modelMatrix*vec4(pos,1.), mv=viewMatrix*wp;
  float a=smoothstep(0.,.06,ft)*(1.-smoothstep(.65,1.,ft))*valid;
  vec3 cen=modelMatrix[3].xyz; float Rw=uOcc*length(modelMatrix[0].xyz); vec3 rd=normalize(wp.xyz-cameraPosition); float tc=dot(cen-cameraPosition,rd); float b=length(cameraPosition+rd*tc-cen);
  a*=mix(1.,smoothstep(1.,1.3,b/Rw),step(distance(cameraPosition,wp.xyz),tc));   // 不画在日面正前方
  for(int i=0;i<8;i++) a*=mix(1.,smoothstep(uPlR*.35,uPlR,distance(pos,uPl[i])),uInt); // 行星附近变淡
  a*=(.45+.9*aStream)*(1.-.55*aEnd);
  vC=mix(uWarm,uCool,clamp(aStream*.85+aSeed*.15,0.,1.)); vA=a*uOp;
  gl_PointSize=clamp(uSize*uPR*(7./max(-mv.z,.1))*(.7+.6*aSeed),1.6,9.); gl_Position=projectionMatrix*mv; }`;
const FS_P = /* glsl */ `varying vec3 vC; varying float vA; uniform float uA; void main(){ float d=length(gl_PointCoord-.5); float a=exp(-d*d*16.)-.03; gl_FragColor=vec4(vC,max(a,0.)*vA*uA); }`;
const FS_L = /* glsl */ `varying vec3 vC; varying float vA; uniform float uA; void main(){ gl_FragColor=vec4(vC,vA*uA*.7); }`;

/** cfg: { n, r0, r1, map(0 展示/1 真实/2 直接), size, speed, tail, opacity, flat(纬向压扁 0–1), occ(日面半径), curl, planets(bool), seed } */
export function createSolarWind(kit, cfg) {
  const { THREE, V, rng, gauss, smat } = kit, r = rng(cfg.seed || 77), N = cfg.n;
  const axes = Array.from({ length: 7 }, () => V(gauss(r), gauss(r) * cfg.flat, gauss(r)).normalize()); // 7 个流束方向
  const mk = (count, verts) => {
    const dir = new Float32Array(count * verts * 3), seed = new Float32Array(count * verts), ph = new Float32Array(count * verts), st = new Float32Array(count * verts), end = new Float32Array(count * verts);
    for (let i = 0; i < count; i++) {
      const inStream = r() < 0.3, ax = axes[Math.floor(r() * axes.length)], d = inStream ? ax.clone().add(V(gauss(r), gauss(r), gauss(r)).multiplyScalar(0.12)).normalize() : V(gauss(r), gauss(r) * cfg.flat, gauss(r)).normalize();
      const s = Math.max(...axes.map((a) => Math.min(1, Math.max(0, (a.dot(d) - 0.9) / 0.09)))), sd = r(), p = r();
      for (let v = 0; v < verts; v++) { const k = i * verts + v; dir.set([d.x, d.y, d.z], k * 3); seed[k] = sd; ph[k] = p; st[k] = s; end[k] = v; }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * verts * 3), 3)); g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1)); g.setAttribute('aStream', new THREE.BufferAttribute(st, 1)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1)); return g;
  };
  const U = { uT: { value: 0 }, uR0: { value: cfg.r0 }, uR1: { value: cfg.r1 }, uSpeed: { value: cfg.speed }, uMap: { value: cfg.map }, uSize: { value: cfg.size }, uPR: { value: 1 }, uTail: { value: cfg.tail }, uOcc: { value: cfg.occ }, uOp: { value: cfg.opacity }, uCurl: { value: cfg.curl }, uInt: { value: cfg.planets ? 1 : 0 }, uPlR: { value: 0.55 },
    uWarm: { value: new THREE.Color(...SOLAR_WIND.solarWindColorWarm) }, uCool: { value: new THREE.Color(...SOLAR_WIND.solarWindColorCool) }, uPl: { value: Array.from({ length: 8 }, () => V(999, 999, 999)) } };
  const pm = smat(VS, FS_P, U, { blending: THREE.AdditiveBlending }); pm.uniforms = { ...pm.uniforms, ...U };
  const pg = mk(N, 1), pts = new THREE.Points(pg, pm); pts.frustumCulled = false; // 只保留光点粒子；带拖尾的流线（线段）已移除
  const group = new THREE.Group(); group.add(pts);
  let clock = 0, last = 0;
  const update = (t, { pr = 1, map, planets, sunR } = {}) => {
    const dt = Math.min(0.1, Math.max(0, t - last)); last = t; clock += dt * SOLAR_WIND.solarWindSpeed; U.uT.value = clock; U.uPR.value = pr;
    const lv = FX.wind ?? 1, sci = FX.mode === 'sci'; group.visible = lv > 0;
    pg.setDrawRange(0, Math.floor(N * (lv === 2 ? 1 : 0.6)));
    U.uOp.value = cfg.opacity * SOLAR_WIND.solarWindOpacity * SOLAR_WIND.solarWindVisibility * (lv === 2 ? 1.35 : 1) * (sci ? 0.85 : 1);
    U.uTail.value = cfg.tail * SOLAR_WIND.solarWindTailLength * (lv === 2 ? 1.4 : 1); U.uInt.value = cfg.planets ? SOLAR_WIND.solarWindInterferenceReduction : 0;
    if (map !== undefined) U.uMap.value = map; if (sunR !== undefined) U.uOcc.value = sunR;
    if (planets) planets.forEach((p, i) => U.uPl.value[i].copy(p));
  };
  return { group, update };
}

/** 帕克螺旋辅助线（黄道面内）：φ = φ0 − r（r 以 AU 计，1 AU 处约 45°）。fd(rAU) 给出显示半径。 */
export function createParkerSpirals(kit, fd) {
  const { THREE, V, TAU } = kit, g = new THREE.Group(), n = SOLAR_WIND.parkerSpiralCount;
  for (let k = 0; k < n; k++) { const pts = []; for (let i = 0; i <= 160; i++) { const rr = 0.15 + (i / 160) ** 1.4 * 10, // 只画到约 10 AU（约一圈半），避免缠满整个太阳系
       ph = (k / n) * TAU - rr, R = fd(rr); pts.push(V(Math.cos(ph) * R, 0, -Math.sin(ph) * R)); }
    const m = new THREE.LineBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: SOLAR_WIND.parkerSpiralOpacity, depthWrite: false, blending: THREE.AdditiveBlending }); m.userData.base = SOLAR_WIND.parkerSpiralOpacity; g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), m)); }
  return g;
}
