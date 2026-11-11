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
import { createSun, createPhotosphereMesh } from './sun.js';
import { viewZoom } from './zoom.js';
import { createSolarWind, createParkerSpirals, SOLAR_WIND } from './solarwind.js';
import { FX, FXU, TWINKLE, DYN, RICH, GLINT, STEP3, SPIKE, ATMO, SIM, SIM_RATE, simDate, NAV } from './fx.js';
import { COMETS, cometPos, cometVel, dustDelta } from './comets.js';

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
  vec3 i=floor(p),f=fract(p),s=step(.5,f); float m=0.; // 只查看点所在半格的 2×2×2 个邻格（坑半径 ≤ 0.48，结果与 3×3×3 相同，着色器编译快 3 倍多）
  for(int x=0;x<2;x++)for(int y=0;y<2;y++)for(int z=0;z<2;z++){
    vec3 g=vec3(float(x),float(y),float(z))+s-1.; vec3 o=h33(i+g); float rr=.2+.28*h33(i+g+7.).x; float d=length(g+o-f)/rr;
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
const POINTS_VS = /* glsl */ `attribute float aS; attribute vec3 aC; uniform float uPR; uniform float uSize; uniform float uTime; uniform float uTw; uniform float uTwW; uniform float uRich; uniform float uGl; uniform float uStarD; uniform float uCut; uniform vec3 uGp[3]; uniform vec3 uGs; uniform vec3 uGz; varying vec3 vC; varying float vF; varying float vG; varying float vS;
void main(){ vC=aC; vec4 mv=modelViewMatrix*vec4(position,1.);
  float raw=aS*uSize*uPR*1.7*(8./max(-mv.z,.1)), sz=clamp(raw,3.2*uPR,64.);
  float k=clamp(raw/sz,0.,1.); vF=k*k*.85+.15;
  float hp=fract(sin(dot(position,vec3(12.9898,78.233,37.719)))*43758.5453), h2=fract(hp*57.31);
  if(hp>.7&&uTw>0.){ float ph=hp*41.; vF*=1.+uTw*(.6*sin(uTime*uTwW+ph)+.4*sin(uTime*uTwW*2.3+ph*1.7)); }
  if(uRich>0.){ vec3 tint=h2<.16?vec3(.72,.85,1.):h2<.5?vec3(.96,.97,1.):h2<.84?vec3(1.,.84,.6):vec3(1.,.66,.45); vC*=mix(vec3(1.),tint*1.08,min(uRich,1.)); }
  vC*=1.+uStarD; vG=0.; { vec4 c0=modelViewMatrix*vec4(0.,0.,0.,1.); vC*=1.-.88*uCut*smoothstep(-.03,.06,(mv.z-c0.z)/max(.001,-c0.z)); } // 剖切观察：淡化靠近镜头的前半球（仅为观察手段）
  float gz=1.; for(int i=0;i<3;i++){ if(distance(position,uGp[i])<1e-3){ float x=(uTime-uGs[i])/1.2; if(x>0.&&x<1.){ vG=sin(3.14159*x); gz=uGz[i]; } } } // 星芒由 CPU 调度：同一时间最多 3 颗
  float big=mix(sz,max(sz,max(sz,10.*uPR)*4.5*gz),vG); vS=big/sz; gl_PointSize=big; gl_Position=projectionMatrix*mv; }`;
const POINTS_FS = /* glsl */ `varying vec3 vC; varying float vF; varying float vG; varying float vS; uniform float uA; uniform float uSpk;
void main(){ vec2 q=gl_PointCoord-.5, c=q*vS; float d=length(c); float a=max(exp(-d*d*18.)-.02,0.)*(1.+1.2*vG);
  float sp=vG*(exp(-abs(q.x)*70.)*exp(-abs(q.y)*7.)+exp(-abs(q.y)*70.)*exp(-abs(q.x)*7.))*1.4+vG*exp(-dot(q,q)*500.)*1.2; sp*=uSpk; // 四向星芒：从亮核根部向外渐隐（成像/艺术效果，不是天体的真实外形）
  gl_FragColor=vec4(vC*1.5,(a+sp)*uA*mix(vF,1.,vG)); }`;

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
  const pts = new THREE.Points(g, smat(POINTS_VS, POINTS_FS, { uPR: { value: uPR }, uSize: { value: size }, uTw: { value: 0 }, uTwW: { value: 1 }, uRich: { value: 0 }, uGp: { value: [new THREE.Vector3(1e4, 0, 0), new THREE.Vector3(1e4, 0, 0), new THREE.Vector3(1e4, 0, 0)] }, uGs: { value: new THREE.Vector3(-1e4, -1e4, -1e4) }, uGz: { value: new THREE.Vector3(1, 1, 1) }, uSpk: { value: 1 }, uCut: { value: 0 }, uStarD: { value: 0 } }, { blending: THREE.AdditiveBlending })); pts.frustumCulled = false; return pts;
}
const glow = (col, k, size) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), smat(GLOW_VS, GLOW_FS, { uCol: { value: new THREE.Color(...col) }, uK: { value: k } }, { blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); m.scale.setScalar(size); m.userData.billboard = true; m.userData.fx = 'glow'; return m; };
// 密度辉光／重点高亮：一小团辉光，带各自相位的低幅度脉动（幅度受特效设置控制；科学模式下静止）
const pulseGlow = (g, pos, col, kp, size, k, amp = 0.02, per = 20, ph = 0) => { const m = glow(col, kp, size); m.position.copy(pos); m.material.uniforms.uCol.value.multiplyScalar(k); (g.userData.pulses ||= []).push({ m, c: m.material.uniforms.uCol.value.clone(), amp, per, ph }); g.add(m); return m; };
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

