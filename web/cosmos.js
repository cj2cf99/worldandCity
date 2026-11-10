// 宇宙系场景（PRD §3.1、§6）。天体走写实风格（程序生成材质，无外部素材），整体按“天文科普插图”处理：明亮、通透、星点大而柔、带标注。
// 距离与比例以画面表现优先，不是真实比例。每个层级各有独立的模型（按需构建，进入该级附近才生成）。
// 十八个层级放在同一条尺度轴上做“十的幂”式推拉：层级 d 与当前聚焦 L 相差越远，越小、越淡（相邻单位尺度差 SCALE 倍）。
// 本模块不依赖地球场景（globe.js／geo.js／layers.js）：进入宇宙系后地球侧可整体释放。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createModels } from './cosmos-models.js';

const TAU = Math.PI * 2, SCALE = 6, DUR = 2.2; // 层级切换 2.2 秒（项目规范 1–3 秒）
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const gauss = (r) => (r() + r() + r() + r() - 2) / 0.577;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------- GLSL ----------------
const NOISE = /* glsl */ `
float h3(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*n3(p);p=p*2.03+1.7;a*=.5;}return s;}
vec3 h33(vec3 p){return fract(sin(vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6))))*43758.5453);}
float crater(vec3 p){
  vec3 i=floor(p),f=fract(p); float m=0.;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){
    vec3 g=vec3(float(x),float(y),float(z)); vec3 o=h33(i+g); float rr=.2+.28*h33(i+g+7.).x; float d=length(g+o-f)/rr;
    m+=-smoothstep(1.,0.,d)*.9+smoothstep(.72,1.,d)*smoothstep(1.35,1.,d)*.55; }
  return m;}`;

const SPHERE_VS = /* glsl */ `
varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec3 vL; uniform vec3 uSunW;
void main(){ vP=position; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=-mv.xyz;
  vL=normalize((viewMatrix*vec4(uSunW,1.)).xyz-mv.xyz); gl_Position=projectionMatrix*mv; }`;

const AMB = '.09'; // 暗面环境光：科普插图里暗面也要看得清
const PLANET_FS = /* glsl */ `${NOISE}
varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec3 vL;
uniform vec3 uC1; uniform vec3 uC2; uniform float uMode; uniform float uBand; uniform float uWarp; uniform float uCrat; uniform float uTime; uniform float uA;
void main(){
  vec3 p=normalize(vP); float k;
  if(uMode<.5){ float w=fbm(p*3.+uTime*.004)*uWarp; k=.5+.5*sin(p.y*uBand+w*6.); k=mix(k,fbm(p*5.),.18); }
  else if(uMode<1.5){ k=fbm(p*4.+uTime*.003); }
  else { k=smoothstep(.45,.58,fbm(p*2.2+4.)); }
  vec3 col=mix(uC1,uC2,k)*(.88+.24*fbm(p*16.));
  if(uCrat>0.){ float c=crater(p*3.)*.6+crater(p*9.)*.32; col*=1.+c*uCrat; }
  vec3 n=normalize(vN); float d=max(dot(n,normalize(vL)),0.);
  col*=${AMB}+1.1*pow(d,.8);
  col+=pow(1.-max(dot(n,normalize(vV)),0.),3.)*uC2*.2;
  gl_FragColor=vec4(col,uA);
}`;

const EARTH_FS = /* glsl */ `${NOISE}
varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec3 vL; uniform float uTime; uniform float uA;
void main(){
  vec3 p=normalize(vP); float a=uTime*.04; vec3 q=vec3(p.x*cos(a)-p.z*sin(a),p.y,p.x*sin(a)+p.z*cos(a));
  float h=fbm(q*2.3+3.), land=smoothstep(.5,.54,h);
  vec3 ocean=mix(vec3(.02,.1,.28),vec3(.05,.3,.55),smoothstep(.3,.5,h));
  vec3 lc=mix(vec3(.14,.34,.1),vec3(.58,.48,.28),smoothstep(.54,.72,fbm(q*5.))); lc=mix(lc,vec3(.68,.6,.42),smoothstep(.55,.2,abs(q.y))*.25*smoothstep(.52,.7,fbm(q*3.+9.)));
  lc=mix(lc,vec3(.94,.96,.99),smoothstep(.82,.93,abs(q.y)+(h-.5)*.2));
  vec3 col=mix(ocean,lc,land);
  vec3 n=normalize(vN),v=normalize(vV),L=normalize(vL); float d=max(dot(n,L),0.);
  float cl=smoothstep(.52,.78,fbm(q*3.2+vec3(uTime*.012,0.,0.)));
  vec3 day=col*(1.-cl*.5)+vec3(.86,.88,.92)*cl*.7;
  float spec=pow(max(dot(reflect(-L,n),v),0.),70.)*(1.-land)*(1.-cl)*.45;
  float night=1.-smoothstep(0.,.18,dot(n,L));
  vec3 lights=vec3(1.,.72,.35)*land*smoothstep(.62,.8,fbm(q*26.))*night*.9*(1.-cl*.8);
  vec3 c=day*(${AMB}+1.0*pow(d,.75))+spec+lights;
  float rim=pow(1.-max(dot(n,v),0.),3.); c+=rim*vec3(.28,.55,1.)*(.3+d*.7);
  float term=smoothstep(.0,.25,d)*(1.-smoothstep(.25,.6,d)); c+=term*rim*vec3(1.,.5,.25)*.35;
  gl_FragColor=vec4(c,uA);
}`;

