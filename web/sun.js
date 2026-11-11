import { FX, saveFX } from './fx.js';
import { createSolarWind, SOLAR_WIND } from './solarwind.js';
// 太阳（V4：70% 科学真实 + 30% 艺术美化）
// 层次：光球（白金→暖白，颗粒、边缘变暗、少量黑子与活动区）→ 极薄的色球层 → 沿磁弧组织的日珥 → 稀薄、放射状、分层的日冕。
// 说明：差异自转按真实公式的 0.3 倍使用（避免长时间观看后图案被拉成条纹）；观赏模式是时间压缩演示，不是实时太阳变化；
// 耀斑由随机模拟驱动（不是预报、不按固定周期）；日珥断裂与日冕物质抛射只在把“活动水平”调到“高”时才会出现。
// 可调参数集中在 SUN_PARAMS（显示层参数，不影响太阳半径与太阳系坐标）。
export const SUN_PARAMS = {
  granulationContrast: 1.0, // 颗粒对比度（0–1.5）
  limbDarkening: 0.62, //     边缘变暗强度（0–0.9）
  chromosphere: 0.55, //      色球层亮度（0–1）
  prominenceCount: 3, //      主要日珥数量（1–3；活动水平“高”时另加 2 条小的）
  prominenceActivity: 1.0, // 日珥起伏幅度（0–1.5）
  coronaIntensity: 0.42, //    日冕亮度（0–1）
  flareChance: 1.0, //        耀斑出现概率系数（0–2）
  animationSpeed: 1.0, //     观赏模式动画速度（0.3–2）
};

const R = 1.5;

function photoMaterial(kit) {
  const { THREE, V, NOISE, SPHERE_VS, smat } = kit;
  const PHOTO_FS = /* glsl */ `${NOISE}
  varying vec3 vP; varying vec3 vN; varying vec3 vV; uniform float uST; uniform float uGT; uniform vec4 uFlare; uniform float uA; uniform float uGran; uniform float uLimb;
  // 颗粒：特征点各自缓慢漂移的 Voronoi——中心亮、边缘（颗粒间暗径）暗，大小不一
  vec2 cell(vec3 p,float t){ vec3 i=floor(p),f=fract(p); float d1=8.,d2=8.;
    for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){ vec3 g=vec3(float(x),float(y),float(z)); vec3 h=h33(i+g);
      vec3 o=.5+.42*sin(6.2832*(h*1.7+t*(.3+.7*h.zxy))); float d=length(g+o-f)*(.8+.45*h.x); if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d; }
    return vec2(d1,d2); }
  void main(){
    vec3 p=normalize(vP), n=normalize(vN), v=normalize(vV);
    float lat=asin(clamp(p.y,-1.,1.)), s2=sin(lat)*sin(lat);
    float om=(14.713-.3*(2.396*s2+1.787*s2*s2))*.0174533*uST; float cs=cos(om), sn=sin(om);
    vec3 q=vec3(p.x*cs-p.z*sn,p.y,p.x*sn+p.z*cs);
    float mu=max(dot(n,v),0.);
    float px=length(fwidth(p)); float lod=1.-smoothstep(.3,1.,px*46.), lod2=1.-smoothstep(.3,1.,px*10.);
    vec2 c1=cell(q*46.,uGT), c2=cell(q*10.,uGT*.12);
    float edge=c1.y-c1.x; float gran=mix(.7,1.,smoothstep(.0,.22,edge))*(1.+.1*(1.-smoothstep(0.,.5,c1.x)));
    float lum=mix(1.,gran,lod*uGran*.9*(.45+.55*mu)); // 靠近边缘颗粒被透视压扁、对比度降低
    lum*=mix(1.,.96+.07*smoothstep(0.,.3,c2.y-c2.x),lod2*.6);
    // 黑子（极少）与活动区（浅橙金的亮斑，靠近边缘更明显）
    float spot=0.,act=0.; vec3 sq=q*4.,si=floor(sq),sf=fract(sq);
    for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){ vec3 g=vec3(float(x),float(y),float(z)); vec3 hh=h33(si+g); if(hh.x>.955){ vec3 cen=g+.25+.5*hh.yzx; vec3 cw=normalize((si+cen)/4.); float cl=abs(asin(clamp(cw.y,-1.,1.))); float bm=exp(-pow((cl-.26)/.12,2.)); float d=length(cen-sf); spot=max(spot,bm*(1.-smoothstep(.06,.26+.14*hh.z,d))); act=max(act,bm*(1.-smoothstep(.2,.75,d))); } }
    float pen=smoothstep(.1,.4,spot), umb=smoothstep(.5,.85,spot); lum*=mix(1.,.6,pen); lum*=mix(1.,.3,umb);
    float plage=act*(1.-pen)*(.35+.65*smoothstep(.3,.85,fbm(q*14.+uGT*.02)));
    // 颜色：中心白金/珍珠白 → 主体暖白 → 边缘淡金；边缘变暗
    vec3 col=mix(vec3(1.,.72,.4),vec3(1.,.9,.72),smoothstep(0.,.45,mu)); col=mix(col,vec3(1.,.965,.88),smoothstep(.45,1.,mu));
    float ld=1.-uLimb*(1.-pow(mu,.6));
    col*=lum*ld*.86; col+=vec3(1.,.74,.42)*plage*(.1+.16*(1.-mu));
    vec3 fd=normalize(uFlare.xyz); float fl=uFlare.w*exp(-pow(acos(clamp(dot(q,fd),-1.,1.))/.07,2.)); col+=vec3(1.,.95,.85)*fl*.7;
    gl_FragColor=vec4(col,uA); }`;
  return smat(SPHERE_VS, PHOTO_FS, { uSunW: { value: V(0, 0, 0) }, uST: { value: 0 }, uGT: { value: 0 }, uFlare: { value: new THREE.Vector4(1, 0, 0, 0) }, uGran: { value: SUN_PARAMS.granulationContrast }, uLimb: { value: SUN_PARAMS.limbDarkening } });
}