// 参考系统：距离环（断续的点状环，带透视深度）、坐标轴、三维网格；各层级把它们放进 userData.ref，由面板开关控制（见 applyRef）
function dotRings(radii, uPR, col = [0.5, 0.65, 0.92]) {
  const a = [];
  for (const R of radii) for (const [ax, k] of [[0, 0.4], [1, 0.14], [2, 0.14]]) for (let i = 0, n = Math.round(120 + R * 60); i < n; i++) {
    const th = (i / n) * TAU; if (Math.sin(th * 7 + R * 3) < -0.35) continue; // 断续
    const v = ax === 0 ? V(Math.cos(th) * R, 0, Math.sin(th) * R) : ax === 1 ? V(Math.cos(th) * R, Math.sin(th) * R, 0) : V(0, Math.cos(th) * R, Math.sin(th) * R);
    a.push({ p: v.toArray(), s: 0.5 + 0.25 * Math.sin(th * 13), c: col.map((x) => x * k * (0.6 + 0.4 * Math.sin(th * 5 + R))) });
  }
  const m = pointsOf(a, 1, uPR); m.userData.still = true; return m;
}
const axesLines = (R, c = 0x8fa8d8, o = 0.12) => new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([V(-R, 0, 0), V(R, 0, 0), V(0, -R, 0), V(0, R, 0), V(0, 0, -R), V(0, 0, R)]), lineMat(c, o));
const gridLines = (R, step, c = 0x6f88c0, o = 0.05) => { const p = []; for (let u = -R; u <= R + 1e-6; u += step) { p.push(V(u, 0, -R), V(u, 0, R), V(-R, 0, u), V(R, 0, u), V(u, -R, 0), V(u, R, 0), V(-R, u, 0), V(R, u, 0), V(0, u, -R), V(0, u, R), V(0, -R, u), V(0, R, u)); } return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(p), lineMat(c, o)); };
// 参考线：“参考线”总开关（FX.refOn）接管所有层级的辅助线（拉尼亚凯亚的引力流线、行星环线、选中标记除外）；剖切／彗星演示／X 射线各有独立开关。
// 淡入淡出：把层级当前透明度再乘上渐变值（材质去重，避免共享材质被重复相乘）。
const refTarget = (k) => (k === 'orbit' ? FX.ref.orbit : k === 'xray' ? FX.ref.xray : k === 'orbitLine' ? FX.refOn && FX.ref.orbit : FX.refOn);
const refLabelOn = (k) => !!(k === 'xray' ? FX.ref.xray : FX.refOn);
function fadeLines(o, f, seen) { if (o.userData.refGrp || o.userData.keep) return; const m = o.material; if (o.isLine && m && !seen.has(m)) { seen.add(m); m.opacity *= f; } for (const c of o.children) fadeLines(c, f, seen); }
function applyRef(l, dt) {
  const R = l.g.userData.ref, C = l.g.userData.cutPts, kk = Math.min(1, dt * 4); l.rf ??= {};
  for (const k in R || {}) {
    const t = refTarget(k) ? 1 : 0, f = (l.rf[k] = (l.rf[k] ?? t) + (t - (l.rf[k] ?? t)) * kk), grp = R[k]; grp.userData.refGrp = true; grp.visible = f > 0.01; if (!grp.visible) continue;
    const seen = new Set(); grp.traverse((o) => { const m = o.material; if (!m || seen.has(m)) return; seen.add(m); if (m.uniforms?.uA) m.uniforms.uA.value *= f; else m.opacity *= f; });
  }
  if (l.id !== 'cel.laniakea') { const t = FX.refOn ? 1 : 0, f = (l.lf = (l.lf ?? t) + (t - (l.lf ?? t)) * kk); if (f < 0.999) fadeLines(l.g, f, new Set()); }
  if (C) { const t = FX.ref.cut ? 1 : 0; l.cv = (l.cv ?? 0) + (t - (l.cv ?? 0)) * Math.min(1, dt * 3); for (const o of C) o.material.uniforms.uCut.value = l.cv; }
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
  { a: 8.2, r: 0.035, p: 120, m: (s) => planetMat(s, [0.5, 0.4, 0.33], [0.84, 0.76, 0.66], 1, 0, 0, 0.4) }, // 冥王星（矮行星）：和八大行星一样用平均根数画轨道与位置
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
  [39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684], // 冥王星（JPL 平均根数，同一张表）
];
function kepler(el, yr) { // 返回黄道坐标 (x,y,z)，AU
  const D = Math.PI / 180, [a, e, I, L, vp, Om] = el, w = (vp - Om) * D, O = Om * D, i = I * D, n = 360 / Math.pow(a, 1.5);
  let M = (((L - vp + n * yr) * D) % TAU + TAU) % TAU, E = M + e * Math.sin(M); for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E), cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i);
  return [(cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp, (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp, sw * si * xp + cw * si * yp];
}
// 彗星：真实根数的二体轨道 + 活动模型（彗发／离子尾／尘埃尾随日心距离变化）。离子尾：背离太阳并受太阳风（约 400 km/s）与彗星速度的合成偏折；
// 尘埃尾：尘埃以彗核速度释放，受辐射压 β 积分，向后弯曲且更宽。尾长与彗发大小经增强显示（真实尺度太小看不见）。远于 60 AU 时不显示。
const COMET_RMAX = 60, TAIL_K = 6, KMS = 4.74047; // AU/年 → km/s
function makeComet(c, toV, uPR) {
  const g = new THREE.Group(), NI = 56, ND = 3 * 40, N = NI + ND, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), sz = new Float32Array(N);
  for (let i = 0; i < N; i++) sz[i] = i < NI ? 0.8 * (1 - i / NI) + 0.15 : 0.9 * (1 - ((i - NI) % 40) / 40 * 0.7) + 0.15;
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); tg.setAttribute('aS', new THREE.BufferAttribute(sz, 1)); tg.setAttribute('aC', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const tail = new THREE.Points(tg, smat(POINTS_VS, POINTS_FS, { uPR: { value: uPR }, uSize: { value: 1.3 } }, { blending: THREE.AdditiveBlending })); tail.frustumCulled = false;
  const head = glow([0.85, 0.95, 1], 3, 0.1), orbit = new THREE.Line(new THREE.BufferGeometry(), lineMat(0x9fd0ff, 0.35)); g.add(orbit, tail, head);
  const cEs = (1 - COMET_RMAX / c.a) / c.e, Em = cEs > 1 ? 0 : cEs < -1 ? Math.PI : Math.acos(cEs); // r ≤ 60 AU 的那段轨道
  const rebuild = () => { const o = []; for (let i = 0; i <= 240; i++) { const E = -Em + (i / 240) * 2 * Em; const n = TAU / Math.pow(c.a, 1.5), M = E - c.e * Math.sin(E); o.push(toV(cometPos(c, c.tp + M / n), V(0, 0, 0)).clone()); } orbit.geometry.setFromPoints(o); }; rebuild();
  const st = { A: 0, r: 99 }, p3 = V(0, 0, 0);
  const update = (yr) => {
    const p = cometPos(c, yr), r = Math.hypot(...p); st.r = r; st.A = r < c.rAct ? Math.pow(1 - r / c.rAct, 1.5) * c.act : 0;
    const vis = FX.comets && r < COMET_RMAX; g.visible = !!FX.comets; head.visible = vis; tail.visible = vis && !!FX.tails; if (!vis) return;
    toV(p, p3); head.position.copy(p3); head.scale.setScalar(0.07 + 0.3 * Math.min(st.A, 1.2)); head.material.uniforms.uCol.value.setRGB(0.85, 0.95, 1).multiplyScalar(0.12 + 0.7 * Math.min(st.A, 1));
    if (st.A < 0.01) { col.fill(0); tg.attributes.aC.needsUpdate = true; return; }
    const rh = p.map((x) => x / r), v = cometVel(c, yr).map((x) => x * KMS), dv = [rh[0] * 400 - v[0], rh[1] * 400 - v[1], rh[2] * 400 - v[2]], dl = Math.hypot(...dv), L = c.ion * st.A * 1.4, wob = yr * 60;
    for (let k = 0; k < NI; k++) { const u = k / NI, rip = 0.02 * L * u * Math.sin(k * 0.8 + wob), q = [p[0] + (dv[0] / dl) * L * u * TAIL_K + rip, p[1] + (dv[1] / dl) * L * u * TAIL_K + rip * 0.6, p[2] + (dv[2] / dl) * L * u * TAIL_K]; toV(q, p3); pos.set([p3.x, p3.y, p3.z], k * 3); const f = (1 - u * 0.8) * Math.min(1, st.A) * 0.9; col.set([0.45 * f, 0.72 * f, 1 * f], k * 3); }
    for (let m = 0; m < 3; m++) for (let k = 0; k < 40; k++) {
      const u = (k + 1) / 40, d = dustDelta(c, yr, c.dust * 0.1 * Math.pow(u, 1.4), c.beta * [0.7, 1, 1.35][m]), q = [p[0] + d[0] * TAIL_K, p[1] + d[1] * TAIL_K, p[2] + d[2] * TAIL_K], i = NI + m * 40 + k;
      toV(q, p3); pos.set([p3.x, p3.y, p3.z], i * 3); const f = (1 - u * 0.75) * Math.min(1, st.A) * (m === 1 ? 0.7 : 0.4); col.set([1 * f, 0.86 * f, 0.55 * f], i * 3);
    }
    tg.attributes.position.needsUpdate = true; tg.attributes.aC.needsUpdate = true;
  };
  return { group: g, head, update, rebuild, st, c };
}
const comLabels = (items) => items.flatMap((it) => [{ p: V(0, 0, 0), follow: () => it.head, text: '', dyn: () => `${it.c.name}（日心 ${it.st.r.toFixed(1)} AU · ${it.st.A > 0.02 ? '活跃：彗发与彗尾已出现' : it.st.r >= COMET_RMAX ? '太远，未显示' : '休眠'}）`, lvl: [0] }]);
// 彗星专题层：太阳 + 行星轨道（参考）+ 选定彗星；展示比例（距离按平方根压缩），时间＝统一模拟时间
function buildComets(ids, fit, uPR) {
  const g = new THREE.Group(), toV = (p, o = V(0, 0, 0)) => { const d = Math.hypot(p[0], p[1], p[2]) || 1, f = (1.15 * Math.sqrt(d) + 0.1) / d; return o.set(p[0] * f, p[2] * f, -p[1] * f); };
  g.add(glow([1, 0.65, 0.25], 2.4, 1.4), pointsOf([{ p: [0, 0, 0], s: 3.6, c: [1, 0.92, 0.7] }], 1, uPR));
  ELEM.forEach((el0) => { const pts = []; for (let k = 0; k <= 180; k++) { const el = el0.slice(); el[3] = el[4] + (k / 180) * 360; pts.push(toV(kepler(el, 0)).clone()); } g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(0xffd28a, 0.16))); });
  const items = COMETS.filter((c) => ids.includes(c.id)).map((c) => makeComet(c, toV, uPR)); items.forEach((it) => g.add(it.group));
  g.userData.tick = () => items.forEach((it) => it.update(SIM.yr));
  g.userData.labels = [{ p: V(0, -0.5, 0), text: '太阳' }, ...comLabels(items), ...items.map((it) => ({ p: V(0, 0, 0), follow: () => it.head, text: it.c.tag, lvl: [0], k: 'minor' })), { hud: [0.66, 0.97], text: '彗星位置为二体开普勒近似（非 Horizons 星历）；彗尾长度与彗发大小经增强显示' }];
  g.userData.fitR = fit; g.rotation.x = 0.6; return g;
}
function buildSolar(uPR) {
  const g = new THREE.Group(), sunW = V(0, 0, 0), r = rng(7);
  let mode = 0; // 0 展示比例，1 真实距离比例
  const fd = (rAU) => (mode === 0 ? 1.15 * Math.sqrt(rAU) + 0.1 : 0.2 * rAU), toV = (p, o = V(0, 0, 0)) => { const d = Math.hypot(p[0], p[1], p[2]) || 1, f = fd(d) / d; return o.set(p[0] * f, p[2] * f, -p[1] * f); }; // 黄道 (x,y,z) → 场景 (x,z,-y)，径向压缩保持方向
  const sun = createPhotosphereMesh(SUNKIT, 0.45), sunGl = [glow([1, 0.55, 0.2], 2.4, 3.0), glow([1, 0.8, 0.45], 6, 1.2)];
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
  // 太阳风（太阳系尺度）：稀疏粒子 + 极短流线 + 少量帕克螺旋辅助线；行星附近自动变淡
  const wind = createSolarWind(SUNKIT, { n: SOLAR_WIND.solarWindDensityFar, r0: 0.3, r1: 34, map: 0, size: 0.9, speed: 0.03, tail: 0.02, opacity: 0.42, flat: 0.3, occ: 0.45, curl: 0, planets: true, seed: 78 }); g.add(wind.group);
  const parker = [0, 1].map((m) => { const old = mode; mode = m; const p = createParkerSpirals(SUNKIT, fd); mode = old; p.visible = false; g.add(p); return p; }), plPos = [];
  // 黄道面与坐标轴（默认隐藏）
  const ref = new THREE.Group(), plane = new THREE.Mesh(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6f86c8, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false })); plane.material.userData.base = 0.07;
  const axis = (v, c) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), v]), lineMat(c, 0.55)); ref.add(plane, axis(V(1, 0, 0), 0xffb070), axis(V(0, 0, -1), 0x80c0ff), axis(V(0, 1, 0), 0xa0ffb0)); g.add(ref); g.userData.ref = { ref };
  const comets = COMETS.map((c) => makeComet(c, toV, uPR)); comets.forEach((it) => g.add(it.group));
  const place = () => { comets.forEach((it) => it.rebuild()); const R = fd(33); plane.scale.setScalar(R); ref.children.slice(1).forEach((ln, k) => ln.scale.setScalar(R)); sun.scale.setScalar(mode === 0 ? 1 : 0.12); sunGl[0].scale.setScalar(mode === 0 ? 3.0 : 0.5); sunGl[1].scale.setScalar(mode === 0 ? 1.2 : 0.2); bodies.forEach((b) => b.scale.setScalar(mode === 0 ? 1 : 0.45)); orbits[0].forEach((o) => (o.visible = mode === 0)); orbits[1].forEach((o) => (o.visible = mode === 1)); setBelt(); };
  place();
  const YR = 0.12; let yr = 0; // 模拟时间：1 秒 ≈ 0.12 年（地球约 8 秒一圈；水星约 2 秒，海王星约 23 分钟）
  const tmp = V(0, 0, 0);
  // 太阳系全景里的主要卫星：只画成行星附近的小光点（不画轨道线、不挂标签）；公转速度与行星近景一致，是展示压缩，不是模拟时间；轨道半径按行星放大后的显示尺寸缩放
  const MN = [];
  for (const [id, bi] of [['cel.mars', 3], ['cel.jupiter', 4], ['cel.saturn', 5], ['cel.uranus', 6], ['cel.neptune', 7]]) { const o = M.SYS[id]; for (const m of o.moons) MN.push({ bi, a: Math.min(0.55, Math.max(PLANETS[bi].r * 1.7, PLANETS[bi].r * (m.a / o.R) * 0.6)), p: m.p, ph: r() * TAU, c: m.type === 7 ? [1, 0.85, 0.5] : m.type === 11 ? [1, 0.7, 0.35] : [0.85, 0.85, 0.88], tilt: id === 'cel.uranus' ? 1.71 : 0 }); }
  MN.push({ bi: 2, a: Math.max(0.16, PLANETS[2].r * 3.2), p: 14, ph: 0.3, c: [0.85, 0.85, 0.88], tilt: 0 }); // 月球
  const moonPts = pointsOf(MN.map((m) => ({ p: [0, 0, 0], s: 1.0, c: m.c.map((x) => x * 0.8) })), 1, uPR); moonPts.userData.still = true; g.add(moonPts);
  const moonStep = (t) => { const pa = moonPts.geometry.attributes.position; MN.forEach((m, i) => { const ang = m.ph + (TAU / m.p) * t * 0.9, x = Math.cos(ang) * m.a, z = -Math.sin(ang) * m.a, b = bodies[m.bi].position; pa.setXYZ(i, b.x + (m.tilt ? x * Math.cos(m.tilt) : x), b.y + (m.tilt ? x * Math.sin(m.tilt) : 0), b.z + z); }); pa.needsUpdate = true; moonPts.visible = !!FX.moons; };
  g.userData.tick = (t) => { comets.forEach((it) => it.update(SIM.yr)); beltPts.visible = !!FX.belt; plPos.length = 0; bodies.forEach((b) => plPos.push(b.position)); wind.update(t, { pr: uPR, map: mode, planets: plPos.slice(0, 8), sunR: mode === 0 ? 0.45 : 0.054 }); parker.forEach((p, m) => (p.visible = m === mode && (FX.wind ?? 1) > 0 && !!FX.parker)); sun.material.uniforms.uST.value = t * 0.25; sun.material.uniforms.uGT.value = t / 9; yr = SIM.yr; bodies.forEach((b, i) => { toV(kepler(ELEM[i], yr), tmp); b.position.copy(tmp); b.rotation.y = t * 0.3; }); moonStep(t); };
  g.userData.still = true; g.userData.fitR = 8.2;
  g.userData.labels = [
    { p: V(0, -0.7, 0), text: '太阳', lvl: [0] },
    { p: V(-6.6, 0, 5.6), text: '', dyn: () => `模拟日期：${simDate(SIM.yr)}（J2000.0 ${SIM.yr >= 0 ? '+' : '−'} ${Math.abs(SIM.yr).toFixed(1)} 年；二体开普勒近似，非 Horizons 星历；彗尾长度经增强显示）`, lvl: [0] },
    { p: V(-6.6, 0, 6.6), text: '', dyn: () => (mode === 0 ? '▶ 展示比例（距离压缩、行星放大，非真实比例）—点击切换为真实距离' : '▶ 真实距离比例（线性，行星仍放大显示）—点击切换为展示比例'), toggle: () => { mode = 1 - mode; place(); }, lvl: [0] },
    ...comLabels(comets),
    ...ELEM.map((el, i) => ({ p: V(0, 0, 0), text: ['水星', '金星', '地球', '火星', '木星', '土星', '天王星', '海王星', '冥王星（矮行星）'][i], follow: () => bodies[i], lvl: [0] })),
  ];
  g.rotation.x = 0.65; return g;
}
// L3.2 奥尔特云（假设性结构，至今未被直接观测）：1 单位＝2 万 AU，外缘 5 单位＝10 万 AU（NASA 给出的约 2,000–100,000 AU 估计范围）。
// 外层：近球形、密度 ∝ r⁻²（文献模型取值范围内的示意选择，非实测）、外缘逐渐稀疏、各方向有不规则起伏；内层：2,000–2 万 AU，较扁平且有倾角，向外过渡为球状；
// 另有可选的“研究模拟”内层（双旋臂翘曲盘，基于 2025 年动力学模拟，未被观测确认）。粒子是冰质小天体的统计示意，不是实测天体坐标；颜色为编码色，不是真实发光色。
const OORT_COL = [[0.863, 0.914, 0.961], [0.502, 0.722, 0.875], [0.651, 0.627, 0.835], [0.894, 0.773, 0.553]]; // 银白／冷蓝／冷紫／柔金
function buildOort(uPR) {
  const g = new THREE.Group(), r = rng(13), base = [], lit = [], X = V(1, 0, 0), ph = [r() * 6.3, r() * 6.3, r() * 6.3];
  const sm = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
  const col = () => { const u = r(); return OORT_COL[u < 0.55 ? 0 : u < 0.8 ? 1 : u < 0.95 ? 2 : 3]; };
  const put = (p, k0) => { const u = r(), c = col(); // 亮度分级：绝大多数很弱；少量清晰小点；极少数展示点
    if (u < 0.92) base.push({ p, s: 0.25 + r() * 0.2, c: c.map((x) => x * (0.13 + 0.1 * r()) * k0) });
    else if (u < 0.995) lit.push({ p, s: 0.6 + r() * 0.4, c: c.map((x) => x * (0.35 + 0.25 * r()) * k0) });
    else lit.push({ p, s: 1.4 + r() * 0.5, c: c.map((x) => x * 0.8 * k0) }); };
  for (let i = 0, n = 0; n < 4800 && i < 40000; i++) { // 外层
    const rr = 1 + r() * 5, d = V(gauss(r), gauss(r), gauss(r)).normalize();
    if (r() > (rr < 3 ? 1 : Math.exp(-(rr - 3) / 1.1)) * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(2.3 * d.x + ph[0]) * Math.sin(2.1 * d.y + ph[1]) * Math.sin(2.7 * d.z + ph[2])))) continue;
    n++; put(d.multiplyScalar(rr).toArray(), 1);
  }
  const inner = (spiral) => { const out = [];
    for (let i = 0; i < 3200; i++) { const rr = 0.1 * Math.pow(15, r()); let p;
      if (spiral) { const k = i % 2, th = k * Math.PI + 2.4 * Math.log(rr / 0.1) + gauss(r) * 0.3; p = V(Math.cos(th) * rr, gauss(r) * 0.07 * rr + 0.2 * rr * Math.sin(th - 0.6), Math.sin(th) * rr); }
      else { const f = 0.22 + 0.78 * sm((rr - 0.3) / 1.0); p = V(gauss(r), gauss(r) * f, gauss(r)).normalize().multiplyScalar(rr).applyAxisAngle(X, 0.35); }
      const c = col(), u = r(); out.push({ p: p.toArray(), s: u < 0.94 ? 0.25 + r() * 0.2 : 0.65 + r() * 0.4, c: c.map((x) => x * (u < 0.94 ? 0.16 + 0.1 * r() : 0.4 + 0.2 * r())) }); }
    return out; };
  const pBase = pointsOf(base, 1, uPR), pLit = pointsOf(lit, 1, uPR); pBase.userData.still = true; g.userData.glintPts = [pLit];
  const pIn = pointsOf(inner(false), 1, uPR), pSp = pointsOf(inner(true), 1, uPR); pIn.userData.still = pSp.userData.still = true; pSp.visible = false;
  g.add(pBase, pLit, pIn, pSp);
  const sun = pointsOf([{ p: [0, 0, 0], s: 3.2, c: [1, 0.82, 0.6] }], 1, uPR); sun.userData.still = true; g.add(sun, glow([1, 0.82, 0.6], 3, 0.3));
  g.add(new THREE.LineLoop(circle(0.07), lineMat(0xffd29a, 0.35))); // 太阳系位置（行星轨道、柯伊伯带只有数十 AU，圆圈为增强显示）
  // 参考层（各自可开关）：距离环、内外边界、坐标轴、网格、附近恒星方向
  const mk = (...o) => { const q = new THREE.Group(); q.add(...o); g.add(q); return q; };
  const rings = mk(dotRings([0.25, 1, 2.5, 5], uPR)), axes = mk(axesLines(5.8)), grid = mk(gridLines(5, 1)), bounds = mk(new THREE.LineLoop(circle(1), lineMat(0x9bb8e8, 0.16)), new THREE.LineLoop(circle(5), lineMat(0x9bb8e8, 0.16)));
  const lab = [['5,000 AU', 0.25, 0.4], ['20,000 AU（内层外缘）', 1, 0.9], ['50,000 AU', 2.5, 1.5], ['100,000 AU（外缘，估计）', 5, 2.2]].map(([text, R, an]) => ({ p: V(Math.cos(an) * R, 0, Math.sin(an) * R), text, color: '#6d89c0', ref: 'scale' }));
  for (const [p, tx] of [[V(6, 0, 0), '赤经 0h'], [V(0, 6, 0), '北天极'], [V(0, 0, 6), '赤经 18h']]) lab.push({ p, text: tx, color: '#8fa8d8', ref: 'axes', k: 'ref' });
  const dirs = [['半人马座 α 方向（实际约 27.6 万 AU，未按比例）', 14.66, -60.83, [1, 0.93, 0.72]], ['天狼星方向', 6.75, -16.72, [0.7, 0.82, 1]], ['织女星方向', 18.62, 38.78, [0.82, 0.9, 1]]];
  const sp = [];
  for (const [text, h, dec, c] of dirs) { const al = h * 15 * (Math.PI / 180), de = dec * (Math.PI / 180), p = V(Math.cos(de) * Math.cos(al), Math.sin(de), -Math.cos(de) * Math.sin(al)).multiplyScalar(6); sp.push({ p: p.toArray(), s: 2.6, c }); lab.push({ p: p.clone().add(V(0, -0.3, 0)), text, color: '#c9d6ee', k: 'minor' }); }
  const stars = pointsOf(sp, 1, uPR); stars.userData.still = true; g.add(stars);
  lab.push({ p: V(0, -0.22, 0), text: '太阳（行星轨道与柯伊伯带在此尺度下仅数十 AU，圆圈为增强显示）', color: '#ffd28a' });
  // 长周期彗星轨道演示（模拟）：高偏心率开普勒轨道；彗发／彗尾只在靠近太阳时逐渐出现（尺寸经增强）
  const A = 1.8, E0 = 0.9993, B = A * Math.sqrt(1 - E0 * E0), Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.0, 0.5, 0.3)), orb = (e) => V(A * (Math.cos(e) - E0), 0, B * Math.sin(e)).applyQuaternion(Q);
  const orbitLine = mk(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 720 }, (_, i) => orb((i / 720) * TAU))), lineMat(0xa6c8e8, 0.22)));
  const head = glow([0.8, 0.93, 1], 3, 0.1), tg = new THREE.BufferGeometry().setFromPoints([V(), V()]), tail = new THREE.Line(tg, lineMat(0xcfe6ff, 0)), cm = mk(head, tail);
  g.userData.tick = (t, w) => { if (!cm.visible) return; const M = (t / 200) * TAU; let e = M; for (let i = 0; i < 12; i++) e -= (e - E0 * Math.sin(e) - M) / (1 - E0 * Math.cos(e));
    const p = orb(e), d = p.length(), pr = Math.max(0, Math.min(1, 1 - d / 0.8)); head.position.copy(p); head.scale.setScalar(0.07 + 0.2 * pr); head.material.uniforms.uCol.value.setRGB(0.8, 0.93, 1).multiplyScalar(0.25 + 0.75 * pr);
    const q = p.clone().normalize().multiplyScalar(d + 0.9 * pr * pr); tg.attributes.position.setXYZ(0, p.x, p.y, p.z); tg.attributes.position.setXYZ(1, q.x, q.y, q.z); tg.attributes.position.needsUpdate = true; tail.material.opacity = 0.7 * pr * w; };
  let spOn = false;
  g.userData.ref = { rings, axes, grid, bounds, orbit: cm, orbitLine }; g.userData.cutPts = [pBase, pLit, pIn, pSp];
  g.rotation.x = 0.6; g.userData.fitR = 5.6;
  g.userData.labels = [...lab, { hud: [0.66, 0.97], text: '奥尔特云至今未被直接观测；粒子为模型示意，颜色为编码色' },
    { hud: [0.66, 0.89], text: '', dyn: () => (spOn ? '内层方案：研究模拟（基于动力学模拟的可能结构，尚未得到直接观测确认）' : '内层方案：基础科学方案（点击切换为研究模拟：双旋臂）'), toggle: () => { spOn = !spOn; pSp.visible = spOn; pIn.visible = !spOn; } },
    { hud: [0.66, 0.85], text: '剖切观察：靠近镜头的前半球已淡化，仅为观察手段，并非云真实缺失一半', when: () => FX.ref.cut },
    { hud: [0.66, 0.81], text: '彗星轨道为模拟轨道，非实际观测；彗发彗尾仅在接近太阳时出现，尺寸经增强', when: () => FX.ref.orbit }];
  return g;
}
const SUNKIT = { FXU, THREE, V, TAU, rng, gauss, NOISE, SPHERE_VS, smat, glow, POINTS_VS, POINTS_FS, ATMO_FS, pointsOf };
const M = createModels({ pulseGlow, FXU, THREE, V, TAU, rng, gauss, ease, NOISE, SPHERE_VS, ATMO_FS, SUN_FS, RING_VS, RING_FS, POINTS_VS, POINTS_FS, smat, sphereMat, sphere, circle, lineMat, pointsOf, glow, blob, PLANETS, T });
// L4.1 恒星邻域：以太阳为中心的近邻恒星三维图（1 单位＝2 光年）。
// 位置由 (赤经, 赤纬, 距离) 换算（赤道坐标，y＝北天极方向）；赤经赤纬、距离取常见文献近似值，未逐项对照目录。
// 三层：重点恒星（标注、辉光、少量短星芒）／普通邻域恒星（真实位置的暗星）／背景补充星（程序生成，稀疏，仅作陪衬）。
const HOOD_COL = { red: [1, 0.46, 0.32], orange: [1, 0.72, 0.45], yellow: [1, 0.9, 0.66], white: [0.92, 0.95, 1], blue: [0.7, 0.82, 1], gold: [1, 0.93, 0.72] };
// 重点：[标签, 赤经 h, 赤纬 °, 距离 ly, 色, 点大小, 亮度]
const HOOD_KEY = [
  ['南门二 · 比邻星（4.2–4.4 光年）', 14.66, -60.83, 4.37, 'gold', 3.0, 1], ['', 14.495, -62.68, 4.24, 'red', 1.7, 0.95],
  ['巴纳德星（6.0 光年）', 17.96, 4.69, 5.96, 'red', 1.8, 0.8], ['天狼星（8.6 光年）', 6.75, -16.72, 8.6, 'blue', 3.6, 1.1], ['波江座 ε（10.5 光年）', 3.55, -9.46, 10.5, 'orange', 2.2, 0.9],
  ['南河三（11.5 光年）', 7.65, 5.22, 11.46, 'yellow', 2.8, 1], ['鲸鱼座 τ（11.9 光年）', 1.73, -15.94, 11.9, 'yellow', 2.2, 0.9], ['河鼓二（16.7 光年）', 19.85, 8.87, 16.7, 'white', 2.9, 1],
  ['织女星（25 光年）', 18.62, 38.78, 25.0, 'white', 3.3, 1.05], ['北落师门（25 光年）', 22.96, -29.62, 25.1, 'white', 2.8, 1],
];
// 普通邻域恒星：[赤经 h, 赤纬 °, 距离 ly, 色]
const HOOD_MID = [[10.94, 7.0, 7.86, 'red'], [11.06, 35.97, 8.31, 'red'], [1.65, -17.95, 8.73, 'red'], [18.83, -23.8, 9.7, 'red'], [23.7, 44.2, 10.3, 'red'], [23.1, -35.85, 10.7, 'red'], [11.79, 0.8, 11.0, 'red'],
  [21.12, 38.75, 11.4, 'orange'], [18.71, 59.6, 11.5, 'red'], [0.31, 44.0, 11.6, 'red'], [22.06, -56.8, 11.87, 'orange'], [7.46, 5.23, 12.4, 'red'], [2.88, 16.9, 12.5, 'red'], [5.19, -45.0, 12.8, 'red'],
  [21.29, -38.9, 12.9, 'red'], [22.47, 57.7, 13.1, 'red'], [16.5, -12.7, 14.0, 'red'], [0.82, 5.4, 14.1, 'white'], [0.09, -37.4, 14.2, 'red'], [4.25, -7.65, 16.3, 'orange'], [18.09, 2.5, 16.6, 'orange'], [0.82, 57.8, 19.4, 'yellow'], [20.15, -66.2, 19.9, 'yellow']];