const ATMO_FS = /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec3 vL; uniform float uA; uniform vec3 uCol;
void main(){ vec3 n=normalize(vN),v=normalize(vV); float f=pow(clamp(.72-dot(n,v),0.,1.),2.4); float lit=.3+.7*smoothstep(-.2,.5,dot(normalize(vL),n));
  gl_FragColor=vec4(uCol*f*1.8*lit,f*lit*uA); }`;

const SUN_FS = /* glsl */ `${NOISE}
varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec3 vL; uniform float uTime; uniform float uA;
void main(){
  vec3 p=normalize(vP); vec3 n=normalize(vN),v=normalize(vV);
  float g=fbm(p*9.+vec3(0.,uTime*.07,0.))*.6+fbm(p*22.-uTime*.05)*.4;
  float spots=smoothstep(.64,.72,fbm(p*3.5-uTime*.01));
  vec3 col=mix(vec3(1.,.45,.08),vec3(1.,.92,.6),g); col=mix(col,vec3(.3,.1,.03),spots*.7);
  float limb=pow(max(dot(n,v),0.),.55); col*=(.5+.6*limb)*1.5;
  gl_FragColor=vec4(col,uA);
}`;

const GLOW_VS = /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const GLOW_FS = /* glsl */ `varying vec2 vUv; uniform vec3 uCol; uniform float uK; uniform float uA;
void main(){ float d=length(vUv-.5)*2.; float a=pow(max(1.-d,0.),uK); gl_FragColor=vec4(uCol*a,a*uA); }`;

const RING_VS = `varying vec3 vPos; void main(){ vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const RING_FS = /* glsl */ `varying vec3 vPos; uniform float uA; uniform float uIn; uniform float uOut;
float h(float x){return fract(sin(x*127.1)*43758.5453);}
void main(){ float r=(length(vPos.xz)-uIn)/(uOut-uIn);
  float b=.55+.25*sin(r*60.)+.2*sin(r*23.+2.)+.25*(h(floor(r*90.))-.5);
  float gap=smoothstep(.0,.03,abs(r-.62)-.035); float edge=smoothstep(0.,.04,r)*smoothstep(1.,.95,r);
  vec3 c=mix(vec3(.6,.52,.4),vec3(.92,.84,.68),b); gl_FragColor=vec4(c*(.5+.7*b),b*.85*gap*edge*uA); }`;

// 点：更大更柔（高斯光斑），最小 3.2px 并按面积补偿亮度，避免亚像素闪烁
const POINTS_VS = /* glsl */ `attribute float aS; attribute vec3 aC; uniform float uPR; uniform float uSize; varying vec3 vC; varying float vF;
void main(){ vC=aC; vec4 mv=modelViewMatrix*vec4(position,1.);
  float raw=aS*uSize*uPR*1.7*(8./max(-mv.z,.1)), sz=clamp(raw,3.2*uPR,64.);
  gl_PointSize=sz; float k=clamp(raw/sz,0.,1.); vF=k*k*.85+.15; gl_Position=projectionMatrix*mv; }`;
const POINTS_FS = /* glsl */ `varying vec3 vC; varying float vF; uniform float uA;
void main(){ float d=length(gl_PointCoord-.5); float a=exp(-d*d*18.)-.02; a=max(a,0.); gl_FragColor=vec4(vC*1.5,a*uA*vF); }`;

const NEBULA = {
  vs: `varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fs: `${NOISE} varying vec3 vDir; uniform float uTime; uniform float uBand;
  void main(){ vec3 d=normalize(vDir);
    vec3 bn=normalize(vec3(.35,.82,.45)); float band=exp(-pow(dot(d,bn)/.15,2.))*uBand;
    float dust=fbm(d*5.+vec3(0.,uTime*.002,0.)), cloud=fbm(d*2.2+3.);
    vec3 col=vec3(.003,.005,.014)+vec3(.005,.008,.022)*fbm(d*1.6+1.);
    col+=band*(vec3(.55,.46,.36)*(.08+.3*smoothstep(.35,.75,dust))+vec3(.12,.18,.4)*cloud*.25);
    col+=vec3(.07,.035,.11)*pow(cloud,3.)*.5*uBand;
    gl_FragColor=vec4(col,1.); }`,
};

// ---------------- 材质与几何助手 ----------------
const T = { uTime: { value: 0 } };
const smat = (vs, fs, uniforms = {}, o = {}) => new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, uniforms: { uTime: T.uTime, uA: { value: 1 }, ...uniforms }, ...o });
const sphereMat = (fs, sun, extra = {}) => smat(SPHERE_VS, fs, { uSunW: { value: sun }, ...extra });
const planetMat = (sun, c1, c2, mode, band = 0, warp = 0, crat = 0) => sphereMat(PLANET_FS, sun, { uC1: { value: new THREE.Color(...c1) }, uC2: { value: new THREE.Color(...c2) }, uMode: { value: mode }, uBand: { value: band }, uWarp: { value: warp }, uCrat: { value: crat } });
const sphere = (r, m, seg = 64) => new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg / 2 | 0), m);
const lineMat = (c, o) => { const m = new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending }); m.userData.base = o; return m; };
const circle = (r, n = 160) => { const p = []; for (let i = 0; i < n; i++) p.push(V(Math.cos((i / n) * TAU) * r, 0, Math.sin((i / n) * TAU) * r)); return new THREE.BufferGeometry().setFromPoints(p); };
function setAlpha(g, w) { g.visible = w > 0.01; g.traverse((o) => { const m = o.material; if (!m) return; if (m.uniforms?.uA) m.uniforms.uA.value = w; else m.opacity = (m.userData.base ?? 1) * w; }); }
function pointsOf(arr, size, uPR) {
  const pos = new Float32Array(arr.length * 3), s = new Float32Array(arr.length), c = new Float32Array(arr.length * 3);
  arr.forEach((a, i) => { pos.set(a.p, i * 3); s[i] = a.s; c.set(a.c, i * 3); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.BufferAttribute(s, 1)); g.setAttribute('aC', new THREE.BufferAttribute(c, 3));
  const pts = new THREE.Points(g, smat(POINTS_VS, POINTS_FS, { uPR: { value: uPR }, uSize: { value: size } }, { blending: THREE.AdditiveBlending })); pts.frustumCulled = false; return pts;
}
const glow = (col, k, size) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), smat(GLOW_VS, GLOW_FS, { uCol: { value: new THREE.Color(...col) }, uK: { value: k } }, { blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); m.scale.setScalar(size); m.userData.billboard = true; return m; };
const starColor = (r) => { const t = r(); return t < 0.12 ? [0.6, 0.74, 1] : t < 0.55 ? [1, 0.97, 0.92] : t < 0.85 ? [1, 0.85, 0.6] : [1, 0.62, 0.42]; };
const blob = (arr, r, c, n, sx, sy, sz, col, s0 = 0.3, s1 = 0.5) => { for (let i = 0; i < n; i++) arr.push({ p: [c[0] + gauss(r) * sx, c[1] + gauss(r) * sy, c[2] + gauss(r) * sz], s: s0 + r() * s1, c: col }); };
const labels = (g, list) => { g.userData.labels = list.map(([p, text]) => ({ p: V(...p), text })); };
function miniGalaxy(arr, r, c, R, tilt) {
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  for (let i = 0; i < 3500; i++) {
    const rr = Math.pow(r(), 0.6) * R, th = Math.floor(r() * 2) * Math.PI + Math.log(1 + (rr / R) * 6) * 2.6 + gauss(r) * 0.22;
    const x = Math.cos(th) * rr, y = gauss(r) * R * 0.04, z = Math.sin(th) * rr, warm = Math.exp(-rr / (R * 0.3));
    arr.push({ p: [c[0] + x, c[1] + y * ct - z * st, c[2] + y * st + z * ct], s: 0.3 + r() * 0.45, c: [0.75 + warm * 0.25, 0.8 + warm * 0.1, 1 - warm * 0.4].map((v) => v * (0.5 + 0.5 * (1 - rr / R))) });
  }
}

// ================= 各层级独立模型 =================
// L0 月球
function buildMoon(sun) { const g = new THREE.Group(); g.add(sphere(1, planetMat(sun, [0.2, 0.2, 0.21], [0.7, 0.68, 0.64], 2, 0, 0, 1.15), 96)); labels(g, [[[0, -1.25, 0], '月球']]); return g; }
// L1 地月系统
function buildEarthMoon(sun) {
  const g = new THREE.Group();
  g.add(sphere(0.6, sphereMat(EARTH_FS, sun), 96));
  g.add(sphere(0.67, smat(SPHERE_VS, ATMO_FS, { uSunW: { value: sun }, uCol: { value: new THREE.Color(0.3, 0.6, 1) } }, { side: THREE.BackSide, blending: THREE.AdditiveBlending })));
  const moon = sphere(0.2, planetMat(sun, [0.2, 0.2, 0.21], [0.7, 0.68, 0.64], 2, 0, 0, 1.1), 64); g.add(moon);
  g.add(new THREE.LineLoop(circle(1.75), lineMat(0xffd28a, 0.4)));
  g.rotation.x = 0.12; g.userData.moon = moon; g.userData.R = 1.75; labels(g, [[[0, -0.9, 0], '地球']]); return g;
}
// L1.7 太阳（恒星特写）：日面、黑子、日珥、太阳风
function buildSunClose() {
  const g = new THREE.Group(), r = rng(5), O = V(0, 0, 0);
  g.add(sphere(1.5, smat(SPHERE_VS, SUN_FS, { uSunW: { value: O } }), 128));
  g.add(glow([1, 0.6, 0.2], 2.0, 8), glow([1, 0.88, 0.55], 5, 4.2));
  const arr = [];
  for (let k = 0; k < 10; k++) { // 日珥：从日面拱起的等离子体环
    const a = r() * TAU, b = (r() - 0.5) * 1.5, d = V(Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)).normalize();
    const t1 = new THREE.Vector3().crossVectors(d, V(0, 1, 0)).normalize(), w = 0.16 + r() * 0.2, h = 0.3 + r() * 0.55;
    for (let i = 0; i < 160; i++) { const u = i / 159, phi = (u - 0.5) * 2 * w, hh = h * Math.cos((u - 0.5) * Math.PI), p = d.clone().multiplyScalar(Math.cos(phi)).addScaledVector(t1, Math.sin(phi)).multiplyScalar(1.5 + hh); arr.push({ p: p.toArray(), s: 0.5 + r() * 0.5, c: [1, 0.45 + r() * 0.2, 0.2] }); }
  }
  for (let i = 0; i < 3200; i++) { const d = V(gauss(r), gauss(r), gauss(r)).normalize(), rr = 1.7 + Math.pow(r(), 1.6) * 5; arr.push({ p: d.multiplyScalar(rr).toArray(), s: 0.25 + r() * 0.3, c: [1, 0.85 - rr * 0.06, 0.55 - rr * 0.05].map((x) => Math.max(0.05, x) * (1 - (rr - 1.7) / 6)) }); } // 太阳风
  g.add(pointsOf(arr, 1, 1)); labels(g, [[[0, -1.9, 0], '太阳']]); g.userData.fitR = 2.3; return g;
}
// L2.3 太阳系
const PLANETS = [
  { a: 1.05, r: 0.05, p: 7, m: (s) => planetMat(s, [0.34, 0.34, 0.35], [0.62, 0.6, 0.56], 1, 0, 0, 1) },
  { a: 1.45, r: 0.085, p: 11, m: (s) => planetMat(s, [0.74, 0.58, 0.32], [0.96, 0.88, 0.64], 1) },
  { a: 1.95, r: 0.09, p: 16, earth: true },
  { a: 2.5, r: 0.065, p: 22, m: (s) => planetMat(s, [0.46, 0.2, 0.1], [0.82, 0.46, 0.24], 1, 0, 0, 0.35) },
  { a: 4.2, r: 0.27, p: 40, m: (s) => planetMat(s, [0.66, 0.48, 0.32], [0.96, 0.9, 0.8], 0, 20, 1.2) },
  { a: 5.6, r: 0.22, p: 60, ring: true, m: (s) => planetMat(s, [0.78, 0.68, 0.48], [0.96, 0.9, 0.72], 0, 14, 0.5) },
  { a: 6.8, r: 0.14, p: 80, m: (s) => planetMat(s, [0.55, 0.8, 0.86], [0.72, 0.92, 0.95], 0, 7, 0.2) },
  { a: 7.8, r: 0.14, p: 100, m: (s) => planetMat(s, [0.12, 0.26, 0.7], [0.3, 0.46, 0.92], 0, 9, 0.6) },
];
// L2.3 太阳系：用 JPL 的行星平均轨道根数（J2000.0，Standish）+ 开普勒方程，统一的模拟时间驱动；内部单位 AU。
// 根数顺序：[a(AU), e, I(°), L(平黄经°), ϖ(近日点黄经°), Ω(升交点黄经°)]；近日点幅角 ω＝ϖ−Ω，平近点角 M＝L−ϖ，平运动 n＝360°/(a^1.5 年)。
// 没有使用 Horizons 星历（本机访问不到），因此位置是“J2000.0 + 模拟年数”的二体近似，不是某一日期的精确位置。
// 两种显示：展示比例（距离按平方根压缩、行星按渲染尺寸放大，非真实比例）／真实距离比例（距离线性）；两者只改显示，不改任何物理计算。行星的渲染尺寸与真实直径无关。
const ELEM = [
  [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
  [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
  [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
  [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
  [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
  [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
  [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
  [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
];
function kepler(el, yr) { // 返回黄道坐标 (x,y,z)，AU
  const D = Math.PI / 180, [a, e, I, L, vp, Om] = el, w = (vp - Om) * D, O = Om * D, i = I * D, n = 360 / Math.pow(a, 1.5);
  let M = (((L - vp + n * yr) * D) % TAU + TAU) % TAU, E = M + e * Math.sin(M); for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E), cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i);
  return [(cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp, (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp, sw * si * xp + cw * si * yp];
}
function buildSolar(uPR) {
  const g = new THREE.Group(), sunW = V(0, 0, 0), r = rng(7);
  let mode = 0; // 0 展示比例，1 真实距离比例
  const fd = (rAU) => (mode === 0 ? 1.15 * Math.sqrt(rAU) + 0.1 : 0.2 * rAU), toV = (p, o = V(0, 0, 0)) => { const d = Math.hypot(p[0], p[1], p[2]) || 1, f = fd(d) / d; return o.set(p[0] * f, p[2] * f, -p[1] * f); }; // 黄道 (x,y,z) → 场景 (x,z,-y)，径向压缩保持方向
  const sun = sphere(0.45, smat(SPHERE_VS, SUN_FS, { uSunW: { value: sunW } }), 96), sunGl = [glow([1, 0.55, 0.2], 2.4, 3.0), glow([1, 0.8, 0.45], 6, 1.2)];
  g.add(sun, ...sunGl);
  const bodies = [], orbits = [[], []];
  PLANETS.forEach((pl, i) => {
    const body = pl.earth ? sphere(pl.r, sphereMat(EARTH_FS, sunW), 48) : sphere(pl.r, pl.m(sunW), 48);
    if (pl.ring) { const rg = new THREE.RingGeometry(pl.r * 1.35, pl.r * 2.4, 96); rg.rotateX(-Math.PI / 2 + 0.45); body.add(new THREE.Mesh(rg, smat(RING_VS, RING_FS, { uIn: { value: pl.r * 1.35 }, uOut: { value: pl.r * 2.4 } }, { side: THREE.DoubleSide }))); }
    g.add(body); bodies.push(body);
    for (const m of [0, 1]) { // 两种比例各一条椭圆轨道（由同一组根数采样）
      const pts = []; for (let k = 0; k <= 180; k++) { const el = ELEM[i].slice(); el[3] = el[4] + (k / 180) * 360; const old = mode; mode = m; pts.push(toV(kepler([el[0], el[1], el[2], el[3], el[4], el[5]], 0))); mode = old; }
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(0xffd28a, 0.32)); ln.visible = m === 0; g.add(ln); orbits[m].push(ln);
    }
  });
  // 小行星带：由轨道分布生成（a≈2.1–3.3 AU，避开柯克伍德空隙，e、i 为瑞利分布），稀疏、有垂直厚度；此处为静态快照（程序生成的示意）
  const NB = 2400, belt = [], bpos = new Float32Array(NB * 3), KG = [2.5, 2.82, 2.95, 3.27];
  for (let i = 0; i < NB; i++) {
    let a; do { a = 2.1 + r() * 1.2; } while (KG.some((k) => Math.abs(a - k) < 0.025) || r() > 0.45 + 0.55 * Math.sin(((a - 2.1) / 1.2) * Math.PI));
    const e = Math.min(0.35, Math.abs(gauss(r)) * 0.1), I = Math.abs(gauss(r)) * 8, Om = r() * 360, vp = r() * 360;
    belt.push({ p: [0, 0, 0], s: 0.2 + r() * 0.28, c: [0.72, 0.66, 0.58].map((x) => x * (0.25 + 0.3 * r())) }); belt[i].el = [a, e, I, vp + r() * 360, vp, Om];
  }
  const beltPts = pointsOf(belt, 1, uPR), setBelt = () => { const tmp = V(0, 0, 0), pa = beltPts.geometry.attributes.position; belt.forEach((b, i) => { toV(kepler(b.el, 0), tmp); pa.setXYZ(i, tmp.x, tmp.y, tmp.z); }); pa.needsUpdate = true; };
  g.add(beltPts); setBelt();
  // 黄道面与坐标轴（默认隐藏）
  const ref = new THREE.Group(), plane = new THREE.Mesh(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6f86c8, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false })); plane.material.userData.base = 0.07;
  const axis = (v, c) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), v]), lineMat(c, 0.55)); ref.add(plane, axis(V(1, 0, 0), 0xffb070), axis(V(0, 0, -1), 0x80c0ff), axis(V(0, 1, 0), 0xa0ffb0)); ref.visible = false; g.add(ref);
  const place = () => { const R = fd(33); plane.scale.setScalar(R); ref.children.slice(1).forEach((ln, k) => ln.scale.setScalar(R)); sun.scale.setScalar(mode === 0 ? 1 : 0.12); sunGl[0].scale.setScalar(mode === 0 ? 1 : 0.35); sunGl[1].scale.setScalar(mode === 0 ? 1 : 0.35); bodies.forEach((b) => b.scale.setScalar(mode === 0 ? 1 : 0.45)); orbits[0].forEach((o) => (o.visible = mode === 0)); orbits[1].forEach((o) => (o.visible = mode === 1)); setBelt(); };
  place();
  const YR = 0.12; let yr = 0; // 模拟时间：1 秒 ≈ 0.12 年（地球约 8 秒一圈；水星约 2 秒，海王星约 23 分钟）
  const tmp = V(0, 0, 0);
  g.userData.tick = (t) => { yr = t * YR; bodies.forEach((b, i) => { toV(kepler(ELEM[i], yr), tmp); b.position.copy(tmp); b.rotation.y = t * 0.3; }); };
  g.userData.still = true; g.userData.fitR = 7.4;
  g.userData.labels = [
    { p: V(0, -0.7, 0), text: '太阳', lvl: [0] },
    { p: V(-6.6, 0, 5.6), text: '', dyn: () => `模拟时间：J2000.0 + ${yr.toFixed(1)} 年（开普勒方程，JPL 平均根数）`, lvl: [0] },
    { p: V(-6.6, 0, 6.6), text: '', dyn: () => (mode === 0 ? '▶ 展示比例（距离压缩、行星放大，非真实比例）—点击切换为真实距离' : '▶ 真实距离比例（线性，行星仍放大显示）—点击切换为展示比例'), toggle: () => { mode = 1 - mode; place(); }, lvl: [0] },
    { p: V(-6.6, 0, 7.6), text: '', dyn: () => (ref.visible ? '▶ 黄道面与坐标轴：开' : '▶ 黄道面与坐标轴：关（点击开启）'), toggle: () => { ref.visible = !ref.visible; }, lvl: [0] },
    ...ELEM.map((el, i) => ({ p: V(0, 0, 0), text: ['水星', '金星', '地球', '火星', '木星', '土星', '天王星', '海王星'][i], follow: () => bodies[i], lvl: [0] })),
  ];
  g.rotation.x = 0.65; return g;
}
// L3.2 奥尔特云：包裹太阳系的冰冻小天体球壳 + 长周期彗星
function buildOort(uPR) {
  const g = new THREE.Group(), r = rng(13), a = [];
  for (let i = 0; i < 16000; i++) { const d = V(gauss(r), gauss(r), gauss(r)).normalize(), rr = 3.4 + r() * 1.7, k = 0.45 + r() * 0.55; a.push({ p: d.multiplyScalar(rr).toArray(), s: 0.22 + r() * 0.5, c: [0.62 * k, 0.8 * k, 1 * k] }); }
  for (let c = 0; c < 6; c++) { // 彗星：亮核 + 指向外侧的彗尾
    const d = V(gauss(r), gauss(r) * 0.6, gauss(r)).normalize(), head = d.clone().multiplyScalar(1.2 + r() * 1.6);
    a.push({ p: head.toArray(), s: 2.4, c: [1, 1, 0.95] });
    for (let i = 1; i < 42; i++) { const p = head.clone().addScaledVector(d, i * 0.05); p.x += gauss(r) * 0.02; p.y += gauss(r) * 0.02; a.push({ p: p.toArray(), s: 0.7 * (1 - i / 42) + 0.2, c: [0.6, 0.85, 1].map((x) => x * (1 - i / 50)) }); }
  }
  g.add(pointsOf(a, 1, uPR), glow([1, 0.8, 0.45], 3, 1.1)); g.add(new THREE.LineLoop(circle(0.55), lineMat(0xffd28a, 0.5)));
  labels(g, [[[0, -0.5, 0], '太阳系'], [[3.4, 1.8, 0.4], '奥尔特云']]); return g;
}
const M = createModels({ THREE, V, TAU, rng, gauss, ease, NOISE, SPHERE_VS, ATMO_FS, SUN_FS, RING_VS, RING_FS, POINTS_VS, POINTS_FS, smat, sphereMat, sphere, circle, lineMat, pointsOf, glow, blob, PLANETS, T });
// L4.1 恒星邻域：附近的恒星，标出几颗著名的邻居
function buildHood(uPR) {
  const g = new THREE.Group(), r = rng(21), a = [];
  for (let i = 0; i < 2600; i++) { const u = r(), v = r() * TAU, w = Math.acos(2 * r() - 1), rr = Math.pow(r(), 0.55) * 14; a.push({ p: [rr * Math.sin(w) * Math.cos(v), rr * Math.cos(w) * 0.8, rr * Math.sin(w) * Math.sin(v)], s: 0.4 + Math.pow(r(), 4) * 2.4, c: starColor(r).map((x) => x * (0.55 + 0.45 * u)) }); }
  const named = [['比邻星（4.2 光年）', [1.6, 0.4, 2.2], [1, 0.5, 0.35]], ['天狼星（8.6 光年）', [-4.2, 0.8, 3.3], [0.75, 0.85, 1]], ['织女星（25 光年）', [-7.6, -1.2, -6], [0.8, 0.88, 1]]];
  for (const [, p, c] of named) a.push({ p, s: 3.4, c });
  g.add(pointsOf(a, 1.2, uPR), pointsOf([{ p: [0, 0, 0], s: 3.8, c: [1, 0.93, 0.7] }], 1.2, uPR), glow([1, 0.85, 0.5], 3, 1.2));
  g.rotation.x = 0.35; labels(g, [[[0, -0.5, 0], '太阳'], ...named.map(([t, p]) => [[p[0], p[1] - 0.45, p[2]], t])]); return g;
}
// L5 本地泡：太阳周围气体稀薄的“气泡”
const BUBBLE_FS = `${NOISE} varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec3 vL; uniform float uTime; uniform float uA;
void main(){ vec3 p=normalize(vP), n=normalize(vN), v=normalize(vV); float f=pow(1.-abs(dot(n,v)),2.); float m=fbm(p*5.+uTime*.01);
  gl_FragColor=vec4(vec3(.3,.55,.95)*(.2+m)*(.08+f*.4),(.015+f*.16)*uA); }`; // 本地泡的壳：很淡，只勾出边缘
function buildBubble(uPR) {
  const g = new THREE.Group(), r = rng(34), a = [];
  for (let i = 0; i < 9000; i++) { const d = V(gauss(r), gauss(r) * 0.8, gauss(r)).normalize(), rr = 6.6 + gauss(r) * 0.5, k = 0.5 + r() * 0.5; a.push({ p: d.multiplyScalar(rr).toArray(), s: 0.3 + r() * 0.7, c: [0.55 * k, 0.78 * k, 1 * k] }); } // 气泡壁：被推开的星际气体与新生恒星
  for (let i = 0; i < 700; i++) { const d = V(gauss(r), gauss(r) * 0.8, gauss(r)).normalize(), rr = Math.pow(r(), 0.7) * 6; a.push({ p: d.multiplyScalar(rr).toArray(), s: 0.3 + Math.pow(r(), 4) * 1.6, c: starColor(r) }); }
  g.add(pointsOf(a, 1.1, uPR), new THREE.Mesh(new THREE.SphereGeometry(7, 64, 40), smat(SPHERE_VS, BUBBLE_FS, { uSunW: { value: V(0, 0, 0) } }, { blending: THREE.AdditiveBlending })), glow([1, 0.88, 0.55], 2.6, 0.9));
  g.rotation.x = 0.35; labels(g, [[[0, -0.45, 0], '太阳'], [[6.8, 2.2, 0], '本地泡的边缘']]); return g;
}
// L7 银河系（按 NASA/JPL、ESA/Gaia 的结构近似重建）：直径约 10 万光年的棒旋星系。1 单位≈3300 光年，盘半径 15 单位。
// 分层：球状的暖黄色核球（单一平滑的高斯团）→ 沿一条轴伸长的椭球棒（与太阳—银心连线约成 27°）→ 薄盘（指数密度）→ 旋臂（对数螺线，从棒端附近伸出，各臂长短宽窄不同，
// 带断裂与分叉）→ 极稀薄的晕与少量球状星团。粉色星形成区只沿旋臂分布，暗色尘埃在臂内侧；外盘有轻微翘曲。太阳在距银心约 2.6 万光年（7.8 单位）、猎户臂支上。
const BAR = 0.47, SUN_R = 7.8;
const ARMS = [
  { t0: BAR, r0: 4.4, rmax: 15, pitch: 0.23, w: 1.0, name: '盾牌–半人马臂' },
  { t0: 3.48, r0: 4.4, rmax: 15, pitch: 0.23, w: 1.0, name: '英仙臂' },
  { t0: 1.3, r0: 4.4, start: 5.4, rmax: 10.5, pitch: 0.25, w: 0.55, name: '人马臂' },
  { t0: 4.5, r0: 4.4, start: 5.4, rmax: 9.5, pitch: 0.25, w: 0.45, name: '矩尺臂' },
];
const armTh = (A, rr) => A.t0 - Math.log(rr / A.r0) / A.pitch;
ARMS.push({ t0: armTh(ARMS[1], 10.5), r0: 10.5, rmax: 14.5, pitch: 0.42, w: 0.3, branch: true }, { t0: armTh(ARMS[0], 8.5), r0: 8.5, rmax: 12.5, pitch: 0.38, w: 0.3, branch: true }); // 两条分叉的支臂
const warp = (rr, th) => (rr > 8 ? 0.0085 * (rr - 8) * (rr - 8) * Math.cos(th - 0.6) : 0);
function buildGalaxy(uPR) {
  const g = new THREE.Group(), r = rng(33), a = [];
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const cb = Math.cos(BAR), sb = Math.sin(BAR), rotB = (x, z) => [x * cb - z * sb, x * sb + z * cb];
  const ph = ARMS.map(() => [r() * 6.3, r() * 6.3, r() * 6.3]);
  const gap = (k, u) => Math.min(1, Math.max(0.3, 0.55 + 0.5 * Math.sin(9 * u + ph[k][0]) + 0.3 * Math.sin(23 * u + ph[k][1]))); // 臂上的疏密起伏与断裂
  const armPos = (k, rr, dr = 0, dy = 0) => { const A = ARMS[k], th = armTh(A, rr), R = rr + dr; return [Math.cos(th) * R, dy + warp(R, th), Math.sin(th) * R]; };
  // 薄盘：指数盘（标高随半径缓慢增大），越外越稀
  for (let i = 0; i < 52000; i++) {
    const rr = 0.3 - Math.log(1 - r() * 0.995) * 3.3; if (rr > 15.5) continue; const th = r() * TAU, kk = (0.12 + 0.16 * Math.exp(-rr / 6)) * (1 - smooth(10, 15.5, rr) * 0.7), warm = Math.exp(-rr / 3.5);
    a.push({ p: [Math.cos(th) * rr, gauss(r) * (0.14 + 0.014 * rr) + warp(rr, th), Math.sin(th) * rr], s: 0.2 + r() * 0.35, c: [0.72 + 0.28 * warm, 0.8 + 0.12 * warm, 1 - 0.45 * warm].map((x) => x * kk) });
  }
  // 旋臂：对数螺线，沿弧长按疏密函数取样；臂越往外越宽越淡
  const tot = ARMS.reduce((s, A) => s + A.w, 0);
  ARMS.forEach((A, k) => {
    const r00 = A.branch ? A.r0 : (A.start || A.r0 * 0.9), L = Math.log(A.rmax / r00), N = Math.floor((64000 * A.w) / tot);
    for (let i = 0; i < N; i++) {
      const u = r(); if (r() > gap(k, u) * Math.min(1, u / 0.12 + 0.05) * (1 - 0.6 * smooth(0.65, 1, u))) continue; const rr = r00 * Math.exp(u * L), wd = 0.2 + 0.045 * rr, dr = gauss(r) * wd + 0.35 * Math.sin(5 * u + ph[k][2]) * (rr / 15), th = armTh(A, rr), R = rr + dr, edge = 1 - smooth(0.55, 1, u) * 0.75;
      a.push({ p: [Math.cos(th) * R, gauss(r) * (0.1 + 0.012 * rr) + warp(R, th), Math.sin(th) * R], s: 0.2 + r() * 0.4, c: [0.62, 0.76, 1].map((x) => x * (0.3 + 0.35 * r()) * edge * (0.6 + 0.4 * A.w)) });
    }
  });
  // 沿旋臂的恒星形成区（粉）与年轻星团（蓝）：只出现在臂里、距银心 3–12 单位
  for (let i = 0; i < 520; i++) {
    const k = Math.floor(r() * 4), A = ARMS[k], u = r(), rr = Math.max(3.2, A.r0 * Math.exp(u * Math.log(A.rmax / A.r0))); if (rr > 12.5 || gap(k, u) < 0.7 || r() > gap(k, u)) { i--; continue; }
    const p = armPos(k, rr, gauss(r) * 0.15), pink = r() < 0.6;
    for (let j = 0; j < 4; j++) a.push({ p: [p[0] + gauss(r) * 0.07, p[1] + gauss(r) * 0.04, p[2] + gauss(r) * 0.07], s: 0.55 + r() * 0.8, c: (pink ? [1, 0.45, 0.65] : [0.62, 0.8, 1]).map((x) => x * 0.65) });
  }
  // 猎户臂支：太阳附近一小段短而弱的臂（在人马臂与英仙臂之间）
  for (let i = 0; i < 700; i++) { const t = (r() - 0.5) * 2.6, th = -t * 0.07, R = SUN_R + t * 0.22 + gauss(r) * 0.13; a.push({ p: [Math.cos(th) * R, gauss(r) * 0.09, Math.sin(th) * R], s: 0.2 + r() * 0.35, c: [0.65, 0.78, 1].map((x) => x * (0.28 + 0.3 * r())) }); }
  // 核球：一个平滑的暖黄色三维团；棒：沿长轴伸长的椭球（密度随椭球半径平滑下降，无硬边）
  for (let i = 0; i < 9000; i++) { const x = gauss(r) * 0.85, y = gauss(r) * 0.7, z = gauss(r) * 0.8, m2 = (x * x) / 0.72 + (y * y) / 0.49 + (z * z) / 0.64; const q = rotB(x, z); a.push({ p: [q[0], y, q[1]], s: 0.22 + r() * 0.3, c: [1, 0.82, 0.58].map((v) => v * (0.04 + 0.09 * Math.exp(-m2 * 0.9))) }); }
  for (let i = 0; i < 18000; i++) { const x = gauss(r) * 2.6, y = gauss(r) * 0.4, z = gauss(r) * 0.55, m = Math.hypot(x / 5.0, y / 0.9, z / 1.1); if (m > 1) continue; const q = rotB(x, z); a.push({ p: [q[0], y, q[1]], s: 0.22 + r() * 0.3, c: [1, 0.8, 0.52].map((v) => v * (0.09 + 0.14 * (1 - m * m))) }); }
  // 晕：极稀薄的球状分布；少量球状星团
  for (let i = 0; i < 4500; i++) { const d = V(gauss(r), gauss(r), gauss(r)).normalize(), rr = 0.8 + 14 * Math.pow(r(), 2.4); a.push({ p: d.multiplyScalar(rr).toArray(), s: 0.2 + r() * 0.25, c: [0.78, 0.72, 0.58].map((x) => x * 0.2 * (1 - rr / 16)) }); }
  for (let i = 0; i < 40; i++) { const d = V(gauss(r), gauss(r), gauss(r)).normalize(), rr = 2 + 10 * Math.pow(r(), 1.3); a.push({ p: d.multiplyScalar(rr).toArray(), s: 1.1 + r() * 0.6, c: [1, 0.86, 0.58].map((x) => x * 0.42) }); }
  g.add(pointsOf(a, 1.1, uPR));
  const gl2 = glow([1, 0.78, 0.5], 2.2, 3.2); gl2.material.uniforms.uCol.value.multiplyScalar(0.07); g.add(gl2); // 核球处一层极淡的辉光
  const you = glow([1, 0.9, 0.6], 2.5, 0.16); you.position.set(SUN_R, 0, 0); g.add(you); // 太阳：很小的标记
  g.userData.armAt = armPos;
  const at = (k, rr, dr = 0.6) => armPos(k, rr, dr, 0.3);
  g.userData.fitR = 22; g.rotation.x = 1.3; labels(g, [[[SUN_R, 0.3, 0.9], '太阳系（距银心约 2.6 万光年）'], [at(0, 11.5), '盾牌–半人马臂'], [at(1, 12), '英仙臂'], [at(2, 8.5), '人马臂'], [at(3, 7.8), '矩尺臂'], [[SUN_R - 0.2, 0.2, -0.9], '猎户臂支'], [[0, 1.1, -1.2], '核球与棒']]); return g;
}
// L12.1 斯隆长城：一整面由星系排成的“墙”
function buildSloan(uPR) {
  const g = new THREE.Group(), r = rng(111), a = [], nodes = [];
  for (let i = 0; i < 46; i++) nodes.push(V((r() - 0.5) * 12, gauss(r) * 0.3, (r() - 0.5) * 2.8));
  nodes.forEach((n, i) => {
    blob(a, r, n.toArray(), 70, 0.3, 0.18, 0.3, [1, 0.88, 0.66], 0.3, 0.5);
    nodes.map((m, j) => [n.distanceTo(m), j]).filter(([, j]) => j !== i).sort((x, y) => x[0] - y[0]).slice(0, 2).forEach(([d, j]) => { for (let k = 0; k < Math.floor(d * 22); k++) { const t = r(), m = nodes[j]; a.push({ p: [n.x + (m.x - n.x) * t + gauss(r) * 0.1, n.y + (m.y - n.y) * t + gauss(r) * 0.08, n.z + (m.z - n.z) * t + gauss(r) * 0.1], s: 0.25 + r() * 0.4, c: [0.7, 0.8, 1] }); } });
  });
  for (let i = 0; i < 1400; i++) a.push({ p: [(r() - 0.5) * 22, (r() - 0.5) * 9, (r() - 0.5) * 12], s: 0.2 + r() * 0.3, c: [0.35, 0.42, 0.62] });
  g.add(pointsOf(a, 1.1, uPR)); labels(g, [[[0, -1.4, 0], '斯隆长城（长约 14 亿光年）']]); g.rotation.set(0.7, 0.3, 0); return g;
}
// L13.7 武仙-北冕座长城：由伽马射线暴分布推断出的巨型结构（存疑）
function buildHCB(uPR) {
  const g = new THREE.Group(), r = rng(121), a = [], P = (u) => V((u - 0.5) * 22, Math.sin(u * 3) * 2.6, Math.cos(u * 2) * 2.2);
  for (let i = 0; i < 12000; i++) { const p = P(r()); a.push({ p: [p.x + gauss(r) * 1.5, p.y + gauss(r) * 1.1, p.z + gauss(r) * 1.4], s: 0.25 + r() * 0.4, c: [0.5, 0.6, 0.95].map((x) => x * (0.4 + r() * 0.5)) }); }
  for (let i = 0; i < 520; i++) { const p = P(r()); a.push({ p: [p.x + gauss(r) * 1.2, p.y + gauss(r) * 0.9, p.z + gauss(r) * 1.1], s: 1.5 + r() * 1.3, c: [1, 0.42, 0.66] }); } // 伽马射线暴
  for (let i = 0; i < 2500; i++) a.push({ p: [(r() - 0.5) * 28, (r() - 0.5) * 14, (r() - 0.5) * 14], s: 0.2 + r() * 0.3, c: [0.35, 0.42, 0.62] });
  g.add(pointsOf(a, 1.1, uPR)); labels(g, [[[0, -4.6, 0], '武仙-北冕座长城（粉点＝伽马射线暴；存疑）']]); g.rotation.x = 0.4; return g;
}
// L14.6 可观测宇宙：宇宙网并入此层——蓝白发光的网球（亮节点＝星系团，丝带勾出近黑的空洞），球心是“我们”
function buildObservable() {
  const g = M.webObservable();
  g.add(glow([1, 0.88, 0.55], 2.6, 1.6)); const mark = new THREE.LineLoop(circle(0.6, 64), lineMat(0xffe2a0, 0.9)); g.add(mark); g.userData.mark = mark;
  labels(g, [[[0, -1.2, 0], '我们在这里'], [[0, 14.8, 0], '可观测宇宙的边缘']]); return g;
}
function buildInstrument() { // 地球过来时仪轨的环：先收起，之后宇宙系不再使用
  const g = new THREE.Group(), rings = [];
  [[5.6, [0.4, 0, 0.2]], [6.0, [-0.7, 0.3, 0.5]], [6.4, [1.1, 0, -0.4]]].forEach(([R, tilt]) => {
    const h = new THREE.Group(), ring = new THREE.Group();
    ring.add(new THREE.LineLoop(circle(R), lineMat(0xc9a45c, 0.3)));
    h.rotation.set(...tilt); h.add(ring); g.add(h); rings.push(ring);
  });
  g.userData.rings = rings; return g;
}

// ---------------- 层级表：节点 → 尺度轴位置 L；各自独立的模型（按需构建）----------------
const EM_SUN = V(-40, 12, 26);
const LV = [
  ['cel.moon', 0, () => buildMoon(EM_SUN), 2.1, 'moon'],
  ...Object.keys(M.MOONS).map((id) => [id, 0, (p) => M.moonBody(id, p), 1.9, 'moon']),
  ['cel.earth-moon', 1, () => buildEarthMoon(EM_SUN), 1.7, 'sys'],
  ...Object.entries(M.SYS).map(([id, o]) => [id, 1, () => M.planetSystem(o), id === 'cel.jupiter' ? 0.52 : id === 'cel.saturn' ? 0.62 : 0.95, 'sys']),
  ['cel.sun', 1.7, () => buildSunClose(), 0.8],
  ['cel.solar', 2.3, buildSolar, 0.6, 'sol'],
  ['cel.asteroid-belt', 2.3, M.buildBelt, 0.62, 'sol'],
  ['cel.comets', 2.3, (p) => M.cometSystem([{ ...M.HALLEY, a: 3.6, tagAt: V(-7.2, 0.2, 0) }, { ...M.HALE, a: 8, tagAt: V(-15.9, 0.2, 0) }, M.OUMU], p), 0.34, 'sol'],
  ['cel.halley', 2.3, (p) => M.cometSystem([M.HALLEY], p), 0.62, 'sol'],
  ['cel.hale-bopp', 2.3, (p) => M.cometSystem([M.HALE], p, false), 0.23, 'sol'],
  ['cel.oumuamua', 2.3, (p) => M.cometSystem([M.OUMU], p), 0.3, 'sol'],
  ['cel.oort', 3.2, buildOort, 0.7],
  ['cel.neighborhood', 4.1, (p) => M.decorateHood(buildHood(p)), 0.32],
  ['cel.local-bubble', 5, (p) => M.decorateBubble(buildBubble(p)), 0.46],
  ['cel.orion-arm', 6, M.buildOrionArm, 0.3],
  ['cel.milkyway', 7, (p) => M.decorateGalaxy(buildGalaxy(p)), 0.42],
  ['cel.local-group', 8, M.buildLocalGroup, 0.5],
  ['cel.virgo-cluster', 8.7, M.buildVirgo, 0.3],
  ['cel.local-supercluster', 9.5, M.buildSupercluster, 0.21],
  ['cel.laniakea', 10.5, M.buildLaniakea, 0.24],
  ['cel.pisces-cetus', 11.4, M.buildComplex, 0.27],
  ['cel.sloan-wall', 12.1, buildSloan, 0.3],
  ['cel.hcb-wall', 13.7, buildHCB, 0.27],
  ['cel.observable', 14.6, buildObservable, 0.215],
];
const LEVEL = Object.fromEntries(LV.map(([id, L]) => [id, L]));

/** 层级内容的“有效半径”（组内坐标，建好、未缩放时计算）。用于自动缩放，使内容占画面可见范围的固定比例。 */
function contentRadius(g) {
  if (g.userData.fitR) return g.userData.fitR;
  const d = [], v = V(0, 0, 0); let mesh = 0;
  g.traverse((o) => {
    const geo = o.geometry; if (o === g || !geo || o.userData.billboard) return;
    if (o.isPoints || o.isLine) { const p = geo.attributes.position, step = Math.max(1, Math.floor(p.count / 6000)); for (let i = 0; i < p.count; i += step) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); d.push(v.length()); } }
    else if (o.isMesh && geo.type !== 'PlaneGeometry') { geo.computeBoundingSphere(); const s = geo.boundingSphere; v.copy(s.center).applyMatrix4(o.matrixWorld); mesh = Math.max(mesh, v.length() + s.radius * o.matrixWorld.getMaxScaleOnAxis()); }
  });
  d.sort((a, b) => a - b);
  // 点／线类层级：第 96 百分位半径往往比最外缘的星系团大，除以 1.4 使最外缘落在画面 80% 附近；球体类按包围球精确适配
  return Math.max(mesh, (d.length ? d[Math.floor(d.length * 0.96)] : 0) / 1.4) || 1;
}
const FILL = 0.8; // 内容占画面可见范围（取较短边）的比例

// ---------------- 场景 ----------------
export async function createCosmos(host, { level, node, rings = false } = {}) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const PR = Math.min(devicePixelRatio, 1.75); renderer.setPixelRatio(PR);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3; renderer.setClearColor(0x02030a); // 科普插图：整体明亮
  host.appendChild(renderer.domElement); M.setRenderer(renderer); // 宇宙网贴图在此渲染器上一次性烘焙
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, 0.05, 1e7);

  const nebula = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 24), new THREE.ShaderMaterial({ vertexShader: NEBULA.vs, fragmentShader: NEBULA.fs, side: THREE.BackSide, depthWrite: false, uniforms: { uTime: T.uTime, uBand: { value: 1 } } }));
  scene.add(nebula);
  const r0 = rng(99), bg = []; for (let i = 0; i < 3500; i++) { const u = r0() * 2 - 1, a = r0() * TAU, s = Math.sqrt(1 - u * u), d = 100; bg.push({ p: [s * Math.cos(a) * d, u * d, s * Math.sin(a) * d], s: 0.3 + Math.pow(r0(), 5) * 1.8, c: starColor(r0) }); }
  const bgStars = pointsOf(bg, 1, PR); scene.add(bgStars);

  const levels = LV.map(([id, L, build, base, x]) => ({ id, L, build, base, x, a: 0, g: null, w: 0 })); // 模型按需构建；x＝独占组（同一尺度只显示当前节点）
  let cur = node ?? 'cel.earth-moon';
  { const dl = new THREE.DirectionalLight(0xffffff, 2.8); dl.position.set(-6, 4, 5); scene.add(dl, new THREE.AmbientLight(0x8a96b8, 0.9)); } // 小行星带岩石用的标准材质需要灯光
  let inst = rings ? buildInstrument() : null, ringT = performance.now();
  if (inst) scene.add(inst);

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.6, 0.9); composer.addPass(bloom); composer.addPass(new OutputPass());

  // 标注层（DOM）：科普插图式文字标注
  const labelBox = Object.assign(document.createElement('div'), { className: 'clabels' }); host.appendChild(labelBox);
  const labelEls = new Map();

  const resize = () => { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); composer.setSize(w, h); bloom.resolution.set(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.domElement.style.cssText = 'width:100%;height:100%;display:block'; };
  const ro = new ResizeObserver(resize); ro.observe(host); resize();

  let L = level ?? LEVEL[node] ?? 1, tw = null, raf = 0, last = performance.now(), running = false, px = 0, py = 0, cx = 0, cy = 0;
  let yaw = 0, pitch = 0, vYaw = 0, vPitch = 0, drag = null;
  const onMove = (e) => {
    px = (e.clientX / innerWidth) * 2 - 1; py = (e.clientY / innerHeight) * 2 - 1;
    if (drag && e.isPrimary) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; vYaw = -dx * 0.006; vPitch = dy * 0.006; yaw += vYaw; pitch = Math.max(-1.3, Math.min(1.3, pitch + vPitch)); } // 拖拽 = 对应方向的旋转
  };
  const onDown = (e) => { if (e.isPrimary) drag = { x: e.clientX, y: e.clientY }; };
  const onUp = () => { drag = null; };
  addEventListener('pointermove', onMove); renderer.domElement.addEventListener('pointerdown', onDown); addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp);
  const wp = new THREE.Vector3(), zc = new THREE.Vector3(); let zsel = -1, zk = 0, zs = 1;

  function loop() {
    if (!running) return; raf = requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; const t = (T.uTime.value += dt);
    if (tw) { const k = Math.min(1, (now - tw.t0) / tw.ms); L = tw.a + (tw.b - tw.a) * ease(k); if (k >= 1) tw = null; }
    const live = [], fitR = FILL * 9.5 * Math.tan((camera.fov * Math.PI) / 360) * Math.min(1, camera.aspect); // 适配后的内容半径（世界单位）
    for (const l of levels) {
      const d = l.L - L, tgt = l.x ? (cur === l.id ? 1 : 0) : 1; l.a += Math.sign(tgt - l.a) * Math.min(Math.abs(tgt - l.a), dt / 1.2);
      const w = Math.max(0, (Math.exp(-(d * d) / (2 * 0.28 * 0.28)) - 0.06) / 0.94) * ease(l.a); // 截断尾巴：非当前层级彻底隐去，不留巨大的鬼影
      if (!l.g) { if (Math.abs(d) > 1.2 || (l.x && cur !== l.id)) continue; l.g = l.build(PR); scene.add(l.g); l.g.updateMatrixWorld(true); l.R = contentRadius(l.g); } // 按需构建：靠近该层级、且（独占组）是当前节点才生成
      { const zm = l.g.userData.zoom, base = (fitR / l.R) * Math.pow(SCALE, d); if (zm && l.w > 0.5 && cur === l.id) { const tg = zsel >= 0 ? zm[zsel] : null, kk = Math.min(1, dt * 2.4); if (tg) { zc.lerp(tg.p, zk < 0.02 ? 1 : kk); zs += (tg.s - zs) * kk; } zk += ((tg ? 1 : 0) - zk) * kk; const sc = base * (1 + (zs - 1) * zk); l.g.position.set(0, 0, 0); l.g.scale.setScalar(sc); l.g.updateMatrixWorld(); l.g.position.copy(wp.copy(zc).applyMatrix4(l.g.matrixWorld)).multiplyScalar(-zk); } else l.g.scale.setScalar(base); } setAlpha(l.g, w); l.w = w; if (l.g.userData.tick) l.g.userData.tick(t, w);
      if (l.g.userData.labels && w > 0.5) live.push(l);
      if (l.g.userData.moon) { const a = t * 0.35, R = l.g.userData.R; l.g.userData.moon.position.set(Math.cos(a) * R, 0, Math.sin(a) * R); l.g.userData.moon.rotation.y = -a; l.g.rotation.y = t * 0.01; }
      else if (l.g.userData.bodies) for (const h of l.g.userData.bodies) { const a = h.userData.phase + t * h.userData.w; h.rotation.y = a; h.children[0].rotation.y = t * 0.3; }
      else if (l.id !== 'cel.moon' && l.id !== 'cel.observable' && !l.g.userData.still) l.g.rotation.y = t * 0.004;
      if (l.g.userData.mark) l.g.userData.mark.scale.setScalar(1 + 0.25 * Math.sin(t * 2));
      if (w > 0.01) l.g.traverse((o) => { if (o.userData.billboard) o.quaternion.copy(camera.quaternion); });
    }
    if (inst) {
      const k = Math.min(1, (now - ringT) / (DUR * 1000)), e = ease(k);
      inst.scale.setScalar(Math.max(0.001, 1 - e)); setAlpha(inst, 1 - e); inst.rotation.y = t * 0.02 + e * 1.2;
      if (k >= 1) { scene.remove(inst); inst.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); inst = null; }
    }
    cx += (px * 0.25 - cx) * Math.min(1, dt * 2); cy += (py * 0.15 - cy) * Math.min(1, dt * 2);
    if (!drag) { yaw += vYaw; pitch = Math.max(-1.3, Math.min(1.3, pitch + vPitch)); const k = Math.pow(0.94, dt * 60); vYaw *= k; vPitch *= k; }
    const drift = reduce ? 0 : Math.sin(t * 0.07) * 0.03, Y = yaw + cx + drift, P = Math.max(-1.35, Math.min(1.35, pitch - cy * 0.6 + 0.12));
    camera.position.set(Math.sin(Y) * Math.cos(P) * 9.5, Math.sin(P) * 9.5, Math.cos(Y) * Math.cos(P) * 9.5);
    camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    { const x = Math.min(1, Math.max(0, (L - 4.8) / 1.6)); nebula.material.uniforms.uBand.value = 1 - x * x * (3 - 2 * x); } // 银河带只属于银河系内的视角
    nebula.position.copy(camera.position); bgStars.position.copy(camera.position);
    // 标注：投影到屏幕
    const W = host.clientWidth, H = host.clientHeight, used = new Set(), items = [];
    for (const l of live) l.g.userData.labels.forEach((lb, i) => {
      const key = `${l.id}#${i}`; if (lb.lvl && !lb.lvl.includes(l.g.userData.zoom && zsel >= 0 ? (l.g.userData.zoom[zsel]?.lvl ?? 1) : 0)) return;
      l.g.updateWorldMatrix(true, false); if (lb.follow) { wp.copy(lb.follow().position); wp.y -= 0.22; } else wp.copy(lb.p); l.g.localToWorld(wp); wp.project(camera);
      if (wp.z > 1 || Math.abs(wp.x) > 1.05 || Math.abs(wp.y) > 1.05) return;
      let el = labelEls.get(key);
      if (!el) {
        const act = lb.zoom !== undefined || lb.toggle || lb.go;
        el = Object.assign(document.createElement('span'), { className: act ? 'clabel zoomable' : 'clabel', textContent: lb.text });
        if (act) el.onclick = () => {
          if (lb.toggle) { lb.toggle(); return; }
          if (lb.go) { host.dispatchEvent(new CustomEvent('cosmos-go', { detail: lb.go, bubbles: true })); return; }
          zsel = zsel === lb.zoom ? -1 : lb.zoom; for (const [, e2] of labelEls) e2.classList.remove('on'); if (zsel >= 0) el.classList.add('on');
        };
        if (lb.color) el.style.color = lb.color; labelBox.appendChild(el); labelEls.set(key, el);
      }
      if (lb.dyn) { const t = lb.dyn(); if (t !== el.textContent) { el.textContent = t; el._w = 0; } }
      items.push({ el, key, x: (wp.x * 0.5 + 0.5) * W, y: (-wp.y * 0.5 + 0.5) * H, op: Math.min(1, (l.w - 0.5) * 3) });
    });
    const boxes = []; // 重叠检测：按优先级（列表顺序）依次放置，与已放置标签相交的隐藏
    for (const it of items) {
      const w = it.el._w || (it.el._w = it.el.offsetWidth || 80), x0 = it.x - w / 2, x1 = it.x + w / 2, y0 = it.y, y1 = it.y + 22;
      const hit = boxes.some((b) => x0 < b[2] && x1 > b[0] && y0 < b[3] && y1 > b[1]);
      it.el.style.transform = `translate(${it.x}px,${it.y}px) translate(-50%,0)`; it.el.style.opacity = hit ? 0 : it.op; it.el.style.pointerEvents = hit ? 'none' : ''; used.add(it.key);
      if (!hit) boxes.push([x0, y0, x1, y1]);
    }
    for (const [k, el] of labelEls) if (!used.has(k)) { el.style.opacity = 0; el.style.pointerEvents = 'none'; }
    composer.render();
  }
  const api = {
    /** 聚焦到天体节点：2.2 秒推拉到对应尺度层级。 */
    focus(id) { const b = LEVEL[id]; if (b === undefined) return; cur = id; zsel = -1; for (const [, e2] of labelEls) e2.classList.remove('on'); tw = { a: L, b, t0: performance.now(), ms: reduce ? 1 : DUR * 1000 }; },
    pause() { running = false; cancelAnimationFrame(raf); },
    resume() { if (running) return; running = true; last = performance.now(); loop(); },
    dispose() {
      api.pause(); ro.disconnect(); removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp); renderer.domElement.remove(); labelBox.remove(); composer.dispose(); renderer.dispose();
      scene.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => x.dispose()); });
    },
  };
  api.resume();
  return api;
}