export function createSun(kit) {
  const { THREE, V, TAU, rng, gauss, NOISE, smat, glow } = kit;
  const LOW = (navigator.hardwareConcurrency || 8) <= 4, Q = LOW ? 0.5 : 1; // 低性能设备减半次级粒子
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 64), photoMaterial(kit)), phot = sphere.material; body.add(sphere);

  // ---------------- 日珥：粒子沿磁弧组织（拱环 / 火舌 / 细喷流），5 根细丝，内部有亮丝 ----------------
  const PROM_VS = /* glsl */ `attribute float aU; attribute float aSeed; attribute vec2 aOff; uniform vec3 uP0; uniform vec3 uP1; uniform float uH; uniform float uT; uniform float uR; uniform float uSpeed; uniform float uSize; uniform float uPR; uniform float uBreak; uniform float uShape; varying vec3 vC; varying float vA;
  void main(){
    float u=fract(aU+uT*uSpeed*(.6+.8*aSeed)); vec3 tg=normalize(uP1-uP0); vec3 dv; float hh; float fade;
    if(uShape<.5){ dv=normalize(mix(uP0,uP1,u)); hh=uH*pow(sin(3.14159*u),.75); fade=smoothstep(0.,.06,u)*smoothstep(1.,.94,u); }                 // 拱环：两个足点
    else if(uShape<1.5){ float w=u*.62; dv=normalize(mix(uP0,uP1,w)); hh=uH*pow(sin(3.14159*w),.7)*(1.+.25*u); fade=smoothstep(0.,.06,u)*(1.-smoothstep(.55,1.,u)); } // 火舌：从一个足点抬升、末端渐隐
    else { dv=normalize(mix(uP0,uP1,u*.22)); hh=uH*u*1.25; fade=smoothstep(0.,.08,u)*(1.-smoothstep(.35,1.,u)); }                                 // 细喷流：近似沿径向
    hh*=1.+3.*uBreak; vec3 bn=normalize(cross(dv,tg));
    float thick=.012+hh*.075;
    vec3 pos=dv*(uR+hh+aOff.x*thick*.6+uBreak*uBreak*2.5*(.4+aSeed))+bn*(aOff.y*thick+sin(u*8.+uT*.25+aSeed*6.)*.018*hh);
    vec4 mv=modelViewMatrix*vec4(pos,1.); gl_PointSize=clamp(uSize*uPR*(7./max(-mv.z,.1))*(.75+.5*aSeed),2.,26.); gl_Position=projectionMatrix*mv;
    float core=1.-smoothstep(0.,.9,abs(aOff.y));                                              // 中间的细丝更亮
    vC=mix(vec3(1.,.34,.15),vec3(1.,.6,.3),core*.7+aSeed*.3)+vec3(.25,.22,.16)*smoothstep(.12,0.,min(u,1.-u));
    vA=fade*(.45+.55*core)*(1.-uBreak*.6); }`;
  const PROM_FS = /* glsl */ `varying vec3 vC; varying float vA; uniform float uA; void main(){ float d=length(gl_PointCoord-.5); float a=exp(-d*d*14.)-.03; gl_FragColor=vec4(vC,max(a,0.)*vA*uA*.5); }`;
  const proms = [];
  const prom = (lat, lon, span, h, per, shape, seed) => {
    const r = rng(seed), N = Math.floor(1500 * Q), aU = new Float32Array(N), aSeed = new Float32Array(N), aOff = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { aU[i] = r(); aSeed[i] = r(); aOff[i * 2] = gauss(r) * 0.5; aOff[i * 2 + 1] = (Math.floor(r() * 5) - 2) * 0.45 + gauss(r) * 0.1; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); geo.setAttribute('aU', new THREE.BufferAttribute(aU, 1)); geo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1)); geo.setAttribute('aOff', new THREE.BufferAttribute(aOff, 2));
    const dir = (la, lo) => V(Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)), P0 = dir(lat, lon - span / 2), P1 = dir(lat + 0.06, lon + span / 2);
    const mat = smat(PROM_VS, PROM_FS, { uP0: { value: P0 }, uP1: { value: P1 }, uH: { value: h }, uT: { value: 0 }, uR: { value: R }, uSpeed: { value: 0.03 }, uSize: { value: 2.3 }, uPR: { value: 1 }, uBreak: { value: 0 }, uShape: { value: shape } }, { blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; const grp = new THREE.Group(); grp.add(pts); body.add(grp);
    const o = { grp, mat, lat, h, per, ph: [r() * 6.3, r() * 6.3, r() * 6.3], brk: 0, lift: 0, state: 'idle', st: 0, mid: P0.clone().add(P1).normalize() }; proms.push(o); return o;
  };
  // 位置不对称：一个拱环、一条火舌、一束细喷流；另有两条小拱环只在活动水平“高”时显示
  prom(0.44, 0.7, 0.5, 0.34, 9, 0, 11); prom(-0.3, 2.9, 0.62, 0.46, 13, 1, 12); prom(0.1, 4.6, 0.3, 0.42, 7, 2, 13); prom(0.6, 2.1, 0.36, 0.2, 15, 0, 14); prom(-0.52, 5.3, 0.3, 0.18, 19, 0, 15);

  // ---------------- 色球层 + 日冕：一张始终朝向相机的面片，按“太阳固连方向”的噪声生成，转动镜头时流束仍附着在太阳上 ----------------
  const CSZ = R * 2 * 5.2; // 面片边长：日冕延伸到约 5 个太阳半径
  const COR_VS = /* glsl */ `varying vec3 vWP; varying vec3 vCen; varying float vRw; uniform float uSize; uniform float uR;
  void main(){ vec4 wp=modelMatrix*vec4(position,1.); vWP=wp.xyz; vCen=modelMatrix[3].xyz; vRw=uR*length(modelMatrix[0].xyz)/uSize; gl_Position=projectionMatrix*viewMatrix*wp; }`;
  const COR_FS = /* glsl */ `${NOISE} varying vec3 vWP; varying vec3 vCen; varying float vRw; uniform float uA; uniform float uRot; uniform float uT; uniform float uCor; uniform float uChrom;
  void main(){ vec3 rd=normalize(vWP-cameraPosition); vec3 pc=cameraPosition+rd*dot(vCen-cameraPosition,rd)-vCen; float r=length(pc)/vRw; if(r<1.||r>5.2) discard;
    vec3 d=normalize(pc); float cs=cos(uRot), sn=sin(uRot); d=vec3(d.x*cs-d.z*sn,d.y,d.x*sn+d.z*cs);
    float eq=exp(-pow(d.y/.55,2.));                                                       // 赤道附近：盔状流束；两极：细羽流
    float helm=smoothstep(.42,.8,fbm(d*2.3+vec3(0.,uT*.01,0.)))*eq;
    float rays=pow(n3(d*9.+vec3(uT*.015,0.,0.)),2.)*.7+pow(n3(d*22.),3.)*.5;
    float plume=smoothstep(.55,.95,abs(d.y))*pow(n3(d*26.+3.),2.);
    float inner=exp(-(r-1.)*4.2), mid=1./pow(r,3.2), far=1./pow(r,2.);
    float I=inner*.55+mid*(.16+.55*helm+.3*rays)+far*(.02+.2*helm*rays+.1*plume);
    I*=(1.-smoothstep(3.6,5.2,r))*uCor*(1.+.035*sin(uT*.7+d.x*3.)+.025*sin(uT*1.9+d.y*4.));  // 外围透明；极弱的非同步呼吸
    vec3 col=mix(vec3(1.,.93,.78),vec3(.84,.9,1.),smoothstep(1.,3.6,r))*I;
    float spic=.6+.5*n3(d*60.+uT*.2); float ch=smoothstep(1.03,1.,r)*uChrom*spic; // 极薄的色球层（约 3% 半径），边缘带细碎针状起伏
    col+=vec3(1.,.36,.24)*ch;
    gl_FragColor=vec4(col,uA); }`;
  const corMat = smat(COR_VS, COR_FS, { uSize: { value: CSZ }, uR: { value: R }, uRot: { value: 0 }, uT: { value: 0 }, uCor: { value: SUN_PARAMS.coronaIntensity }, uChrom: { value: SUN_PARAMS.chromosphere } }, { blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const corona = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), corMat); corona.scale.setScalar(CSZ); corona.userData.billboard = true; corona.renderOrder = 2; g.add(corona);

  // 太阳风：从日冕外缘（约 1.9 个太阳半径）持续向外的粒子流，见 solarwind.js
  const wind = createSolarWind(kit, { n: Math.floor(SOLAR_WIND.solarWindDensityNear * Q), r0: R * 1.9, r1: R * 7.5, map: 2, size: 1.25, speed: 0.05, tail: 0.03, opacity: 0.6, flat: 0.8, occ: R, curl: 0.15, planets: false, seed: 77 }); g.add(wind.group);
  const flareGlow = glow([1, 0.92, 0.75], 3.4, 0.4); flareGlow.visible = false; body.add(flareGlow);

  // ---------------- 日冕物质抛射（只在活动水平“高”时可能出现）----------------
  const CME_VS = /* glsl */ `attribute float aSeed; attribute vec3 aDir; uniform float uC; uniform float uPR; varying float vA;
  void main(){ float f=uC*(0.75+.5*aSeed); vec3 pos=aDir*(1.6+f*6.5); vec4 mv=modelViewMatrix*vec4(pos,1.); gl_PointSize=clamp(2.2*uPR*(7./max(-mv.z,.1)),2.,14.); gl_Position=projectionMatrix*mv; vA=pow(1.-uC,1.5)*smoothstep(0.,.08,uC); }`;
  const CME_FS = /* glsl */ `varying float vA; uniform float uA; void main(){ float d=length(gl_PointCoord-.5); float a=exp(-d*d*16.)-.02; gl_FragColor=vec4(vec3(1.,.72,.4),max(a,0.)*vA*uA*.45); }`;
  const NC = Math.floor(900 * Q), cd = new Float32Array(NC * 3), cs = new Float32Array(NC), cg = new THREE.BufferGeometry(), rm = rng(31);
  cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NC * 3), 3)); cg.setAttribute('aDir', new THREE.BufferAttribute(cd, 3)); cg.setAttribute('aSeed', new THREE.BufferAttribute(cs, 1));
  const cmeMat = smat(CME_VS, CME_FS, { uC: { value: 1 }, uPR: { value: 1 } }, { blending: THREE.AdditiveBlending }), cme = new THREE.Points(cg, cmeMat); cme.frustumCulled = false; cme.visible = false; g.add(cme);
  const setCME = (axis) => { const t1 = new THREE.Vector3().crossVectors(axis, V(0, 1, 0)).normalize(), t2 = new THREE.Vector3().crossVectors(axis, t1); for (let i = 0; i < NC; i++) { const th = Math.abs(gauss(rm)) * 0.42, ph = rm() * TAU, d = axis.clone().multiplyScalar(Math.cos(th)).addScaledVector(t1, Math.sin(th) * Math.cos(ph)).addScaledVector(t2, Math.sin(th) * Math.sin(ph)); cd.set([d.x, d.y, d.z], i * 3); cs[i] = rm(); } cg.attributes.aDir.needsUpdate = true; cg.attributes.aSeed.needsUpdate = true; };

  // ---------------- 时间：观赏（时间压缩演示）/ 科学时间 ----------------
  const RATES = [[1, '×1（实时）'], [60, '×60（1 秒＝1 分钟）'], [3600, '×3600（1 秒＝1 小时）'], [86400, '×86400（1 秒＝1 天）']];
  const ui = { mode: 0, rate: 2, lvl: 1, prom: true, corona: true, wind: true, act: true };
  const clock = { rotDays: 0, gt: 0 }; // 太阳自转（天）、颗粒演化（代）
  const advance = (dt) => { if (ui.mode === 0) { const k = SUN_PARAMS.animationSpeed; clock.rotDays += dt * 0.25 * k; clock.gt += (dt / 11) * k; } else { const s = dt * RATES[ui.rate][0]; clock.rotDays += s / 86400; clock.gt += s / 480; } };

  // ---------------- 活动：偶发的小型耀斑、日珥轻微抬升；“高”水平时才有断裂与 CME ----------------
  const LV = [['低', 110, 9 * 86400], ['中', 55, 3 * 86400], ['高', 26, 86400]]; // [名称, 观赏模式平均间隔（真实秒）, 科学模式平均间隔（模拟秒）]
  const ev = { next: 25, flare: null, cmeT: -1 }, K = () => (ui.mode === 0 ? 150 : 1); // 观赏模式把事件时长压缩 150 倍
  const trigger = () => {
    const main = proms.slice(0, SUN_PARAMS.prominenceCount), p = main[Math.floor(Math.random() * main.length)], rnd = Math.random();
    const fd = p.mid.clone().add(V(gauss(Math.random) * 0.12, gauss(Math.random) * 0.1, gauss(Math.random) * 0.12)).normalize(); // 耀斑出现在活动区（日珥足点附近）
    ev.flare = { dir: fd, t: 0, amp: 0.35 + Math.random() * 0.45, dur: 1800 * (0.6 + Math.random() * 0.8) };
    if (ui.lvl === 2 && rnd < 0.3 && p.state === 'idle') { p.state = 'erupt'; p.st = 0; p.cme = rnd < 0.12; } else if (rnd < 0.7) p.liftT = 0; // 多数时候只是轻微抬升后回落
  };
  const stepActivity = (dau) => { // dau：活动时间（秒）
    if (!ui.act) { phot.uniforms.uFlare.value.w = 0; flareGlow.visible = false; return; }
    ev.next -= dau / K();
    if (!ev.flare && ev.next <= 0) { trigger(); const mean = LV[ui.lvl][ui.mode === 0 ? 1 : 2] / Math.max(0.1, SUN_PARAMS.flareChance); ev.next = Math.max(ui.mode === 0 ? 14 : 3600, -Math.log(1 - Math.random()) * mean); } // 指数分布间隔（非固定周期）
    const f = ev.flare;
    if (f) { f.t += dau; const x = f.t / f.dur, I = f.amp * (x < 0.12 ? x / 0.12 : Math.exp(-(x - 0.12) * 3.2)); phot.uniforms.uFlare.value.set(f.dir.x, f.dir.y, f.dir.z, I); flareGlow.visible = I > 0.03; flareGlow.position.copy(f.dir).multiplyScalar(R * 1.01); flareGlow.scale.setScalar(0.15 + 0.35 * I); flareGlow.material.uniforms.uCol.value.setRGB(I, 0.9 * I, 0.72 * I); if (x > 1.6) { ev.flare = null; phot.uniforms.uFlare.value.w = 0; flareGlow.visible = false; } }
    const ds = dau / K();
    for (const p of proms) {
      if (p.liftT !== undefined) { p.liftT += ds / (ui.mode === 0 ? 18 : 9000); p.lift = Math.sin(Math.min(1, p.liftT) * Math.PI) * 0.3; if (p.liftT >= 1) { p.liftT = undefined; p.lift = 0; } }
      if (p.state === 'erupt') { p.st += ds; const x = p.st / (ui.mode === 0 ? 14 : 7200); p.brk = Math.min(1, x * x); if (p.cme && x > 0.35 && ev.cmeT < 0) { setCME(p.mid.clone().applyAxisAngle(V(0, 1, 0), p.grp.rotation.y)); cme.visible = true; ev.cmeT = 0; p.cme = false; } if (x >= 1) { p.state = 'gone'; p.st = 0; } }
      else if (p.state === 'gone') { p.st += ds; p.brk = 1; if (p.st / (ui.mode === 0 ? 20 : 10000) >= 1) { p.state = 'form'; p.st = 0; } }
      else if (p.state === 'form') { p.st += ds; p.brk = Math.max(0, 1 - p.st / (ui.mode === 0 ? 10 : 5000)); if (p.brk <= 0) p.state = 'idle'; }
    }
    if (ev.cmeT >= 0) { ev.cmeT += ds / (ui.mode === 0 ? 16 : 28800); cmeMat.uniforms.uC.value = ev.cmeT; if (ev.cmeT >= 1) { ev.cmeT = -1; cme.visible = false; } }
  };

  g.userData.tick = () => {
    const now = performance.now() / 1000, dt = Math.min(0.1, now - (g.userData._last || now)); g.userData._last = now; advance(dt);
    phot.uniforms.uST.value = clock.rotDays; phot.uniforms.uGT.value = clock.gt; phot.uniforms.uGran.value = SUN_PARAMS.granulationContrast; phot.uniforms.uLimb.value = SUN_PARAMS.limbDarkening;
    if (dt > 0) stepActivity(ui.mode === 0 ? dt * 150 : dt * RATES[ui.rate][0]);
    proms.forEach((p, i) => { // 各日珥各自的周期，轻微起伏、互不同步
      const a = SUN_PARAMS.prominenceActivity, k = 1 + a * (0.14 * Math.sin(clock.gt * (TAU / p.per) + p.ph[0]) + 0.08 * Math.sin(clock.gt * (TAU / (p.per * 2.7)) + p.ph[1])) + p.lift;
      const u = p.mat.uniforms; u.uH.value = p.h * k; u.uT.value = clock.gt * 0.8 + p.ph[2]; u.uBreak.value = p.brk; u.uPR.value = g.userData.pr || 1;
      const s2 = Math.sin(p.lat) ** 2; p.grp.rotation.y = -(14.713 - 0.3 * (2.396 * s2 + 1.787 * s2 * s2)) * 0.0174533 * clock.rotDays; // 与光球同一自转公式
      p.grp.visible = ui.prom && (i < SUN_PARAMS.prominenceCount || (i >= 3 && ui.lvl === 2));
    });
    corMat.uniforms.uRot.value = clock.rotDays * 0.2565; corMat.uniforms.uT.value = clock.gt; corMat.uniforms.uCor.value = ui.corona ? SUN_PARAMS.coronaIntensity : 0; corMat.uniforms.uChrom.value = SUN_PARAMS.chromosphere;
    wind.update(now, { pr: g.userData.pr || 1 }); cmeMat.uniforms.uPR.value = g.userData.pr || 1;
  };

  // ---------------- 标注 / 控件（屏幕固定）----------------
  const hud = (i, dyn, toggle) => ({ p: V(0, 0, 0), text: '', dyn, toggle, hud: [0.78, 0.2 + i * 0.058], lvl: [0] });
  const on = (b) => (b ? '开' : '关');
  g.userData.labels = [
    { p: V(0, -2.0, 0), text: '太阳', lvl: [0] },
    hud(0, () => (ui.mode === 0 ? '▶ 观赏时间：时间压缩演示，不是实时太阳变化（点击切换科学时间）' : `▶ 科学时间 ${RATES[ui.rate][1]}（点击切换观赏时间）`), () => { ui.mode = 1 - ui.mode; }),
    hud(1, () => (ui.mode === 1 ? `时间倍率：${RATES[ui.rate][1]}（点击改变）` : '压缩比例：自转 1 秒≈0.25 天；颗粒约 11 秒一代；事件 150×'), () => { if (ui.mode === 1) ui.rate = (ui.rate + 1) % RATES.length; }),
    hud(2, () => `日珥：${on(ui.prom)}`, () => { ui.prom = !ui.prom; }), hud(3, () => `日冕：${on(ui.corona)}`, () => { ui.corona = !ui.corona; }), hud(4, () => `太阳风：${['关', '标准', '增强'][FX.wind ?? 1]}（示意，点击切换）`, () => { FX.wind = ((FX.wind ?? 1) + 1) % 3; saveFX(); }),
    hud(5, () => `耀斑等活动：${on(ui.act)}（随机模拟，非预报）`, () => { ui.act = !ui.act; }), hud(6, () => `活动水平：${LV[ui.lvl][0]}（“高”才会有日珥断裂与日冕物质抛射）`, () => { ui.lvl = (ui.lvl + 1) % 3; }),
  ];
  g.userData.fitR = 4.2; g.userData.still = true; g.userData.autoOrbit = true; g.rotation.x = 0.2;
  return g;
}

// 太阳系里的太阳：只用同一套光球着色器（无日珥/日冕），由调用方更新 uST/uGT
export function createPhotosphereMesh(kit, radius) { return new kit.THREE.Mesh(new kit.THREE.SphereGeometry(radius, 96, 48), photoMaterial(kit)); }