const HOOD_ZOOM = { 2: 2 }, HOOD_GO = { 0: 'cel.alpha-cen', 3: 'cel.sirius' }; // 半人马 α、天狼星有独立场景（点击标签进入）；巴纳德星仍是缩放目标 // HOOD_KEY 下标 → 缩放目标序号
function buildHood(uPR) {
  const g = new THREE.Group(), r = rng(21), S = 0.5, key = [], mid = [], bg = [], R0 = 14;
  const at = (h, dec, d) => { const al = h * 15 * (Math.PI / 180), de = dec * (Math.PI / 180); return V(d * Math.cos(de) * Math.cos(al) * S, d * Math.sin(de) * S, -d * Math.cos(de) * Math.sin(al) * S); };
  const dim = (p) => 1 - 0.4 * Math.min(1, p.length() / R0); // 远星略暗
  // 第三层：稀疏背景星，一半均匀、一半成团，留出大片暗区
  const cl = Array.from({ length: 4 }, () => V(gauss(r), gauss(r) * 0.6, gauss(r)).multiplyScalar(4.5));
  for (let i = 0, n = 0; n < 170 && i < 2000; i++) {
    const p = i % 2 ? V(gauss(r), gauss(r) * 0.7, gauss(r)).multiplyScalar(1.7).add(cl[i % 4]) : V(gauss(r), gauss(r), gauss(r)).normalize().multiplyScalar(13 * Math.cbrt(r()));
    if (p.length() < 1.2 || p.length() > 13.5) continue; n++;
    bg.push({ p: p.toArray(), s: 0.35 + r() * 0.35, c: starColor(r).map((x) => x * (0.14 + 0.14 * r()) * dim(p)) });
  }
  // 第二层：真实位置的普通恒星（暗、小、偏红）
  for (const [h, dec, d, c] of HOOD_MID) { const p = at(h, dec, d); mid.push({ p: p.toArray(), s: c === 'red' ? 1.0 : 1.4, c: HOOD_COL[c].map((x) => x * (c === 'red' ? 0.42 : 0.6) * dim(p)) }); }
  // 第一层：重点恒星
  const lab = [], drops = [];
  HOOD_KEY.forEach(([name, h, dec, d, c, s, b], i) => {
    const p = at(h, dec, d); key.push({ p: p.toArray(), s, c: HOOD_COL[c].map((x) => x * b * dim(p)) });
    pulseGlow(g, p, HOOD_COL[c], 3, 0.35 + 0.16 * s, 0.3 * b, 0.05, 9 + i * 1.7, i * 1.9); // 非同步的微弱呼吸
    if (name) lab.push({ p: p.clone().add(V(0, -0.45, 0)), text: name, ...(i === 0 || i === 3 || i === 8 ? {} : { k: 'minor' }), ...(HOOD_GO[i] ? { go: HOOD_GO[i] } : HOOD_ZOOM[i] !== undefined ? { zoom: HOOD_ZOOM[i] } : {}) });
    drops.push(p.x, p.y, p.z, p.x, 0, p.z); // 到赤道面的垂线：辅助判断深度
  });
  key.push({ p: [0, 0, 0], s: 4.4, c: HOOD_COL.gold }); // 太阳
  const tier = (arr, size) => { const m = pointsOf(arr, size, uPR); g.add(m); return m; };
  const t3 = tier(bg, 1.2), t2 = tier(mid, 1.2), t1 = tier(key, 1.2); g.userData.glintPts = [t1];
  const sun = glow([1, 0.86, 0.55], 3, 0.9), halo = glow([1, 0.9, 0.7], 3, 2.8); halo.material.uniforms.uCol.value.multiplyScalar(0.1); g.add(halo, sun);
  const mk = (...o) => { const q = new THREE.Group(); q.add(...o); g.add(q); return q; };
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(drops, 3));
  const rings = mk(dotRings([5 * S, 10 * S, 20 * S], uPR), new THREE.LineSegments(dg, lineMat(0x7f9fe0, 0.055))), axes = mk(axesLines(13)), grid = mk(gridLines(12.5, 2.5));
  for (const [ly, tx] of [[5, '5 光年'], [10, '10 光年'], [20, '20 光年']]) lab.push({ p: V(ly * S * 0.7071, 0, ly * S * 0.7071), text: tx, color: '#6d89c0', ref: 'scale' });
  for (const [p, tx] of [[V(13.5, 0, 0), '赤经 0h'], [V(0, 13.5, 0), '北天极'], [V(0, 0, 13.5), '赤经 18h']]) lab.push({ p, text: tx, color: '#8fa8d8', ref: 'axes', k: 'ref' });
  g.userData.zoom = [[0, 14], [3, 6], [2, 6]].map(([i, sc]) => ({ p: at(HOOD_KEY[i][1], HOOD_KEY[i][2], HOOD_KEY[i][3]), s: sc })); // 缩放目标 0 半人马 α（比邻星离它很近，倍率大些）、1 天狼星、2 巴纳德星（见 ZOOM_OF）
  let more = true; // 只显示重点恒星／显示更多邻域恒星
  g.userData.ref = { rings, axes, grid }; g.userData.fitR = 13;
  g.rotation.x = 0.35; g.userData.labels = [{ p: V(0, -0.5, 0), text: '太阳', color: '#ffd28a' }, ...lab, { hud: [0.5, 0.93], text: '显示：全部邻域恒星（点击切换为只显示重点）', dyn: () => (more ? '显示：全部邻域恒星（点击切换为只显示重点）' : '显示：只显示重点恒星（点击显示更多邻域恒星）'), toggle: () => { more = !more; t2.visible = t3.visible = more; } }]; return g;
}
// L5 本地泡：太阳周围气体稀薄的“气泡”
const BUBBLE_FS = `${NOISE} varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec3 vL; uniform float uTime; uniform float uA;
void main(){ vec3 p=normalize(vP), n=normalize(vN), v=normalize(vV); float f=pow(1.-abs(dot(n,v)),2.); float m=fbm(p*5.+uTime*.01);
  gl_FragColor=vec4(vec3(.3,.55,.95)*(.2+m)*(.08+f*.4),(.015+f*.16)*uA); }`; // 本地泡的壳：很淡，只勾出边缘
// 本地泡（概念重建，非精确观测边界）：1 单位＝20 pc，坐标以太阳为原点、按银河坐标 (l,b,d) 组织，显示时 (x,y,z)→(x,z,−y)（银盘水平、银北向上）。
// 形态参考 O'Neill 等（2024）“本地烟囱”：不规则低密度空腔，银河北向开放延伸（研究推定）；边界半径场由各方向的“叶”（云团一侧的外鼓、向北的烟囱、CMa 方向通道、凹陷）叠加而成，
// 没有导入原始三维尘埃数据，分子云位置取常见文献近似值（(l,b,d) 约值）。低可信区域（烟囱远端、通道）轮廓更弱。内部只放稀疏恒星，不用白色粒子表现气体。
const DEG = Math.PI / 180, gal = (l, b) => V(Math.cos(b * DEG) * Math.cos(l * DEG), Math.cos(b * DEG) * Math.sin(l * DEG), Math.sin(b * DEG));
const toDisp = (v, s = 1 / 20) => V(v.x * s, v.z * s, -v.y * s); // 银河坐标(pc)→显示单位
const LB_LOBES = [ // [l, b, 增量 pc, 角宽 rad, 低可信]
  [345, 10, 30, 0.7], [173, -15, 30, 0.5], [297, -15, 70, 0.35], [0, -18, 20, 0.3], // 蛇夫/豺狼/南冕一侧、金牛一侧、蝘蜓一侧的外鼓（壳层靠近这些云团）
  [0, 85, 150, 0.6, true], [240, -12, 60, 0.35, true], // 银河北向烟囱、CMa 方向通道（研究推定）
  [270, 10, -25, 0.4], [90, -30, -25, 0.4], // 凹陷
].map(([l, b, amp, w, low]) => ({ d: gal(l, b), amp, w, low }));
const LB_CLOUDS = [ // [名称, l, b, d(pc), 尺度 pc, 有年轻恒星, 有发射/反射光, 重点标签]
  ['金牛座分子云', 173, -15, 140, 18, 1, 0, 1], ['蛇夫座分子云', 353, 17, 139, 9, 1, 1, 1], ['豺狼座分子云', 339, 16, 155, 11, 1, 0, 0],
  ['蝘蜓座分子云', 297, -15, 190, 10, 1, 0, 0], ['南冕座分子云', 0, -18, 150, 7, 1, 1, 0], ['烟斗星云（暗云）', 0, 5, 145, 12, 0, 0, 0],
].map(([name, l, b, d, sg, yo, em, key]) => ({ name, dir: gal(l, b), d, sg, yo, em, key, pos: gal(l, b).multiplyScalar(d) }));
function bubbleR(dir, ph) { // 方向 dir（银河坐标单位向量）上的壳层半径 pc 与可信度
  let R = 85, low = 0;
  for (const o of LB_LOBES) { const an = Math.acos(Math.max(-1, Math.min(1, dir.dot(o.d)))), k = Math.exp(-((an / o.w) ** 2)); R += o.amp * k; if (o.low) low = Math.max(low, k); }
  R += 7 * (Math.sin(2.7 * dir.x + ph[0]) + Math.sin(3.3 * dir.y + ph[1]) * Math.sin(2.1 * dir.z + ph[2])); // 低阶起伏（确定性，非随机抖动）
  return [R, 1 - 0.55 * low];
}
function buildBubble(uPR) {
  const g = new THREE.Group(), r = rng(34), ph = [r() * 6.3, r() * 6.3, r() * 6.3], ph2 = [r() * 6.3, r() * 6.3, r() * 6.3];
  const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const dust = [], edge = [], cl = [], yst = [], stars = [], bright = [], xr = [], P = (v) => toDisp(v).toArray();
  const DUST = [0.459, 0.435, 0.62], WARM = [0.55, 0.44, 0.52], ICE = [0.533, 0.671, 0.82], PINK = [0.847, 0.494, 0.616], YOUNG = [0.714, 0.851, 1], SUN = [1, 0.878, 0.635];
  // B. 边缘尘埃壳层：不规则、厚薄不一、有缺口；靠近云团的一侧更稠、偏暖褐
  for (let i = 0, n = 0; n < 7500 && i < 90000; i++) {
    const d = V(gauss(r), gauss(r), gauss(r)).normalize(), [R, conf] = bubbleR(d, ph);
    const nz = 0.5 + 0.5 * Math.sin(3.1 * d.x + ph2[0]) * Math.sin(2.7 * d.y + ph2[1]) * Math.sin(3.7 * d.z + ph2[2]) + 0.25 * Math.sin(7 * d.x + 2 * d.z + ph2[1]);
    let boost = 0; for (const c of LB_CLOUDS) boost += Math.exp(-((Math.acos(Math.max(-1, Math.min(1, d.dot(c.dir)))) / 0.4) ** 2));
    const rho = Math.max(0, Math.min(1.2, (0.15 + 0.7 * nz) * (1 + 0.8 * boost) * (conf < 1 ? 0.7 : 1)));
    if (rho < 0.22 || r() > rho * 0.85) continue; n++;
    const t = (8 + 14 * nz) * (conf < 1 ? 1.8 : 1), rr = Math.max(25, R + gauss(r) * t), k = (0.3 + 0.4 * rho) * conf, warm = sm(0.5, 1.2, boost);
    const c = DUST.map((x, j) => x + (WARM[j] - x) * warm);
    if (r() < 0.07) edge.push({ p: P(d.clone().multiplyScalar(rr)), s: 0.7 + r() * 0.4, c: ICE.map((x) => x * (0.28 + 0.2 * r()) * conf) });
    else dust.push({ p: P(d.clone().multiplyScalar(rr)), s: 0.45 + r() * 0.4, c: c.map((x) => x * k) });
  }
  // 周边分子云：真实方向与距离（近似值），各有尺度与形态；恒星形成区点缀年轻蓝白星，仅蛇夫座、南冕座有微弱粉色云气
  const lab = [];
  for (const c of LB_CLOUDS) {
    const ax = V(gauss(r), gauss(r), gauss(r) * 0.5).normalize(), N = Math.round(60 + c.sg * 12);
    for (let i = 0; i < N; i++) { const u = gauss(r), v = V(gauss(r), gauss(r), gauss(r)).multiplyScalar(c.sg * 0.55).addScaledVector(ax, u * c.sg * 0.9); cl.push({ p: P(c.pos.clone().add(v)), s: 0.4 + r() * 0.5, c: WARM.map((x) => x * (0.1 + 0.16 * r())) }); }
    if (c.yo) for (let i = 0; i < 18; i++) yst.push({ p: P(c.pos.clone().add(V(gauss(r), gauss(r), gauss(r)).multiplyScalar(c.sg * 0.7))), s: 0.8 + r() * 0.7, c: YOUNG.map((x) => x * (0.4 + 0.3 * r())) });
    if (c.em) { const gl = glow(PINK, 3, 1.1 + c.sg * 0.06); gl.material.uniforms.uCol.value.multiplyScalar(0.12); gl.position.copy(toDisp(c.pos)); g.add(gl); }
    lab.push({ p: toDisp(c.pos).add(V(0, -0.5, 0)), text: c.name, color: '#d6a9bd', ...(c.key ? {} : { k: 'minor' }) });
  }
  for (let i = 0; i < 90; i++) { const d = gal(335 + gauss(r) * 14, 12 + gauss(r) * 8).multiplyScalar(130 + gauss(r) * 14); yst.push({ p: P(d), s: 0.8 + r() * 0.6, c: YOUNG.map((x) => x * (0.35 + 0.3 * r())) }); } // 蝎虎-半人马（Sco–Cen）一带的年轻恒星（近似）
  // A. 内部：只放稀疏的真实类型恒星，不用粒子表现气体
  for (let i = 0; i < 380; i++) { const d = V(gauss(r), gauss(r), gauss(r)).normalize(), R = bubbleR(d, ph)[0] * 0.85 * Math.cbrt(r()), c = starColor(r); (i < 14 ? bright : stars).push({ p: P(d.multiplyScalar(R)), s: i < 14 ? 1.6 + r() * 0.8 : 0.35 + r() * 0.5, c: c.map((x) => x * (i < 14 ? 0.8 : 0.35 + 0.2 * r())) }); }
  const mk = (...o) => { const q = new THREE.Group(); q.add(...o); g.add(q); return q; }, pts = (arr, still = true) => { const m = pointsOf(arr, 1, uPR); m.userData.still = still; return m; };
  const pDust = pts(dust), pCl = pts(cl), pSt = pts(stars), pYo = pts(yst), pEdge = pts(edge, false), pBr = pts(bright, false); g.userData.glintPts = [pBr];
  g.add(pDust, pCl, pSt, pYo, pEdge, pBr);
  const sun = pts([{ p: [0, 0, 0], s: 3.4, c: SUN }]); g.add(sun, glow(SUN, 3, 0.55));
  // 参考层
  const bnd = (f) => { const o = []; for (let i = 0; i < 180; i++) { const t = (i / 180) * TAU, d = f(Math.cos(t), Math.sin(t)); o.push(toDisp(d.clone().multiplyScalar(bubbleR(d, ph)[0]))); } return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(o), lineMat(0x88abd1, 0.18)); };
  const bounds = mk(bnd((c, s) => V(c, s, 0)), bnd((c, s) => V(c, 0, s)), bnd((c, s) => V(0, c, s)));
  const rings = mk(dotRings([1.25, 2.5, 5, 10], uPR)), axes = mk(axesLines(11)), gp = []; for (let u = -10; u <= 10; u += 2.5) gp.push(V(u, 0, -10), V(u, 0, 10), V(-10, 0, u), V(10, 0, u));
  const grid = mk(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gp), lineMat(0x6f88c0, 0.07))); // 银河平面
  for (const [t, R, an] of [['25 pc（约 80 光年）', 1.25, 0.5], ['50 pc', 2.5, 0.9], ['100 pc（约 330 光年）', 5, 1.3], ['200 pc', 10, 1.7]]) lab.push({ p: V(Math.cos(an) * R, 0, Math.sin(an) * R), text: t, color: '#6d89c0', ref: 'scale' });
  for (const [t, p] of [['银心方向 l=0°', V(11.4, 0, 0)], ['l=90°', V(0, 0, -11.4)], ['银北极', V(0, 11.4, 0)]]) lab.push({ p, text: t, color: '#8fa8d8', ref: 'axes', k: 'ref' });
  const mg = [], xa = []; for (let i = 0; i < 26; i++) { const d = V(gauss(r), gauss(r), gauss(r) * 0.5).normalize(), [R, cf] = bubbleR(d, ph); if (cf < 1) continue; const p = d.clone().multiplyScalar(R), tg = V(-d.y, d.x, 0).normalize().multiplyScalar(12); mg.push(toDisp(p.clone().sub(tg)), toDisp(p.clone().add(tg))); }
  const mag = mk(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(mg), lineMat(0xa6a0d5, 0.3)));
  for (let i = 0; i < 1800; i++) { const d = V(gauss(r), gauss(r), gauss(r)).normalize(), R = bubbleR(d, ph)[0] * 0.9 * Math.cbrt(r()); xr.push({ p: P(d.multiplyScalar(R)), s: 0.9 + r() * 0.5, c: [0.4, 0.85, 0.95].map((x) => x * 0.06) }); }
  const xray = mk(pts(xr));
  const chim = toDisp(V(0, 0, 1).multiplyScalar(bubbleR(V(0, 0, 1), ph)[0] * 0.95));
  lab.push({ p: chim, text: '本地烟囱（银河北向，研究推定）', color: '#a9c3e6' }, { p: V(0, -0.45, 0), text: '太阳（点击进入恒星邻域）', color: '#ffe0a2', go: 'cel.neighborhood' });
  g.userData.cutPts = [pDust, pCl, pSt, pYo, pEdge, pBr, sun]; g.userData.ref = { rings, axes, grid, bounds, mag, xray };
  g.rotation.set(0.5, -0.5, 0); g.userData.fitR = 9;
  g.userData.labels = [...lab, { hud: [0.66, 0.97], text: '本地泡为概念重建，非精确观测边界' }, { hud: [0.66, 0.935], text: '形态参考 O’Neill 等 2024（未导入原始数据）；云团位置为近似值' },
    { hud: [0.66, 0.89], text: '软 X 射线热气体为伪彩色可视化，非人眼所见颜色；X 射线热泡与尘埃边界不完全等同', when: () => FX.ref.xray },
    { hud: [0.66, 0.85], text: '磁场方向线为示意（沿壳层切向取向），非实际重建', when: () => FX.refOn },
    { hud: [0.66, 0.81], text: '剖切观察：靠近镜头的前半球已淡化，仅为观察手段', when: () => FX.ref.cut }];
  return g;
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
  g.userData.fitR = 22; g.rotation.x = 1.3; labels(g, [[[SUN_R, 0.3, 0.9], '太阳系（距银心约 2.6 万光年）'], [at(0, 11.5), '盾牌–半人马臂'], [at(1, 12), '英仙臂'], [at(2, 8.5), '人马臂'], [at(3, 7.8), '矩尺臂'], [[SUN_R - 0.2, 0.2, -0.9], '猎户臂支'], [[0, 1.1, -1.2], '核球与棒']]);
  // 银河中心区域与人马座 A*：缩放目标 0＝中心区域、1＝A*（黑洞不发光，只给定位标签，不画成发光的“太阳”，不虚构喷流）
  // 半人马座 ω（球状星团，l=309.1° b=+15.0° 约 1.7 万光年）：按银经银纬换算到银河系场景（太阳在 x=SUN_R）；点云按“中心密、外缘稀”的剖面，显示尺寸已放大
  { const K = Math.PI / 180, dk = 17.7 / 3.3, l = 309.1 * K, b = 15 * K, wc = V(SUN_R - dk * Math.cos(b) * Math.cos(l), dk * Math.sin(b), dk * Math.cos(b) * Math.sin(l)), rr = rng(5139), wp = [];
    for (let i = 0; i < 900; i++) { const d = V(gauss(rr), gauss(rr), gauss(rr)).normalize(), R = 0.09 * Math.pow(rr(), 1.7), k = rr() < 0.04 ? [0.75, 0.88, 1] : rr() < 0.6 ? [1, 0.92, 0.75] : [0.93, 0.95, 1]; wp.push({ p: wc.clone().addScaledVector(d, R).toArray(), s: 0.3 + rr() * 0.4, c: k.map((x) => x * (0.35 + 0.4 * rr())) }); }
    g.add(pointsOf(wp, 1, uPR)); g.userData.wc = wc; }
  g.userData.zoom = [{ p: V(0, 0, 0), s: 5 }, { p: g.userData.wc, s: 10, lvl: 2 }];
  g.userData.labels.push({ p: g.userData.wc.clone().add(V(0, -0.12, 0)), text: '半人马座 ω（巨大球状星团，约 1.7 万光年）', zoom: 1, lvl: [2] });
  g.userData.labels.push({ p: V(0, 0.9, 0.5), text: '银河中心区域', zoom: 0, lvl: [0, 1] }, { p: V(0, 0.08, 0), text: '人马座 A*（点击进入黑洞近景）', go: 'cel.sgr-a', lvl: [1], color: '#ffd28a' });
  return g;
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
  nodes.map((n) => [n, nodes.filter((m) => m.distanceTo(n) < 1.3).length]).sort((x, y) => y[1] - x[1]).slice(0, 6).forEach(([n], i) => pulseGlow(g, n, [1, 0.85, 0.6], 2.4, 0.9 + (i % 3) * 0.3, 0.07 + 0.02 * (i % 2), 0.015, 30 + i * 4, i * 1.7));
  g.add(pointsOf(a, 1.1, uPR)); labels(g, [[[0, -1.4, 0], '斯隆长城（长约 14 亿光年）']]); g.rotation.set(0.7, 0.3, 0); return g;
}
// L13.7 武仙-北冕座长城：由伽马射线暴分布推断出的巨型结构（存疑）
function buildHCB(uPR) {
  const g = new THREE.Group(), r = rng(121), a = [], P = (u) => V((u - 0.5) * 22, Math.sin(u * 3) * 2.6, Math.cos(u * 2) * 2.2);
  for (let i = 0; i < 12000; i++) { const p = P(r()); a.push({ p: [p.x + gauss(r) * 1.5, p.y + gauss(r) * 1.1, p.z + gauss(r) * 1.4], s: 0.25 + r() * 0.4, c: [0.5, 0.6, 0.95].map((x) => x * (0.4 + r() * 0.5)) }); }
  for (let i = 0; i < 520; i++) { const p = P(r()); a.push({ p: [p.x + gauss(r) * 1.2, p.y + gauss(r) * 0.9, p.z + gauss(r) * 1.1], s: 1.5 + r() * 1.3, c: [1, 0.42, 0.66] }); } // 伽马射线暴
  for (let i = 0; i < 2500; i++) a.push({ p: [(r() - 0.5) * 28, (r() - 0.5) * 14, (r() - 0.5) * 14], s: 0.2 + r() * 0.3, c: [0.35, 0.42, 0.62] });
  g.add(pointsOf(a, 1.1, uPR)); labels(g, [[[0, -4.6, 0], '武仙-北冕座长城（粉点＝伽马射线暴；是否为真实结构及其尺度仍有争议）']]); g.rotation.x = 0.4; return g;
}
const CMB_FS = /* glsl */ `${NOISE} varying vec3 vP; uniform float uA;
void main(){ vec3 p=normalize(vP); float t=clamp((fbm(p*9.)*.65+fbm(p*26.)*.35-.47)*4.+.5,0.,1.);
  vec3 c=mix(vec3(.04,.1,.6),vec3(.1,.6,.85),smoothstep(0.,.4,t)); c=mix(c,vec3(.95,.85,.3),smoothstep(.4,.7,t)); c=mix(c,vec3(.85,.2,.1),smoothstep(.7,1.,t));
  gl_FragColor=vec4(c*.5,.45*uA); }`;
// L14.6 可观测宇宙：宇宙网并入此层——蓝白发光的网球（亮节点＝星系团，丝带勾出近黑的空洞），球心是“我们”
function buildObservable() {
  const g = M.webObservable();
  g.add(glow([1, 0.88, 0.55], 2.6, 1.6)); const mark = new THREE.LineLoop(circle(0.6, 64), lineMat(0xffe2a0, 0.9)); mark.userData.keep = true; g.add(mark); g.userData.mark = mark;
  labels(g, [[[0, -1.2, 0], '我们在这里'], [[0, 14.8, 0], '可观测宇宙的边缘（观测范围，不是实体外壳）']]);
  const cmb = new THREE.Mesh(new THREE.SphereGeometry(14.6, 64, 40), smat(SPHERE_VS, CMB_FS, { uSunW: { value: V(0, 0, 0) } }, { side: THREE.BackSide })); cmb.visible = false; g.add(cmb);
  g.userData.labels.push({ p: V(0, -15.8, 0), text: '', dyn: () => (cmb.visible ? '▶ CMB 全天图：开（温度起伏伪彩色；程序示意，非实测数据）' : '▶ CMB 全天图：关（点击开启）'), toggle: () => { cmb.visible = !cmb.visible; } });
  return g;
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
  ['cel.sun', 1.7, (p) => { const g = createSun(SUNKIT); g.userData.pr = p; return g; }, 0.8],
  ['cel.solar', 2.3, buildSolar, 0.6, 'sol'],
  ['cel.asteroid-belt', 2.3, M.buildBelt, 0.62, 'sol'],
  ['cel.comets', 2.3, (p) => buildComets(['cel.halley', 'cel.hale-bopp', 'cel.67p'], 9.5, p), 0.34, 'sol'],
  ['cel.halley', 2.3, (p) => buildComets(['cel.halley'], 7.5, p), 0.62, 'sol'],
  ['cel.hale-bopp', 2.3, (p) => buildComets(['cel.hale-bopp'], 9.5, p), 0.23, 'sol'],
  ['cel.67p', 2.3, (p) => buildComets(['cel.67p'], 3.4, p), 0.8, 'sol'],
  ['cel.pillars', -4, M.buildPillars, 0.3, 'gx'], ['cel.m16', -4, M.buildM16, 0.3, 'gx'], ['cel.m42', -4, M.buildM42, 0.3, 'gx'], ['cel.horsehead', -4, M.buildHorsehead, 0.3, 'gx'], ['cel.m8', -4, M.buildM8, 0.3, 'gx'],
  ['cel.m20', -4, M.buildM20, 0.3, 'gx'], ['cel.carina', -4, M.buildCarina, 0.3, 'gx'], ['cel.tarantula', -4, M.buildTarantula, 0.3, 'gx'], ['cel.m1', -4, M.buildCrab, 0.3, 'gx'], ['cel.veil', -4, M.buildVeil, 0.3, 'gx'], ['cel.ngc7293', -4, M.buildHelix, 0.3, 'gx'],
  ['cel.alpha-cen', -5, (p) => M.buildMulti(M.MULTI_SPECS.alpha, p), 0.3, 'gx'], ['cel.sirius', -5, (p) => M.buildMulti(M.MULTI_SPECS.sirius, p), 0.3, 'gx'], ['cel.kepler16', -5, (p) => M.buildMulti(M.MULTI_SPECS.kepler16, p), 0.3, 'gx'], ['cel.algol', -5, (p) => M.buildMulti(M.MULTI_SPECS.algol, p), 0.3, 'gx'], // 著名星云独立场景（独占）
  ['cel.m51', -2, M.buildGalaxyPair, 0.5, 'gx'], // 河外星系专题场景（独占显示；尺度轴放在最内侧，避免与室女座／超星系团等层级叠加）
  ['cel.m104', -2, M.buildSombrero, 0.5, 'gx'],
  ['cel.bootes-void', -3, M.buildVoid, 0.3, 'gx'],
  ['cel.m87-bh', -1, (p) => M.buildBlackHole('m87', p), 0.5, 'bh'], // 黑洞近景：独立场景（x＝独占），尺度轴放在最内侧
  ['cel.sgr-a', -1, (p) => M.buildBlackHole('sgra', p), 0.5, 'bh'],
  ['cel.v404', -5, M.buildV404Pano, 0.3, 'gx'], ['cel.v404-binary', -1, M.buildV404Near, 0.4, 'bh'], // V3.1：黑洞吞噬恒星
  ['cel.qiz-host', -2, M.buildQizHost, 0.4, 'gx'], ['cel.qiz-smbh', -1, M.buildQizBH, 0.5, 'bh'], ['cel.at2019qiz', -1, M.buildTDE, 0.3, 'bh'],
  ['cel.oort', 3.2, buildOort, 0.7],
  ['cel.neighborhood', 4.1, (p) => M.decorateHood(buildHood(p)), 0.32],
  ['cel.local-bubble', 5, buildBubble, 0.46],
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
// 没有独立场景的导航节点：落在父场景里，并自动放大到对应的缩放目标（M31、M33、LMC、SMC 都在本星系群场景里已有模型）
const ZOOM_OF = { 'cel.m31': ['cel.local-group', 1], 'cel.m33': ['cel.local-group', 2], 'cel.lmc': ['cel.local-group', 3], 'cel.smc': ['cel.local-group', 4],
  'cel.galactic-center': ['cel.milkyway', 0], 'cel.m45': ['cel.orion-arm', 1], 'cel.orion-cloud': ['cel.orion-arm', 2],
  'cel.m87': ['cel.virgo-cluster', 4],
  'cel.barnard': ['cel.neighborhood', 2],
  'cel.m32': ['cel.local-group', 5], 'cel.m110': ['cel.local-group', 6], 'cel.m49': ['cel.virgo-cluster', 5], 'cel.m84': ['cel.virgo-cluster', 6], 'cel.m86': ['cel.virgo-cluster', 7],
  'cel.ngc5195': ['cel.m51', 1], 'cel.ngc6611': ['cel.m16', 0], 'cel.trapezium': ['cel.m42', 0], 'cel.r136': ['cel.tarantula', 0],
  'cel.sag-car-arm': ['cel.orion-arm', -1], 'cel.galactic-disk': ['cel.milkyway', -1], 'cel.multistars': ['cel.milkyway', -1], 'cel.omega-cen': ['cel.milkyway', 1],
  'cel.v404-third': ['cel.v404', 0], 'cel.v404-donor': ['cel.v404-binary', 0], 'cel.v404-bh': ['cel.v404-binary', 1], 'cel.tde-group': ['cel.qiz-host', -1],
  'cel.qiz-s1': ['cel.at2019qiz', 0], 'cel.qiz-s2': ['cel.at2019qiz', 1], 'cel.qiz-s3': ['cel.at2019qiz', 2], 'cel.qiz-s4': ['cel.at2019qiz', 3], 'cel.qiz-s5': ['cel.at2019qiz', 4], 'cel.qiz-s6': ['cel.at2019qiz', 5] };
for (const id in ZOOM_OF) LEVEL[id] = LEVEL[ZOOM_OF[id][0]];
const EXTERNAL = new Set(['cel.pillars', 'cel.m16', 'cel.m42', 'cel.horsehead', 'cel.m8', 'cel.m20', 'cel.carina', 'cel.tarantula', 'cel.m1', 'cel.veil', 'cel.ngc7293', 'cel.alpha-cen', 'cel.sirius', 'cel.kepler16', 'cel.algol', 'cel.m51', 'cel.m104', 'cel.bootes-void', 'cel.m87-bh', 'cel.v404', 'cel.v404-binary', 'cel.qiz-host', 'cel.qiz-smbh', 'cel.at2019qiz']); // 银河系之外的专题场景：不显示银河带背景
const resolveNode = (id) => (ZOOM_OF[id] ? ZOOM_OF[id] : [id, -1]);

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

  const glintSlots = [{ next: 1 }, { next: 2.5 }, { next: 4 }];
  const levels = LV.map(([id, L, build, base, x]) => ({ id, L, build, base, x, a: 0, g: null, w: 0 })); // 模型按需构建；x＝独占组（同一尺度只显示当前节点）
  let cur = resolveNode(node ?? 'cel.earth-moon')[0];
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
  let yaw = 0, pitch = 0, vYaw = 0, vPitch = 0, drag = null, touched = false, zS = viewZoom.f;
  const onMove = (e) => {
    px = (e.clientX / innerWidth) * 2 - 1; py = (e.clientY / innerHeight) * 2 - 1;
    if (drag && e.isPrimary) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; vYaw = -dx * 0.006; vPitch = dy * 0.006; yaw += vYaw; pitch = Math.max(-1.3, Math.min(1.3, pitch + vPitch)); } // 拖拽 = 对应方向的旋转
  };
  const onDown = (e) => { if (e.isPrimary) { drag = { x: e.clientX, y: e.clientY }; touched = true; } };
  const onUp = () => { drag = null; };
  addEventListener('pointermove', onMove); renderer.domElement.addEventListener('pointerdown', onDown); addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp);
  const wp = new THREE.Vector3(), zc = new THREE.Vector3(); let zsel = resolveNode(node)[1], zk = 0, zs = 1;

  function loop() {
    if (!running) return; raf = requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; const t = (T.uTime.value += dt); SIM.yr += dt * 0.12 * SIM_RATE[SIM.speed]; // 统一模拟时间（行星、彗星共用）
    if (tw) { const k = Math.min(1, (now - tw.t0) / tw.ms); L = tw.a + (tw.b - tw.a) * ease(k); if (k >= 1) tw = null; }
    const live = [], fitR = FILL * 9.5 * Math.tan((camera.fov * Math.PI) / 360) * Math.min(1, camera.aspect); // 适配后的内容半径（世界单位）
    for (const l of levels) {
      const d = l.L - L, tgt = l.x ? (cur === l.id ? 1 : 0) : 1; l.a += Math.sign(tgt - l.a) * Math.min(Math.abs(tgt - l.a), dt / 1.2);
      const w = Math.max(0, (Math.exp(-(d * d) / (2 * 0.28 * 0.28)) - 0.15) / 0.85) * ease(l.a); // 截断尾巴：非当前层级彻底隐去，不留巨大的鬼影
      if (!l.g) { if (Math.abs(d) > 1.2 || (l.x && cur !== l.id)) continue; l.g = l.build(PR); scene.add(l.g); l.g.updateMatrixWorld(true); l.R = contentRadius(l.g); } // 按需构建：靠近该层级、且（独占组）是当前节点才生成
      { const zm = l.g.userData.zoom, base = (fitR / l.R) * Math.pow(SCALE, d); if (zm && l.w > 0.5 && cur === l.id) { const tg = zsel >= 0 ? zm[zsel] : null, kk = Math.min(1, dt * 2.4); if (tg) { zc.lerp(tg.p, zk < 0.02 ? 1 : kk); zs += (tg.s - zs) * kk; } zk += ((tg ? 1 : 0) - zk) * kk; const sc = base * (1 + (zs - 1) * zk); l.g.position.set(0, 0, 0); l.g.scale.setScalar(sc); l.g.updateMatrixWorld(); l.g.position.copy(wp.copy(zc).applyMatrix4(l.g.matrixWorld)).multiplyScalar(-zk); } else l.g.scale.setScalar(base); } setAlpha(l.g, w); l.w = w; if (l.g.userData.tick) l.g.userData.tick(t, w); applyRef(l, dt);
      if (l.g.userData.pulses && w > 0.01) for (const q of l.g.userData.pulses) q.m.material.uniforms.uCol.value.copy(q.c).multiplyScalar(STEP3.glowK[FX.glowK] * (FX.mode === 'sci' ? 0.6 : 1)).multiplyScalar(1 + q.amp * FXU.uBr.value * (0.6 * Math.sin((t * TAU) / q.per + q.ph) + 0.4 * Math.sin((t * TAU) / (q.per * 2.3) + q.ph * 1.7)));
      if (l.g.userData.labels && w > 0.5) live.push(l);
      if (l.g.userData.moon) { const a = t * 0.35, R = l.g.userData.R; l.g.userData.moon.position.set(Math.cos(a) * R, 0, Math.sin(a) * R); l.g.userData.moon.rotation.y = -a; l.g.rotation.y = t * 0.01; }
      else if (l.g.userData.bodies) for (const h of l.g.userData.bodies) { const a = h.userData.phase + t * h.userData.w; h.rotation.y = a; h.children[0].rotation.y = t * 0.3; }
      else if (l.id !== 'cel.moon' && l.id !== 'cel.observable' && !l.g.userData.still) l.g.rotation.y = t * 0.004;
      if (l.g.userData.mark) l.g.userData.mark.scale.setScalar(1 + 0.25 * Math.sin(t * 2));
      { if (!l.fxs) { l.fxs = []; l.g.traverse((o) => { if (o.userData.fx) l.fxs.push(o); }); }
        const tp = TWINKLE[l.id] || [0, 10], art = FX.mode === 'view' && FX.quality !== 'low' && !reduce, amp = FX.twinkle && art ? tp[0] * DYN[FX.dyn] : 0;
        const rich = (RICH[l.id] || 0) * (FX.mode === 'view' ? STEP3.rich[FX.rich] : 0.4), sp = SPIKE.i[FX.spike], sd = STEP3.star[FX.star], key = amp + '|' + rich + '|' + sd + '|' + sp + '|' + FX.atmo;
        if (l.fxKey !== key) { l.fxKey = key; l.g.traverse((o) => { const u = o.material?.uniforms; if (u && u.uTw) { u.uTw.value = o.userData.still ? 0 : amp; u.uTwW.value = TAU / tp[1]; u.uRich.value = rich; u.uSpk.value = sp; u.uStarD.value = sd; } if (o.userData.atmoK0) o.material.uniforms.uK.value = o.userData.atmoK0 * ATMO[FX.atmo]; }); }
        for (const o of l.fxs) { const on = FX[o.userData.fx]; if (!on) { if (o.visible) { o.visible = false; o._fxHid = true; } } else if (o._fxHid) { o.visible = true; o._fxHid = false; } } }
      if (w > 0.01) l.g.traverse((o) => { if (o.userData.billboard) o.quaternion.copy(camera.quaternion); });
    }
    { // 星芒调度：全局最多 3 个槽，同一时间最多 3 颗；每个槽闪完后随机间隔再换一颗（层级越高，间隔越长＝数量越少）
      const n = SPIKE.n[FX.spike], art = FX.mode === 'view' && FX.quality !== 'low' && !reduce, maxS = art ? Math.min(3, Math.ceil(n * 2.5)) : 0;
      glintSlots.forEach((s, k) => {
        if (t < s.next) return;
        const cand = k < maxS ? levels.filter((l) => l.g && l.w > 0.3 && GLINT[l.id]) : [];
        if (!cand.length) { s.next = t + 1; return; }
        let pick = Math.random() * cand.reduce((a, l) => a + l.w, 0), l = cand[0]; for (const c of cand) { pick -= c.w; if (pick <= 0) { l = c; break; } }
        const pts = (l.gp ??= l.g.userData.glintPts || (() => { const a = []; l.g.traverse((o) => { if (o.isPoints) a.push(o); }); return a; })()); if (!pts.length) { s.next = t + 1; return; }
        const o = pts[Math.floor(Math.random() * pts.length)], P = o.geometry.getAttribute('position'), S = o.geometry.getAttribute('aS'); let bi = 0, bs = -1; // 8 次抽样里取最亮（尺寸最大）的一颗
        for (let j = 0; j < 8; j++) { const i = Math.floor(Math.random() * P.count); if (S.getX(i) > bs) { bs = S.getX(i); bi = i; } }
        o.material.uniforms.uGp.value[k].fromBufferAttribute(P, bi); o.material.uniforms.uGs.value.setComponent(k, t); o.material.uniforms.uGz.value.setComponent(k, 0.2 + 0.8 * Math.random()); // 大小随机：最大＝原规格，最小＝1/5
        s.next = t + 1.2 + (1 + Math.random() * 4) * (1.2 / Math.max(n, 0.3)) / GLINT[l.id];
      });
    }
    FXU.uBr.value = FX.mode === 'view' && FX.quality !== 'low' ? DYN[FX.dyn] : 0; bloom.strength = (FX.quality === 'low' ? 0 : FX.mode === 'sci' ? 0.15 : 0.3 * STEP3.bloom[FX.bloom]) * (FX.quality === 'mid' ? 0.6 : 1); bloom.enabled = FX.quality !== 'low';
    if (inst) {
      const k = Math.min(1, (now - ringT) / (DUR * 1000)), e = ease(k);
      inst.scale.setScalar(Math.max(0.001, 1 - e)); setAlpha(inst, 1 - e); inst.rotation.y = t * 0.02 + e * 1.2;
      if (k >= 1) { scene.remove(inst); inst.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); inst = null; }
    }
    if (!touched && FX.auto && !reduce && levels.some((l) => l.g && l.w > 0.5 && l.g.userData.autoOrbit)) yaw += dt * 0.04; // 缓慢自动环绕；用户一操作就停止
    cx += (px * 0.25 - cx) * Math.min(1, dt * 2); cy += (py * 0.15 - cy) * Math.min(1, dt * 2);
    if (!drag) { yaw += vYaw; pitch = Math.max(-1.3, Math.min(1.3, pitch + vPitch)); const k = Math.pow(0.94, dt * 60); vYaw *= k; vPitch *= k; }
    { const lim = levels.find((l) => l.id === cur)?.g?.userData.camLimit; if (lim) { yaw = Math.max(-lim[0], Math.min(lim[0], yaw)); pitch = Math.max(-lim[1], Math.min(lim[1], pitch)); } } // 特殊星云（2.5D 分层）：只允许小角度观察
    const drift = reduce || !FX.auto ? 0 : Math.sin(t * 0.07) * 0.03 + Math.sin(t * 0.023 + 1.3) * 0.02, Y = yaw + cx + drift, P = Math.max(-1.35, Math.min(1.35, pitch - cy * 0.6 + 0.12));
    zS += (viewZoom.f - zS) * Math.min(1, dt * 6); const D = 9.5 / zS; // 主动放大：只改相机距离
    camera.position.set(Math.sin(Y) * Math.cos(P) * D, Math.sin(P) * D, Math.cos(Y) * Math.cos(P) * D);
    camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    { const x = Math.min(1, Math.max(0, (L - 4.8) / 1.6)); nebula.material.uniforms.uBand.value = EXTERNAL.has(cur) ? 0 : 1 - x * x * (3 - 2 * x); } // 银河带只属于银河系内的视角
    NAV.cur = cur; NAV.zsel = zsel; NAV.vz = zS * (zsel >= 0 ? 3 : 1);
    nebula.position.copy(camera.position); bgStars.position.copy(camera.position);
    // 标注：投影到屏幕
    const W = host.clientWidth, H = host.clientHeight, used = new Set(), items = [];
    for (const l of live) l.g.userData.labels.forEach((lb, i) => {
      const key = `${l.id}#${i}`; if (lb.lvl && !lb.lvl.includes(l.g.userData.zoom && zsel >= 0 ? (l.g.userData.zoom[zsel]?.lvl ?? 1) : 0)) return;
      if (lb.when && !lb.when()) return;
      if (!lb.hud && (FX.labels === 0 || (FX.labels === 1 && lb.k) || (lb.ref && !refLabelOn(lb.ref)))) return;
      if (lb.hud) { /* 屏幕固定 */ } else { l.g.updateWorldMatrix(true, false); if (lb.follow) { wp.copy(lb.follow().position); wp.y -= 0.22; } else wp.copy(lb.p); l.g.localToWorld(wp); wp.project(camera);
      if (wp.z > 1 || Math.abs(wp.x) > 1.05 || Math.abs(wp.y) > 1.05) return; }
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
      items.push({ el, key, x: lb.hud ? lb.hud[0] * W : (wp.x * 0.5 + 0.5) * W, y: lb.hud ? lb.hud[1] * H : (-wp.y * 0.5 + 0.5) * H, op: Math.min(1, (l.w - 0.5) * 3) });
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
    focus(id) { const b = LEVEL[id]; if (b === undefined) return; const [pid, zi] = resolveNode(id); cur = pid; zsel = zi; touched = false; for (const [, e2] of labelEls) e2.classList.remove('on'); tw = { a: L, b, t0: performance.now(), ms: reduce ? 1 : DUR * 1000 }; },
    pause() { running = false; cancelAnimationFrame(raf); },
    resume() { if (running) return; running = true; last = performance.now(); loop(); },
    dispose() {
      api.pause(); document.getElementById('qizTl')?.remove(); ro.disconnect(); removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp); renderer.domElement.remove(); labelBox.remove(); composer.dispose(); renderer.dispose();
      scene.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => x.dispose()); });
    },
  };
  api.resume();
  return api;
}
