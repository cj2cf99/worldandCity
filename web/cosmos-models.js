// 宇宙系的专题模型：太阳系内的行星／卫星／小行星带／彗星、重做的本超星系团与拉尼亚凯亚，以及可观测宇宙层的彩蛋。
// 由 cosmos.js 注入共用的着色器与几何助手（避免循环依赖）。天体走写实风格；距离与比例以画面表现优先。
import { FX, SIM, SIM_RATE, NAV } from './fx.js';
export function createModels(kit) {
  const { pulseGlow, FXU, THREE, V, TAU, rng, gauss, ease, NOISE, SPHERE_VS, ATMO_FS, SUN_FS, RING_VS, RING_FS, POINTS_VS, POINTS_FS, smat, sphereMat, sphere, circle, lineMat, pointsOf, glow, blob, PLANETS } = kit;

  // ---------------- 通用天体表面着色器（行星／卫星／小天体的“表面图像级”程序纹理）----------------
  const SURF_FS = /* glsl */ `${NOISE}
varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec3 vL;
uniform float uType; uniform vec3 uRim; uniform float uTime; uniform float uA; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uK; uniform vec3 uSunO; uniform vec3 uRN; uniform vec2 uRR;
float ridge(vec3 p){ return 1.-abs(2.*fbm(p)-1.); }
float spot(vec3 p, vec3 c, vec2 sz){ float a=atan(p.z,p.x), ac=atan(c.z,c.x); float dl=atan(sin(a-ac),cos(a-ac)); return smoothstep(1.,.35,length(vec2(dl/sz.x,(p.y-c.y)/sz.y))); }
void main(){
  vec3 p=normalize(vP), n=normalize(vN), v=normalize(vV), L=normalize(vL);
  const int t=TYPE; vec3 col=vec3(.5); // TYPE 由材质 defines 给定：每种天体单独编译，只含自己的那一支（所有类型塞进一个着色器会让首次编译卡顿十几秒）
  // 撞击坑噪声只在 3 个调用点计算（crater 内部是循环，内联多份会让着色器编译慢到数十秒）：各类型按需选频率，分支里复用 c1/c2/c3
  float f1=1.,f2=1.,f3=1.,c1=0.,c2=0.,c3=0.;
  if(t==0){f1=2.5;f2=7.;f3=20.;} else if(t==2){f1=5.;f2=14.;} else if(t==9){f1=6.;} else if(t==10){f1=4.;f2=12.;f3=5.;} else if(t==12){f1=8.;} else if(t==13){f1=10.;} else if(t==14){f1=3.;f2=9.;} else if(t==15){f1=4.;f2=11.;} else if(t==16){f1=5.;}
  if(t==0||t==2||t==9||t==10||t==12||t==13||t==14||t==15||t==16){ c1=crater(p*f1); c2=crater(p*f2); c3=crater(p*f3); }
  if(t==0){ float c=c1*.7+c2*.4+c3*.2; col=vec3(.46,.43,.4)*(1.+c*.9)*(.85+.3*fbm(p*8.)); }
  else if(t==1){ vec3 q=p*3.; q+=fbm(q*2.+uTime*.01)*1.4; float k=fbm(q*1.6+vec3(uTime*.015,0.,0.)); col=mix(vec3(.84,.68,.4),vec3(.99,.92,.72),k)*(.92+.16*sin(p.y*40.+k*8.)); }
  else if(t==2){ float land=fbm(p*3.+2.); col=mix(vec3(.56,.25,.12),vec3(.84,.52,.3),fbm(p*6.)); col=mix(col,vec3(.3,.15,.1),smoothstep(.52,.66,land)*.75);
    float cr=c1*.3+c2*.18; col*=1.+cr;
    float cany=smoothstep(.035,0.,abs(p.y+.08+.025*sin(p.x*9.+2.)))*smoothstep(-.7,.1,p.x)*(.5+.5*fbm(p*20.)); col=mix(col,vec3(.2,.09,.06),cany*.9);
    col=mix(col,vec3(.96,.96,.98),smoothstep(.84,.92,abs(p.y)+.05*fbm(p*9.))); }
  else if(t==3){ float w=fbm(vec3(p.x*2.,p.y*7.,p.z*2.)+uTime*.01)*1.2; float b=.5+.5*sin(p.y*24.+w*5.); b=mix(b,fbm(vec3(p.x*3.,p.y*14.,p.z*3.)),.3);
    col=mix(vec3(.6,.4,.26),vec3(.97,.91,.8),b); col=mix(col,vec3(.5,.28,.2),smoothstep(.5,.9,fbm(vec3(p.x*2.,p.y*22.,p.z*2.)))*.3);
    col=mix(col,vec3(.8,.3,.18),spot(p,normalize(vec3(.85,-.34,.3)),vec2(.26,.08))*.95);
    col=mix(col,vec3(.97,.95,.9),spot(p,normalize(vec3(.6,-.5,-.6)),vec2(.07,.03))*.9); }
  else if(t==4){ float w=fbm(vec3(p.x*2.,p.y*6.,p.z*2.)); float b=.5+.5*sin(p.y*18.+w*3.); col=mix(vec3(.74,.62,.42),vec3(.95,.87,.66),b*.8+.1); col*=.94+.1*fbm(vec3(p.x*3.,p.y*30.,p.z*3.)); }
  else if(t==5){ float b=.5+.5*sin(p.y*9.+fbm(p*2.)*1.5); col=mix(vec3(.5,.78,.82),vec3(.7,.92,.94),b*.5+.2); col=mix(col,vec3(.82,.95,.96),smoothstep(.6,.9,p.y)*.4); }
  else if(t==6){ float w=fbm(vec3(p.x*2.,p.y*8.,p.z*2.))*1.1; float b=.5+.5*sin(p.y*12.+w*4.); col=mix(vec3(.08,.2,.62),vec3(.26,.44,.92),b);
    col*=1.-spot(p,normalize(vec3(.8,-.4,.45)),vec2(.2,.08))*.55; col+=smoothstep(.7,.9,fbm(vec3(p.x*2.,p.y*20.,p.z*2.)+3.))*.32; }
  else if(t==7){ col=mix(vec3(.95,.82,.35),vec3(.98,.95,.76),fbm(p*4.)); col=mix(col,vec3(.32,.13,.07),smoothstep(.62,.8,fbm(p*9.))*.85);
    col=mix(col,vec3(.99),smoothstep(.72,.88,fbm(p*5.+4.))*.55); col=mix(col,vec3(.9,.45,.2),smoothstep(.7,.85,fbm(p*7.+9.))*.4); }
  else if(t==8){ col=vec3(.93,.92,.88)*(.9+.2*fbm(p*18.)); float cr=smoothstep(.82,.95,ridge(p*4.))+smoothstep(.86,.97,ridge(p*10.))*.6; col=mix(col,vec3(.55,.3,.2),clamp(cr,0.,1.)*.85); }
  else if(t==9){ col=mix(vec3(.36,.32,.28),vec3(.62,.58,.52),fbm(p*3.)); float gr=smoothstep(.55,.7,fbm(p*6.)); col=mix(col,vec3(.72,.7,.66),gr*.6*(.5+.5*sin(p.x*60.+p.z*40.)));
    float c=c1; col*=1.+c*.5; col+=smoothstep(-.4,-.9,c)*.18; }
  else if(t==10){ col=vec3(.24,.2,.17)*(1.+c1*.7+c2*.45); col+=smoothstep(-.5,-1.,c3)*.25; }
  else if(t==11){ col=mix(vec3(.82,.5,.14),vec3(.96,.72,.32),fbm(p*2.)); col*=.94+.1*sin(p.y*12.+fbm(p*3.)*2.); }
  else if(t==12){ col=vec3(.95,.97,1.)*(.92+.08*fbm(p*10.)); float s=smoothstep(.9,1.,ridge(vec3(p.x*6.,p.y*2.,p.z*6.)))*smoothstep(-.55,-.85,p.y); col=mix(col,vec3(.5,.78,.95),s); col*=1.+c1*.18; }
  else if(t==13){ col=mix(vec3(.84,.74,.68),vec3(.68,.76,.8),fbm(p*3.)); col*=1.+c1*.12; col=mix(col,vec3(.97,.82,.8),smoothstep(-.35,-.8,p.y)); }
  else if(t==14){ col=vec3(.3,.28,.26)*(1.+c1*.8+c2*.5)*(.8+.4*fbm(p*12.)); }
  else if(t==16){ float f=clamp(fbm(p*3.5)*1.15,0.,1.); col=mix(uC1,uC2,f); // 通用卫星：底色双色 + 撞击坑(uK.x) + 明暗半球(uK.y) + 断层/亮纹(uK.z)
    col=mix(col,mix(col*.16,col*1.12,smoothstep(-.12,.12,p.x)),uK.y);
    float cr=c1; col*=1.+cr*uK.x*.7; // 只调用一次 crater（它是 27 次循环，调用多了会拖慢着色器编译）
    col=mix(col,uC2*1.12,smoothstep(.86,.97,ridge(vec3(p.x*5.,p.y*2.2,p.z*5.)))*uK.z); }
  else { col=vec3(.44,.42,.4)*(1.+c1*.6+c2*.4); col=mix(col,vec3(.99),smoothstep(.09,.0,distance(p,normalize(vec3(.5,.45,.6)))));
    col=mix(col,vec3(.95),smoothstep(.04,.0,distance(p,normalize(vec3(.4,.5,.7))))*.8); }
  if(t==4&&uRR.y>0.){ vec3 s=normalize(uSunO); float dn=dot(s,uRN); if(abs(dn)>.01){ float tt=-dot(p,uRN)/dn; if(tt>0.){ float rho=length(p+s*tt); // 土星环投在行星上的影子（行星半径＝1）
      float inb=smoothstep(uRR.x-.03,uRR.x+.03,rho)*(1.-smoothstep(uRR.y-.03,uRR.y+.03,rho)); col*=1.-.7*inb*(.6+.3*sin(rho*30.)); } } }
  float d=max(dot(n,L),0.);
  col*=.09+1.1*pow(d,.85);
  col+=uRim*pow(1.-max(dot(n,v),0.),3.)*(.35+d);
  gl_FragColor=vec4(col,uA);
}`;
  const SUN_DIR = V(-40, 10, 30);
  const surfMat = (type, rim = [0, 0, 0], prm) => smat(SPHERE_VS, SURF_FS, { uSunW: { value: SUN_DIR }, uType: { value: type }, uRim: { value: new THREE.Color(...rim) }, uC1: { value: new THREE.Color(...(prm?.c1 || [0.5, 0.5, 0.5])) }, uC2: { value: new THREE.Color(...(prm?.c2 || [0.7, 0.7, 0.7])) }, uK: { value: new THREE.Vector3(...(prm?.k || [0.6, 0, 0])) }, uSunO: { value: V(1, 0, 0) }, uRN: { value: V(0, 1, 0) }, uRR: { value: new THREE.Vector2(0, 0) } }, { defines: { TYPE: type } });
  const atmoMat = (col) => smat(SPHERE_VS, ATMO_FS, { uSunW: { value: SUN_DIR }, uCol: { value: new THREE.Color(...col) } }, { side: THREE.BackSide, blending: THREE.AdditiveBlending });
  const ringMat = (inR, outR) => smat(RING_VS, RING_FS, { uIn: { value: inR }, uOut: { value: outR } }, { side: THREE.DoubleSide });
  const RING_FS2 = RING_FS.replace('uniform float uOut;', 'uniform float uOut; uniform vec3 uSunL; uniform float uPRad;').replace('gl_FragColor=vec4(c*(.5+.7*b),',
    'vec3 P0=vec3(vPos.x,0.,vPos.z), s0=normalize(uSunL); float ps=dot(P0,s0), bd=length(P0-s0*ps); float sh=step(ps,0.)*(1.-smoothstep(uPRad*.92,uPRad*1.04,bd)); c*=1.-.88*sh; gl_FragColor=vec4(c*(.5+.7*b),'); // 行星投在环上的影子
  const ringMat2 = (inR, outR, R) => smat(RING_VS, RING_FS2, { uIn: { value: inR }, uOut: { value: outR }, uSunL: { value: V(1, 0, 0) }, uPRad: { value: R } }, { side: THREE.DoubleSide });

  // ---------------- 行星系统：行星 + 卫星 + 光环 ----------------
  function planetSystem(o) {
    const g = new THREE.Group(), tilt = new THREE.Group(), wv = V(0, 0, 0), sv = V(0, 0, 0), invB = new THREE.Matrix4(), invR = new THREE.Matrix4(); let ringMesh = null; tilt.rotation.z = o.tilt || 0; g.add(tilt);
    const body = sphere(o.R, surfMat(o.type, o.rim, o.prm), 128); tilt.add(body);
    if (o.atmo) g.add(new THREE.Mesh(new THREE.SphereGeometry(o.R * 1.07, 64, 32), atmoMat(o.atmo)));
    if (o.ring) { const rg = new THREE.RingGeometry(o.R * o.ring[0], o.R * o.ring[1], 160); rg.rotateX(-Math.PI / 2); ringMesh = new THREE.Mesh(rg, ringMat2(o.R * o.ring[0], o.R * o.ring[1], o.R)); ringMesh.rotation.z = o.ringTilt ?? 0.45; g.add(ringMesh); body.material.uniforms.uRR.value.set(o.ring[0], o.ring[1]); }
    if (o.thin) for (const f of [1.55, 1.7, 1.85, 2.0]) { const l = new THREE.LineLoop(circle(o.R * f, 160), lineMat(0xdfe8ea, 0.25)); l.userData.keep = true; l.rotation.z = o.tilt || 0; g.add(l); }
    const labs = [{ p: V(0, -o.R - 0.35, 0), text: o.name }], moons = [], ob = new THREE.Group(); ob.rotation.z = o.ringTilt && o.ring ? o.ringTilt : o.tilt || 0; g.add(ob); // 卫星轨道面＝行星赤道面（天王星卫星随自转轴倾斜；土星卫星与环同面）
    for (const m of o.moons || []) {
      const e = m.e || 0, b2 = m.a * Math.sqrt(1 - e * e), pts = []; for (let i = 0; i < 200; i++) { const E = (i / 200) * TAU; pts.push(V(m.a * (Math.cos(E) - e), 0, -b2 * Math.sin(E))); }
      ob.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), lineMat(0xffd28a, 0.22)));
      const mesh = sphere(m.r, surfMat(m.type, [0, 0, 0], m.prm), 64); if (m.shape) mesh.scale.set(...m.shape);
      const lb = { p: V(0, 0, 0), text: m.name }; labs.push(lb); ob.add(mesh); moons.push({ mesh, m, lb, ph: Math.random() * TAU });
    }
    g.userData.labels = labs;
    g.userData.tick = (t) => {
      body.rotation.y = t * 0.06; ob.visible = !!FX.moons;
      if (ringMesh) { // 土星：环与行星互相投影（太阳方向取自表面着色器用的同一个太阳位置）
        g.updateWorldMatrix(true, true); sv.copy(SUN_DIR).sub(g.getWorldPosition(wv)).normalize(); invB.copy(body.matrixWorld).invert(); invR.copy(ringMesh.matrixWorld).invert();
        body.material.uniforms.uSunO.value.copy(sv).transformDirection(invB); body.material.uniforms.uRN.value.set(0, 1, 0).transformDirection(ringMesh.matrixWorld).transformDirection(invB);
        ringMesh.material.uniforms.uSunL.value.copy(sv).transformDirection(invR);
      }
      for (const s of moons) { const m = s.m, e = m.e || 0, M = s.ph + (TAU / m.p) * t * 0.9, E = e ? solveKepler(((M % TAU) + TAU) % TAU, e) : M, x = m.a * (Math.cos(E) - e), z = -m.a * Math.sqrt(1 - e * e) * Math.sin(E); s.mesh.position.set(x, 0, z); s.mesh.rotation.y = -M;
        // 冥王星—卡戎：共同绕质心（原点），质心在冥王星外；潮汐锁定，互相始终同一面朝向对方
        if (o.bary && s === moons[0]) { body.position.set(-o.bary * x, 0, -o.bary * z); body.rotation.y = -M; } s.lb.p.set(x, -m.r - 0.22, z); } // 卫星同步自转：始终同一面朝向行星（近似）
    };
    return g;
  }
  // 卫星按真实数据定义：半径 km、轨道半长轴（行星半径倍数）、周期（天）、偏心率、是否逆行。展示比例（非真实比例）：轨道距离 a/R = off + 0.5√(a_real/R)，卫星半径放大，周期压缩为 2.5+2.2·d^0.85 秒；不影响真实数值。
  const MN = (R, off = 0.85) => (name, type, km, aR, d, o = {}) => ({ name, type, r: +(0.06 + 0.09 * Math.pow(km / 1000, 0.7)).toFixed(3), a: +Math.min(R * (off + 0.5 * Math.sqrt(aR)), 7.8).toFixed(2), p: (o.retro ? -1 : 1) * (2.5 + 2.2 * Math.pow(d, 0.85)), ...o });
  const mars = MN(1.0), plu = MN(1.0), jup = MN(1.8), sat = MN(1.4, 1.75), ura = MN(1.15), nep = MN(1.15);
  const ICE = (c1, c2, k) => ({ c1, c2, k });
  const SYS = {
    'cel.mercury': { name: '水星', R: 1.2, type: 0 },
    'cel.venus': { name: '金星', R: 1.25, type: 1, rim: [0.95, 0.8, 0.45], atmo: [1, 0.8, 0.45] },
    'cel.mars': { name: '火星', R: 1.0, type: 2, rim: [0.9, 0.5, 0.3], atmo: [0.9, 0.55, 0.35], moons: [mars('火卫一', 14, 11, 2.77, 0.319, { shape: [1.3, 0.95, 1.05] }), mars('火卫二', 14, 6, 6.92, 1.263, { shape: [1.2, 0.95, 1] })] },
    'cel.pluto': { name: '冥王星（矮行星）', R: 1.0, type: 16, prm: ICE([0.5, 0.38, 0.3], [0.88, 0.8, 0.7], [0.45, 0, 0.1]), bary: 0.116, moons: [plu('卡戎', 16, 606, 16.5, 6.387, { r: 0.51, prm: ICE([0.38, 0.38, 0.4], [0.66, 0.66, 0.7], [0.7, 0, 0.05]) })] }, // 质量比 0.116：质心在两者之间偏向冥王星；卡戎半径约为冥王星的一半
    'cel.jupiter': { name: '木星', R: 1.8, type: 3, rim: [0.8, 0.65, 0.5], moons: [jup('木卫一', 7, 1822, 5.9, 1.769), jup('木卫二', 8, 1561, 9.38, 3.551), jup('木卫三', 9, 2634, 14.97, 7.155), jup('木卫四', 10, 2410, 26.33, 16.69)] },
    'cel.saturn': { name: '土星', R: 1.4, type: 4, rim: [0.9, 0.8, 0.55], ring: [1.35, 2.4], moons: [sat('土卫一', 16, 198, 3.07, 0.942, { prm: ICE([0.55, 0.55, 0.57], [0.72, 0.72, 0.74], [1.1, 0, 0]) }), sat('土卫二', 12, 252, 3.95, 1.37), sat('土卫三', 16, 531, 4.88, 1.888, { prm: ICE([0.78, 0.78, 0.8], [0.9, 0.9, 0.92], [0.6, 0, 0.15]) }), sat('土卫四', 16, 561, 6.26, 2.737, { prm: ICE([0.68, 0.68, 0.7], [0.86, 0.86, 0.88], [0.6, 0, 0.6]) }), sat('土卫五', 16, 764, 8.74, 4.518, { prm: ICE([0.6, 0.6, 0.62], [0.8, 0.8, 0.82], [1, 0, 0.2]) }), sat('土卫六', 11, 2575, 20.27, 15.945), sat('土卫八', 16, 735, 58.9, 79.33, { prm: ICE([0.12, 0.1, 0.09], [0.88, 0.87, 0.84], [0.6, 1, 0]) })] },
    'cel.uranus': { name: '天王星', R: 1.15, type: 5, rim: [0.5, 0.85, 0.9], atmo: [0.5, 0.85, 0.9], tilt: 1.71, thin: true, moons: [ura('天卫五', 16, 236, 5.08, 1.413, { prm: ICE([0.5, 0.5, 0.52], [0.72, 0.72, 0.74], [0.5, 0, 0.9]) }), ura('天卫一', 16, 579, 7.53, 2.52, { prm: ICE([0.62, 0.62, 0.64], [0.85, 0.85, 0.87], [0.5, 0, 0.5]) }), ura('天卫二', 16, 585, 10.5, 4.144, { prm: ICE([0.22, 0.22, 0.23], [0.38, 0.38, 0.4], [0.8, 0, 0]) }), ura('天卫三', 16, 789, 17.2, 8.706, { prm: ICE([0.56, 0.52, 0.5], [0.78, 0.74, 0.7], [0.6, 0, 0.4]) }), ura('天卫四', 16, 761, 23.0, 13.46, { prm: ICE([0.35, 0.32, 0.3], [0.55, 0.5, 0.46], [1, 0, 0.2]) })] },
    'cel.neptune': { name: '海王星', R: 1.15, type: 6, rim: [0.3, 0.5, 1], atmo: [0.3, 0.5, 1], moons: [nep('海卫八', 16, 210, 4.75, 1.122, { shape: [1.15, 1, 0.9], prm: ICE([0.22, 0.22, 0.23], [0.34, 0.34, 0.36], [1, 0, 0]) }), nep('海卫一', 13, 1353, 14.33, 5.877, { retro: true }), nep('海卫二', 16, 170, 222.6, 360.1, { e: 0.751, prm: ICE([0.45, 0.45, 0.48], [0.62, 0.62, 0.65], [0.5, 0, 0]) })] },
  };
  // ---------------- 卫星／矮行星特写 ----------------
  const MOONS = {
    'cel.phobos': { name: '火卫一', type: 14, R: 1.3, scale: [1.35, 1, 1.1] }, 'cel.deimos': { name: '火卫二', type: 14, R: 1.2, scale: [1.2, 0.95, 1] },
    'cel.ceres': { name: '谷神星（矮行星）', type: 15, R: 1.45 }, 'cel.io': { name: '木卫一', type: 7, R: 1.4, plume: [1, 0.8, 0.45] },
    'cel.europa': { name: '木卫二', type: 8, R: 1.4 }, 'cel.ganymede': { name: '木卫三', type: 9, R: 1.5 }, 'cel.callisto': { name: '木卫四', type: 10, R: 1.45 },
    'cel.titan': { name: '土卫六', type: 11, R: 1.45, haze: [0.95, 0.6, 0.2] }, 'cel.enceladus': { name: '土卫二', type: 12, R: 1.3, jets: true }, 'cel.triton': { name: '海卫一', type: 13, R: 1.4 },
    'cel.charon': { name: '卡戎', type: 16, R: 1.4, prm: ICE([0.38, 0.38, 0.4], [0.66, 0.66, 0.7], [0.7, 0, 0.05]) },
    'cel.mimas': { name: '土卫一', type: 16, R: 1.3, prm: ICE([0.55, 0.55, 0.57], [0.72, 0.72, 0.74], [1.1, 0, 0]) }, 'cel.tethys': { name: '土卫三', type: 16, R: 1.4, prm: ICE([0.78, 0.78, 0.8], [0.9, 0.9, 0.92], [0.6, 0, 0.15]) },
    'cel.dione': { name: '土卫四', type: 16, R: 1.4, prm: ICE([0.68, 0.68, 0.7], [0.86, 0.86, 0.88], [0.6, 0, 0.6]) }, 'cel.rhea': { name: '土卫五', type: 16, R: 1.45, prm: ICE([0.6, 0.6, 0.62], [0.8, 0.8, 0.82], [1, 0, 0.2]) },
    'cel.iapetus': { name: '土卫八', type: 16, R: 1.45, prm: ICE([0.12, 0.1, 0.09], [0.88, 0.87, 0.84], [0.6, 1, 0]) },
    'cel.miranda': { name: '天卫五', type: 16, R: 1.3, prm: ICE([0.5, 0.5, 0.52], [0.72, 0.72, 0.74], [0.5, 0, 0.9]) }, 'cel.ariel': { name: '天卫一', type: 16, R: 1.4, prm: ICE([0.62, 0.62, 0.64], [0.85, 0.85, 0.87], [0.5, 0, 0.5]) },
    'cel.umbriel': { name: '天卫二', type: 16, R: 1.4, prm: ICE([0.22, 0.22, 0.23], [0.38, 0.38, 0.4], [0.8, 0, 0]) }, 'cel.titania': { name: '天卫三', type: 16, R: 1.45, prm: ICE([0.56, 0.52, 0.5], [0.78, 0.74, 0.7], [0.6, 0, 0.4]) },
    'cel.oberon': { name: '天卫四', type: 16, R: 1.45, prm: ICE([0.35, 0.32, 0.3], [0.55, 0.5, 0.46], [1, 0, 0.2]) },
    'cel.proteus': { name: '海卫八', type: 16, R: 1.3, scale: [1.12, 1, 0.92], prm: ICE([0.22, 0.22, 0.23], [0.34, 0.34, 0.36], [1, 0, 0]) }, 'cel.nereid': { name: '海卫二', type: 16, R: 1.25, prm: ICE([0.45, 0.45, 0.48], [0.62, 0.62, 0.65], [0.5, 0, 0]) },
  };
  function moonBody(id, uPR) {
    const s = MOONS[id], g = new THREE.Group(), r = rng(id.length * 97), body = sphere(s.R, surfMat(s.type, s.haze || [0, 0, 0], s.prm), 128);
    if (s.scale) body.scale.set(...s.scale);
    g.add(body);
    if (s.haze) g.add(new THREE.Mesh(new THREE.SphereGeometry(s.R * 1.1, 64, 32), atmoMat(s.haze)));
    if (s.jets) { const a = []; for (let j = 0; j < 7; j++) { const ox = gauss(r) * 0.25, oz = gauss(r) * 0.25; for (let i = 0; i < 90; i++) { const t = r(); a.push({ p: [ox * (1 + t * 2) + gauss(r) * 0.03, -s.R - t * 2.4, oz * (1 + t * 2) + gauss(r) * 0.03], s: 0.5 * (1 - t) + 0.2, c: [0.8, 0.92, 1].map((x) => x * (1 - t * 0.6)) }); } } g.add(pointsOf(a, 1, uPR)); } // 土卫二南极的水汽喷泉
    if (s.plume) { const a = []; for (let i = 0; i < 220; i++) { const t = r(), an = r() * TAU, w = t * 0.5; a.push({ p: [s.R * 0.78 + t * 1.3 + Math.cos(an) * w * 0.3, s.R * 0.62 + t * 1.0, Math.sin(an) * w], s: 0.6 * (1 - t) + 0.2, c: s.plume.map((x) => x * (1 - t * 0.5)) }); } g.add(pointsOf(a, 1, uPR)); } // 木卫一的火山喷发
    g.userData.labels = [{ p: V(0, -s.R * 1.25 - 0.1, 0), text: s.name }];
    if (s.plume) g.userData.fitR = 1.9; else if (s.jets) g.userData.fitR = 2.6; // 喷发／喷泉不计入适配范围，让卫星本体足够大
    g.userData.tick = (t) => { body.rotation.y = t * 0.05; };
    return g;
  }


  // ---------------- 黑洞近景：实时近似光线追踪（M87* 与人马座 A* 各自一套参数）----------------
  // 科学部分：对每个像素的光线在“类史瓦西”黑洞外按光线偏折方程 a = −1.5·h²·x/r⁵（rs=1）逐步积分——给出光子球、黑洞阴影（r<rs 的捕获区）、
  // 吸积盘背面被弯到阴影上方的像、多重成像；盘内气体按开普勒速度运动，亮度含相对论多普勒增强（不对称）与引力红移。
  // 近似与艺术边界：忽略黑洞自旋（用无自旋度规近似）；盘是薄盘＋湍流纹理；纹理、亮斑、闪耀与喷流细节是艺术化示意；喷流按直线传播（不做透镜）；
  // 背景星点是只给本画面用的程序化星场，经同一套光线偏折；时间为加速的观赏时间，不是真实时标。
  const BH_VS = `varying vec3 vDir; void main(){ vec4 v=inverse(projectionMatrix)*vec4(position.xy,1.,1.); vDir=(inverse(viewMatrix)*vec4(v.xyz/v.w,0.)).xyz; gl_Position=vec4(position.xy,0.,1.); }`;
  const BH_FS = `${NOISE}
varying vec3 vDir; uniform vec3 uCen; uniform float uScale; uniform mat3 uR; uniform float uTime; uniform float uA; uniform float uMotion; uniform float uArt;
uniform int uSteps; uniform int uJetSteps; uniform float uRin; uniform float uRout; uniform float uSpeed; uniform float uTS; uniform float uHotN; uniform float uFlare; uniform float uJet; uniform float uExpo;
uniform vec3 uCool; uniform vec3 uMid; uniform vec3 uHot; uniform vec3 uStar; uniform float uBeam; uniform float uInner; uniform float uStarK; uniform float uOutK; uniform float uDiskK; uniform float uSpotAz; uniform float uSpotR; uniform float uSpotK;
float hh(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
vec3 starField(vec3 d){ vec3 s=d*95., c=floor(s), f=fract(s); float k=hh(c); if(k<uStarK) return vec3(0.); vec3 q=vec3(hh(c+1.7),hh(c+4.1),hh(c+9.3)); float dd=length(f-(.2+.6*q)), tw=.85+.15*sin(uTime*(1.+hh(c+7.)*3.)+hh(c+2.)*40.); return uStar*exp(-dd*dd*60.)*(.35+hh(c+3.3))*tw; }
void main(){
  vec3 ro=uR*(cameraPosition-uCen)/uScale, rd=normalize(uR*vDir), ro0=ro; bool miss=false;
  if(length(ro)>70.){ float b=dot(ro,rd), c=dot(ro,ro)-4900., h=b*b-c; float t=-b-sqrt(max(h,0.)); if(h<0.||t<0.) miss=true; else ro+=rd*t; }
  vec3 col=vec3(0.), x=ro, v=rd; float trans=1., rmin=1e9; bool cap=false; vec3 hc=cross(x,v); float h2=dot(hc,hc);
  if(!miss){
    for(int i=0;i<uSteps;i++){
      float r=length(x); rmin=min(rmin,r); if(r<1.){ cap=true; break; } if(r>78.&&dot(x,v)>0.) break;
      float dt=clamp(.1*(r-.85),.012,2.6); vec3 a=-1.5*h2*x/(r*r*r*r*r); vec3 vn=normalize(v+a*dt); vec3 xn=x+.5*(v+vn)*dt;
      if(x.y*xn.y<0.){
        vec3 p=mix(x,xn,x.y/(x.y-xn.y)); float rp=length(p.xz);
        if(rp>uRin&&rp<uRout){
          float om=.7071/(rp*sqrt(rp)), beta=sqrt(.5/rp), gam=inversesqrt(1.-beta*beta); vec3 tg=normalize(vec3(-p.z,0.,p.x));
          float dop=1./(gam*(1.-beta*dot(tg,-vn))), gr=sqrt(max(1.-1./rp,.02)), g=dop*gr;            // 多普勒＋引力红移
          float ang=om*uTime*uSpeed*uMotion, ca=cos(ang), sa=sin(ang);                                // 差速转动：内圈更快，纹理被拉伸剪切
          vec3 pr=vec3(p.x*ca-p.z*sa,p.y,p.x*sa+p.z*ca);
          float az=atan(pr.z,pr.x);                                                                      // 沿方位拉长、沿半径细密的细丝（像被剪切的等离子体，而不是团状沙暴）
          float tex=fbm(vec3(rp*uTS*1.9,cos(az)*1.2,sin(az)*1.2)+vec3(0.,uTime*.012*uMotion,0.)), tex2=fbm(vec3(rp*uTS*5.5,cos(az)*2.6+3.,sin(az)*2.6)+9.1);
          float prof=pow(uRin/rp,2.2)*smoothstep(uRin,uRin+.4,rp)*(1.-smoothstep(uRout-3.,uRout,rp))+uInner*exp(-(rp-uRin)*1.25)*smoothstep(uRin,uRin+.15,rp)+uOutK*(1.-smoothstep(uRout-6.,uRout,rp))*smoothstep(uRin,uRin+3.,rp); // 内缘高温亮环；外盘底光（V404）
          float inten=prof*(.1+1.7*smoothstep(.42,.86,tex)+.7*smoothstep(.5,.92,tex2));
          float hot=0.;                                                                                // 非同步的短寿命亮斑（沿开普勒轨道）
          for(int k=0;k<4;k++){ if(float(k)>=uHotN) break; float fk=float(k), rk=uRin+1.1+1.4*fk+.4*sin(fk*7.), pk=fk*1.9+.5+.7071/(rk*sqrt(rk))*uTime*uSpeed*uMotion;
            vec3 ps=vec3(rk*cos(pk),0.,rk*sin(pk)); float d=length(p-ps), life=pow(max(0.,sin(uTime*.29*uMotion*(1.+fk*.31)+fk*2.3)),2.); hot+=exp(-d*d/(.25+.05*rk))*life; }
          float fl=uArt*uFlare*pow(max(0.,sin(uTime*.23)*sin(uTime*.71+1.1)),6.);                       // 间歇性增强（A*）：很短，不持续
          if(uSpotK>0.){ vec3 psp=vec3(uSpotR*cos(uSpotAz),0.,uSpotR*sin(uSpotAz)); vec3 dsp=p-psp; float sg=exp(-dot(dsp,dsp)/6.); hot+=sg*uSpotK; inten+=.3*sg*uSpotK; }  // 盘缘撞击热点（V404：流束落到盘上的位置）
          inten*=(1.+fl*3.*smoothstep(uRin+4.,uRin,rp)+2.2*hot)*uDiskK;
          float lum=inten*pow(max(g,.05),uBeam), T=pow(uRin/rp,.75)*g;
          vec3 cc=mix(uCool,uMid,smoothstep(.12,.6,T)); cc=mix(cc,uHot,smoothstep(.55,1.25,T*(1.+hot*.6)));
          col+=trans*lum*cc; trans*=1.-.5*clamp(prof*2.,0.,1.);
        }
      }
      x=xn; v=vn;
    }
  }
  vec3 dout=miss?rd:normalize(v);
  if(!miss&&!cap){ float wq=exp(-(rmin-1.)*.55); dout=normalize(dout+.014*uMotion*wq*vec3(sin(uTime*.7+dout.y*44.),cos(uTime*.55+dout.x*39.),sin(uTime*.4+dout.z*31.))); } // 近黑洞处背景星的轻微扭曲／闪烁
  if(!cap) col+=trans*starField(dout);
  if(uJet>.5){                                                                                         // 喷流：细长、准直、稳定的主喷流（沿自旋轴），近侧明显，反向只留很弱的痕迹；沿程有缓慢向外漂移的亮结；直线传播（不做透镜）
    float b0=dot(ro0,rd), c0=dot(ro0,ro0)-5625., h0=b0*b0-c0;
    if(h0>0.){ float t0=max(-b0-sqrt(h0),0.), t1=-b0+sqrt(h0); float dtj=(t1-t0)/float(uJetSteps), bimp=length(cross(ro0,rd)), tc=-b0, jit=hh(vec3(gl_FragCoord.xy,3.)); vec3 jet=vec3(0.);
      for(int k=0;k<uJetSteps;k++){ float t=t0+(float(k)+jit)*dtj; if(t>tc&&bimp<2.8) continue; vec3 pos=ro0+rd*t; float az=abs(pos.y); if(az<1.3) continue;
        float rc=length(pos.xz), w=.2+.045*az; float dens=exp(-rc*rc/(w*w))*pow(az,-.7)*smoothstep(1.3,3.,az)*(1.-smoothstep(48.,75.,az));
        float kn=0.; for(int q=0;q<6;q++){ float fq=float(q), az0=mod(4.+fq*9.5+uTime*uMotion*(.35+.08*fq),56.)+3.; kn+=smoothstep(3.,9.,az0)*(1.-smoothstep(44.,58.,az0))*exp(-pow((az-az0)/(.8+.05*az),2.)); }
        float fil=n3(vec3(pos.x/w*1.2,az*.25,pos.z/w*1.2))*.5+.5;
        dens*=(.28+2.6*kn*uArt+(1.-uArt)*.4)*(.7+.5*fil)*(pos.y>0.?1.:.1);
        vec3 vj=vec3(0.,sign(pos.y),0.); float bj=.55, dj=1./(inversesqrt(1.-bj*bj)*(1.-bj*dot(vj,-rd)));
        dens*=pow(dj,2.6)*1.4;
        vec3 jc=mix(vec3(.92,.96,1.),vec3(.55,.72,1.),smoothstep(0.,35.,az)); jc=mix(jc,vec3(.6,.7,.88),smoothstep(30.,70.,az)); jc=mix(jc,vec3(1.),kn*.35); // 冷白→淡蓝白→银蓝
        jet+=dens*jc*dtj*.9; }
      col+=jet; }
  }
  col=1.-exp(-col*uExpo);
  gl_FragColor=vec4(col*uA,cap?uA:0.);
}`;
  const BH_PARAMS = {
    m87: { rin: 3, rout: 15, speed: 0.55, ts: 1.15, hotN: 2, flare: 0, jet: 1, expo: 1.1, beam: 4.2, inner: 1.4, starK: 0.9985, cool: [0.38, 0.17, 0.06], mid: [1, 0.6, 0.2], hot: [1, 0.95, 0.8], star: [1, 0.9, 0.72], rot: 1.1, fit: 17, name: 'M87*', env: 'ellipse' },
    sgra: { rin: 3, rout: 11, speed: 2.6, ts: 2.2, hotN: 4, flare: 1, jet: 0, expo: 1.15, beam: 3.4, inner: 0.8, starK: 0.988, cool: [0.3, 0.1, 0.04], mid: [1, 0.55, 0.16], hot: [1, 0.86, 0.55], star: [1, 0.9, 0.7], rot: 0.45, fit: 14, name: '人马座 A*', env: 'cluster' },
  };
  function bhQuad(g, P, extra = {}) {
    const rot = new THREE.Matrix4(), q = new THREE.Quaternion();
    const U = { uCen: { value: V(0, 0, 0) }, uScale: { value: 1 }, uR: { value: new THREE.Matrix3() }, uMotion: { value: 1 }, uArt: { value: 1 }, uSteps: { value: 96 }, uJetSteps: { value: 40 },
      uBeam: { value: P.beam }, uInner: { value: P.inner }, uStarK: { value: P.starK }, uRin: { value: P.rin }, uRout: { value: P.rout }, uSpeed: { value: P.speed }, uTS: { value: P.ts }, uHotN: { value: P.hotN }, uFlare: { value: P.flare }, uJet: { value: P.jet }, uExpo: { value: P.expo },
      uCool: { value: new THREE.Color(...P.cool) }, uMid: { value: new THREE.Color(...P.mid) }, uHot: { value: new THREE.Color(...P.hot) }, uStar: { value: new THREE.Color(...P.star) }, uDiskK: { value: 1 }, uOutK: { value: P.outK || 0 }, uSpotAz: { value: 0 }, uSpotR: { value: 20 }, uSpotK: { value: 0 }, ...extra };
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), smat(BH_VS, BH_FS, U, { depthTest: false, premultipliedAlpha: true })); quad.frustumCulled = false; quad.renderOrder = 8; g.add(quad);
    const step = (scaleMul = 1, cen = null) => {
      g.updateWorldMatrix(true, false); if (cen) U.uCen.value.copy(cen).applyMatrix4(g.matrixWorld); else g.getWorldPosition(U.uCen.value); U.uScale.value = g.matrixWorld.getMaxScaleOnAxis() * scaleMul;
      q.setFromRotationMatrix(g.matrixWorld); rot.makeRotationFromQuaternion(q.invert()); U.uR.value.setFromMatrix4(rot);
      U.uMotion.value = FX.dyn === 0 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : [0, 1, 1.6][FX.dyn] ?? 1;
      U.uArt.value = FX.mode === 'sci' ? 0 : 1; U.uSteps.value = FX.quality === 'low' ? 44 : FX.quality === 'mid' ? 72 : 100; U.uJetSteps.value = FX.quality === 'low' ? 36 : FX.quality === 'mid' ? 64 : 96;
    };
    return { U, quad, step };
  }
  function buildBlackHole(kind, uPR) {
    const P = BH_PARAMS[kind], g = new THREE.Group(), r = rng(kind === 'm87' ? 8701 : 4301), a = [], { U, step } = bhQuad(g, P);
    // 环境（中景）：尺度大幅压缩，只示意宿主环境（不与黑洞同一物理比例）；点云放在 12 rs 以外，避免挡在黑洞前面
    const lite = (col, size, k) => { const gl = glow(col, 2.4, size); gl.material.uniforms.uCol.value.multiplyScalar(k); g.add(gl); };
    if (kind === 'm87') { // 巨型椭圆星系的核区：厚重、平滑、乳白偏灰金的光晕，只有少量稀疏恒星
      lite([1, 0.9, 0.72], 100, 0.08); lite([1, 0.92, 0.78], 55, 0.09); lite([0.95, 0.85, 0.7], 28, 0.07);
      for (let i = 0; i < 700; i++) { const d = V(gauss(r), gauss(r) * 0.85, gauss(r)).normalize(), R = 14 + 70 * Math.pow(r(), 0.8); a.push({ p: d.multiplyScalar(R).toArray(), s: 0.25 + r() * 0.4, c: [1, 0.9, 0.74].map((x) => x * (0.1 + 0.22 * r())) }); }
    } else { // 银河中心：中心更密的核球恒星场（暖白／冷白／淡黄，少量橙红）＋柔和的灰金核心底光＋淡淡的暗尘条带与弧状气体丝
      lite([1, 0.86, 0.66], 60, 0.085); lite([0.9, 0.78, 0.62], 110, 0.04); lite([1, 0.9, 0.75], 30, 0.06);
      const COL = [[1, 0.92, 0.78], [0.86, 0.9, 1], [1, 0.9, 0.62], [1, 0.58, 0.36]], W = [0.4, 0.3, 0.22, 0.08];
      for (let i = 0; i < 7500; i++) { const d = V(gauss(r), gauss(r) * 0.72, gauss(r)).normalize(), R = 12 + 85 * Math.pow(r(), 2.3), u = r() * 0.92; let k = 0, acc = W[0]; while (u > acc && k < 3) acc += W[++k]; a.push({ p: d.multiplyScalar(R).toArray(), s: 0.22 + Math.pow(r(), 4) * 1.3, c: COL[k].map((x) => x * (0.12 + 0.3 * r()) * (1.4 - R / 120)) }); }
      for (let i = 0; i < 12; i++) { const d = V(gauss(r), gauss(r) * 0.6, gauss(r)).normalize().multiplyScalar(34 + 40 * r()); g.add(neb(d.toArray(), 22 + 22 * r(), [0.16, 0.13, 0.14], [0.12, 0.09, 0.12], [0.1, 0.08, 0.1], 70 + i * 5, 0.32, true, { sx: 1.8, sy: 0.7, rot: r() * 3 })); }
      for (let k = 0; k < 6; k++) { const U = V(gauss(r), gauss(r), gauss(r)).normalize(), W2 = V(gauss(r), gauss(r), gauss(r)).cross(U).normalize(), t0 = r() * 6; arcPts(a, r, V(0, 0, 0), U, W2, 42 + 28 * r(), t0, t0 + 0.9 + r() * 0.8, 150, 0.7, [0.46, 0.4, 0.52], 0.5, 0.14); }
    }
    const env = pointsOf(a, 1, uPR); env.userData.still = true; g.add(env);
    g.userData.labels = [{ hud: [0.66, 0.97], text: P.name + '：近似光线追踪（忽略自旋）；吸积流纹理、亮斑' + (kind === 'm87' ? '、喷流' : '与间歇增强') + '为艺术化示意，动态为加速的观赏时间' },
      { hud: [0.66, 0.935], text: kind === 'm87' ? '环境恒星背景示意，尺度大幅压缩；喷流按直线画出（未做透镜），近侧更亮' : '银心环境示意，尺度大幅压缩；A* 没有已证实的长期稳定大喷流，故不画' }];
    g.userData.fitR = P.fit; g.userData.autoOrbit = true; g.rotation.x = P.rot;
    g.userData.tick = () => step();
    return g;
  }

  // ---------------- 小行星带：成千上万块真实凹凸的岩石围成环，谷神星在其中 ----------------
  function buildBelt(uPR) {
    const g = new THREE.Group(), r = rng(1301), N = 1100;
    const geo = new THREE.IcosahedronGeometry(1, 2), pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), k = 1 + 0.26 * Math.sin(x * 3.1 + y * 2.3) * Math.cos(z * 2.7 + x) + 0.14 * Math.sin(y * 7 + z * 5); pos.setXYZ(i, x * k, y * k, z * k); }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0.05, flatShading: true, transparent: true }); mat.userData.base = 1;
    const rocks = new THREE.InstancedMesh(geo, mat, N), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const an = r() * TAU, rad = 6 + gauss(r) * 0.8, s = 0.025 + Math.pow(r(), 3) * 0.14;
      e.set(r() * TAU, r() * TAU, r() * TAU); q.setFromEuler(e);
      m4.compose(V(Math.cos(an) * rad, gauss(r) * 0.12, Math.sin(an) * rad), q, V(s * (0.8 + r() * 0.6), s * (0.55 + r() * 0.6), s * (0.7 + r() * 0.6)));
      rocks.setMatrixAt(i, m4); col.setHSL(0.07 + r() * 0.04, 0.12 + r() * 0.15, 0.3 + r() * 0.25); rocks.setColorAt(i, col);
    }
    rocks.frustumCulled = false; g.add(rocks);
    const dust = []; for (let i = 0; i < 7000; i++) { const an = r() * TAU, rad = 6 + gauss(r) * 1.0; dust.push({ p: [Math.cos(an) * rad, gauss(r) * 0.1, Math.sin(an) * rad], s: 0.2 + r() * 0.3, c: [0.6, 0.56, 0.5] }); }
    g.add(pointsOf(dust, 1, uPR), glow([1, 0.8, 0.45], 2.6, 2.4));
    const ceres = sphere(0.34, surfMat(15), 64); ceres.position.set(6.1, 0, 0.2); g.add(ceres);
    g.userData.labels = [{ p: V(0, -0.5, 0), text: '太阳' }, { p: V(6.1, -0.65, 0.2), text: '谷神星' }, { p: V(-6, 0.9, 1.5), text: '小行星带（石头之间相距很远）' }];
    g.rotation.x = 0.55; g.userData.tick = (t) => { rocks.rotation.y = t * 0.012; ceres.rotation.y = t * 0.1; };
    return g;
  }

  const solveKepler = (M, e) => { let E = M; for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); return E; };

  // ---------------- 室女座星系团（V2：成员星系 + 子团，三层细节）----------------
  // 数据说明（重要）：没能接入 VCC／EVCC 星表（本机访问不到 VizieR）。下面的 MEM 是手工整理的约 26 个亮成员（Messier/NGC）的近似赤经、赤纬与近似文献距离——
  // 凭整理，未对照星表；距离为 null 的成员没有可靠独立距离，深度是**模拟**的（高斯），不用红移硬算。细小的点是“矮星系统计密度样本”（程序生成，深度也是模拟），
  // 按这些亮成员周围的密度分量撒出（M87、M49、M60/M59、M86/M84 四个子团 + 弥散的外围），不是真实目录。M104（草帽星系）不是室女座星系团主体成员，不显示。
  // 坐标：以 (赤经 187.5°, 赤纬 12.5°, 16.5 Mpc) 为中心的切平面，1 单位≈0.25 Mpc，x 向西（东在左，同天球图），z 为视线方向；视觉尺寸的放大独立于坐标。
  // 细节层级：整体（粒子＝星系，A–D 子团标注）→ 区域（点子团标签放大）→ 星系（点星系名放大，展开椭圆／透镜／旋涡的内部形态）。再点一次回到整体。
  function buildVirgo(uPR) {
    const g = new THREE.Group(), r = rng(71), a = [], U = 4, D0 = 16.5, RA0 = 187.5, DE0 = 12.5, K = Math.PI / 180;
    const sky = (ra, de, d) => V(-(ra - RA0) * Math.cos(DE0 * K) * K * D0 * U, (de - DE0) * K * D0 * U, ((d ?? D0 + gauss(r) * 0.9) - D0) * U);
    // [名称, 赤经°, 赤纬°, 距离 Mpc（null＝未知）, 类型, 视觉半径（放大后）, 旋涡参数]
    const SP = { m100: { m: 2, p: 0.26 }, m99: { m: 2, p: 0.34, asym: 1 }, m98: { m: 2, p: 0.3, tilt: 1.35 }, m88: { m: 2, p: 0.16 }, m90: { m: 2, p: 0.2, weak: 1 }, m91: { m: 2, p: 0.28, bar: 1 }, m58: { m: 2, p: 0.22, bar: 1 }, m61: { m: 2, p: 0.3, bar: 1 }, n4535: { m: 2, p: 0.32, bar: 1, asym: 1 } };
    const MEM = [
      ['M87', 187.706, 12.391, 16.5, 'E', 0.22], ['M49', 187.445, 8.0, 17.1, 'E', 0.2], ['M84', 186.266, 12.887, 16.8, 'E', 0.14], ['M86', 186.549, 12.946, 16.7, 'E', 0.15], ['M60', 190.917, 11.553, 16.5, 'E', 0.17], ['M59', 190.51, 11.647, 14.9, 'E', 0.1], ['M89', 188.916, 12.556, 16.5, 'E', 0.11],
      ['NGC 4636', 190.708, 2.688, 14.7, 'E', 0.12], ['NGC 4473', 187.454, 13.429, 15.2, 'E', 0.09], ['NGC 4478', 187.57, 12.327, 16.8, 'E', 0.07], ['NGC 4458', 187.239, 13.24, 16.8, 'E', 0.06], ['NGC 4387', 186.424, 12.81, 17.0, 'E', 0.06],
      ['M85', 186.35, 18.191, 17.9, 'S0', 0.14], ['NGC 4459', 187.25, 13.979, 16.1, 'S0', 0.1], ['NGC 4477', 187.509, 13.636, 16.5, 'S0', 0.1], ['NGC 4550', 188.877, 12.221, 15.5, 'S0', 0.08], ['NGC 4435', 186.746, 13.079, 16.7, 'S0', 0.09],
      ['M100', 185.729, 15.822, 16.0, 'Sp', 0.26, SP.m100], ['M99', 184.707, 14.417, 16.8, 'Sp', 0.22, SP.m99], ['M98', 183.451, 14.9, null, 'Sp', 0.22, SP.m98], ['M88', 187.997, 14.42, null, 'Sp', 0.2, SP.m88], ['M90', 189.208, 13.163, null, 'Sp', 0.22, SP.m90], ['M91', 188.86, 14.497, null, 'Sp', 0.18, SP.m91], ['M58', 189.431, 11.818, 16.8, 'Sp', 0.18, SP.m58], ['M61', 185.479, 4.474, null, 'Sp', 0.22, SP.m61], ['NGC 4535', 188.585, 8.198, null, 'Sp', 0.22, SP.n4535],
    ].map(([name, ra, de, d, kind, R, sp]) => ({ name, kind, R, sp, c: sky(ra, de, d), known: d != null }));
    const M = (n) => MEM.find((x) => x.name === n).c;
    const frame = (c, n, spin) => { n = n.clone().normalize(); const t = Math.abs(n.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0), e1 = new THREE.Vector3().crossVectors(n, t).normalize(), e2 = new THREE.Vector3().crossVectors(n, e1), cs = Math.cos(spin), sn = Math.sin(spin); return (x, y, z) => { const X = x * cs - y * sn, Y = x * sn + y * cs; return [c.x + e1.x * X + e2.x * Y + n.x * z, c.y + e1.y * X + e2.y * Y + n.y * z, c.z + e1.z * X + e2.z * Y + n.z * z]; }; };
    const put = (p, s, c, k) => a.push({ p, s, c: c.map((x) => x * k) });
    const randN = (tilt) => { const t = tilt ?? 0.15 + r() * 1.2; return V(Math.sin(t) * Math.cos(r() * TAU), Math.cos(t), Math.sin(t) * Math.sin(r() * TAU)); };
    // 椭圆：平滑的三维椭球，无旋臂；巨椭圆（M87、M49）有更大更淡的星晕
    const ell = (G) => { const R = G.R, big = R >= 0.2, N = big ? 1600 : 360, F = frame(G.c, randN(), r() * TAU), b = 0.6 + r() * 0.35, cz = 0.55 + r() * 0.35; for (let i = 0; i < N; i++) { const x = gauss(r) * R * 0.38, y = gauss(r) * R * 0.38 * b, z = gauss(r) * R * 0.38 * cz, m2 = (x * x + (y / b) ** 2 + (z / cz) ** 2) / (R * R * 0.144); put(F(x, y, z), 0.22 + r() * 0.3, [1, 0.87, 0.64], 0.1 + 0.3 * Math.exp(-m2 * 0.7)); } if (big) for (let i = 0; i < 700; i++) { const d = V(gauss(r), gauss(r) * b, gauss(r) * cz).multiplyScalar(R * 0.8); put(F(d.x, d.y, d.z), 0.2 + r() * 0.2, [0.95, 0.85, 0.68], 0.1); } };
    // 透镜：核球＋光滑的盘，无旋臂
    const lens = (G) => { const R = G.R, F = frame(G.c, randN(), r() * TAU); for (let i = 0; i < 160; i++) put(F(gauss(r) * R * 0.2, gauss(r) * R * 0.2, gauss(r) * R * 0.17), 0.22 + r() * 0.3, [1, 0.9, 0.72], 0.32); for (let i = 0; i < 360; i++) { const rr = -Math.log(1 - r() * 0.97) * R * 0.3 + 0.1 * R, th = r() * TAU; put(F(Math.cos(th) * rr, Math.sin(th) * rr, gauss(r) * R * 0.035), 0.2 + r() * 0.25, [0.98, 0.92, 0.8], 0.2 * (1 - rr / (R * 1.3))); } };
    // 旋涡：参数各不相同（臂数/缠绕/棒/不对称/弱臂/倾角）；粉色星形成区只在臂上
    const spiral = (G) => {
      const R = G.R, p = G.sp, F = frame(G.c, randN(p.tilt), r() * TAU), arm = (th0, rr) => th0 + Math.log(rr / (0.12 * R)) / p.p;
      for (let i = 0; i < 180; i++) put(F(gauss(r) * R * 0.1, gauss(r) * R * 0.1, gauss(r) * R * 0.08), 0.22 + r() * 0.3, [1, 0.84, 0.58], 0.34);
      if (p.bar) for (let i = 0; i < 160; i++) put(F(gauss(r) * R * 0.22, gauss(r) * R * 0.05, gauss(r) * R * 0.03), 0.22 + r() * 0.3, [1, 0.85, 0.6], 0.26);
      for (let i = 0; i < 420; i++) { const rr = -Math.log(1 - r() * 0.97) * R * 0.32 + 0.06 * R, th = r() * TAU; put(F(Math.cos(th) * rr, Math.sin(th) * rr, gauss(r) * R * 0.025), 0.18 + r() * 0.25, [0.75, 0.82, 1], 0.14); }
      const arms = p.m, N = p.weak ? 220 : 620;
      for (let i = 0; i < N; i++) { const k = Math.floor(r() * arms), rr = (0.2 + 0.9 * Math.pow(r(), 0.8)) * R, w = p.asym && k === 0 ? 1.4 : 1, th = arm((k * TAU) / arms + (p.bar ? 0.5 : 0), rr) + gauss(r) * 0.12; if (r() > w * 0.75) continue; put(F(Math.cos(th) * rr, Math.sin(th) * rr, gauss(r) * R * 0.025), 0.2 + r() * 0.3, [0.64, 0.78, 1], 0.3 + 0.2 * r()); }
      if (!p.weak) for (let i = 0; i < 14; i++) { const k = Math.floor(r() * arms), rr = (0.35 + 0.65 * r()) * R, th = arm((k * TAU) / arms + (p.bar ? 0.5 : 0), rr); for (let j = 0; j < 3; j++) put(F(Math.cos(th) * rr + gauss(r) * R * 0.02, Math.sin(th) * rr + gauss(r) * R * 0.02, gauss(r) * R * 0.01), 0.45 + r() * 0.5, [1, 0.5, 0.66], 0.6); }
    };
    MEM.forEach((G) => (G.kind === 'E' ? ell(G) : G.kind === 'S0' ? lens(G) : spiral(G)));
    const halos = []; MEM.forEach((G) => { const gl = glow(G.kind === 'Sp' ? [0.75, 0.82, 1] : [1, 0.88, 0.66], 2.4, G.R * (G.kind === 'E' ? 1.6 : 1.3)); gl.position.copy(G.c); gl.material.uniforms.uCol.value.multiplyScalar(G.kind === 'E' ? (G.R >= 0.2 ? 0.7 : 0.45) : 0.3); halos.push(gl); }); // 每个亮成员自带一小团柔和的光（随放大展开为光滑的星系光）
    // 矮星系统计密度样本：围绕亮成员的子团密度分量 + 弥散外围；每个点＝一个矮星系（统计样本，非真实目录；深度为模拟）
    const mid = (x, y) => M(x).clone().lerp(M(y), 0.5);
    const COMP = [['A', M('M87'), 1.0, 1.5, 2.6], ['B', M('M49'), 0.55, 1.0, 2.2], ['C', mid('M60', 'M59'), 0.35, 1.2, 2.4], ['D', mid('M86', 'M84'), 0.5, 1.2, 2.4], ['ext', M('M87').clone().add(V(-0.5, -0.5, 0)), 0.5, 5.8, 4.2]];
    const tw = COMP.reduce((s, c) => s + c[2], 0);
    for (let i = 0; i < 3200; i++) {
      let x = r() * tw, comp = COMP[0]; for (const c of COMP) { x -= c[2]; if (x <= 0) { comp = c; break; } }
      const [nm, c, , sg, sz] = comp, ex = nm === 'ext', irr = r() < 0.12;
      put([c.x + gauss(r) * sg * (ex ? 1.1 : 1), c.y + gauss(r) * sg * (ex ? 0.8 : 1), c.z + gauss(r) * sz], 0.2 + r() * 0.28, irr ? [0.7, 0.82, 1] : [0.96, 0.87, 0.72], 0.2 + r() * 0.2);
    }
    g.add(pointsOf(a, 1.0, uPR), ...halos);
    const dg = (c, n, sp, size, k, per) => { for (let i = 0; i < n; i++) pulseGlow(g, c.clone().add(V(gauss(r) * sp, gauss(r) * sp * 0.7, gauss(r) * sp)), [1, 0.9, 0.72], 2.2, size * (0.6 + 0.7 * r()), k * (0.6 + 0.6 * r()), 0.03, per + i * 3, r() * 6.3); }; // 几团大小不一的淡辉光叠成不规则的密度光
    dg(COMP[0][1], 4, 0.9, 2.4, 0.07, 18); dg(COMP[1][1], 3, 0.6, 1.6, 0.045, 22); dg(COMP[2][1], 2, 0.7, 1.4, 0.03, 26); dg(COMP[3][1], 3, 0.7, 1.5, 0.035, 24);
    halos.forEach((h, i) => (g.userData.pulses ||= []).push({ m: h, c: h.material.uniforms.uCol.value.clone(), amp: 0.03, per: 14 + (i % 7) * 2.3, ph: i * 1.3 }));
    const gas = new THREE.Group(); for (const [c, n, sp, size, k] of [[COMP[0][1], 5, 1.3, 4.2, 0.05], [COMP[1][1], 3, 0.9, 2.6, 0.035], [COMP[3][1], 3, 0.9, 2.4, 0.03]]) for (let i = 0; i < n; i++) { const m = glow([0.55, 0.75, 1], 1.8, size * (0.6 + 0.6 * r())); m.position.copy(c).add(V(gauss(r) * sp, gauss(r) * sp * 0.7, gauss(r) * sp)); m.material.uniforms.uCol.value.multiplyScalar(k); gas.add(m); }
    gas.visible = false; g.add(gas); // 团内热气体：静态、不规则、极淡蓝白；默认隐藏
    // 标注与缩放：层级 0＝整体，1＝区域（子团），2＝星系
    const lbl = [], zoom = [], add = (p, text, o = {}) => lbl.push({ p, text, ...o });
    [['M87 子团（Virgo A）', COMP[0][1], 2.4], ['M49 子团（Virgo B）', COMP[1][1], 1.7], ['M60 / M59 周边（C）', COMP[2][1], 1.9], ['M86 / M84 周边', COMP[3][1], 1.9]].forEach(([text, c, dy], i) => { zoom.push({ p: c, s: 4.5, lvl: 1 }); add(c.clone().add(V(0, dy, 0)), text, { zoom: i, lvl: [0, 1], color: '#ffd28a' }); });
    const BIG = ['M87', 'M49', 'M84', 'M86', 'M60', 'M100', 'M88', 'M61', 'M85', 'M59', 'M89', 'M99', 'M98', 'M90', 'M58', 'NGC 4636', 'M91', 'NGC 4535'];
    BIG.forEach((nm, i) => { const G = MEM.find((x) => x.name === nm); zoom.push({ p: G.c, s: 6.6 / G.R * 9.5 / 11, lvl: 2 }); add(G.c.clone().add(V(0, -G.R * 1.4 - 0.25, 0)), nm + (G.kind === 'E' ? '（椭圆）' : G.kind === 'S0' ? '（透镜）' : '（旋涡）'), { zoom: 4 + i, lvl: i < 2 ? [0, 1, 2] : [1, 2] }); });
    { const G = MEM.find((x) => x.name === 'M87'); add(G.c.clone().add(V(0, 0.08, 0)), 'M87*（点击进入黑洞近景）', { go: 'cel.m87-bh', lvl: [2], color: '#ffd28a' }); } // 放大到 M87 后出现，点击进入独立的黑洞近景
    add(V(0, -10.2, 0), '细点＝矮星系统计密度样本（程序生成，深度为模拟）；亮成员位置、距离为近似值', { lvl: [0] });
    add(V(0, -9.3, 0), '', { lvl: [0, 1], dyn: () => (gas.visible ? '▶ 团内热气体：开（X 射线伪彩色示意，程序生成，非肉眼可见颜色）' : '▶ 团内热气体：关（点击显示）'), toggle: () => { gas.visible = !gas.visible; } });
    g.userData.labels = lbl; g.userData.zoom = zoom; g.userData.fitR = 9.5;
    g.rotation.set(0.2, 0.3, 0); return g;
  }

  // ---------------- 鱼-鲸座超星系团复合体（三维，科学概念示意）----------------
  // 注意：这里没有接入真实的星系团三维坐标（Abell／Tully 等星表本项目离线不带），整体由程序随机过程生成，是“概念示意”，不是观测重建。
  // 结构是涌现出来的，而不是手工指定的：先在一条细长、扁平（长轴 ≫ 宽 ≫ 厚）的带内按对数正态权重随机撒结点候选，再用一个低频的“空洞场”剔除落在空洞里的候选；
  // 结点之间按距离与权重的概率连接成弯曲、断续的纤维（强结点之间粗而密，弱结点之间稀疏）；大结点周围偶有薄片；空洞场同样挖空弥散成分与纤维。
  // 因此结点、纤维、空洞的数量都由随机过程决定。不标注拉尼亚凯亚的位置（没有数据支撑）。
  function buildComplex(uPR) {
    const g = new THREE.Group(), r = rng(101), a = [];
    const ph = Array.from({ length: 6 }, () => r() * 6.3);
    const cl = (x) => V(x, 0.5 * Math.sin(0.3 * x + ph[4]), 1.1 * Math.sin(0.22 * x + ph[5])); // 带的中心线：只作缓慢的弯曲
    const taper = (x) => 0.55 + 0.45 * Math.sin(((x + 12.5) / 25) * Math.PI), YS = 0.32, ZS = 1.5; // 厚（y）≈ 0.3，宽（z）≈ 1.5，长（x）≈ 24
    const around = (x, ks = 1) => { const c = cl(x), t = taper(x); return V(c.x, c.y + gauss(r) * YS * t * ks, c.z + gauss(r) * ZS * t * ks); };
    const field = (p) => { const n = Math.sin(0.5 * p.x + ph[0] + 1.1 * Math.sin(0.37 * p.z + ph[1])) * Math.sin(0.45 * p.z + ph[2] + 0.9 * Math.sin(0.31 * p.x + ph[3])) + 0.5 * Math.sin(1.1 * p.x + 0.9 * p.z + ph[1]); const t = Math.min(1, Math.max(0, (n + 0.55) / 0.9)); return t * t * (3 - 2 * t); };
    const keep = (p, pw = 1) => r() < Math.pow(field(p), pw);
    const add = (p, s, c, k) => a.push({ p: [p.x, p.y, p.z], s, c: c.map((x) => x * k) });
    // 结点
    const nodes = []; for (let i = 0; i < 90; i++) { const p = around((r() * 2 - 1) * 12), w = Math.exp(gauss(r) * 0.75); if (field(p) > 0.5) nodes.push({ c: p, w }); }
    const wmax = nodes.reduce((m, n) => Math.max(m, n.w), 0);
    nodes.forEach(({ c, w }) => {
      const sz = 0.35 + 0.55 * Math.sqrt(w / wmax) * 1.3, nb = 2 + Math.floor(r() * 3 + w), n0 = Math.floor(120 + 380 * Math.min(1, w / wmax * 1.5));
      for (let b = 0; b < nb; b++) { const o = V(gauss(r), gauss(r) * 0.4, gauss(r)).multiplyScalar(0.5 * sz), sx = (0.2 + r() * 0.35) * sz, sy = (0.1 + r() * 0.15) * sz, sz2 = (0.2 + r() * 0.3) * sz; for (let i = 0; i < n0 / nb * 2; i++) add(V(c.x + o.x + gauss(r) * sx, c.y + o.y + gauss(r) * sy, c.z + o.z + gauss(r) * sz2), 0.5 + r() * 0.9, r() < 0.3 ? [1, 0.92, 0.75] : [1, 0.8, 0.52], 0.22 + r() * 0.25); }
    });
    // 纤维：结点对之间按概率连接（弯曲的二次贝塞尔、断续、粗细随线变化）
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const A = nodes[i], B = nodes[j], d = A.c.distanceTo(B.c); if (d > 6.5) continue;
      const pl = Math.exp(-d / 2.4) * Math.min(1, Math.sqrt(A.w * B.w) / (0.6 * wmax) + 0.15); if (r() > pl * 2.8) continue;
      const mid = A.c.clone().lerp(B.c, 0.5).add(V(gauss(r), gauss(r) * 0.25, gauss(r)).multiplyScalar(0.22 * d)), f1 = r() * 6.3, f2 = r() * 6.3, thick = 0.06 + 0.1 * r(), N = Math.floor(d * (8 + 26 * Math.min(1, Math.sqrt(A.w * B.w) / (0.5 * wmax))));
      for (let k = 0; k < N; k++) { const t = r(), br = 0.5 + 0.5 * Math.sin(9 * t + f1) * Math.sin(3 * t + f2); if (r() > Math.max(0.12, br)) continue; const u = 1 - t, p = V(u * u * A.c.x + 2 * u * t * mid.x + t * t * B.c.x + gauss(r) * thick, u * u * A.c.y + 2 * u * t * mid.y + t * t * B.c.y + gauss(r) * thick * 0.5, u * u * A.c.z + 2 * u * t * mid.z + t * t * B.c.z + gauss(r) * thick); if (keep(p, 0.6)) add(p, 0.16 + r() * 0.32, r() < 0.15 ? [1, 0.82, 0.58] : [0.55, 0.68, 1], 0.28 + r() * 0.34); }
    }
    // 薄片：权重最大的几个结点周围各有一小片（x–z 平面，极薄）
    nodes.filter((n) => n.w > 0.7 * wmax).forEach(({ c }) => { const sa = 1.0 + r() * 1.1, sb = 0.6 + r() * 0.8, ang = r() * 3.14; for (let i = 0; i < 1100; i++) { const u = gauss(r) * sa * 0.5, v = gauss(r) * sb * 0.5, p = V(c.x + u * Math.cos(ang) - v * Math.sin(ang), c.y + gauss(r) * 0.07, c.z + u * Math.sin(ang) + v * Math.cos(ang)); if (keep(p)) add(p, 0.15 + r() * 0.3, [0.5, 0.62, 0.98], 0.1 + r() * 0.18); } });
    // 弥散的星系：沿带分布，被空洞挖空
    for (let i = 0; i < 5000; i++) { const p = around((r() * 2 - 1) * 12.5, 1.15); if (keep(p, 1.4)) add(p, 0.14 + r() * 0.28, [0.45, 0.58, 0.95], 0.1 + r() * 0.2); }
    g.add(pointsOf(a, 1.0, uPR));
    nodes.slice().sort((x, y) => y.w - x.w).slice(0, 12).forEach((n, i) => pulseGlow(g, n.c, [1, 0.88, 0.66], 2.6, 0.5 + 0.6 * Math.sqrt(n.w / wmax), 0.04 + 0.07 * (n.w / wmax), 0.02, 24 + i * 2.7, i * 1.4)); // 只给权重最大的 12 个结点
    g.userData.labels = [{ p: V(-10.5, 3.2, 0), text: '鱼-鲸座超星系团复合体' }, { p: V(0, -3.4, 0), text: '科学概念示意（程序生成，非真实观测重建）' }];
    g.rotation.set(0.5, 0.35, 0.12); return g;
  }

  // ---------------- 本超星系团（与其他层级统一的粒子语言）----------------
  // 一个粒子＝一个星系（不是恒星）。群/团的位置取自 Atlas of the Universe 的超星系面（SGX–SGY）示意图的读数，是近似位置；SGZ（纵深）没有可靠距离数据，
  // 是程序给的（整体保持扁平、带一定离面起伏），**不是观测结果**。各群的成员数、范围、椭率、峰数各不相同（室女座、天炉座是多峰结构，小群稀疏）；
  // 没有为了连续而把群连起来：只在有依据的地方画了一片很弱的“本地薄片”。显示尺寸与坐标无关。
  function buildSupercluster(uPR) {
    const g = new THREE.Group(), r = rng(81), a = [], R = 11, K = R / 910, H = 6.65;
    const P = (px, py, z) => V((px - 965) * K, (940 - py) * K, z);
    const ph = Array.from({ length: 4 }, () => r() * 6.3);
    const field = (p) => { const n = Math.sin(0.55 * p.x + ph[0] + 1.1 * Math.sin(0.4 * p.y + ph[1])) * Math.sin(0.5 * p.y + ph[2]) + 0.4 * Math.sin(0.9 * p.x + 0.7 * p.y + ph[3]); const t = Math.min(1, Math.max(0, (n + 0.6) / 0.9)); return t * t * (3 - 2 * t); };
    // [名称, 屏幕 x, y, 纵深 z（程序）, 成员数, 半径(px), 椭率(纵/横), 峰数, 偏暖比例, 层级标注]
    const C = [
      ['室女座星系团', 1410, 935, -2.2, 1500, 60, 0.85, 4, 0.35, [0, 1]], ['猎犬座星系群', 1205, 940, -1.2, 200, 38, 0.7, 2, 0.15, [1]], ['NGC 5033', 1255, 860, -0.5, 40, 16, 1, 1, 0.1, [1]],
      ['NGC 4697', 1580, 830, 1.0, 70, 20, 1.2, 1, 0.45, [1]], ['大熊座星系群', 1420, 1085, 0.5, 320, 34, 1.7, 3, 0.15, [0, 1]], ['狮子座 I', 1135, 1070, -0.8, 50, 15, 1.9, 1, 0.1, [1]],
      ['NGC 2997', 1035, 1148, 1.6, 36, 13, 1, 1, 0.1, [1]], ['NGC 1023', 885, 1110, 2.0, 110, 13, 3.2, 2, 0.2, [1]], ['NGC 6744', 865, 865, -1.0, 45, 16, 0.9, 1, 0.1, [1]],
      ['NGC 5128（半人马座 A）', 1005, 900, 0.6, 28, 10, 1, 1, 0.3, [1]], ['M101', 1065, 925, 0.8, 22, 8, 1, 1, 0.1, [1]], ['M81', 1040, 968, -0.2, 26, 9, 1.1, 1, 0.1, [1]],
      ['天炉座星系团', 500, 1405, 1.2, 620, 44, 0.75, 3, 0.3, [0, 1]], ['剑鱼座星系群', 685, 1235, -1.5, 260, 34, 1.1, 2, 0.15, [1]], ['波江座星系团', 420, 1525, -0.8, 300, 38, 1.2, 2, 0.15, [1]], ['NGC 7582', 405, 865, 1.4, 60, 15, 1, 1, 0.1, [1]],
    ];
    const lab = [], zoom = [];
    for (const [name, px, py, z, n, sig, tall, peaks, warm, lv] of C) {
      const c = P(px, py, z), s = sig * K, ang = r() * Math.PI, ca = Math.cos(ang), sa = Math.sin(ang), subs = Array.from({ length: peaks }, (_, i) => V(gauss(r) * s * (i ? 0.8 : 0), gauss(r) * s * (i ? 0.8 : 0), gauss(r) * s * 0.4)), wts = subs.map((_, i) => (i ? 0.5 + r() * 0.5 : 1));
      for (let i = 0; i < n; i++) { let x = r() * wts.reduce((q, w) => q + w, 0), k = 0; while (k < peaks - 1 && (x -= wts[k]) > 0) k++; const o = subs[k], sx = s * (0.35 + 0.3 * r()), u = gauss(r) * sx, v = gauss(r) * sx * tall; a.push({ p: [c.x + o.x + u * ca - v * sa, c.y + o.y + u * sa + v * ca, c.z + o.z + gauss(r) * s * 0.35], s: 0.3 + r() * 0.4, c: (r() < warm ? [1, 0.88, 0.62] : [0.72, 0.84, 1]).map((q) => q * (0.22 + 0.3 * r())) }); }
      const zi = zoom.length; zoom.push({ p: c, s: n > 500 ? 3.4 : 4.6, lvl: 1 });
      lab.push({ p: c.clone().add(V(0, -s * (1 + tall * 0.35) - 0.3, 0)), text: name, zoom: zi, lvl: lv, color: name === '室女座星系团' ? '#ffd28a' : undefined });
    }
    // 成串的小星系群（室女座 III、狮子座 II 一带）：稀疏
    for (const [px, py, z] of [[1665, 560, 0.5], [1705, 600, 0.2], [1680, 680, 0.6], [1790, 720, -0.4], [1730, 780, 0.1], [1520, 1405, 1], [1575, 1410, 0.4], [1440, 1420, 0.8], [1475, 1330, 1.1], [360, 810, 1], [195, 760, 0.6], [275, 700, 1.2], [300, 765, 0.3], [1250, 765, 0.2]]) { const c = P(px, py, z), s = 16 * K * (0.7 + 0.6 * r()), nn = 30 + Math.floor(r() * 40); for (let i = 0; i < nn; i++) a.push({ p: [c.x + gauss(r) * s, c.y + gauss(r) * s * (0.6 + r() * 0.6), c.z + gauss(r) * s * 0.4], s: 0.28 + r() * 0.3, c: [0.72, 0.84, 1].map((q) => q * (0.2 + 0.25 * r())) }); }
    // 群与群之间散落的单个星系：由密度场决定（有空洞），整体扁平
    for (let i = 0; i < 900; i++) { const an = r() * TAU, rr = Math.sqrt(r()) * R * 0.98, p = V(Math.cos(an) * rr, Math.sin(an) * rr * 0.9, gauss(r) * 1.7); if (r() < Math.pow(field(p), 1.3)) a.push({ p: p.toArray(), s: 0.2 + r() * 0.28, c: [0.68, 0.78, 0.95].map((q) => q * (0.14 + 0.2 * r())) }); }
    // 本地薄片：围绕本星系群的一片很弱的薄层（有观测依据的片状结构）
    const LG = P(860, 912, 0), tilt = 0.25; for (let i = 0; i < 160; i++) { const u = gauss(r) * 2.2, v = gauss(r) * 1.1; a.push({ p: [LG.x + u, LG.y + v * Math.cos(tilt), LG.z + v * Math.sin(tilt) + gauss(r) * 0.08], s: 0.22 + r() * 0.25, c: [0.7, 0.82, 1].map((q) => q * 0.2) }); }
    // 本星系群：银河系、仙女座、三角座三个很小的点（不画成大旋涡）
    for (const [dx, dy, c] of [[0, 0, [1, 0.85, 0.55]], [0.1, 0.03, [0.9, 0.9, 1]], [0.07, -0.05, [0.7, 0.85, 1]]]) a.push({ p: [LG.x + dx, LG.y + dy, LG.z], s: 1.4, c: c.map((q) => q * 0.9) });
    g.add(pointsOf(a, 1.0, uPR));
    { const V0 = P(1410, 935, -2.2), F0 = P(500, 1405, 1.2), U0 = P(1420, 1085, 0.5); // 高密度区极淡的密度辉光（几团错开，不成实心球）；普通星系点保持静态
      for (let i = 0; i < 4; i++) pulseGlow(g, V0.clone().add(V(gauss(r) * 0.35, gauss(r) * 0.3, gauss(r) * 0.2)), [1, 0.9, 0.72], 2.2, 1.3 + r() * 1.2, 0.05 + 0.03 * r(), 0.02, 22 + i * 4, i * 1.9);
      for (let i = 0; i < 2; i++) pulseGlow(g, F0.clone().add(V(gauss(r) * 0.25, gauss(r) * 0.25, 0)), [1, 0.9, 0.75], 2.2, 1.0 + r() * 0.8, 0.04, 0.02, 28 + i * 5, 2 + i);
      pulseGlow(g, U0, [0.85, 0.92, 1], 2.2, 1.3, 0.03, 0.015, 31, 4.4);
      pulseGlow(g, LG, [1, 0.8, 0.6], 3, 0.35, 0.5, 0.03, 16, 0.7); } // 本星系群：小型定位亮点
    const lz = zoom.length; zoom.push({ p: LG, s: 7, lvl: 1 });
    lab.unshift({ p: LG.clone().add(V(0, 0.5, 0)), text: '本星系群（我们）', zoom: lz, lvl: [0, 1], color: '#ffb0a0' });
    lab.push({ p: LG.clone().add(V(0, -0.9, 0)), text: '本地薄片', lvl: [1] }, { p: V(0, -R - 0.6, 0), text: '示意：群/团位置为示意图读数（近似）；纵深由程序给出，非观测；一个粒子＝一个星系', lvl: [0] });
    g.userData.labels = lab; g.userData.zoom = zoom; g.userData.fitR = 11;
    g.rotation.set(0.62, 0.25, 0); return g;
  }

  // ---------------- 拉尼亚凯亚（三维，科学概念示意）----------------
  // 坐标：超星系坐标 (SGX,SGY,SGZ)，单位 Mpc，本星系群在原点；显示时 (x,y,z)→(x,z,-y)/9、整体平移到流域中心。1 单位≈9 Mpc。
  // 数据说明：没有接入 Cosmicflows 的速度场（本机离线）。以下哪些是什么——
  //  · “巨引源区域”里的几个星系团（诺玛、半人马、长蛇一带）与室女座星系团的位置：近似的超星系坐标（凭整理，未对照星表）；其余结点由程序按对数正态权重＋空洞场生成，是示意；
  //  · 流线：对一个程序化的“引力速度场”（若干吸引子：上述巨引源区星系团、更远的沙普利方向、本地的室女座；一个排斥区）做三维积分得到，
  //    方向、曲率、汇聚形态都由该场决定，**不是 Cosmicflows 实测的星系运动轨迹**；
  //  · 流域范围：没有任何壳；空间范围用星系渐淡与流线汇聚趋势暗示，另有默认隐藏的不闭合细线断片（示意，不是真实物理外壳）。
  function buildLaniakea(uPR) {
    const g = new THREE.Group(), r = rng(91), a = [], U = 9, C0 = V(-33, 16, -3), sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    const S = (p) => V((p.x - C0.x) / U, (p.z - C0.z) / U, -(p.y - C0.y) / U); // 超星系坐标（Mpc）→ 场景
    const GA = [[-62, 22, -6, 1.6, '诺玛星系团一带'], [-41, 18, -8, 1.3, '半人马座星系团'], [-38, 34, -4, 1.0, '长蛇座星系团'], [-52, 4, -17, 0.9, ''], [-47, 28, -5, 0.7, ''], [-70, 8, -10, 0.8, '']].map(([x, y, z, w, name]) => ({ p: V(x, y, z), w, name }));
    const VIRGO = V(-3.4, 16.1, -0.7), SHAP = V(-150, 50, -20), REP = V(95, -35, 12);
    const ph = Array.from({ length: 4 }, () => r() * 6.3);
    const field = (p) => { const n = Math.sin(0.09 * p.x + ph[0] + 1.1 * Math.sin(0.07 * p.z + ph[1])) * Math.sin(0.08 * p.z + ph[2] + 0.9 * Math.sin(0.06 * p.x)) + 0.5 * Math.sin(0.2 * p.x + 0.17 * p.y + ph[3]); return sm(0, 1, (n + 0.55) / 0.9); }; // 空洞场：低值＝空洞
    // 空间范围用“渐变”表达：离流域中心越远，星系越淡，但不会突然消失，也没有任何封闭轮廓
    const add = (p, s, c, k) => a.push({ p: S(p).toArray(), s, c: c.map((x) => x * k * (1 - 0.5 * sm(40, 95, p.distanceTo(C0)))) });
    // ---- 宇宙网：高密度结点（巨引源区几个星系团＋室女座＋程序生成的其余结点）
    const nodes = GA.map((n) => ({ c: n.p, w: n.w * 3.2, ga: true })); nodes.push({ c: VIRGO, w: 1.6, ga: false });
    for (let i = 0; i < 110; i++) { const p = V(C0.x + gauss(r) * 40, C0.y + gauss(r) * 27, C0.z + gauss(r) * 21), w = Math.exp(gauss(r) * 0.7); if (field(p) > 0.5 && nodes.every((n) => n.c.distanceTo(p) > 7)) nodes.push({ c: p, w, ga: false }); }
    const wmax = nodes.reduce((m, n) => Math.max(m, n.w), 0);
    nodes.forEach(({ c, w }) => { const nb = 2 + Math.floor(r() * 3 + w), n0 = Math.floor(80 + 300 * Math.min(1, w / wmax)), sg = 3 + 5 * Math.sqrt(w / wmax); for (let b = 0; b < nb; b++) { const o = V(gauss(r), gauss(r) * 0.5, gauss(r)).multiplyScalar(0.6 * sg), sx = sg * (0.3 + r() * 0.4), sy = sx * (0.35 + r() * 0.3), sz = sg * (0.25 + r() * 0.4); for (let i = 0; i < (n0 / nb) * 1.6; i++) add(V(c.x + o.x + gauss(r) * sx, c.y + o.y + gauss(r) * sy, c.z + o.z + gauss(r) * sz), 0.4 + r() * 0.7, r() < 0.12 + 0.3 * Math.min(1, w / wmax) ? [1, 0.9, 0.68] : [0.88, 0.92, 1], 0.2 + r() * 0.25); } });
    // ---- 丝状星系链：每个结点连向最近的 2–3 个结点（弯曲、粗细变化、断续），再加少量较远的连接；不同丝之间留出空洞
    const edges = new Map(), key = (i, j) => (i < j ? i + '-' + j : j + '-' + i);
    nodes.forEach((A, i) => { nodes.map((B, j) => [A.c.distanceTo(B.c), j]).filter(([, j]) => j !== i).sort((x, y) => x[0] - y[0]).slice(0, 2 + Math.floor(r() * 2)).forEach(([d, j]) => { if (d < 48) edges.set(key(i, j), [i, j]); }); });
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) { const d = nodes[i].c.distanceTo(nodes[j].c); if (d < 60 && r() < 0.05 * Math.exp(-d / 40) * 6) edges.set(key(i, j), [i, j]); }
    for (const [i, j] of edges.values()) {
      const A = nodes[i], B = nodes[j], d = A.c.distanceTo(B.c), mid = A.c.clone().lerp(B.c, 0.5).add(V(gauss(r), gauss(r), gauss(r)).multiplyScalar(0.18 * d)), f1 = r() * 6.3, f2 = r() * 6.3, str = Math.min(1, Math.sqrt(A.w * B.w) / (0.45 * wmax) + 0.25);
      for (let k = 0, N = Math.floor(d * 3.4 * (0.5 + 0.7 * str)); k < N; k++) { const t = r(); if (Math.sin(t * 9 + f1) < -0.55) continue; const u = 1 - t, th = (0.5 + 0.9 * (0.5 + 0.5 * Math.sin(t * 6 + f2))) * (0.6 + 0.8 * str), p = V(u * u * A.c.x + 2 * u * t * mid.x + t * t * B.c.x + gauss(r) * th, u * u * A.c.y + 2 * u * t * mid.y + t * t * B.c.y + gauss(r) * th * 0.8, u * u * A.c.z + 2 * u * t * mid.z + t * t * B.c.z + gauss(r) * th);
        if (r() < Math.pow(field(p), 0.6)) add(p, 0.16 + r() * 0.34, r() < 0.1 ? [1, 0.88, 0.66] : r() < 0.3 ? [0.6, 0.62, 1] : [0.84, 0.9, 1], 0.14 + r() * 0.22); }
    }
    for (let i = 0; i < 3600; i++) { const p = V(C0.x + gauss(r) * 52, C0.y + gauss(r) * 34, C0.z + gauss(r) * 27); if (r() < Math.pow(field(p), 1.8)) add(p, 0.14 + r() * 0.26, [0.62, 0.64, 1], 0.1 + r() * 0.16); } // 散落的单个星系，被空洞挖空；向外自然稀疏，不设边界
    // 沙普利方向：外侧稀疏的星系结构（示意，位置沿该方向放在标注处，距离未按比例）
    const shp = SHAP.clone().lerp(C0, 0.45); for (let c = 0; c < 6; c++) { const o = shp.clone().add(V(gauss(r) * 10, gauss(r) * 6, gauss(r) * 6)); for (let i = 0; i < 45; i++) add(V(o.x + gauss(r) * 3, o.y + gauss(r) * 2, o.z + gauss(r) * 2.5), 0.2 + r() * 0.3, [0.7, 0.74, 1], 0.12 + r() * 0.14); }
    const hi = []; for (let i = a.length - 1; i >= 0 && hi.length < 90; i--) if (a[i].s > 0.95 && a[i].c[2] < a[i].c[0]) hi.push(...a.splice(i, 1)); // 少数重要亮点单独成组，只有它们轻微闪烁
    // 近处少量星系：椭圆或旋涡形态（微小，远处的仍只是光点）
    const mini = [], Q = new THREE.Quaternion(), E = new THREE.Euler();
    for (let m = 0; m < 26; m++) { const cp = m < 12 ? VIRGO.clone().add(V(gauss(r) * 6, gauss(r) * 4, gauss(r) * 5)) : V(gauss(r) * 14, gauss(r) * 9, gauss(r) * 9).add(V(0, 0, 0)), c = S(cp), spiral = r() < 0.6; Q.setFromEuler(E.set(r() * 6.3, r() * 6.3, r() * 6.3)); const ph0 = r() * 6.3;
      for (let i = 0; i < (spiral ? 80 : 55); i++) { let v; if (spiral) { const rr = 0.012 + 0.075 * Math.sqrt(r()), th = (i % 2) * Math.PI + 3.4 * (rr / 0.09) + ph0 + gauss(r) * 0.16; v = V(Math.cos(th) * rr, gauss(r) * 0.004, Math.sin(th) * rr); } else v = V(gauss(r) * 0.045, gauss(r) * 0.026, gauss(r) * 0.034); v.applyQuaternion(Q).add(c); mini.push({ p: v.toArray(), s: 0.3 + r() * 0.25, c: (spiral ? [0.78, 0.86, 1] : [1, 0.9, 0.72]).map((x) => x * (0.35 + 0.3 * r())) }); } }
    const gals = new THREE.Group(), still = pointsOf(a, 1.0, uPR); still.userData.still = true; const miniP = pointsOf(mini, 1.0, uPR); miniP.userData.still = true; gals.add(still, pointsOf(hi, 1.0, uPR), miniP); g.add(gals);
    // ---- 示意速度场：吸引子（巨引源区、沙普利方向、本地室女座、各结点）与一个排斥区，叠加缓慢的旋转与复杂的三维转向
    const att = [...GA.map((n) => ({ p: n.p, w: n.w })), { p: SHAP, w: 14 }, { p: VIRGO, w: 0.7 }, { p: REP, w: -5 }, ...nodes.filter((n) => !n.ga).map((n) => ({ p: n.c, w: (3.0 * n.w) / wmax }))];
    const GAc = GA.reduce((s, n) => s.add(n.p.clone().multiplyScalar(n.w)), V(0, 0, 0)).multiplyScalar(1 / GA.reduce((s, n) => s + n.w, 0)), dd = V(0, 0, 0), sw = V(0, 0, 0);
    const vel = (p, out) => { out.set(0, 0, 0); for (const k of att) { const d = k.p.clone().sub(p), L2 = d.lengthSq() + 100; out.addScaledVector(d, k.w / Math.pow(L2, 1.5)); } out.normalize(); dd.copy(GAc).sub(p); sw.set(-dd.y, dd.x, 0.3 * dd.z).normalize(); out.addScaledVector(sw, 0.3 * Math.exp(-dd.length() / 70)); out.x += 0.16 * Math.sin(0.07 * p.y + ph[0]); out.y += 0.16 * Math.sin(0.06 * p.z + ph[1]); out.z += 0.12 * Math.sin(0.08 * p.x + ph[2]); return out.normalize(); };
    const streams = [], mainS = [], auxS = [], h = 3.5, v1 = V(0, 0, 0), v2 = V(0, 0, 0), seeds = nodes.filter((n) => !n.ga);
    const integ = (s0) => { const pts = [s0.clone()], p = s0.clone(); for (let k = 0; k < 90; k++) { vel(p, v1); const mid = p.clone().addScaledVector(v1, h * 0.5); vel(mid, v2); p.addScaledVector(v2, h); pts.push(p.clone()); if (GA.some((q) => q.p.distanceTo(p) < 12) || p.distanceTo(C0) > 110) break; } return pts; };
    for (let n = 0, tries = 0; n < 16 && tries < 600; tries++) { const pts = integ(seeds[Math.floor(r() * seeds.length)].c.clone().add(V(gauss(r) * 4, gauss(r) * 3, gauss(r) * 4))); if (pts.length < 8) continue; n++; streams.push(pts); mainS.push({ sq: pts.map((q) => S(q)), c: n % 3 === 0 ? [1, 0.8, 0.5] : [0.86, 0.91, 1] }); }
    for (let n = 0, tries = 0; n < 130 && tries < 1500; tries++) { const p0 = V(C0.x + gauss(r) * 50, C0.y + gauss(r) * 33, C0.z + gauss(r) * 26); if (field(p0) < 0.3 || GA.some((q) => q.p.distanceTo(p0) < 14)) continue; const pts = integ(p0); if (pts.length < 8) continue; n++; auxS.push({ sq: pts.map((q) => S(q)), c: r() < 0.25 ? [0.85, 0.66, 0.4] : [0.55, 0.7, 1] }); } // 大量辅助流线：细微、半透明
    const mkLines = (list, op) => { const pos = [], col = []; for (const { sq, c } of list) sq.forEach((q, k) => { if (!k) return; const f = k / sq.length, br = 0.35 + 0.65 * f, p0 = sq[k - 1]; pos.push(p0.x, p0.y, p0.z, q.x, q.y, q.z); col.push(c[0] * br, c[1] * br, c[2] * br, c[0] * br, c[1] * br, c[2] * br); });
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending }); m.userData.base = op; return new THREE.LineSegments(geo, m); };
    const flowLines = new THREE.Group(); flowLines.add(mkLines(auxS, 0.07), mkLines(mainS, 0.24)); g.add(flowLines); // 主流线 0.24、辅助流线 0.07
    // ---- 空间范围：不画壳。只在转换区域放少量断续、极淡的灰蓝／暗紫弥散辉光，暗示不同引力流域之间的过渡
    const GCOL = [[0.4, 0.45, 0.62], [0.38, 0.28, 0.55], [0.34, 0.4, 0.58]];
    for (let i = 0; i < 9; i++) { const du = V(gauss(r), gauss(r) * 0.7, gauss(r)).normalize(), gl = glow(GCOL[i % 3], 2.2, 3 + r() * 3.5); gl.material.uniforms.uCol.value.multiplyScalar(0.03 + 0.03 * r()); gl.position.copy(S(C0.clone().add(du.multiplyScalar(36 + 34 * r())))); g.add(gl); }
    // ---- 可选的流域参考轮廓（默认隐藏）：若干条不闭合的细线断片，贴在由吸引子朝向给出的不规则半径面上；速度场重建的示意，不是实体外壳
    const lobes = [[GA[0].p, 1.0, 5], [GA[1].p, 0.85, 5], [GA[2].p, 0.7, 5], [VIRGO, 0.9, 5], [V(-30, 50, 5), 0.35, 3], [V(-35, -20, 0), 0.25, 3]].map(([p, w, k]) => ({ u: p.clone().sub(C0).normalize(), w, k })), bph = [r() * 6.3, r() * 6.3, r() * 6.3];
    const Rof = (du) => { let R = 0, ws = 0; for (const l of lobes) { const e = Math.exp(l.k * (du.dot(l.u) - 1)); R += l.w * e; ws += e; } return (34 + 30 * (R / (ws + 1e-6))) * (1 + 0.12 * Math.sin(2.1 * du.x + bph[0]) * Math.sin(1.7 * du.y + bph[1]) + 0.08 * Math.sin(3.3 * du.z + bph[2] + 2 * du.x)); };
    const outline = new THREE.Group();
    for (let k = 0; k < 7; k++) { const e1 = V(gauss(r), gauss(r), gauss(r)).normalize(), e2 = V(gauss(r), gauss(r), gauss(r)).cross(e1).normalize(), t0 = r() * 6.3, span = 0.9 + r() * 0.9, pts = []; for (let i = 0; i <= 40; i++) { const t = t0 + (i / 40) * span, du = e1.clone().multiplyScalar(Math.cos(t)).addScaledVector(e2, Math.sin(t)); pts.push(S(C0.clone().add(du.multiplyScalar(Rof(du))))); } outline.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(0x8fa0e0, 0.1))); }
    outline.visible = false; g.add(outline);
    // 流动的亮点：极慢、稀疏，只沿主流线移动，表示重建速度场的方向（不是星系的实际运动或固定轨道）
    const NP = 40, ppos = new Float32Array(NP * 3), pc = new Float32Array(NP * 3).fill(0.85), ps = new Float32Array(NP).fill(0.6), off = Array.from({ length: NP }, () => r());
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(ppos, 3).setUsage(THREE.DynamicDrawUsage)); pg.setAttribute('aS', new THREE.BufferAttribute(ps, 1)); pg.setAttribute('aC', new THREE.BufferAttribute(pc, 3));
    const flow = new THREE.Points(pg, smat(POINTS_VS, POINTS_FS, { uPR: { value: uPR }, uSize: { value: 0.6 } }, { blending: THREE.AdditiveBlending })); flow.frustumCulled = false; g.add(flow);
    g.userData.tick = (t) => { outline.visible = !!FX.basinRef; gals.visible = !!FX.gals; flow.visible = FX.flow === 2; flowLines.visible = FX.flow > 0;
      for (let i = 0; i < NP; i++) { const st = streams[i % Math.min(streams.length, 8)], f = (off[i] + t * 0.015) % 1, x = f * (st.length - 1), k = Math.min(st.length - 2, Math.floor(x)), u = x - k, q = S(st[k].clone().lerp(st[k + 1], u)); ppos[i * 3] = q.x; ppos[i * 3 + 1] = q.y; ppos[i * 3 + 2] = q.z; } pg.attributes.position.needsUpdate = true; };
    GA.forEach((n, i) => pulseGlow(g, S(n.p), [1, 0.84, 0.58], 2.4, 0.7 + 0.5 * n.w, 0.07 + 0.03 * (i % 2), 0.04, 18 + i * 3.1, i * 2.1)); // 巨引源区：多个星系团各自的小辉光
    pulseGlow(g, S(VIRGO), [0.85, 0.92, 1], 2.4, 0.7, 0.08, 0.03, 24, 1.3); // 室女座星系团：独立的高密度群
    pulseGlow(g, S(V(0, 0, 0)), [1, 0.85, 0.5], 3, 0.32, 0.6, 0.05, 12, 0.5); // 银河系定位标记：小型金色
    const lab = (p, text, o = {}) => ({ p: S(p).add(V(0, 0.35, 0)), text, ...o });
    g.userData.labels = [
      { p: S(C0).add(V(0, 5.2, 0)), text: '拉尼亚凯亚超星系团' },
      lab(GA[0].p, '巨引源区域（诺玛／半人马／长蛇一带的星系团群）'),
      lab(VIRGO, '室女座星系团'),
      lab(V(0, 0, 0), '银河系（我们）— 点击展开', { color: '#ffd28a', go: 'cel.milkyway' }),
      lab(SHAP.clone().lerp(C0, 0.45), '→ 沙普利方向（流域之外的更远汇聚区；示意位置）', { k: 'minor' }),
      { hud: [0.66, 0.97], text: '星系与流线是示意：流线由程序化速度场积分得到（非 Cosmicflows 实测）；巨引源区星系团位置为近似值' },
      { hud: [0.66, 0.935], text: '流域参考轮廓是速度场重建的示意断片，不是实体外壳；星系密度不能严格定义流域边界', when: () => FX.basinRef },
    ];
    g.userData.fitR = 6.6; g.userData.autoOrbit = true; g.rotation.set(0.5, 0.4, 0.1); return g;
  }


  // ---------------- 著名星云独立场景（V3.0）----------------
  // 数据等级：位置／距离取常用文献近似值；形态为“概念三维／艺术增强”：用分层的 2.5D 薄片（带视差）＋体积气体片＋点云组成，不是真实三维重建，也不是观测图像本身。
  // 观测图像：本机离线且未取得可用于公开仓库的观测数据，所以没有嵌入哈勃／韦伯图像；创生之柱的“波段”只是图层权重与配色的示意切换。
  const mkTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const sheet = (tex, w, h, z, o = {}) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: o.op ?? 1 })); m.material.userData.base = o.op ?? 1; m.position.set(o.x ?? 0, o.y ?? 0, z); m.renderOrder = o.ro ?? 0; return m; };
  const wob = (r, k) => (r() - 0.5) * 2 * k;
  const blobs = (ctx, r, n, w, h, rmin, rmax, cols) => { for (let i = 0; i < n; i++) { const x = r() * w, y = r() * h, rad = rmin + r() * (rmax - rmin), c = cols[Math.floor(r() * cols.length)], g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, c[0]); g.addColorStop(1, c[1]); ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); } };
  const starPts = (a, r, n, X, Y, Z, cols, k = 1, s0 = 0.25) => { for (let i = 0; i < n; i++) a.push({ p: [(r() * 2 - 1) * X, (r() * 2 - 1) * Y, (r() * 2 - 1) * Z], s: s0 + Math.pow(r(), 4) * 1.6, c: cols[Math.floor(r() * cols.length)].map((x) => x * k * (0.25 + 0.6 * r())) }); };
  const arcPts = (a, r, c, U, W, R, t0, t1, n, jit, col, s0, k) => { for (let i = 0; i < n; i++) { const t = t0 + r() * (t1 - t0), p = c.clone().addScaledVector(U, Math.cos(t) * R).addScaledVector(W, Math.sin(t) * R).add(V(gauss(r) * jit, gauss(r) * jit, gauss(r) * jit)); a.push({ p: p.toArray(), s: s0 * (0.6 + 0.8 * r()), c: col.map((x) => x * k * (0.4 + 0.6 * r())) }); } };
  const hudNote = (g, text, text2) => { g.userData.labels.push({ hud: [0.66, 0.97], text }); if (text2) g.userData.labels.push({ hud: [0.66, 0.935], text: text2 }); };
  const nebG = (fit, rot) => { const g = new THREE.Group(); g.userData.labels = []; g.userData.fitR = fit; g.userData.autoOrbit = true; g.rotation.set(...rot); return g; };
  const NOTE_C = '概念三维＋艺术增强：位置与距离为文献近似值，形态不是实测三维重建；动态是极缓慢的示意，不代表真实演化速度';

  // —— 创生之柱（2.5D 分层：背景发射层＋尘埃柱本体＋电离边缘＋前景暗尘＋年轻恒星／原恒星／小喷流；四种“波段”只是图层权重与配色示意）——
  // —— 真实图像驱动的 2.5D 分层星云（V3.3）：创生之柱、三叶星云 M20、马头星云 B33 ——
  // 主体形状来自用户提供的公开观测图（referpic → web/public/nebula）；程序只做分层：
  // 环境层（大范围、边缘不规则）→ 后层发光气体 → 前层暗尘 → 亮星层（点光源）→ 前景薄雾；相机限制在小角度内，靠层间视差得到轻微立体感。
  // 背面与未观测的角度不做补全：相机不允许绕到侧面。
  const hash2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const vnoise = (x, y) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return (hash2(ix, iy) * (1 - u) + hash2(ix + 1, iy) * u) * (1 - v) + (hash2(ix, iy + 1) * (1 - u) + hash2(ix + 1, iy + 1) * u) * v; };
  const fnoise = (x, y) => 0.5 * vnoise(x, y) + 0.3 * vnoise(x * 2.1, y * 2.1) + 0.2 * vnoise(x * 4.3, y * 4.3);
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  const mkCv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  // 把一张观测图拆成 后层（发光气体）／前层（暗尘）／亮星层／环境层
  function photoLayers(img, o) {
    const maxS = o.maxS || 1536, asp = img.width / img.height, w = asp >= 1 ? maxS : Math.round(maxS * asp), h = asp >= 1 ? Math.round(maxS / asp) : maxS, N = w * h;
    const c0 = mkCv(w, h), x0 = c0.getContext('2d', { willReadFrequently: true }); x0.drawImage(img, 0, 0, w, h);
    const c1 = mkCv(w, h), x1 = c1.getContext('2d', { willReadFrequently: true }); x1.filter = 'blur(9px)'; x1.drawImage(c0, 0, 0);
    const d0 = x0.getImageData(0, 0, w, h).data, d1 = x1.getImageData(0, 0, w, h).data, lum = (d, i) => (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255;
    const cm = mkCv(w, h), xm = cm.getContext('2d', { willReadFrequently: true }), im = xm.createImageData(w, h);
    for (let p = 0, i = 0; p < N; p++, i += 4) { const hp = lum(d0, i) - lum(d1, i); im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; const bx = o.deBox && d0[i + 1] > 130 && d0[i + 2] > 130 && d0[i] < 120 ? 255 : 0; im.data[i + 3] = Math.max(bx, 255 * sstep(o.starLo ?? 0.1, o.starHi ?? 0.26, hp) * (lum(d0, i) > 0.3 ? 1 : 0)); }
    xm.putImageData(im, 0, 0); const cb = mkCv(w, h), xb = cb.getContext('2d', { willReadFrequently: true }); xb.filter = 'blur(1.8px)'; xb.drawImage(cm, 0, 0); const mk = xb.getImageData(0, 0, w, h).data;
    const back = mkCv(w, h), dust = mkCv(w, h), stars = mkCv(w, h), ib = new ImageData(w, h), idd = new ImageData(w, h), is = new ImageData(w, h), lo = o.dustLo ?? 0.18, hi = o.dustHi ?? 0.42;
    const sl = new Float32Array(N); // 去星后的亮度（再柔化一点，用作暗尘密度）
    for (let p = 0, i = 0; p < N; p++, i += 4) { const m = Math.min(1, (mk[i + 3] / 255) * 1.6); sl[p] = lum(d0, i) * (1 - m) + lum(d1, i) * m; }
    for (let y = 0, p = 0; y < h; y++) for (let x = 0; x < w; x++, p++) {
      const i = p * 4, m = Math.min(1, (mk[i + 3] / 255) * 1.6), u = x / w, v = y / h, e = Math.min(u, 1 - u, v, 1 - v) + (fnoise(u * 9, v * 9) - 0.4) * 0.07, fe = sstep(0.0, o.feather ?? 0.16, e);
      const sr = d0[i] * (1 - m) + d1[i] * m, sg = d0[i + 1] * (1 - m) + d1[i + 1] * m, sb = d0[i + 2] * (1 - m) + d1[i + 2] * m, d = 1 - sstep(lo, hi, sl[p]);
      ib.data[i] = Math.min(255, sr * (1 + 0.45 * d)); ib.data[i + 1] = Math.min(255, sg * (1 + 0.45 * d)); ib.data[i + 2] = Math.min(255, sb * (1 + 0.45 * d)); ib.data[i + 3] = 255 * fe;
      idd.data[i] = sr * 0.85; idd.data[i + 1] = sg * 0.85; idd.data[i + 2] = sb * 0.85; idd.data[i + 3] = 255 * d * (o.dustA ?? 0.8) * fe;
      is.data[i] = d0[i]; is.data[i + 1] = d0[i + 1]; is.data[i + 2] = d0[i + 2]; is.data[i + 3] = 255 * m * fe;
    }
    back.getContext('2d').putImageData(ib, 0, 0); dust.getContext('2d').putImageData(idd, 0, 0); stars.getContext('2d').putImageData(is, 0, 0);
    // 环境层：同一张图的大尺度柔化版，边缘按噪声不规则地淡出（没有矩形或椭圆边界）
    const E = 384, eh = Math.round(E / asp), env = mkCv(E, eh), xe = env.getContext('2d', { willReadFrequently: true }); xe.filter = 'blur(10px)'; xe.drawImage(c1, 0, 0, E, eh); xe.filter = 'none';
    const ie = xe.getImageData(0, 0, E, eh); for (let y = 0, p = 0; y < eh; y++) for (let x = 0; x < E; x++, p++) { const u = x / E, v = y / eh, r = Math.hypot(u - 0.5, (v - 0.5) / (eh / E)) * 2, n = fnoise(u * 5 + 3, v * 5 + 7); ie.data[p * 4 + 3] = 255 * (1 - sstep(0.35 + 0.35 * n, 0.95 + 0.3 * n, r)) * 0.8; }
    xe.putImageData(ie, 0, 0);
    const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
    return { asp, back: tex(back), dust: tex(dust), stars: tex(stars), env: tex(env) };
  }
  // cfg: { src, srcAlt?, H（世界高度）, camLimit:[yaw,pitch], labels:(fn: (px,py)=>V3 → 标签数组), notes:[…], dust:{lo,hi}, star:{lo,hi}, fit }
  function photoNebula(cfg, uPR) {
    const g = nebG(cfg.fit || 6.6, [0, 0, 0]), H = cfg.H || 12; g.userData.still = true; g.userData.camLimit = cfg.camLimit || [0.3, 0.22]; g.userData.autoOrbit = false;
    const mat = (add, op) => { const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: op }); m.userData.base = op; return m; };
    const plane = (add, op, z, ro) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(add, op)); m.position.z = z; m.renderOrder = ro; m.visible = false; g.add(m); return m; };
    const L = { far: plane(false, 0.7, -9, 0), env: plane(false, 1, -2.4, 0), back: plane(false, 1, -1.6, 1), dust: plane(false, 1, 0.9, 2), stars: plane(true, 1, 1.8, 3), mist: plane(false, 0.09, 3.2, 4) };
    const sets = [], srcs = [cfg.src, cfg.srcAlt].filter(Boolean); let cur = -1, ready = false;
    srcs.forEach((s, k) => loadImg(s).then((img) => { if (!img) return; sets[k] = photoLayers(img, { dustA: cfg.dust?.a, dustLo: cfg.dust?.lo, dustHi: cfg.dust?.hi, starLo: cfg.star?.lo, starHi: cfg.star?.hi, maxS: cfg.maxS, feather: cfg.feather, deBox: cfg.deBox }); ready = true; }));
    const apply = (k) => { const S = sets[k]; if (!S) return; cur = k; const W = H * S.asp;
      for (const [n, m] of Object.entries(L)) { const t = n === 'far' || n === 'env' || n === 'mist' ? S.env : S[n]; if (m.material.map !== t) { m.material.map = t; m.material.needsUpdate = true; } m.visible = true; }
      for (const n of ['back', 'dust', 'stars']) L[n].scale.set(W, H, 1);
      if (cfg.zoom) g.userData.zoom[0].p.copy(px(cfg.zoom.u, cfg.zoom.v)).setZ(cfg.detail ? 1.2 : 0);
      if (det?.userData.asp) { const dw = W * cfg.detail.w; det.scale.set(dw, dw / det.userData.asp, 1); det.position.x = px(cfg.detail.u, cfg.detail.v).x; det.position.y = px(cfg.detail.u, cfg.detail.v).y; det.rotation.z = cfg.detail.rot || 0; }
      L.far.scale.set(W * 3, (W * 3) / S.asp, 1); L.env.scale.set(W * 1.3, (W * 1.3) / S.asp, 1); L.mist.scale.set(W * 1.7, (W * 1.7) / S.asp, 1); L.mist.position.x = W * 0.12; };
    const px = (u, v) => { const S = sets[cur < 0 ? 0 : cur]; const W = H * (S?.asp || 1); return V((u - 0.5) * W, (0.5 - v) * H, 0); }; // 图像比例坐标 → 世界
    if (cfg.zoom) g.userData.zoom = [{ p: V(0, 0, 0), s: cfg.zoom.s }];
    // 细节层（LOD）：放大时淡入一张更高分辨率的局部观测图（羽化边缘），不放大时不可见
    let det = null; if (cfg.detail) { det = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(false, 0)); det.position.z = 1.3; det.renderOrder = 3; det.visible = false; g.add(det);
      loadImg(cfg.detail.src).then((img) => { if (!img) return; const S = 1024, a = img.width / img.height, w = a >= 1 ? S : Math.round(S * a), h = a >= 1 ? Math.round(S / a) : S, c = mkCv(w, h), x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h); const id = x.getImageData(0, 0, w, h);
        for (let yy = 0, p = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++, p++) { const u = xx / w, v = yy / h, e = Math.min(u, 1 - u, v, 1 - v) + (fnoise(u * 7, v * 7) - 0.4) * 0.08; id.data[p * 4 + 3] = 255 * sstep(0, 0.2, e); } x.putImageData(id, 0, 0);
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; det.material.map = t; det.material.needsUpdate = true; det.userData.asp = a; }); }
    let annot = false; const lb = cfg.labels ? cfg.labels(px) : [];
    g.userData.labels.push(...lb, { p: V(0, -H * 0.56, 0), text: '', dyn: () => (annot ? '▾ 天文注释' : '▸ 天文注释'), toggle: () => { annot = !annot; }, color: '#9fd0ff' });
    (cfg.notes || []).forEach((t, i) => g.userData.labels.push({ hud: [0.66, 0.97 - i * 0.035], text: t, when: () => annot }));
    g.userData.tick = (t) => { const k = cfg.srcAlt && (FX.band === 1 || FX.band === 2) && sets[1] ? 1 : 0; if (ready && (k !== cur || !L.back.visible)) apply(sets[k] ? k : 0);
      if (det?.userData.asp) { const k = sstep(1.5, 2.6, NAV.vz) * 0.95; det.material.userData.base = k; det.visible = k > 0.01; if (!det.userData.ok && sets[0]) { det.userData.ok = true; apply(0); } }
      L.back.material.color.setHex(FX.band === 2 ? 0xffb0e0 : 0xffffff); L.mist.position.y = Math.sin(t * 0.05) * 0.06; }; // 极慢的云层漂移
    return g;
  }
  const PH_NOTE = '以公开观测图为主体的 2.5D 分层重建：环境、后层气体、前层暗尘、亮星分在不同深度，只允许小角度观察；背面与未观测的角度不做补全；亮度与颜色按观测图，只做分层与柔化';
  const buildPillars = (uPR) => photoNebula({ src: '/nebula/pillars_hst.jpg', srcAlt: '/nebula/pillars_jwst.jpg', H: 12, fit: 4.6, camLimit: [0.3, 0.2], dust: { lo: 0.18, hi: 0.38, a: 0.5 }, star: { lo: 0.12, hi: 0.3 },
    labels: (px) => [{ p: px(0.37, 0.14).add(V(0, 0.4, 0)), text: '主柱', when: () => FX.band !== 1 && FX.band !== 2 }, { p: px(0.59, 0.27).add(V(0, 0.4, 0)), text: '次柱', when: () => FX.band !== 1 && FX.band !== 2 }, { p: px(0.69, 0.42).add(V(0, 0.4, 0)), text: '小柱', when: () => FX.band !== 1 && FX.band !== 2 }],
    notes: ['创生之柱：约 6,500–7,000 光年，柱高数光年；主图为哈勃 2014 年影像，“近红外／中红外”档切换为韦伯影像（来源与署名见开发记录，待确认）', PH_NOTE, '主柱／次柱／小柱只是应用内的展示标签；NGC 6611 的年轻大质量恒星位于画面上方之外，是电离并侵蚀柱子的光源'] }, uPR);
  const buildM20 = (uPR) => photoNebula({ src: '/nebula/m20_main.jpg', H: 12, fit: 4.6, camLimit: [0.3, 0.2], dust: { lo: 0.1, hi: 0.32 }, star: { lo: 0.1, hi: 0.26 },
    labels: (px) => [{ p: px(0.5, 0.97).add(V(0, 0.2, 0)), text: '三叶星云 M20 · 约 5,200 光年' }, { p: px(0.64, 0.57), text: '红色发射区', k: 'minor' }, { p: px(0.55, 0.2), text: '蓝色反射云', k: 'minor' }, { p: px(0.7, 0.53), text: '暗尘带', k: 'minor' }],
    notes: ['M20：红色发射气体、三条不规则暗尘带与上方的蓝色反射云；暗尘是对后方发光气体的吸收，不是实体', PH_NOTE] }, uPR);
  const buildHorsehead = (uPR) => photoNebula({ src: '/nebula/horsehead_main.jpg', H: 12, fit: 4.6, camLimit: [0.3, 0.2], dust: { lo: 0.08, hi: 0.26 }, star: { lo: 0.1, hi: 0.26 }, maxS: 1024, feather: 0.14, deBox: true, zoom: { u: 0.47, v: 0.5, s: 3.2 }, detail: { src: '/nebula/horsehead_hst.jpg', u: 0.472, v: 0.497, w: 0.1, rot: -0.35 },
    labels: (px) => [{ p: px(0.47, 0.6).add(V(0, -0.5, 0)), text: '马头星云 B33 · 约 1,375 光年（点击放大马头）', zoom: 0 }, { p: px(0.8, 0.5), text: 'IC 434（背景发射星云）', k: 'minor' }],
    notes: ['马头本体是冷尘埃（暗），后面的红色是发射星云 IC 434；下方连着更大的暗分子云', PH_NOTE] }, uPR);


  // —— 通用小工具：体积气体片（neb 公告牌）与暗尘片 ——
  const gas = (g, c, size, c1, c2, c3, seed, k = 0.5, opt = {}) => g.add(neb(c.toArray ? c.toArray() : c, size, c1, c2, c3, seed, k, false, opt));
  const dust = (g, c, size, seed, k = 0.5, opt = {}) => g.add(neb(c.toArray ? c.toArray() : c, size, DUST[0], DUST[1], DUST[2], seed, k, true, opt));
  const PINKS = [[1, 0.34, 0.5], [1, 0.58, 0.55], [0.95, 0.85, 0.9]], BLUEW = [[0.75, 0.85, 1], [1, 0.95, 0.9], [0.65, 0.78, 1]];
  const bright = (a, p, s, c) => a.push({ p: p.toArray ? p.toArray() : p, s, c });

  function buildM16(uPR) { // 鹰状星云：发射星云 IC 4703（本体）＋年轻星团 NGC 6611（两个不同的东西）＋暗云＋创生之柱的位置
    const g = nebG(42, [0.5, 0.3, 0]), r = rng(1601), a = [];
    for (let i = 0; i < 26; i++) gas(g, V(gauss(r) * 11, gauss(r) * 9, gauss(r) * 5), 9 + r() * 9, ...PINKS, 11 + i * 3, 0.32 + 0.2 * r(), { mode: 0, sx: 0.8 + r() * 0.8, sy: 0.7 + r() * 0.5, rot: r() * 3 });
    for (let i = 0; i < 16; i++) dust(g, V(gauss(r) * 12, -4 - Math.abs(gauss(r)) * 9, gauss(r) * 5), 7 + r() * 8, 40 + i * 5, 0.5, { sx: 1 + r(), sy: 0.8 });
    const cl = V(0, 3, 0); for (let i = 0; i < 520; i++) a.push({ p: [cl.x + gauss(r) * 4.5, cl.y + gauss(r) * 4, cl.z + gauss(r) * 4], s: 0.25 + Math.pow(r(), 5) * 1.8, c: [0.72, 0.84, 1].map((x) => x * (0.3 + 0.6 * r())) });
    for (let i = 0; i < 9; i++) bright(a, [cl.x + gauss(r) * 2.2, cl.y + gauss(r) * 2, cl.z + gauss(r) * 2], 2.6, [0.75, 0.86, 1].map((x) => x * 0.9));
    starPts(a, r, 700, 40, 34, 14, BLUEW, 0.5); const pts = pointsOf(a, 1, uPR); pts.userData.still = true; g.add(pts);
    const pil = V(-3, -9.5, 0); dust(g, pil, 3.2, 99, 0.7); g.add(pointsOf([{ p: pil.toArray(), s: 1.4, c: [1, 0.8, 0.55] }], 1, uPR));
    g.userData.zoom = [{ p: cl, s: 3 }];
    g.userData.labels.push({ p: V(0, 13, 0), text: 'IC 4703（发射星云本体，即鹰状星云）' }, { p: cl.clone().add(V(0, -6, 0)), text: 'NGC 6611（年轻星团）', zoom: 0 }, { p: pil.clone().add(V(0, -2.2, 0)), text: '创生之柱（点击进入）', go: 'cel.pillars', color: '#ffd28a' });
    hudNote(g, 'M16：发射星云 IC 4703 与年轻星团 NGC 6611 是两个不同的东西；' + NOTE_C); return g;
  }
  function buildM42(uPR) { // 猎户座大星云：梯形星团的亮核、蝙蝠翼状的气体、猎户之棒、暗尘“鱼嘴”、蓝色反射区 M43
    const g = nebG(14, [0.45, 0.2, 0]), r = rng(4201), a = [];
    for (let i = 0; i < 18; i++) { const side = i % 2 ? 1 : -1, x = side * (1.5 + r() * 5.5), y = 0.5 + r() * 3.2 - 0.4 * Math.abs(x); gas(g, V(x, y, gauss(r) * 1.5), 4 + r() * 4, ...PINKS, 7 + i * 5, 0.4 + 0.25 * r(), { mode: 0, sx: 1.2, sy: 0.8, rot: side * 0.5 + gauss(r) * 0.3 }); }
    gas(g, V(1.2, -3, 0), 7, [1, 0.75, 0.7], [1, 0.45, 0.45], [1, 0.9, 0.8], 321, 0.55, { mode: 2, sx: 2.4, sy: 0.7, rot: 0.35 }); // 猎户之棒：明亮的电离前沿（细长）
    gas(g, V(0.4, 5.4, 0), 2.6, [0.4, 0.6, 1], [0.6, 0.8, 1], [0.9, 0.95, 1], 322, 0.5, { mode: 1 }); // M43 反射区
    for (let i = 0; i < 6; i++) dust(g, V(-2.6 + gauss(r) * 1, -1 + gauss(r) * 1.2, 0.6), 3.2 + r() * 2, 400 + i, 0.6, { sx: 1.3, sy: 0.8 }); // “鱼嘴”暗尘
    const T = [[0, 0.1], [0.3, -0.18], [-0.25, -0.22], [0.5, 0.16]]; for (const [x, y] of T) bright(a, [x, y, 0], 3.4, [0.75, 0.86, 1]); // 梯形星团四颗主星
    for (let i = 0; i < 420; i++) a.push({ p: [gauss(r) * 3.2, gauss(r) * 2.8, gauss(r) * 2.2], s: 0.22 + Math.pow(r(), 5) * 1.2, c: [0.8, 0.88, 1].map((x) => x * (0.25 + 0.5 * r())) });
    starPts(a, r, 500, 14, 12, 6, BLUEW, 0.4); const pts = pointsOf(a, 1, uPR); pts.userData.still = true; g.add(pts);
    const gl = glow([1, 0.9, 0.75], 2.4, 3.2); gl.material.uniforms.uCol.value.multiplyScalar(0.25); g.add(gl);
    g.userData.zoom = [{ p: V(0, 0, 0), s: 8 }]; g.userData.labels.push({ p: V(0, 5.2, 0), text: '猎户座大星云 M42 · 约 1,340 光年' }, { p: V(0, -0.8, 0), text: '梯形星团（点击放大）', zoom: 0 }, { p: V(1.2, -4.2, 0), text: '猎户之棒', k: 'minor' }, { p: V(0.4, 6.2, 0), text: 'M43（反射星云）', k: 'minor' });
    hudNote(g, NOTE_C + '；梯形星团四颗主星是示意摆放'); return g;
  }
  function buildM8(uPR) { // 礁湖星云：宽阔的粉红气体、暖白的沙漏核心、横贯的暗尘带、年轻星团 NGC 6530
    const g = nebG(34, [0.4, 0.25, 0]), r = rng(801), a = [];
    for (let i = 0; i < 30; i++) gas(g, V(gauss(r) * 12, gauss(r) * 7, gauss(r) * 4), 8 + r() * 10, ...PINKS, 5 + i * 4, 0.3 + 0.22 * r(), { mode: 0, sx: 1.4, sy: 0.7 + 0.4 * r(), rot: 0.2 + gauss(r) * 0.3 });
    for (const dx of [-1.6, 1.8]) gas(g, V(dx, 0, 0.5), 5, [1, 0.8, 0.7], [1, 0.5, 0.5], [1, 0.95, 0.9], 77 + dx, 0.6, { mode: 0 }); // 沙漏核心
    for (let i = 0; i < 12; i++) dust(g, V(-9 + i * 1.6 + gauss(r) * 0.6, -0.5 + Math.sin(i * 0.8) * 1.2, 0.8), 4 + r() * 3, 600 + i, 0.65, { sx: 1.6, sy: 0.5, rot: 0.1 }); // 横贯的暗尘带
    for (let i = 0; i < 420; i++) a.push({ p: [4 + gauss(r) * 4.5, 1 + gauss(r) * 3.5, gauss(r) * 3], s: 0.22 + Math.pow(r(), 5) * 1.5, c: [0.72, 0.84, 1].map((x) => x * (0.3 + 0.5 * r())) });
    starPts(a, r, 800, 34, 24, 10, BLUEW, 0.5); const pts = pointsOf(a, 1, uPR); pts.userData.still = true; g.add(pts);
    g.userData.labels.push({ p: V(0, 9, 0), text: '礁湖星云 M8 · 约 4,100 光年' }, { p: V(5, -3.5, 0), text: 'NGC 6530（年轻星团）', k: 'minor' }); hudNote(g, NOTE_C); return g;
  }
  function buildCarina(uPR) { // 船底座星云：暗金／棕红气体、巨大的空腔与尘埃壁、海山二与特朗普勒星团
    const g = nebG(60, [0.45, 0.25, 0]), r = rng(3372), a = [];
    for (let i = 0; i < 40; i++) gas(g, V(gauss(r) * 26, gauss(r) * 18, gauss(r) * 8), 14 + r() * 16, [1, 0.55, 0.3], [0.9, 0.4, 0.28], [1, 0.8, 0.6], 15 + i * 7, 0.22 + 0.2 * r(), { mode: 0, sx: 1 + r(), sy: 0.7 + 0.5 * r(), rot: r() * 3 });
    for (const [x, y, s] of [[-12, 6, 20], [14, -4, 16], [2, 14, 14]]) gas(g, V(x, y, 0), s, [1, 0.6, 0.35], [0.9, 0.35, 0.3], [1, 0.85, 0.7], 900 + x, 0.4, { mode: 4 }); // 巨大的空腔（环形电离壁）
    for (let i = 0; i < 34; i++) dust(g, V(gauss(r) * 24, gauss(r) * 16, gauss(r) * 5), 6 + r() * 9, 1500 + i * 3, 0.6, { sx: 0.8 + r() * 1.2, sy: 0.8 + r() * 0.8, rot: r() * 3 });
    bright(a, [0, 0, 0], 4, [1, 0.92, 0.78]); for (const [cx, cy] of [[3, 2], [-4, -2]]) for (let i = 0; i < 260; i++) a.push({ p: [cx + gauss(r) * 3, cy + gauss(r) * 3, gauss(r) * 3], s: 0.25 + Math.pow(r(), 5) * 1.6, c: [0.72, 0.84, 1].map((x) => x * (0.3 + 0.6 * r())) });
    starPts(a, r, 900, 60, 44, 16, BLUEW, 0.5); const pts = pointsOf(a, 1, uPR); pts.userData.still = true; g.add(pts);
    g.userData.labels.push({ p: V(0, 0.9, 0), text: '海山二（Eta Carinae，大质量恒星）' }, { p: V(0, 26, 0), text: '船底座星云 NGC 3372 · 约 7,500 光年' }, { p: V(-14, -16, 0), text: '宇宙悬崖 NGC 3324（相关区域；物理归属待资料核对）', k: 'minor' }); hudNote(g, NOTE_C); return g;
  }
  function buildTarantula(uPR) { // 蜘蛛星云（剑鱼座 30，在大麦哲伦云里）：R136 年轻大质量星团、被侵蚀的气体空腔与丝状壁
    const g = nebG(46, [0.4, 0.25, 0]), r = rng(30301), a = [], c0 = V(0, 0, 0);
    for (let i = 0; i < 22; i++) gas(g, V(gauss(r) * 14, gauss(r) * 11, gauss(r) * 4), 10 + r() * 12, [1, 0.45, 0.35], [1, 0.6, 0.4], [1, 0.85, 0.75], 7 + i * 6, 0.25 + 0.2 * r(), { mode: 0, sx: 1 + r() * 0.8, rot: r() * 3 });
    for (let k = 0; k < 9; k++) { const ang = k * 0.7 + r() * 0.4, R = 7 + r() * 14, U = V(Math.cos(ang), Math.sin(ang), 0), W2 = V(-Math.sin(ang), Math.cos(ang), 0.3).normalize(); arcPts(a, r, c0, U, W2, R, ang * 0.2, ang * 0.2 + 1.2 + r(), 260, 0.5, [1, 0.5, 0.35], 0.6, 0.5); } // 空腔壁上的丝状弧（蜘蛛的“腿”）
    for (let i = 0; i < 14; i++) dust(g, V(gauss(r) * 15, gauss(r) * 12, 1.5), 5 + r() * 6, 800 + i * 4, 0.55, { sx: 1.4, sy: 0.6, rot: r() * 3 });
    for (let i = 0; i < 700; i++) a.push({ p: [gauss(r) * 1.3, gauss(r) * 1.3, gauss(r) * 1.3], s: 0.22 + Math.pow(r(), 4) * 1.4, c: [0.75, 0.86, 1].map((x) => x * (0.35 + 0.6 * r())) }); // R136：致密的蓝白大质量星团
    for (let i = 0; i < 6; i++) bright(a, [gauss(r) * 0.6, gauss(r) * 0.6, gauss(r) * 0.6], 3.4, [0.8, 0.9, 1]);
    starPts(a, r, 700, 46, 36, 12, BLUEW, 0.45); const pts = pointsOf(a, 1, uPR); pts.userData.still = true; g.add(pts);
    g.userData.zoom = [{ p: c0, s: 9 }]; g.userData.labels.push({ p: V(0, 24, 0), text: '蜘蛛星云（剑鱼座 30）· 大麦哲伦云内，约 16 万光年' }, { p: V(0, -1.4, 0), text: 'R136（年轻大质量星团，点击放大）', zoom: 0 }); hudNote(g, '它在大麦哲伦云里，不属于银河系；' + NOTE_C); return g;
  }
  function buildCrab(uPR) { // 蟹状星云：红橙色交织的丝状壳、青蓝色的高能辐射（伪彩）与中心脉冲星
    const g = nebG(5, [0.35, 0.3, 0]), r = rng(1054), a = [], ax = V(3.4, 2.4, 2.4);
    for (let i = 0; i < 150; i++) { const n = V(gauss(r), gauss(r), gauss(r)).normalize(), U = V(gauss(r), gauss(r), gauss(r)).cross(n).normalize(), W2 = n.clone().cross(U), t0 = r() * 6.3, len = 0.5 + r() * 1.3, R = 0.7 + r() * 0.3; arcPts(a, r, V(0, 0, 0), U.multiplyScalar(ax.x * R), W2.multiplyScalar(ax.y * R), 1, t0, t0 + len, 24, 0.05, r() < 0.7 ? [1, 0.38, 0.2] : [1, 0.62, 0.3], 0.55, 0.9); } // 彼此交织的气体丝
    const shell = pointsOf(a, 1, uPR); shell.userData.still = true; g.add(shell);
    const core = glow([0.3, 0.6, 1], 2.4, 5.5); core.material.uniforms.uCol.value.multiplyScalar(0.3); g.add(core); // 高能辐射伪彩（同步辐射）
    const psr = pointsOf([{ p: [0, 0, 0], s: 3, c: [0.85, 0.92, 1] }], 1, uPR); psr.userData.still = true; g.add(psr);
    g.userData.labels.push({ p: V(0, 0.45, 0), text: '脉冲星（每秒约 30 圈；这里放慢成 1 秒一次的闪动示意）', k: 'minor' }, { p: V(0, 3.5, 0), text: '蟹状星云 M1 · 约 6,500 光年 · 1054 年超新星遗迹' });
    hudNote(g, '蓝色为高能辐射的伪彩色；气体丝为程序化示意。' + NOTE_C);
    g.userData.tick = (t) => { const k = 0.5 + 0.5 * Math.pow(Math.max(0, Math.sin(t * 6.28)), 6); psr.material.uniforms.uSize.value = 1 + 0.6 * k * (FX.mode === 'sci' ? 1 : 0.4); core.material.uniforms.uCol.value.setRGB(0.3, 0.6, 1).multiplyScalar(0.26 + 0.05 * k); };
    return g;
  }
  function buildVeil(uPR) { // 面纱星云／天鹅座环：巨大破碎的超新星遗迹壳；主要的东弧、西弧（含“女巫扫帚”）与皮克林三角，细丝状冲击前缘
    const g = nebG(60, [0.5, 0.2, 0]), r = rng(6960), a = [], c = V(0, 0, 0), Z = V(0, 0, 1);
    const part = (cx, cy, R, t0, t1, n, col, k) => { const ctr = V(cx, cy, 0); arcPts(a, r, ctr, V(1, 0, 0), V(0, 1, 0), R, t0, t1, n, 0.32, col, 0.5, k); };
    for (let f = 0; f < 26; f++) part(gauss(r) * 0.6, gauss(r) * 0.6, 34 + gauss(r) * 1.4, 0.35 + r() * 0.4, 0.95 + r() * 0.5, 120, f % 3 === 0 ? [1, 0.45, 0.5] : f % 3 === 1 ? [0.35, 0.85, 0.95] : [1, 0.8, 0.5], 0.95); // 东弧（最亮的冲击前缘）
    for (let f = 0; f < 18; f++) part(gauss(r) * 0.6 - 4, gauss(r) * 0.6, 32 + gauss(r) * 1.4, 3.3 + r() * 0.3, 3.9 + r() * 0.5, 100, f % 2 ? [1, 0.45, 0.5] : [0.4, 0.85, 0.95], 0.7); // 西弧
    for (let f = 0; f < 10; f++) part(gauss(r) * 0.5 - 2, -2 + gauss(r) * 0.5, 29 + gauss(r), 4.5 + r() * 0.2, 5.1 + r() * 0.3, 70, [1, 0.7, 0.45], 0.45); // 皮克林三角一带
    for (let i = 0; i < 300; i++) a.push({ p: [gauss(r) * 30, gauss(r) * 30, gauss(r) * 8], s: 0.2 + r() * 0.3, c: [0.4, 0.6, 0.8].map((x) => x * 0.1) });
    starPts(a, r, 700, 60, 50, 20, BLUEW, 0.5); const pts = pointsOf(a, 1, uPR); pts.userData.still = true; g.add(pts);
    g.userData.labels.push({ p: V(34, 5, 0), text: '东弧（NGC 6992／6995）', k: 'minor' }, { p: V(-28, 5, 0), text: '西弧（NGC 6960，女巫扫帚）', k: 'minor' }, { p: V(0, 40, 0), text: '面纱星云／天鹅座环 · 约 2,400 光年 · 超新星遗迹' }); hudNote(g, NOTE_C + '；丝状结构的亮度分布是示意，真实的冲击波演化要数万年'); return g;
  }
  function buildHelix(uPR) { // 螺旋星云：青蓝内环、暖橙红外环（不是完美圆环）、气体结与中心白矮星
    const g = nebG(3.4, [0.7, 0.3, 0]), r = rng(7293), a = [], tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0.3, 0.2));
    const ring = (R, W, n, col, flat, k) => { for (let i = 0; i < n; i++) { const th = r() * TAU, rr = R + gauss(r) * W * (1 + 0.5 * Math.sin(th * 3)), p = V(Math.cos(th) * rr, gauss(r) * W * flat, Math.sin(th) * rr * (0.9 + 0.1 * Math.sin(th * 2))).applyQuaternion(tilt); a.push({ p: p.toArray(), s: 0.25 + r() * 0.5, c: col.map((x) => x * k * (0.3 + 0.7 * r())) }); } };
    ring(1.0, 0.18, 2600, [0.35, 0.8, 0.95], 0.8, 0.7); ring(1.6, 0.26, 3200, [1, 0.5, 0.28], 1.1, 0.65); ring(2.1, 0.3, 1100, [1, 0.35, 0.22], 1.4, 0.35);
    for (let i = 0; i < 260; i++) { const th = r() * TAU, d = V(Math.cos(th), gauss(r) * 0.3, Math.sin(th)).normalize(), base = d.clone().multiplyScalar(1.05 + r() * 0.15).applyQuaternion(tilt); for (let k = 0; k < 5; k++) a.push({ p: base.clone().addScaledVector(d.clone().applyQuaternion(tilt), k * 0.05).toArray(), s: 0.35 - k * 0.04, c: [0.9, 0.7, 0.55].map((x) => x * (0.5 - k * 0.07)) }); } // 气体结（彗星状）：头朝中心、尾巴向外
    const pts = pointsOf(a, 1, uPR); pts.userData.still = true; g.add(pts);
    const wd = pointsOf([{ p: [0, 0, 0], s: 2.6, c: [0.8, 0.9, 1] }], 1, uPR); wd.userData.still = true; g.add(wd);
    const gl = glow([0.45, 0.8, 1], 2.4, 3); gl.material.uniforms.uCol.value.multiplyScalar(0.12); g.add(gl);
    g.userData.labels.push({ p: V(0, -0.35, 0), text: '中心白矮星', k: 'minor' }, { p: V(0, 2.6, 0), text: '螺旋星云 NGC 7293 · 约 650 光年 · 行星状星云' }); hudNote(g, NOTE_C + '；内外壳层的扩张只是极缓慢的示意');
    g.userData.tick = (t) => { const k = 1 + 0.004 * Math.sin(t * 0.1); pts.scale.setScalar(k); }; return g;
  }

  // ---------------- 多恒星系统（V3.0）：真实质量／周期／偏心率／倾角的开普勒轨道，共同质心运动 ----------------
  // 物理与显示分开：轨道（质量比、半长轴、周期、偏心率、倾角）取文献值；恒星显示半径被放大（写在页面说明里），不影响轨道与光变曲线的计算。
  // 时间：一个“正常”档约 30 秒转一个内轨道周期，加速档按全局模拟时间倍率同时推进所有成员；暂停＝静止。
  const starCol = (T) => (T > 20000 ? [0.7, 0.8, 1] : T > 9000 ? [0.78, 0.87, 1] : T > 7000 ? [0.92, 0.95, 1] : T > 5600 ? [1, 0.93, 0.78] : T > 4300 ? [1, 0.75, 0.48] : T > 3500 ? [1, 0.6, 0.35] : [1, 0.45, 0.28]);
  const STAR_FS = `varying vec3 vN; varying vec3 vV; uniform vec3 uCol; uniform float uA;
void main(){ float mu=max(dot(normalize(vN),normalize(vV)),0.); float ld=1.-.62*(1.-mu); gl_FragColor=vec4(uCol*ld*1.35,uA); }`; // 临边昏暗
  const keplerXY = (a, e, M) => { M = ((M % TAU) + TAU) % TAU; let E = e > 0.8 ? Math.PI : M; for (let i = 0; i < 24; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); return [a * (Math.cos(E) - e), a * Math.sqrt(1 - e * e) * Math.sin(E)]; };
  const orient = (x, y, w, inc) => { const cw = Math.cos(w), sw = Math.sin(w), X = x * cw - y * sw, Y = x * sw + y * cw; return V(X, Y * Math.cos(inc), Y * Math.sin(inc)); }; // 轨道面内 → 倾角后的三维（观察者沿 +z 方向看）
  const lens = (d, r1, r2) => { if (d >= r1 + r2) return 0; if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2; const a1 = Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1)), a2 = Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2)); return r1 * r1 * a1 + r2 * r2 * a2 - 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2)); };
  // spec: { name, scale(AU/单位), disp(恒星显示放大), inner:{m1,m2,a,e,P(年),w,i(弧度)}, outer?:{m3,a,e,P,w,i,compress}, stars:[{T,R(太阳半径),L相对,r显示最小}], planet?, curve? }
  function buildMulti(spec, uPR) {
    const g = nebG(spec.fit, spec.rot || [0.5, 0.3, 0]), RS = 0.00465; // 1 太阳半径 = 0.00465 AU
    const st = spec.stars.map((s) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), smat(SPHERE_VS, STAR_FS, { uSunW: { value: V(0, 0, 0) }, uCol: { value: new THREE.Color(...starCol(s.T)) } })); const gl = glow(starCol(s.T), 2.6, 1); gl.material.uniforms.uCol.value.multiplyScalar((s.glow ?? 0.5) * 0.4); g.add(m, gl); return { m, gl, s, rad: Math.max((s.R * RS * spec.disp) / spec.scale, s.minR || 0.04) }; });
    st.forEach((q) => { q.m.scale.setScalar(q.rad); q.gl.scale.setScalar(q.rad * 5); });
    const I = spec.inner, Mi = I.m1 + I.m2, O = spec.outer, Mo = O ? Mi + O.m3 : Mi;
    const posAt = (ph, phO, noO) => { const rel = keplerXY(I.a / spec.scale, I.e, ph); let rv = orient(rel[0], rel[1], I.w, I.i), p1 = rv.clone().multiplyScalar(-I.m2 / Mi), p2 = rv.clone().multiplyScalar(I.m1 / Mi), p3 = null;
      if (O && !noO) { const ro = keplerXY((O.a / spec.scale) * (O.compress ?? 1), O.e, phO), ov = orient(ro[0], ro[1], O.w, O.i), bi = ov.clone().multiplyScalar(-O.m3 / Mo); p1.add(bi); p2.add(bi); p3 = ov.clone().multiplyScalar(Mi / Mo); }
      return { p1, p2, p3 }; };
    // 轨道线（属于“参考线”，由总开关管理）：恒星相对共同质心的轨迹
    const ref = new THREE.Group(); const trail = (f, c) => { const pts = []; for (let i = 0; i <= 240; i++) pts.push(f((i / 240) * TAU)); ref.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), lineMat(c, 0.28))); };
    trail((m) => posAt(m, 0, true).p1, 0xffd9a0); trail((m) => posAt(m, 0, true).p2, 0xa9c4ff); if (O) trail((m) => posAt(0, m).p3, 0xffb3a0); g.add(ref);
    // 行星（Kepler-16 b）：环双星公转，用两个光源着色
    let pl = null; if (spec.planet) { const P = spec.planet; pl = { P, mesh: new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), smat(`varying vec3 vN; varying vec3 vW; void main(){ vN=normalize(mat3(modelMatrix)*normal); vW=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      `varying vec3 vN; varying vec3 vW; uniform vec3 uL1; uniform vec3 uL2; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uBase; uniform float uA;
       void main(){ vec3 n=normalize(vN); float d1=max(dot(n,normalize(uL1-vW)),0.), d2=max(dot(n,normalize(uL2-vW)),0.); vec3 c=uBase*(0.05+uC1*d1*1.1+uC2*d2*.6); gl_FragColor=vec4(c,uA); }`, { uL1: { value: V() }, uL2: { value: V() }, uC1: { value: new THREE.Color(...starCol(spec.stars[0].T)) }, uC2: { value: new THREE.Color(...starCol(spec.stars[1].T)) }, uBase: { value: new THREE.Color(0.85, 0.72, 0.55) } })) };
      pl.rad = Math.max((P.R * 0.000477 * spec.disp) / spec.scale, 0.03); pl.mesh.scale.setScalar(pl.rad); g.add(pl.mesh);
      const pts = []; for (let i = 0; i <= 240; i++) { const q = keplerXY(P.a / spec.scale, P.e, (i / 240) * TAU), v = orient(q[0], q[1], 0, I.i); pts.push(v); } ref.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), lineMat(0xd8c0a0, 0.25))); }
    // 光变曲线（只有食双星／凌星系统才有）：按真实半径与亮度、真实倾角计算整个内轨道周期，叠加一条移动游标
    let canvas = null, curve = null; const Lr = spec.stars.map((s) => s.L), real = spec.stars.map((s) => s.R * RS);
    if (spec.curve) {
      curve = []; for (let k = 0; k < 360; k++) { const ph = (k / 360) * TAU, rel = keplerXY(I.a, I.e, ph), rv = orient(rel[0], rel[1], I.w, I.i), p1 = rv.clone().multiplyScalar(-I.m2 / Mi), p2 = rv.clone().multiplyScalar(I.m1 / Mi);
        let f1 = Lr[0], f2 = Lr[1], tot; const d = Math.hypot(p1.x - p2.x, p1.y - p2.y), front1 = p1.z > p2.z;
        if (front1) f2 *= 1 - lens(d, real[0], real[1]) / (Math.PI * real[1] ** 2); else f1 *= 1 - lens(d, real[0], real[1]) / (Math.PI * real[0] ** 2);
        tot = f1 + f2; if (spec.planet) { const P = spec.planet, q = keplerXY(P.a, P.e, (ph / TAU) * (I.P / P.P) * TAU + P.ph), pv = orient(q[0], q[1], 0, I.i), pr = P.R * 0.000477, cm = V(0, 0, 0), pp = pv; for (const [pos, f, R] of [[p1, f1, real[0]], [p2, f2, real[1]]]) { if (pp.z > pos.z) tot -= f * lens(Math.hypot(pp.x - pos.x, pp.y - pos.y), R, pr) / (Math.PI * R * R); } }
        curve.push(tot); }
      const mx = Math.max(...curve), mn = Math.min(...curve); curve = curve.map((v) => (v - mn) / (mx - mn || 1));
      canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 80; Object.assign(canvas.style, { position: 'fixed', right: '84px', bottom: '14px', zIndex: 5, pointerEvents: 'none', borderRadius: '6px', background: 'rgba(10,14,30,.55)', border: '1px solid rgba(214,182,120,.3)', display: 'none' }); document.body.appendChild(canvas);
    }
    g.userData.labels.push(...spec.labels); hudNote(g, spec.note, spec.note2);
    let phase = 0, phaseO = 0, prev = null;
    g.userData.tick = (t, w) => {
      const dt = prev === null ? 0 : Math.min(0.1, t - prev); prev = t; const rate = SIM_RATE[SIM.speed] ?? 1; phase += (TAU / 30) * rate * dt; if (O) phaseO += (TAU / 30) * rate * dt * (I.P / O.P);
      const { p1, p2, p3 } = posAt(phase, phaseO); st[0].m.position.copy(p1); st[0].gl.position.copy(p1); st[1].m.position.copy(p2); st[1].gl.position.copy(p2); if (p3 && st[2]) { st[2].m.position.copy(p3); st[2].gl.position.copy(p3); }
      if (pl) { const q = keplerXY(pl.P.a / spec.scale, pl.P.e, (phase * (I.P / pl.P.P)) + pl.P.ph), v = orient(q[0], q[1], 0, I.i); pl.mesh.position.copy(v); pl.mesh.material.uniforms.uL1.value.copy(p1); pl.mesh.material.uniforms.uL2.value.copy(p2); }
      for (const q of st) { q.m.material.uniforms.uA.value = w; }
      if (canvas) { canvas.style.display = w > 0.5 ? 'block' : 'none'; if (w > 0.5) { const x = canvas.getContext('2d'); x.clearRect(0, 0, 240, 80); x.strokeStyle = '#ffd9a0'; x.lineWidth = 1.5; x.beginPath(); curve.forEach((v, i) => { const px = (i / 359) * 230 + 5, py = 70 - v * 55; i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke(); const k = Math.floor((((phase % TAU) + TAU) % TAU) / TAU * 359); x.fillStyle = '#fff'; x.beginPath(); x.arc((k / 359) * 230 + 5, 70 - curve[k] * 55, 3, 0, TAU); x.fill(); x.fillStyle = '#b9c8ff'; x.font = '10px sans-serif'; x.fillText('光变曲线（按真实半径／倾角计算，一个内轨道周期）', 6, 10); } }
    };
    return g;
  }
  const MULTI_SPECS = {
    alpha: { name: '半人马座 α', fit: 40, scale: 1, disp: 40, inner: { m1: 1.1, m2: 0.907, a: 23.4, e: 0.518, P: 79.9, w: 1.2, i: 1.0 }, stars: [{ T: 5790, R: 1.22, L: 1.5, minR: 0.5, glow: 0.7 }, { T: 5260, R: 0.86, L: 0.5, minR: 0.38, glow: 0.55 }],
      labels: [{ p: V(0, -3, 0), text: '半人马座 α A（G 型，偏暖白）与 B（K 型，偏金橙）· 约 80 年绕共同质心一圈' }, { p: V(0, 30, 0), text: '比邻星（M 型红矮星）在约 13,000 AU（约 0.2 光年）之外，不在这个画面范围内；它绕 A、B 的周期约数十万年', k: 'minor' }],
      note: '双星轨道按真实质量比、周期 79.9 年、偏心率 0.52；恒星显示半径放大 40 倍（物理半径不变）', note2: '比邻星太远，只用文字标注；系外行星（比邻星 b）未画' },
    sirius: { name: '天狼星', fit: 44, scale: 1, disp: 30, inner: { m1: 2.06, m2: 1.02, a: 19.8, e: 0.592, P: 50.1, w: 2.0, i: 0.8 }, stars: [{ T: 9940, R: 1.71, L: 25, minR: 0.75, glow: 0.8 }, { T: 25200, R: 0.0084, L: 0.03, minR: 0.12, glow: 0.35 }],
      labels: [{ p: V(0, -4, 0), text: '天狼星 A（明亮的 A 型星）与 B（体积很小的白矮星）· 约 50 年绕共同质心一圈' }],
      note: '双星轨道按真实质量比、周期 50.1 年、偏心率 0.59；A、B 的真实半径差约 200 倍，这里压缩成明显差别而不是比例尺', note2: '没有画两星之间的能量桥（没有这样的现象）' },
    kepler16: { name: 'Kepler-16', fit: 20, scale: 0.05, disp: 6, rot: [0.6, 0.3, 0], curve: true, inner: { m1: 0.69, m2: 0.2, a: 0.2243, e: 0.159, P: 0.1125, w: 0.6, i: 1.5706 - 0.0022 }, planet: { a: 0.7048, e: 0.007, P: 0.6264, R: 0.754, ph: 0.8 },
      stars: [{ T: 4450, R: 0.65, L: 0.15, minR: 0.12, glow: 0.5 }, { T: 3311, R: 0.226, L: 0.006, minR: 0.07, glow: 0.4 }],
      labels: [{ p: V(0, -3.5, 0), text: 'Kepler-16 A（暖黄）与 B（橙红红矮星）互相绕转；Kepler-16 b（气态巨行星）绕两颗星的共同质心运行' }],
      note: '环双星行星：两颗恒星在中心互绕，行星在更外侧绕它们公转（不是恒星绕行星）；光变曲线按真实半径与倾角计算，含互掩食与行星凌星', note2: '恒星与行星显示尺寸放大 6 倍；行星用两个光源着色；视角为模拟观察位置' },
    algol: { name: '大陵五', fit: 14, scale: 0.01, disp: 3, rot: [0.5, 0.3, 0], curve: true, inner: { m1: 3.17, m2: 0.7, a: 0.062, e: 0, P: 0.00785, w: 0, i: 1.5706 - 0.14 }, outer: { m3: 1.76, a: 2.69, e: 0.227, P: 1.862, w: 0.9, i: 1.45, compress: 0.075 },
      stars: [{ T: 12550, R: 2.73, L: 100, minR: 0.2, glow: 0.7 }, { T: 4900, R: 3.5, L: 3, minR: 0.25, glow: 0.45 }, { T: 7600, R: 1.7, L: 6, minR: 0.18, glow: 0.5 }],
      labels: [{ p: V(0, -3.5, 0), text: '大陵五：内侧一对食双星（Aa1 偏蓝白、Aa2 偏暖橙）每 2.87 天互相掩食一次；外侧第三成员约 1.86 年绕它们一圈' }],
      note: '层级三星：内双星轨道与光变曲线按真实参数；外成员的轨道距离按 0.075 压缩显示（真实相距约 2.7 AU，不是比例尺）', note2: '物质转移是已知现象但几何细节不确定，这里没有画；恒星显示半径放大 3 倍' },
  };

  // ---------------- 河外星系专题场景（B5c）：M51＋NGC 5195、M104、博奥特空洞 ----------------
  // 都是程序化示意（位置／距离写在信息卡里，形态不是实测星图）：旋涡用对数螺线＋核球，椭圆用高斯球，侧视盘的暗尘带用暗色星云片，空洞用“密度场×空洞遮罩”。
  const spiralGal = (a, r, c, R, o = {}) => {
    const { arms = 2, pitch = 0.28, tilt = 0.3, pa = 0, n = 9000, bulge = 0.14, knots = 0.05 } = o, q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, pa, 0)), WARM = [1, 0.86, 0.62], COOL = [0.72, 0.82, 1], PINKC = [1, 0.5, 0.65];
    for (let i = 0; i < n; i++) {
      const rr = R * Math.pow(r(), 0.62), th = (i % arms) * (TAU / arms) + Math.log(1 + rr / (0.12 * R)) / Math.tan(pitch) + gauss(r) * (0.2 + 0.25 * (rr / R)), ang = r() < 0.25 ? r() * TAU : th, k = rr / R;
      const p = V(Math.cos(ang) * rr, gauss(r) * 0.015 * R * (1 + k), Math.sin(ang) * rr).applyQuaternion(q).add(c), knot = r() < knots * k, col = knot ? PINKC : WARM.map((x, j) => x + (COOL[j] - x) * Math.min(1, k * 1.3));
      a.push({ p: p.toArray(), s: knot ? 0.32 + r() * 0.3 : 0.22 + r() * 0.35, c: col.map((x) => x * (knot ? 0.4 : 0.16 + 0.22 * (1 - k * 0.6)) * (0.7 + 0.5 * r())) });
    }
    for (let i = 0; i < n / 5; i++) { const p = V(gauss(r) * bulge * R, gauss(r) * bulge * R * 0.8, gauss(r) * bulge * R).applyQuaternion(q).add(c); a.push({ p: p.toArray(), s: 0.25 + r() * 0.4, c: WARM.map((x) => x * (0.25 + 0.3 * r())) }); }
    return q;
  };
  function buildGalaxyPair(uPR) { // M51（涡状星系，近乎正面，双主旋臂）＋NGC 5195（相互作用的伴星系）＋潮汐桥
    const g = new THREE.Group(), r = rng(5101), a = [], cM = V(-2.0, 0, 0), cC = V(2.1, 0.35, 0.5), R = 2.2;
    spiralGal(a, r, cM, R, { arms: 2, pitch: 0.3, tilt: 0.72, pa: 0.5, n: 11000, bulge: 0.12, knots: 0.09 });
    for (let i = 0; i < 2600; i++) a.push({ p: [cC.x + gauss(r) * 0.32, cC.y + gauss(r) * 0.22, cC.z + gauss(r) * 0.28], s: 0.25 + r() * 0.4, c: [1, 0.84, 0.62].map((x) => x * (0.2 + 0.3 * r())) }); // 伴星系：较光滑、偏暖
    const arm = V(cM.x + 1.8, 0.25, 1.1), mid = arm.clone().lerp(cC, 0.5).add(V(0.2, 0.5, -0.5)); // 潮汐桥：从 M51 的一条旋臂外端连到伴星系，稀疏、淡蓝白
    for (let i = 0; i < 380; i++) { const t = r(), u = 1 - t, p = V(u * u * arm.x + 2 * u * t * mid.x + t * t * cC.x + gauss(r) * 0.07, u * u * arm.y + 2 * u * t * mid.y + t * t * cC.y + gauss(r) * 0.05, u * u * arm.z + 2 * u * t * mid.z + t * t * cC.z + gauss(r) * 0.07); a.push({ p: p.toArray(), s: 0.2 + r() * 0.3, c: [0.7, 0.82, 1].map((x) => x * (0.12 + 0.16 * r())) }); }
    g.add(pointsOf(a, 1.05, uPR));
    for (const [c, k, sz] of [[cM, 0.3, 1.1], [cC, 0.22, 0.6]]) { const gl = glow([1, 0.85, 0.6], 2.4, sz); gl.position.copy(c); gl.material.uniforms.uCol.value.multiplyScalar(k * 0.5); g.add(gl); }
    g.userData.zoom = [{ p: cM, s: 2 }, { p: cC, s: 5 }];
    g.userData.labels = [{ p: cM.clone().add(V(0, -R * 0.7, 0)), text: '涡状星系 M51 · 约 2,800 万光年', zoom: 0 }, { p: cC.clone().add(V(0, -0.8, 0)), text: 'NGC 5195（伴星系）', zoom: 1 },
      { hud: [0.66, 0.97], text: '程序化示意：旋臂、潮汐桥与伴星系的形态不是实测星图；位置与距离为近似值' }];
    g.userData.fitR = 5.5; g.userData.autoOrbit = true; g.rotation.set(0.5, 0.2, 0); return g;
  }
  function buildSombrero(uPR) { // M104：近乎侧视的盘，巨大的核球，宽阔的暗尘带，众多球状星团
    const g = new THREE.Group(), r = rng(10401), a = [], c0 = V(0, 0, 0), R = 2.4;
    const q = spiralGal(a, r, c0, R, { arms: 2, pitch: 0.45, tilt: -0.02, pa: 0.2, n: 7000, bulge: 0.34, knots: 0.015 });
    for (let i = 0; i < 2000; i++) { const d = V(gauss(r), gauss(r), gauss(r)).normalize().multiplyScalar(R * 1.1 * Math.pow(r(), 0.7)); a.push({ p: d.toArray(), s: 0.2 + r() * 0.3, c: [1, 0.9, 0.72].map((x) => x * (0.1 + 0.2 * r())) }); } // 球状星团（上千个）与晕
    g.add(pointsOf(a, 1.05, uPR));
    for (let i = 0; i < 30; i++) { const th = (i / 30) * TAU, rr = R * (0.5 + gauss(r) * 0.04), p = V(Math.cos(th) * rr, gauss(r) * 0.02 * R, Math.sin(th) * rr).applyQuaternion(q); g.add(neb(p.toArray(), 0.6, DUST[0], DUST[1], DUST[2], 11 + i, 0.8, true)); } // 暗尘带：沿盘面的一圈暗色星云片
    const gl = glow([1, 0.88, 0.65], 2.4, 1.6); gl.material.uniforms.uCol.value.multiplyScalar(0.18); g.add(gl);
    g.userData.labels = [{ p: V(0, -R * 0.75, 0), text: '草帽星系 M104 · 约 3,100 万光年' }, { hud: [0.66, 0.97], text: '程序化示意：盘与暗尘带形态不是实测星图；侧视角度随镜头变化，暗尘带为屏幕朝向的暗色片' }];
    g.userData.fitR = 4.6; g.userData.autoOrbit = true; g.rotation.set(0.12, 0.3, 0.1); return g;
  }
  function buildVoid(uPR) { // 博奥特空洞：星系密度场里的一大片低密度区（不是真空）；没有任何壳或边界线，范围靠星系变稀来暗示
    const g = new THREE.Group(), r = rng(7701), a = [], Rv = 6, ph = Array.from({ length: 4 }, () => r() * 6.3), sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    const web = (p) => { const n = Math.sin(0.9 * p.x + ph[0] + Math.sin(0.5 * p.z + ph[1])) * Math.sin(0.8 * p.z + ph[2]) + 0.6 * Math.sin(1.7 * p.y + 0.9 * p.x + ph[3]); return sm(-0.2, 0.9, n + 0.45); }; // 纤维／墙的示意密度
    for (let i = 0, n = 0; n < 11000 && i < 160000; i++) {
      const p = V((r() * 2 - 1) * 12, (r() * 2 - 1) * 8, (r() * 2 - 1) * 12), rb = Rv * (1 + 0.18 * Math.sin(1.3 * p.x / Rv + ph[0]) * Math.cos(1.1 * p.z / Rv + ph[2])), mask = 0.02 + 0.98 * sm(rb * 0.7, rb * 1.2, p.length());
      if (r() > web(p) * mask) continue; n++; a.push({ p: p.toArray(), s: 0.2 + r() * 0.4, c: (r() < 0.12 ? [1, 0.9, 0.68] : [0.86, 0.9, 1]).map((x) => x * (0.15 + 0.25 * r())) });
    }
    g.add(pointsOf(a, 1, uPR));
    g.userData.labels = [{ p: V(0, 0.2, 0), text: '博奥特空洞（暗区，不是真空；约 3.3 亿光年宽）' }, { hud: [0.66, 0.97], text: '概念示意：星系密度场与空洞形状为程序化生成，不是实测分布；空洞边界没有画线，范围靠星系变稀暗示' }];
    g.userData.fitR = 12; g.userData.autoOrbit = true; g.rotation.set(0.45, 0.3, 0); return g;
  }

  // ---------------- 星云与尘埃：域扭曲的程序云团（发射／反射星云，加性混合）与暗色尘埃（普通混合，压暗背景）----------------
  const NEB_VS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
  const NEB_FS = `${NOISE} varying vec2 vUv; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform float uSeed; uniform float uA; uniform float uTime; uniform float uK; uniform float uDark; uniform float uBr; uniform float uMode; uniform float uRot;
void main(){ vec2 q=vUv-.5; float cr=cos(uRot), sr=sin(uRot); q=vec2(q.x*cr-q.y*sr,q.x*sr+q.y*cr); float d=length(q)*2.; if(d>1.) discard;
  vec3 p=vec3(q*3.2+uSeed, uSeed*.7+uTime*.008);
  float w=fbm(p+fbm(p*1.7+3.)*1.3), shape; vec3 col;
  if(uMode<.5){ shape=smoothstep(1.,.12,d)*smoothstep(.22,.78,w); shape+=.35*smoothstep(.08,0.,d)*smoothstep(.2,.7,w); col=mix(uC1,uC2,smoothstep(.3,.85,w)); col=mix(col,uC3,smoothstep(.62,.95,fbm(p*2.+9.))*.75); col+=uC3*smoothstep(.25,0.,d)*.5; }
  else if(uMode<1.5){ float t=fbm(p*1.3+vec3(5.,0.,2.)); shape=smoothstep(1.,.2,d)*smoothstep(.35,.85,t)*.8; col=mix(uC1,uC2,smoothstep(.3,.9,t)); col+=uC3*smoothstep(.3,0.,d)*.7; }
  else if(uMode<2.5){ float t=fbm(vec3(q.x*2.2+uSeed,q.y*7.+uSeed*.3,uSeed+uTime*.006)+fbm(p*2.)*.8); shape=smoothstep(1.,.25,d)*smoothstep(.3,.8,t)*(.5+.5*smoothstep(.6,0.,abs(q.y)*2.)); col=mix(uC1,uC2,smoothstep(.3,.85,t)); col=mix(col,uC3,smoothstep(.65,.95,fbm(p*2.+4.))*.6); }
  else if(uMode<3.5){ float ang=atan(q.y,q.x); float rim=.62+.12*(fbm(vec3(cos(ang),sin(ang),uSeed)*2.)-.5)*2.; float ring=exp(-pow((d-rim)/.1,2.)); float fil=smoothstep(.38,.8,1.-abs(2.*fbm(p*2.4+uSeed)-1.)); float gap=smoothstep(.3,.6,fbm(vec3(cos(ang),sin(ang),uSeed+3.)*2.5)); shape=ring*fil*gap*1.2+.15*ring*gap; col=mix(uC1,uC2,smoothstep(.35,.75,fbm(p*3.+7.))); col=mix(col,uC3,.25); }
  else { float rim=.55; float ring=exp(-pow((d-rim)/.22,2.)); shape=ring*smoothstep(.2,.75,w)*(.55+.6*smoothstep(.3,.9,fbm(p*2.+1.)))+.25*smoothstep(1.,.3,d)*smoothstep(.3,.8,w)*(1.-smoothstep(.4,.2,d)); col=mix(uC1,uC2,smoothstep(.3,.85,w)); col=mix(col,uC3,smoothstep(.2,0.,d)*.4); }
  float a=shape*uK*uA*(uDark>.5?1.:1.+uBr*.12*sin(uTime*(.25+.2*fract(uSeed*.37))+uSeed*3.1));
  gl_FragColor=vec4(uDark>.5?col:col*a, uDark>.5?a:a); }`;
  const neb = (pos, size, c1, c2, c3, seed, k = 0.6, dark = false, opt = {}) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), smat(NEB_VS, NEB_FS, { uC1: { value: new THREE.Color(...c1) }, uC2: { value: new THREE.Color(...c2) }, uC3: { value: new THREE.Color(...c3) }, uSeed: { value: seed }, uK: { value: k }, uDark: { value: dark ? 1 : 0 }, uBr: FXU.uBr, uMode: { value: opt.mode || 0 }, uRot: { value: opt.rot || 0 } }, dark ? {} : { blending: THREE.AdditiveBlending }));
    m.material.side = THREE.DoubleSide; m.position.set(...pos); m.scale.set(size * (opt.sx || 1), size * (opt.sy || 1), 1); m.userData.billboard = true; m.userData.fx = dark ? 'dust' : 'neb'; m.renderOrder = dark ? 3 : 0; return m;
  };
  const HII = [[1, 0.28, 0.42], [1, 0.5, 0.55], [0.5, 0.75, 1]];   // 发射星云：粉红为主，核心带蓝
  const DUST = [[0.02, 0.012, 0.01], [0.03, 0.018, 0.012], [0.015, 0.01, 0.01]];

  function decorateHood(g) { // 极淡的银河局部辉光与空间薄雾（强度由“氛围背景”档位控制，见 cosmos.js 的 atmoK0）
    const r = rng(2101), add = (pos, size, c1, c2, c3, seed, k) => { const m = neb(pos, size, c1, c2, c3, seed, k); m.userData.atmoK0 = k; g.add(m); };
    const gc = V(Math.cos(-0.5) * Math.cos(4.65), Math.sin(-0.5), -Math.cos(-0.5) * Math.sin(4.65)).multiplyScalar(11); // 银心方向（赤经约 17.8h，赤纬约 −29°）
    add(gc.toArray(), 26, [0.3, 0.34, 0.62], [0.5, 0.42, 0.72], [0.55, 0.5, 0.8], 7, 0.07);
    for (let i = 0; i < 5; i++) add([gauss(r) * 7, gauss(r) * 3.5, gauss(r) * 7], 8 + r() * 6, [0.28, 0.4, 0.75], [0.5, 0.4, 0.78], [0.4, 0.55, 0.85], r() * 50, 0.035);
    return g;
  }
  const BUBBLE_FS = `${NOISE} varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec3 vL; uniform float uTime; uniform float uA;
void main(){ vec3 p=normalize(vP), n=normalize(vN), v=normalize(vV); float f=pow(1.-abs(dot(n,v)),2.); float m=fbm(p*5.+uTime*.01);
  gl_FragColor=vec4(vec3(.3,.55,.95)*(.2+m)*(.08+f*.4),(.015+f*.16)*uA); }`;
  function decorateBubble(g) {
    const r = rng(2102);
    for (let i = 0; i < 46; i++) { const d = V(gauss(r), gauss(r) * 0.8, gauss(r)).normalize().multiplyScalar(6.6 + gauss(r) * 0.3); g.add(neb(d.toArray(), 1.4 + r() * 2.2, [0.3, 0.55, 0.95], [0.5, 0.35, 0.8], [0.3, 0.8, 0.9], r() * 50, 0.16)); } // 气泡壁上被推开的气体
    for (let i = 0; i < 5; i++) { const d = V(gauss(r), gauss(r) * 0.6, gauss(r)).normalize().multiplyScalar(6.4); g.add(neb(d.toArray(), 2.2 + r(), [1, 0.35, 0.5], [0.9, 0.55, 0.7], [0.5, 0.7, 1], r() * 50, 0.26)); } // 超新星遗迹：把气体吹开的“肇事者”
    g.userData.labels.push({ p: V(-5, 4.2, 2), text: '超新星遗迹（推开气体的“肇事者”）' });
    return g;
  }
  // ---------------- 猎户臂（本地臂）V2 ----------------
  // 统一坐标：以太阳为原点的银河直角坐标（x 指向银心 l=0°，y 指向 l=90°，z 指向银北），1 单位＝1000 光年；显示时 (x,y,z)→(x,z,-y)，银盘在水平面。
  // 数据说明：天体位置由 (银经 l, 银纬 b, 距离 d) 换算——l、b 取自公开目录的常用值，距离取常见文献近似值（Gaia/VLBI 研究的取值范围内），未逐项对照目录，不是精确测量；
  // 臂中心线是对数螺线近似（倾角约 11°，这个数本身有不确定性）；普通恒星、年轻恒星团簇、暗云都是程序生成的示意层，只有下面命名的天体位置来自观测量。
  // 星云的显示尺寸被放大（真实尺寸只有几十到几百光年，比 1 个单位小得多），放大不改变中心位置。
  function buildOrionArm(uPR) {
    const g = new THREE.Group(), r = rng(44), a = [], K = Math.PI / 180, RSUN = 26.1;
    const T = (x, y, z) => V(x, z, -y), gal = (l, b, d) => T(d * Math.cos(b * K) * Math.cos(l * K), d * Math.cos(b * K) * Math.sin(l * K), d * Math.sin(b * K));
    // 银心距为 R（千光年）、方位 θ（太阳处为 0，向 l=90° 一侧为正）的点；臂：R = R0·exp(-θ·tanφ)
    const pol = (R, th, z = 0) => T(RSUN - R * Math.cos(th), R * Math.sin(th), z);
    const ARM = (R0, phi) => (th) => R0 * Math.exp(-th * Math.tan(phi * K));
    const LOCAL = ARM(26.6, 11.4), PER = ARM(33.0, 10.3), SAG = ARM(20.6, 13.5); // 猎户臂中心线略在太阳外侧（太阳在臂内侧边缘），英仙臂、人马臂只作邻近结构
    const clump = (c, sx, sy, sz, n, col, k, s) => { for (let i = 0; i < n; i++) a.push({ p: [c.x + gauss(r) * sx, c.y + gauss(r) * sy, c.z + gauss(r) * sz], s: s + r() * 0.3, c: col.map((x) => x * k * (0.6 + 0.4 * r())) }); };
    const phA = [r() * 6.3, r() * 6.3];
    // ① 普通恒星层：银盘背景（随银心距指数下降，薄盘）＋ 旋臂局部密度增强（有宽度、有断续、边界渐变）
    for (let i = 0; i < 9000; i++) { const x = (r() * 2 - 1) * 14, y = (r() * 2 - 1) * 14, Rg = Math.hypot(RSUN - x, y); if (r() > Math.exp(-(Rg - RSUN) / 9)) continue; a.push({ p: [x, gauss(r) * 0.28, -y], s: 0.18 + r() * 0.3, c: [0.78, 0.84, 1].map((v) => v * (0.1 + 0.16 * r())) }); }
    const armStars = (fn, n, sig, wgt, col, a0, a1) => { for (let i = 0; i < n; i++) { const th = a0 + r() * (a1 - a0); if (r() > 0.35 + 0.65 * Math.max(0, Math.sin(8 * th + phA[0]) * 0.6 + Math.sin(19 * th + phA[1]) * 0.4)) continue; const R = fn(th) + gauss(r) * sig * (0.7 + 0.5 * r()), p = pol(R, th, gauss(r) * 0.2 * (1 + Math.abs(th))); a.push({ p: [p.x, p.y, p.z], s: 0.18 + r() * 0.35, c: col.map((x) => x * (0.18 + 0.3 * r()) * wgt) }); } };
    armStars(LOCAL, 7500, 0.85, 1, [0.85, 0.9, 1], -0.62, 0.6);
    armStars(PER, 2800, 0.9, 0.7, [0.8, 0.88, 1], -0.5, 0.5); armStars(SAG, 2800, 0.9, 0.7, [0.85, 0.9, 1], -0.5, 0.5); // 邻近的英仙臂、人马臂（只作弱结构，不预设与猎户臂的连接方式）
    // ② 年轻大质量恒星层：只在恒星形成活跃处（下面各星云附近）成团，另有少量沿臂的小团
    const named = [ // [名称, l, b, d(千光年), 所属, 显示尺寸, 色1, 色2, 色3, 亮度, 形态参数]
      ['猎户座大星云 M42', 209.0, -19.4, 1.34, '猎户臂', 0.42, [1, 0.34, 0.52], [0.45, 0.72, 1], [1, 0.8, 0.7], 0.9, { mode: 0 }],
      ['北美洲星云 NGC 7000', 85.0, -0.5, 2.59, '猎户臂', 0.55, [1, 0.28, 0.3], [1, 0.5, 0.45], [0.8, 0.25, 0.3], 0.7, { mode: 0, sx: 1.5, sy: 1, rot: 0.4 }],
      ['加州星云 NGC 1499', 160.6, -12.4, 1.0, '猎户臂', 0.5, [1, 0.22, 0.26], [1, 0.45, 0.5], [0.9, 0.3, 0.4], 0.6, { mode: 2, sx: 3.2, sy: 0.9, rot: 0.35 }],
      ['玫瑰星云', 206.3, -2.1, 5.2, '猎户臂外侧（近似归属）', 0.6, [1, 0.18, 0.24], [1, 0.45, 0.5], [0.9, 0.6, 0.6], 0.65, { mode: 4 }],
      ['船底星云', 287.6, -0.7, 7.5, '人马–船底臂', 0.8, [1, 0.5, 0.35], [1, 0.3, 0.45], [0.6, 0.5, 0.9], 0.8, { mode: 0, sx: 1.3, sy: 1, rot: -0.3 }],
      ['鹰状星云 M16', 17.0, 0.8, 5.7, '人马臂', 0.55, [1, 0.55, 0.3], [0.9, 0.35, 0.4], [0.5, 0.6, 0.9], 0.7, { mode: 0 }],
      ['天鹅圈超新星遗迹（伪彩色）', 74.0, -8.5, 2.4, '猎户臂（本地臂）方向', 0.9, [0.3, 0.7, 1], [1, 0.3, 0.3], [0.9, 0.9, 1], 0.55, { mode: 3 }],
      ['蟹状星云 M1（超新星遗迹，约 6,500 光年；伪彩色）', 184.56, -5.78, 6.5, '英仙臂方向（不属猎户臂）', 0.35, [1, 0.35, 0.25], [1, 0.6, 0.4], [0.5, 0.8, 1], 0.7, { mode: 3 }],
      ['礁湖星云 M8', 6.0, -1.2, 4.1, '人马臂方向', 0.5, [1, 0.3, 0.5], [1, 0.55, 0.6], [0.9, 0.85, 0.9], 0.55, { mode: 0 }],
      ['三叶星云 M20', 7.0, -0.3, 5.2, '人马臂方向', 0.4, [1, 0.3, 0.5], [0.6, 0.7, 1], [0.9, 0.85, 0.9], 0.55, { mode: 0 }],
      ['螺旋星云 NGC 7293（行星状星云，约 650 光年）', 36.16, -57.1, 0.65, '太阳附近', 0.18, [0.35, 0.8, 0.95], [1, 0.5, 0.3], [0.9, 0.95, 1], 0.8, { mode: 4, noClump: true }],
    ];
    const lab = [], ob = []; named.forEach(([name, l, b, d, arm, size, c1, c2, c3, k, opt], i) => { const p = gal(l, b, d); ob.push(p); if (opt.mode !== 3 && !opt.noClump) clump(p, size * 0.9, size * 0.5, size * 0.9, 90, [0.7, 0.82, 1], 0.6, 0.4); g.add(neb(p.toArray(), size * 2.6, c1, c2, c3, 10 + i * 7, k * 0.9, false, opt)); lab.push({ p: p.clone().add(V(0, -size * 0.7, 0)), text: name, lvl: [0] }); });
    for (let i = 0; i < 9; i++) { const th = -0.5 + r() * 1.0, R = LOCAL(th) + gauss(r) * 0.6, p = pol(R, th, gauss(r) * 0.15); clump(p, 0.25, 0.1, 0.25, 40, [0.7, 0.82, 1], 0.5, 0.4); } // 其余年轻星团（程序生成的示意）
    // ③ 疏散星团层：昴星团 M45（l=166.6°, b=-23.5°, 约 445 光年）＝一小群蓝白恒星
    const m45 = gal(166.6, -23.5, 0.445); clump(m45, 0.09, 0.07, 0.09, 55, [0.6, 0.78, 1], 1.0, 0.5); g.add(neb(m45.toArray(), 0.5, [0.4, 0.6, 1], [0.6, 0.8, 1], [0.9, 0.95, 1], 70, 0.45, false, { mode: 1, sx: 1.2, sy: 1, rot: 0.5 })); // 反射星云（淡蓝）
    lab.push({ p: m45.clone().add(V(0, -0.3, 0)), text: '昴星团 M45（约 445 光年）', lvl: [0, 1], zoom: 1 }); lab[0].lvl = [0, 1]; lab[0].zoom = 0; // 缩放目标：0 M42、1 M45、2 猎户座分子云复合体（以 M42 位置为中心的较宽视域，见 cosmos.js 的 ZOOM_OF）
    // ④ 分子云与尘埃层：沿猎户臂内缘的暗云（不成串、不等距）
    for (let i = 0; i < 18; i++) { const th = -0.55 + r() * 1.1, p = pol(LOCAL(th) - 0.7 + gauss(r) * 0.3, th, gauss(r) * 0.1); g.add(neb(p.toArray(), 0.35 + r() * 0.5, DUST[0], DUST[1], DUST[2], r() * 70, 0.45, true)); }
    // 太阳（唯一的定位点）与本地泡（可选显示：不规则、很淡的稀疏壳层；太阳在内部）
    const sun = V(0, 0, 0); a.push({ p: [0, 0, 0], s: 2.6, c: [1, 0.93, 0.7] });
    const bp = []; for (let i = 0; i < 700; i++) { const d = V(gauss(r), gauss(r) * 0.8, gauss(r)).normalize(), rr = 0.36 * (1 + 0.35 * Math.sin(3 * Math.atan2(d.z, d.x) + 1.1) * Math.cos(2 * d.y) + gauss(r) * 0.06); bp.push({ p: d.multiplyScalar(rr).toArray(), s: 0.3 + r() * 0.4, c: [0.4, 0.62, 1].map((x) => x * 0.35) }); }
    const bubPts = pointsOf(bp, 1.0, uPR); bubPts.visible = false; g.add(bubPts);
    g.add(pointsOf(a, 1.1, uPR));
    // 可选的参考层：尺度环与邻臂方向（默认隐藏）
    const ref = new THREE.Group(), ring = (R) => { const pts = []; for (let i = 0; i <= 120; i++) { const t = (i / 120) * TAU; pts.push(V(Math.cos(t) * R, 0, Math.sin(t) * R)); } return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(0xb9c8ff, 0.35)); };
    ref.add(ring(5), ring(10)); const arrow = (v, c) => { const p = [V(0, 0, 0), v, v.clone().add(V(-0.25 * Math.sign(v.x || 1), 0, 0.12)), v, v.clone().add(V(-0.25 * Math.sign(v.x || 1), 0, -0.12))]; return new THREE.Line(new THREE.BufferGeometry().setFromPoints(p), lineMat(c, 0.5)); };
    const toPer = pol(PER(0), 0).clone(), toSag = pol(SAG(0), 0).clone(); ref.add(arrow(toPer, 0xffd28a), arrow(toSag, 0x9fc6ff)); g.add(ref); g.userData.ref = { ref, bub: bubPts }; // 本地泡轮廓、尺度环、邻臂方向：由“参考线”总开关管理
    g.userData.labels = [
      { p: sun.clone().add(V(0, -0.35, 0)), text: '太阳（定位点）', color: '#ffd28a', lvl: [0] },
      { p: pol(LOCAL(0.45), 0.45).clone().add(V(0, 0.5, 0)), text: '猎户臂（本地臂）', lvl: [0] },
      ...lab,
      { p: sun.clone().add(V(0.7, 0.55, 0)), text: '本地泡（点击进入）', go: 'cel.local-bubble', lvl: [0] },
      { p: V(10.5, 0, -9.6), text: '示意：臂线为对数螺线近似；命名天体位置为近似观测值；星云显示尺寸已放大', lvl: [0] },
    ];
    g.userData.labels.push({ p: ob[0].clone().add(V(0, 0.75, 0)), text: '猎户座分子云复合体（暗云与恒星形成区，示意视域）', lvl: [0, 1], zoom: 2 });
    for (const [i, id] of [[0, 'cel.m42'], [4, 'cel.carina'], [5, 'cel.m16'], [6, 'cel.veil'], [7, 'cel.m1'], [8, 'cel.m8'], [9, 'cel.m20'], [10, 'cel.ngc7293']]) { lab[i].go = id; lab[i].lvl = [0, 1]; delete lab[i].zoom; } // 这些天体各有独立场景：标签点击进入
    lab.push({ p: gal(206.0, -16.6, 1.375).add(V(-0.2, 0.2, 0)), text: '马头星云 B33（点击进入）', go: 'cel.horsehead', lvl: [0, 1] });
    g.userData.zoom = [{ p: ob[0].clone(), s: 6.5 }, { p: m45.clone(), s: 8 }, { p: ob[0].clone(), s: 3.2 }];
    g.userData.fitR = 13; g.rotation.x = 0.85; return g;
  }
  function decorateOrion(g) {
    const r = rng(2103), P = (off, an) => { const R = 16 + off; return [R * Math.sin(an), 0, -16 + R * Math.cos(an)]; };
    const named = [
      ['猎户座大星云', 0, -0.1, 2.3, [1, 0.34, 0.52], [0.45, 0.72, 1], [1, 0.8, 0.7], 1.4],
      ['玫瑰星云', 0.4, 0.38, 2.0, [1, 0.18, 0.24], [1, 0.45, 0.5], [0.8, 0.3, 0.4], 1.0],
      ['北美洲星云', 0.3, -0.5, 1.9, [1, 0.28, 0.3], [1, 0.5, 0.45], [0.8, 0.25, 0.3], 1.0],
      ['昴星团（反射星云）', -0.5, 0.2, 1.6, [0.4, 0.6, 1], [0.6, 0.8, 1], [0.9, 0.95, 1], 1.2],
      ['船底星云', -4.2, 0.5, 2.6, [1, 0.5, 0.35], [1, 0.3, 0.45], [0.6, 0.5, 0.9], 1.4],
      ['鹰状星云', -4.4, -0.35, 2.0, [1, 0.55, 0.3], [0.9, 0.35, 0.4], [0.5, 0.6, 0.9], 1.2],
    ];
    named.forEach(([name, off, an, size, c1, c2, c3, k], i) => { const p = P(off, an); g.add(neb(p, size, c1, c2, c3, 10 + i * 7, k)); g.userData.labels.push({ p: V(p[0], p[1] - size * 0.55, p[2]), text: name }); });
    for (let i = 0; i < 28; i++) { const lane = [-4.2, 0, 4.6][i % 3], p = P(lane + gauss(r) * 0.4, (r() * 2 - 1) * 0.9); g.add(neb(p, 0.7 + r() * 1.1, HII[i % 3], HII[(i + 1) % 3], [0.9, 0.5, 0.7], r() * 60, 0.3)); }
    for (let i = 0; i < 36; i++) { const lane = [-4.2, 0, 4.6][i % 3], p = P(lane + 0.5 + gauss(r) * 0.3, (r() * 2 - 1) * 0.9); g.add(neb(p, 0.9 + r() * 1.4, DUST[0], DUST[1], DUST[2], r() * 60, 0.45, true)); } // 沿臂内侧的暗色尘埃
    return g;
  }
  function decorateGalaxy(g) { // 星云沿 buildGalaxy 给出的旋臂放置：发射星云成团（不是均匀撒开）、反射星云较少、暗尘在臂内缘切割星光；形态各异
    const r = rng(2104), arm = g.userData.armAt, pick = () => (r() < 0.32 ? 0 : r() < 0.5 ? 1 : r() < 0.7 ? 2 : 3), RR = (lo, hi) => lo + r() * (hi - lo), shp = () => ({ mode: r() < 0.25 ? 2 : 0, sx: 0.8 + r() * 1.1, sy: 0.7 + r() * 0.5, rot: r() * 3.14 });
    for (let c = 0; c < 16; c++) { const k = pick(), rr = RR(3.6, 11.5), n = 3 + Math.floor(r() * 6); for (let i = 0; i < n; i++) g.add(neb(arm(k, rr + gauss(r) * 0.35, gauss(r) * 0.15), 0.35 + r() * 0.9, HII[i % 3], HII[(i + 1) % 3], [1, 0.6, 0.7], r() * 99, 0.35 + r() * 0.2, false, shp())); } // 发射星云：16 个恒星形成区复合体
    for (let i = 0; i < 18; i++) g.add(neb(arm(pick(), RR(3.6, 12), gauss(r) * 0.2), 0.5 + r() * 0.8, [0.45, 0.62, 1], [0.7, 0.82, 1], [0.9, 0.95, 1], r() * 99, 0.18, false, { mode: 1, sx: 1, sy: 0.8 + r() * 0.4, rot: r() * 3.14 })); // 反射星云（冷蓝，较少）
    for (let i = 0; i < 40; i++) g.add(neb(arm(pick(), RR(3.5, 12), gauss(r) * 0.2), 1.6 + r() * 1.2, [0.4, 0.55, 1], [0.6, 0.7, 1], [0.8, 0.85, 1], r() * 99, 0.08)); // 弥散的蓝白星光
    for (let i = 0; i < 170; i++) g.add(neb(arm(pick(), RR(3.2, 11.5), -0.35 + gauss(r) * 0.12), 0.45 + r() * 0.9, DUST[0], DUST[1], DUST[2], r() * 99, 0.42, true, { sx: 1 + r() * 1.4, sy: 0.6 + r() * 0.5, rot: r() * 3.14 })); // 臂内缘的暗尘带（局部遮挡星光）
    for (let i = 0; i < 16; i++) { const x = (r() * 2 - 1) * 2.8, c = Math.cos(0.47), sn = Math.sin(0.47); g.add(neb([x * c - 0.1 * sn, gauss(r) * 0.04, x * sn + 0.1 * c], 0.6 + r() * 0.6, DUST[0], DUST[1], DUST[2], r() * 99, 0.4, true, { sx: 1.6, sy: 0.6, rot: 0.47 })); } // 贯穿核球的暗带
    return g;
  }

  // 通用小旋涡点云盘（超星系团、室女座星系团等只作远景小光点用；本星系群的三大星系各有独立形态，不用它）。nS＝点数倍率
  function galaxyDisk(arr, r, c, R, tilt, roll, nS = 1) {
    const ct = Math.cos(tilt), st = Math.sin(tilt), cr = Math.cos(roll), sr = Math.sin(roll), rot = (x, y, z) => { const y1 = y * ct - z * st, z1 = y * st + z * ct; return [c[0] + x * cr - y1 * sr, c[1] + x * sr + y1 * cr, c[2] + z1]; };
    for (let i = 0; i < 5200 * nS; i++) { const rr = -Math.log(1 - r() * 0.98) * R * 0.32 + 0.04 * R, th = Math.floor(r() * 2) * Math.PI + Math.log(1 + (rr / R) * 6) * 2.3 + gauss(r) * 0.22, warm = Math.exp(-rr / (R * 0.25)); arr.push({ p: rot(Math.cos(th) * rr, gauss(r) * R * 0.025, Math.sin(th) * rr), s: 0.25 + r() * 0.4, c: [0.7 + warm * 0.3, 0.78 + warm * 0.15, 1 - warm * 0.45].map((v) => v * (0.3 + 0.5 * Math.exp(-rr / R))) }); }
    for (let i = 0; i < 1800 * nS; i++) arr.push({ p: rot(gauss(r) * R * 0.14, gauss(r) * R * 0.1, gauss(r) * R * 0.14), s: 0.25 + r() * 0.3, c: [1, 0.8, 0.52].map((v) => v * 0.28) });
    for (let i = 0; i < 1500 * nS; i++) { const d = V(gauss(r), gauss(r), gauss(r)).normalize().multiplyScalar(Math.pow(r(), 1.4) * R * 1.3); arr.push({ p: rot(d.x, d.y, d.z), s: 0.22 + r() * 0.3, c: [0.8, 0.72, 0.55].map((v) => v * 0.18) }); }
  }

  // ---------------- 本星系群（按真实天文坐标重构）----------------
  // 位置：由银经 l、银纬 b、距离 d（kpc）换算成以银河系为原点的三维坐标；银河系—仙女座约 785 kpc（≈ 250 万光年），三角座星系在仙女座附近（≈ 200 kpc，约 65 万光年）。
  // 星系本体按 ENL 倍放大以便观察，**尺寸未按距离同比例绘制**（矮星系位置为近似值）。三个主星系各用不同的真实形态：银河系＝带棒旋涡（棒端伸出两条主臂＋两条次臂）；
  // 仙女座星系＝大而高倾角的旋涡（明亮核球、星形成环、暗尘埃带）并带伴星系 M32、M110；三角座星系＝无明显核球的絮状旋涡（碎片化短臂、大量粉色星形成区）。
  // 矮星系为不规则或椭球状的小光团，围绕主星系，另有少量孤立成员；星系之间保留大片黑暗，不随机填充亮星。
  function buildLocalGroup(uPR) {
    const g = new THREE.Group(), r = rng(61), a = [], ENL = 6, U = 100; // 1 画面单位 = 100 kpc
    const rad = (d) => (d * Math.PI) / 180;
    const lbd = (l, b, d) => V(d * Math.cos(rad(b)) * Math.cos(rad(l)) - 8, d * Math.cos(rad(b)) * Math.sin(rad(l)), d * Math.sin(rad(b)));
    const m31 = lbd(121.2, -21.6, 785), m33 = lbd(133.6, -31.3, 840);
    const ux = m31.clone().normalize(), uw = new THREE.Vector3().crossVectors(ux, m33).normalize(), uv = new THREE.Vector3().crossVectors(uw, ux), mid = m31.clone().multiplyScalar(0.5);
    const T = (p) => { const q = p.clone().sub(mid); return V(q.dot(ux) / U, q.dot(uv) / U, q.dot(uw) / U); }; // 银河系—仙女座连线沿屏幕横向，三角座在其一侧
    const at = (l, b, d) => T(lbd(l, b, d));
    // 星系局部坐标系：法向 n、盘内旋转 spin
    const frame = (c, n, spin = 0) => { n = n.clone().normalize(); const t = Math.abs(n.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0), e1 = new THREE.Vector3().crossVectors(n, t).normalize(), e2 = new THREE.Vector3().crossVectors(n, e1), cs = Math.cos(spin), sn = Math.sin(spin); return (x, y, z) => { const X = x * cs - y * sn, Y = x * sn + y * cs; return [c.x + e1.x * X + e2.x * Y + n.x * z, c.y + e1.y * X + e2.y * Y + n.y * z, c.z + e1.z * X + e2.z * Y + n.z * z]; }; };
    const pt = (arr, p, s, c, k) => arr.push({ p, s, c: c.map((x) => x * k) });
    const BLUE = [0.74, 0.84, 1], WARM = [1, 0.84, 0.6], PINK = [1, 0.5, 0.65];

    // —— 银河系：带棒旋涡（棒＋两条主臂＋两条次臂＋黄色核球）——
    function milkyWay(c, n) {
      const R = 15 * ENL / U, F = frame(c, n, 0.4), bar = 0.52; // R≈15 kpc×ENL/100
      for (let i = 0; i < 2600; i++) { const x = gauss(r) * 0.15 * R, y = gauss(r) * 0.05 * R, z = gauss(r) * 0.03 * R; pt(a, F(x * Math.cos(bar) - y * Math.sin(bar), x * Math.sin(bar) + y * Math.cos(bar), z), 0.22 + r() * 0.3, WARM, 0.22 + 0.2 * Math.exp(-Math.abs(x) / (0.1 * R))); } // 短棒
      for (let i = 0; i < 1800; i++) { const d = V(gauss(r), gauss(r), gauss(r) * 0.7).multiplyScalar(0.075 * R); pt(a, F(d.x, d.y, d.z), 0.22 + r() * 0.3, [1, 0.8, 0.52], 0.3 * Math.exp(-d.length() / (0.07 * R)) + 0.08); } // 三维核球
      for (const [t0, wgt] of [[bar, 1], [bar + Math.PI, 1], [bar + Math.PI / 2, 0.45], [bar + 1.5 * Math.PI, 0.45]]) {   // 主臂从棒端伸出；次臂较稀疏
        const N = Math.floor(3300 * wgt);
        for (let i = 0; i < N; i++) { const u = r(), rr = 0.3 * R * Math.exp(u * Math.log(1 / 0.3)), th = t0 + u * 3.9 + gauss(r) * (0.06 + 0.06 * u); pt(a, F(Math.cos(th) * rr, Math.sin(th) * rr, gauss(r) * 0.012 * R * (1 + 2 * u)), 0.2 + r() * 0.35, BLUE, (0.3 + 0.45 * (1 - u * 0.5)) * (0.6 + 0.4 * wgt)); }
        for (let k = 0; k < 14 * wgt; k++) { const u = 0.15 + r() * 0.8, rr = 0.3 * R * Math.exp(u * Math.log(1 / 0.3)), th = t0 + u * 3.9, cx = Math.cos(th) * rr, cy = Math.sin(th) * rr; for (let j = 0; j < 4; j++) pt(a, F(cx + gauss(r) * 0.01 * R, cy + gauss(r) * 0.01 * R, gauss(r) * 0.006 * R), 0.6 + r() * 0.8, PINK, 0.65); } // 粉色的星形成区
      }
      for (let i = 0; i < 1500; i++) { const rr = 0.2 * R - Math.log(1 - r() * 0.97) * 0.3 * R; if (rr > R * 1.05) continue; const th = r() * TAU; pt(a, F(Math.cos(th) * rr, Math.sin(th) * rr, gauss(r) * 0.015 * R), 0.18 + r() * 0.25, [0.6, 0.66, 0.8], 0.18); } // 臂间的弥散盘
    }
    // —— 仙女座星系（M31）：大旋涡，高倾角，明亮核球，星形成环，暗尘埃带 ——
    function andromeda(c, n) {
      const R = 33 * ENL / U, F = frame(c, n, -0.6);
      for (let i = 0; i < 3200; i++) { const d = V(gauss(r), gauss(r), gauss(r) * 0.8).multiplyScalar(0.1 * R); pt(a, F(d.x, d.y, d.z), 0.22 + r() * 0.35, [1, 0.9, 0.72], 0.34 * Math.exp(-d.length() / (0.07 * R)) + 0.1); } // 明亮的核球
      for (const [rr0, wd, N, k] of [[0.34, 0.035, 2600, 0.7], [0.56, 0.05, 2800, 0.6]]) for (let i = 0; i < N; i++) { const th = r() * TAU, rr = rr0 * R + gauss(r) * wd * R; pt(a, F(Math.cos(th) * rr, Math.sin(th) * rr, gauss(r) * 0.01 * R), 0.2 + r() * 0.35, BLUE, k * (0.35 + 0.4 * r())); } // 星形成环（M31 以环状结构著称）
      for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 2600; i++) { const u = r(), rr = (0.15 + 0.85 * u) * R, th = arm * Math.PI + u * 7.2 + gauss(r) * 0.07; pt(a, F(Math.cos(th) * rr, Math.sin(th) * rr, gauss(r) * 0.01 * R), 0.18 + r() * 0.3, BLUE, 0.28 * (1 - u * 0.5)); } // 紧卷的旋臂
      for (let i = 0; i < 3200; i++) { const rr = -Math.log(1 - r() * 0.985) * 0.28 * R + 0.1 * R, th = r() * TAU; if (rr > 1.25 * R) continue; pt(a, F(Math.cos(th) * rr, Math.sin(th) * rr, gauss(r) * 0.013 * R), 0.16 + r() * 0.25, [0.68, 0.74, 0.9], 0.16); } // 延展的暗淡外盘
      for (let i = 0; i < 1100; i++) { const d = V(gauss(r), gauss(r), gauss(r)).normalize().multiplyScalar(Math.pow(r(), 1.5) * 0.9 * R); pt(a, F(d.x, d.y, d.z), 0.18 + r() * 0.25, [0.85, 0.78, 0.6], 0.14); } // 晕
      const m32 = c.clone().add(V(0.05, -0.17, 0.1)), m110 = c.clone().add(V(-0.35, 0.28, 0.16));  // 伴星系：M32（致密椭圆）、M110（较大较暗的椭圆）
      for (let i = 0; i < 420; i++) pt(a, [m32.x + gauss(r) * 0.04, m32.y + gauss(r) * 0.03, m32.z + gauss(r) * 0.035], 0.2 + r() * 0.3, WARM, 0.42);
      for (let i = 0; i < 380; i++) pt(a, [m110.x + gauss(r) * 0.12, m110.y + gauss(r) * 0.07, m110.z + gauss(r) * 0.09], 0.18 + r() * 0.25, [0.9, 0.85, 0.75], 0.22);
      return { m32, m110 };
    }
    // —— 三角座星系（M33）：絮状旋涡，无明显核球；碎片化的短臂与大量星形成区 ——
    function triangulum(c, n) {
      const R = 9 * ENL / U, F = frame(c, n, 1.1);
      for (let i = 0; i < 90; i++) pt(a, F(gauss(r) * 0.012 * R, gauss(r) * 0.012 * R, gauss(r) * 0.01 * R), 0.4 + r() * 0.5, [1, 0.9, 0.75], 0.5); // 极小的核星团（无核球）
      for (let k = 0; k < 16; k++) { // 16 段短而不规则的臂片段，螺距各异
        const base = r() * TAU, r0 = (0.15 + r() * 0.7) * R, len = 0.5 + r() * 0.9, pitch = 0.2 + r() * 0.35, N = Math.floor(260 + r() * 260);
        for (let i = 0; i < N; i++) { const u = r(), th = base + u * len * 2, rr = r0 * Math.exp(u * pitch * len) + gauss(r) * 0.03 * R; pt(a, F(Math.cos(th) * rr, Math.sin(th) * rr, gauss(r) * 0.02 * R), 0.16 + r() * 0.3, [0.7, 0.8, 1], 0.4); }
      }
      for (let i = 0; i < 38; i++) { const th = r() * TAU, rr = (0.15 + 0.85 * r()) * R, cx = Math.cos(th) * rr, cy = Math.sin(th) * rr; for (let j = 0; j < 4 + Math.floor(r() * 4); j++) pt(a, F(cx + gauss(r) * 0.02 * R, cy + gauss(r) * 0.02 * R, gauss(r) * 0.01 * R), 0.5 + r() * 0.8, PINK, 0.7); } // 大量粉色的星形成区（含 NGC 604 一类的巨型区域）
      for (let i = 0; i < 2400; i++) { const rr = -Math.log(1 - r() * 0.97) * 0.35 * R, th = r() * TAU; pt(a, F(Math.cos(th) * rr, Math.sin(th) * rr, gauss(r) * 0.03 * R), 0.16 + r() * 0.25, [0.62, 0.7, 0.88], 0.2); } // 低表面亮度的弥散盘
    }
    // —— 矮星系：椭球状（矮椭球）或不规则（含粉色星形成区）的小光团 ——
    const dsph = (c, R, n, e = 0.7) => { for (let i = 0; i < n; i++) pt(a, [c.x + gauss(r) * R, c.y + gauss(r) * R * e, c.z + gauss(r) * R * 0.8], 0.18 + r() * 0.25, [0.92, 0.86, 0.7], 0.3); };
    const irr = (c, R, n, knots = 0.07) => { const sub = Array.from({ length: 4 }, () => V(gauss(r) * R * 0.6, gauss(r) * R * 0.4, gauss(r) * R * 0.4)); for (let i = 0; i < n; i++) { const s = sub[Math.floor(r() * 4)], k = r() < knots; pt(a, [c.x + s.x + gauss(r) * R * 0.4, c.y + s.y + gauss(r) * R * 0.3, c.z + s.z + gauss(r) * R * 0.3], k ? 0.55 + r() * 0.5 : 0.18 + r() * 0.28, k ? PINK : BLUE, k ? 0.65 : 0.34); } };

    // —— 摆放（真实坐标换算，矮星系位置为近似值）——
    const cMW = T(V(0, 0, 0)), cM31 = T(m31), cM33 = T(m33);
    milkyWay(cMW, V(0.35, 0.8, 0.5)); const sat = andromeda(cM31, V(-0.3, 0.92, 0.28)); triangulum(cM33, V(0.3, 0.55, 0.78));
    irr(at(280.5, -32.9, 50), 0.2, 800, 0.06); irr(at(302.8, -44.3, 61), 0.11, 380, 0.05);                                  // 大、小麦哲伦云
    dsph(at(5.6, -14.2, 26), 0.14, 300, 0.45); dsph(at(86.4, 34.7, 76), 0.05, 150); dsph(at(105, 44.8, 76), 0.06, 150, 0.55); dsph(at(287.5, -83.2, 86), 0.05, 160);
    dsph(at(243.5, 42.3, 86), 0.08, 150); dsph(at(260.1, -22.2, 105), 0.05, 140); dsph(at(237.1, -65.7, 147), 0.07, 260); dsph(at(226, 49.1, 254), 0.05, 150); dsph(at(220.2, 67.2, 233), 0.04, 120); // 银河系的矮伴星系
    dsph(cM31.clone().add(V(-0.7, 0.5, 0.6)), 0.06, 150); dsph(cM31.clone().add(V(-0.4, 1.2, 0.5)), 0.08, 170); dsph(cM31.clone().add(V(0.8, -0.9, 0.7)), 0.05, 130);  // 仙女座的矮伴星系（NGC 147／185 一带，近似）
    irr(at(25.3, -18.4, 490), 0.1, 300); irr(at(119, -3.3, 794), 0.075, 220, 0.12); irr(at(129.8, -60.6, 755), 0.08, 230); irr(at(75.9, -73.6, 933), 0.06, 180); // 孤立的不规则矮星系：NGC 6822、IC 10、IC 1613、WLM
    irr(at(196.9, 54.4, 800), 0.04, 120); irr(at(94.8, -43.5, 920), 0.05, 140); dsph(at(272.2, -68.9, 415), 0.04, 120); dsph(at(322.9, -47.4, 887), 0.04, 100); dsph(at(101.5, -72.9, 755), 0.04, 110); // Leo A、飞马矮星系、凤凰、杜鹃、鲸鱼座矮星系
    g.add(pointsOf(a, 1.0, uPR));
    for (const [c, R, k] of [[cMW, 0.5, 0.35], [cM31, 1.0, 0.4], [cM33, 0.28, 0.2]]) { const gl = glow([1, 0.82, 0.58], 2.4, R); gl.position.copy(c); gl.material.uniforms.uCol.value.multiplyScalar(k * 0.5); g.add(gl); } // 仅核心处极淡的光
    const lab = (p, text, color, dy = -0.9, zoom) => ({ p: p.clone().add(V(0, dy, 0)), text, color, zoom });
    { const LMC = at(280.5, -32.9, 50), SMC = at(302.8, -44.3, 61); // 星云只依附在宿主星系内部
      g.add(neb(LMC.clone().add(V(0.08, 0.03, 0.02)).toArray(), 0.16, [1, 0.3, 0.45], [1, 0.55, 0.6], [0.7, 0.8, 1], 31, 0.7, false, { mode: 0 })); // 大麦哲伦云的蜘蛛星云一带
      pulseGlow(g, LMC.clone().add(V(0.08, 0.03, 0.02)), [1, 0.5, 0.6], 3, 0.14, 0.5, 0.05, 13, 1.1);
      g.add(neb(SMC.toArray(), 0.1, [1, 0.35, 0.5], [0.6, 0.75, 1], [0.8, 0.85, 1], 37, 0.45, false, { mode: 0, sx: 1.4, sy: 0.8, rot: 0.6 }));
      g.add(neb(cM33.clone().add(V(0.22, 0.05, 0.12)).toArray(), 0.12, [1, 0.3, 0.45], [1, 0.55, 0.6], [0.7, 0.8, 1], 41, 0.6)); pulseGlow(g, cM33.clone().add(V(0.22, 0.05, 0.12)), [1, 0.5, 0.6], 3, 0.1, 0.4, 0.05, 17, 2.3); // M33 的 NGC 604 一类巨型 H II 区
      pulseGlow(g, cM31, [1, 0.9, 0.7], 3, 0.35, 0.25, 0.03, 19, 0.4); pulseGlow(g, cMW, [1, 0.88, 0.62], 3, 0.25, 0.22, 0.03, 15, 3.1); } // 核球处极小的暖白亮点，低幅度脉动
    const cLMC = at(280.5, -32.9, 50), cSMC = at(302.8, -44.3, 61); g.userData.zoom = [{ p: cMW, s: 6 }, { p: cM31, s: 2.7 }, { p: cM33, s: 8 }, { p: cLMC, s: 10 }, { p: cSMC, s: 18 }, { p: sat.m32, s: 14 }, { p: sat.m110, s: 9 }]; // 缩放目标序号与导航节点对应：0 银河系、1 M31、2 M33、3 LMC、4 SMC、5 M32、6 M110（见 cosmos.js 的 ZOOM_OF） g.userData.fitR = 6.3; // 默认视角同时容纳三大星系；点击星系名称放大，再点一次返回
    g.userData.labels = [lab(cMW, '银河系（我们）· 约 10 万光年', '#ffd28a', -1.1, 0), lab(cM31, '仙女座星系 M31 · 约 22 万光年', undefined, -1.5, 1), lab(cM33.clone(), '三角座星系 M33 · 约 6 万光年', undefined, -0.8, 2), lab(cLMC, '大麦哲伦云 LMC · 约 16 万光年', undefined, -0.12, 3), lab(cSMC, '小麦哲伦云 SMC · 约 20 万光年', undefined, -0.07, 4), { p: sat.m32.clone().add(V(0.2, -0.3, 0)), text: 'M32', zoom: 5 }, { p: sat.m110.clone().add(V(0, 0.3, 0)), text: 'M110', zoom: 6 }, lab(at(25.3, -18.4, 490), 'NGC 6822', undefined, -0.4), lab(at(119, -3.3, 794), 'IC 10', undefined, -0.4)];
    g.userData.labels.push({ p: cLMC.clone().add(V(0.09, 0.03, 0.02)), text: '蜘蛛星云（点击进入）', go: 'cel.tarantula', lvl: [1], color: '#ffd28a' });
    g.rotation.set(0.25, 0.25, 0); return g;
  }

  // ---------------- 宇宙网（并入可观测宇宙）----------------
  // 参考大尺度结构模拟的特征：多尺度的层级——少数粗大明亮的主干丝带汇于极亮的节点，主干之间是越来越细的毛发状细丝，其余是近黑的空洞。
  // 做法：三维 Worley 噪声的“胞腔边缘”作丝带（相邻胞腔距离差小处），三个胞腔交汇处作节点；三级倍频（逐级更细更淡）+ 域扭曲；
  // 启动时一次性烘焙成球面贴图，之后每帧仅一次采样（球仍是 3D，可任意旋转）。配色为艺术化处理：丝带蓝白，节点暖白。
  const WEB_CORE = `${NOISE}
vec3 worley(vec3 p){ vec3 i=floor(p), f=fract(p); float d1=9., d2=9., d3=9.;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){ vec3 g=vec3(float(x),float(y),float(z)); vec3 r=g+h33(i+g)-f; float d=dot(r,r);
    if(d<d1){d3=d2;d2=d1;d1=d;} else if(d<d2){d3=d2;d2=d;} else if(d<d3){d3=d;} }
  return sqrt(vec3(d1,d2,d3)); }
vec4 web(vec3 dir, float scale, float seed){
  vec3 p=dir*scale+vec3(seed);
  p+=(vec3(fbm(p*.7),fbm(p*.7+7.),fbm(p*.7+13.))-.5)*1.5;
  float acc=0., nodes=0., amp=1.;
  for(int o=0;o<3;o++){
    vec3 w=worley(p); float e=w.y-w.x, nd=w.z-w.x, fo=float(o);
    float fil=exp(-e*(10.+6.*fo));
    acc+=fil*amp*(o==0?1.:(.5+.5*fbm(p*2.)));
    nodes+=exp(-nd*(11.+4.*fo))*fil*amp;
    p=p*2.07+vec3(3.1,1.7,5.3)+(vec3(fbm(p),fbm(p+3.),fbm(p+9.))-.5)*.7; amp*=.55; }
  acc=smoothstep(.12,1.,acc);
  vec3 col=vec3(.26,.4,.8)*acc*.55+vec3(.7,.82,1.)*pow(acc,2.4)*.45+vec3(1.,.82,.58)*nodes*1.2;
  return vec4(col,clamp(acc*.5+nodes,0.,1.)); }`;
  const BAKE_VS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy*2.,0.,1.); }`;
  const BAKE_FS = `${WEB_CORE} varying vec2 vUv; uniform float uScale; uniform float uSeed;
void main(){ float lon=(vUv.x-.5)*6.2831853, lat=(vUv.y-.5)*3.1415927; vec3 d=vec3(cos(lat)*sin(lon),sin(lat),cos(lat)*cos(lon)); gl_FragColor=web(d,uScale,uSeed); }`;
  let RENDERER = null;
  const setRenderer = (r) => { RENDERER = r; };
  function bakeWeb(scale, seed, w, h) {
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ vertexShader: BAKE_VS, fragmentShader: BAKE_FS, uniforms: { uScale: { value: scale }, uSeed: { value: seed } }, depthTest: false, depthWrite: false })), sc = new THREE.Scene(), cam = new THREE.Camera();
    sc.add(quad); const old = RENDERER.getRenderTarget(); RENDERER.setRenderTarget(rt); RENDERER.render(sc, cam); RENDERER.setRenderTarget(old);
    quad.geometry.dispose(); quad.material.dispose(); return rt.texture;
  }
  const SHELL_FS = `varying vec3 vP; uniform sampler2D uMap; uniform float uA; uniform float uGain;
void main(){ vec3 d=normalize(vP); vec4 t=texture2D(uMap,vec2(atan(d.x,d.z)/6.2831853+.5,asin(clamp(d.y,-1.,1.))/3.1415927+.5)); gl_FragColor=vec4(t.rgb,clamp(t.a*uGain*uA,0.,1.)); }`;
  const SHELL_VS = `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
  const webShell = (R, scale, seed, gain, side, w, h) => new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), smat(SHELL_VS, SHELL_FS, { uMap: { value: bakeWeb(scale, seed, w, h) }, uGain: { value: gain } }, { blending: THREE.AdditiveBlending, side }));
  // 可观测宇宙：外表面是蓝白发光的宇宙网（亮节点＝星系团，丝带勾出近黑的空洞），里面再叠两层更细的网产生纵深；边缘一圈淡蓝光晕
  function webObservable() {
    const g = new THREE.Group(), big = RENDERER.capabilities.maxTextureSize >= 4096;
    g.add(webShell(13.3, 3.4, 1, 0.72, THREE.FrontSide, big ? 3072 : 2048, big ? 1536 : 1024)); // 只留一层外壳（参考图是单层的球）
    g.add(new THREE.Mesh(new THREE.SphereGeometry(14.1, 64, 40), smat(SPHERE_VS, ATMO_FS, { uSunW: { value: V(0, 0, 0) }, uCol: { value: new THREE.Color(0.1, 0.2, 0.5) } }, { side: THREE.BackSide, blending: THREE.AdditiveBlending })));
    return g;
  }


  // ---------------- V3.1：黑洞吞噬恒星——V404 Cygni（持续的物质转移）与 AT2019qiz（潮汐瓦解的历史重建）----------------
  // 物理与显示分开：轨道、质量比、Roche 几何（受限三体问题）与潮汐瓦解的数值积分都用物理量；黑洞、盘、恒星的显示尺寸被放大，下面各处和信息卡都有标注。
  BH_PARAMS.v404 = { outK: 0.07, rin: 3, rout: 14, speed: 2.4, ts: 2.0, hotN: 3, flare: 0, jet: 0, expo: 1.15, beam: 3.2, inner: 0.6, starK: 0.9955, cool: [0.25, 0.07, 0.03], mid: [1, 0.52, 0.14], hot: [1, 0.9, 0.65], star: [1, 0.85, 0.65], rot: 0.5, fit: 90, name: 'V404 Cygni 黑洞' };
  BH_PARAMS.tde = { rin: 3, rout: 9, speed: 1.6, ts: 1.8, hotN: 1, flare: 0, jet: 0, expo: 1.1, beam: 3.4, inner: 0.9, starK: 0.9975, cool: [0.3, 0.1, 0.04], mid: [1, 0.55, 0.16], hot: [1, 0.9, 0.7], star: [1, 0.88, 0.7], rot: 0.5, fit: 30, name: '宿主星系中央黑洞' };
  const hasEl = (id) => document.getElementById(id);

  // —— V404 Cygni：系统全景（内双星与远处第三恒星的尺度差异）——
  function buildV404Pano(uPR) {
    const g = nebG(34, [0.4, 0.2, 0]), r = rng(404), a = [];
    const star = (p, R, col, glowK, text, dy) => { const m = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 16), smat(SPHERE_VS, STAR_FS, { uSunW: { value: V(0, 0, 0) }, uCol: { value: new THREE.Color(...col) } })); m.position.copy(p); const gl = glow(col, 2.6, R * 8); gl.material.uniforms.uCol.value.multiplyScalar(glowK); gl.position.copy(p); g.add(m, gl); g.userData.labels.push({ p: p.clone().add(V(0, dy, 0)), text }); };
    g.add(pointsOf([{ p: [0, 0, 0], s: 2.6, c: [1, 0.6, 0.25] }], 1, uPR));
    const gl0 = glow([1, 0.6, 0.3], 2.6, 2.2); gl0.material.uniforms.uCol.value.multiplyScalar(0.5); g.add(gl0);
    const third = V(26, 5, -8); star(third, 0.9, [1, 0.78, 0.5], 0.5, '第三成员（暖橙色的恒星）', -2.2);
    const ln = []; for (let i = 1; i < 40; i++) if (i % 2) ln.push({ p: third.clone().multiplyScalar(i / 40).toArray(), s: 0.3, c: [0.6, 0.65, 0.8].map((x) => x * 0.35) }); g.add(pointsOf(ln, 1, uPR)); // 虚线：压缩的距离
    starPts(a, r, 700, 34, 22, 14, BLUEW, 0.5); const pts = pointsOf(a, 1, uPR); pts.userData.still = true; g.add(pts);
    g.userData.zoom = [{ p: third, s: 4 }];
    g.userData.labels.push({ p: V(0, 2.4, 0), text: '内侧吸积双星（黑洞＋伴星，6.47 天一圈）——点击进入近景', go: 'cel.v404-binary', color: '#ffd28a' }, { p: third.clone().multiplyScalar(0.5).add(V(0, 2.6, 0)), text: '距离按对数压缩显示：真实至少约 3,500 AU，约为内双星轨道的 2 万倍以上', k: 'minor' });
    hudNote(g, 'V404 Cygni：位于银河系，约 2.39 kpc（约 7,800 光年）；内双星＋远处第三恒星的层级三星系统；黑洞约 9 个太阳质量', '这里的两个距离尺度差异巨大，所以用压缩距离示意；内双星的真实细节见近景；恒星与黑洞为位置标记');
    return g;
  }

  // —— V404 Cygni：内侧吸积双星近景（Roche 变形的伴星、L1 溢流、弯曲的物质流、盘缘撞击热点、2015 年爆发回放）——
  function buildV404Near(uPR) {
    const g = nebG(72, [1.0, 0.1, 0]), r = rng(4040), A = 70, MU = 0.0698, P = BH_PARAMS.v404, bh = bhQuad(g, P), RL = 0.19 * A;
    // L1：受限三体问题（单位 a=1，质量比 μ）在两星之间的平衡点
    const f = (x) => x - ((1 - MU) * (x + MU)) / Math.abs(x + MU) ** 3 - (MU * (x - 1 + MU)) / Math.abs(x - 1 + MU) ** 3; let lo = -MU + 0.2, hi = 1 - MU - 0.05; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; f(m) * f(lo) <= 0 ? (hi = m) : (lo = m); } const XL1 = (lo + hi) / 2;
    const acc = (x, y, vx, vy) => { const r1 = Math.hypot(x + MU, y), r2 = Math.hypot(x - 1 + MU, y); return [2 * vy + x - ((1 - MU) * (x + MU)) / r1 ** 3 - (MU * (x - 1 + MU)) / r2 ** 3, -2 * vx + y - ((1 - MU) * y) / r1 ** 3 - (MU * y) / r2 ** 3]; };
    const NS = 520, TL = 170, traj = new Float32Array(NS * TL * 2), imp = [], len = new Int16Array(NS); // 每个粒子的旋转系轨迹
    for (let p = 0; p < NS; p++) {
      let x = XL1 - 0.004, y = gauss(r) * 0.004, vx = -0.035 - 0.02 * r(), vy = gauss(r) * 0.012, n = 0, last = [x, y];
      for (let step = 0; step < 6000 && n < TL; step++) { const h = 0.004, k1 = acc(x, y, vx, vy); vx += h * k1[0]; vy += h * k1[1]; x += h * vx; y += h * vy; last = [x, y]; if (step % 8 === 0) { traj[(p * TL + n) * 2] = x; traj[(p * TL + n) * 2 + 1] = y; n++; } if (Math.hypot(x + MU, y) < 0.3) break; }
      len[p] = Math.max(8, n); for (; n < TL; n++) { traj[(p * TL + n) * 2] = last[0]; traj[(p * TL + n) * 2 + 1] = last[1]; } imp.push(last);
    }
    const ia = imp.reduce((s, q) => s + Math.atan2(q[1], q[0] + MU), 0) / NS; // 撞击点相对黑洞的方位（旋转系）
    // 伴星：被 Roche 瓣包住、朝黑洞一侧被拉成泪滴；表面颗粒与温度结构；临边昏暗
    const tip = ((1 - MU - XL1) * A) / RL; // L1 到伴星中心的距离（以伴星半径为单位）
    const donor = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), smat(`${NOISE} uniform float uTip; varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ float t=max(-position.x,0.); vec3 p=position; p.x*=1.+(uTip-1.)*t*t*t; p.yz*=1.-.12*t*t; vP=position; vec4 mv=modelViewMatrix*vec4(p,1.); vN=normalize(normalMatrix*normal); vV=-mv.xyz; gl_Position=projectionMatrix*mv; }`,
      `${NOISE} varying vec3 vN; varying vec3 vV; varying vec3 vP; uniform float uTime; uniform float uA; void main(){ vec3 n=normalize(vN), v=normalize(vV); float mu=max(dot(n,v),0.), ld=1.-.62*(1.-mu); float gr=fbm(vP*9.+uTime*.02), sp=fbm(vP*3.+4.); vec3 c=mix(vec3(1.,.5,.18),vec3(1.,.82,.45),gr); c*=1.-.35*smoothstep(.55,.8,sp); c=mix(c,vec3(1.,.85,.55),smoothstep(.55,1.,-vP.x)*.5); gl_FragColor=vec4(c*ld*.62,uA); }`, { uTip: { value: tip } }));
    donor.scale.setScalar(RL); g.add(donor); const dgl = glow([1, 0.65, 0.3], 2.6, RL * 3.2); dgl.material.uniforms.uCol.value.multiplyScalar(0.28); g.add(dgl);
    // 物质流粒子：沿预先积分的轨迹循环（三层：暗橙主体、内部亮细流、少量微光点）
    const NP = NS, pa = []; for (let i = 0; i < NP; i++) pa.push({ p: [0, 0, 0], s: i % 5 === 0 ? 1.5 : 0.95, c: i % 5 === 0 ? [1, 0.8, 0.5] : [0.7, 0.32, 0.12] }); const stream = pointsOf(pa, 1, uPR); stream.userData.still = true; g.add(stream);
    const off = Array.from({ length: NP }, () => r());
    // 2015 年爆发回放（示意）：内盘增亮、喷流亮结沿发射方向弹道运动（离开基部的物质不再随喷流轴转动）
    const NJ = 80, ja = []; for (let i = 0; i < NJ; i++) ja.push({ p: [0, 0, 0], s: 1.2, c: [0.8, 0.9, 1] }); const jetP = pointsOf(ja, 1, uPR); jetP.userData.still = true; jetP.visible = false; g.add(jetP);
    const jd = Array.from({ length: NJ }, (_, i) => ({ t0: i * 0.5, ph: i * 0.37 + gauss(r) * 0.1, sgn: i % 4 === 0 ? -1 : 1 }));
    g.userData.zoom = [{ p: V(A * (1 - MU), 0, 0), s: 3.2 }, { p: V(-A * MU, 0, 0), s: 4 }];
    g.userData.labels.push({ p: V(A * (1 - MU), -RL * 1.4, 0), text: '伴星（暖金橙，被 Roche 瓣包住，朝黑洞一侧溢流）', zoom: 0 }, { p: V(-A * MU, -9, 0), text: '黑洞（约 9 个太阳质量）与吸积盘', zoom: 1 }, { p: V(A * 0.45, 8, 0), text: '物质转移流（L1 溢流、有角动量的弯曲流束）', k: 'minor' });
    hudNote(g, 'V404 Cygni 内双星：轨道周期 6.47 天（正常档约 30 秒一圈）；黑洞与盘相对轨道被放大显示，伴星按 Roche 瓣几何画出', '物质流由受限三体问题积分得到；盘与热点为艺术化示意；2015 年爆发回放（点击黑洞上方的按钮）是示意，不是真实光变');
    g.userData.labels.push({ hud: [0.66, 0.89], text: '', dyn: () => (burst ? '2015 年爆发回放（示意）：内盘增亮、喷流亮结沿发射方向传播，随后逐渐减弱' : ''), when: () => !!burst });
    let phase = 0, prev = null, b0 = null, wasBurst = false, burst = false;
    g.userData.labels.push({ p: V(-A * MU, 13, 0), text: '', dyn: () => (burst ? '■ 结束爆发回放' : '▶ 2015 年爆发回放（示意）'), toggle: () => { burst = !burst; }, color: '#9fd0ff' });
    g.userData.tick = (t, w) => {
      const dt = prev === null ? 0 : Math.min(0.1, t - prev); prev = t; const rate = SIM_RATE[SIM.speed] ?? 1; phase += (TAU / 30) * rate * dt;
      const ph = phase, c = Math.cos(ph), s = Math.sin(ph), rotXZ = (X, Y, k = 1) => V((X * c - Y * s) * k, 0, (X * s + Y * c) * k);
      const bhp = rotXZ(-MU, 0, A), dp = rotXZ(1 - MU, 0, A); donor.position.copy(dp); donor.rotation.y = -ph; dgl.position.copy(dp);
      bh.step(1.6, bhp);
      // 物质流粒子在旋转系里沿轨迹运动，再转到惯性系
      const pos = stream.geometry.attributes.position, col = stream.geometry.attributes.aC; for (let i = 0; i < NP; i++) { const u = (off[i] + (t * 0.06 * Math.max(rate, 0.0001))) % 1, k = Math.min(len[i] - 1, Math.floor(u * len[i])), X = traj[(i * TL + k) * 2], Y = traj[(i * TL + k) * 2 + 1], q = rotXZ(X, Y, A); pos.setXYZ(i, q.x, 0.4 * Math.sin(i * 12.9), q.z); const hot = u > 0.8 ? 1 + (u - 0.8) * 7 : 1, fade = Math.min(1, u * 8) * (1 - Math.max(0, u - 0.97) * 30); const base = i % 5 === 0 ? [1, 0.8, 0.5] : [0.7, 0.32, 0.12]; col.setXYZ(i, base[0] * hot * fade, base[1] * hot * fade, base[2] * hot * fade); } pos.needsUpdate = true; col.needsUpdate = true;
      bh.U.uSpotAz.value = ph + ia; bh.U.uSpotR.value = 12; bh.U.uSpotK.value = 1.5; // 盘缘撞击热点（与流束撞击点同方位）
      // 爆发回放
      if (burst && !wasBurst) b0 = t; wasBurst = burst; let I = 0; if (burst) { const tt = t - b0; I = tt < 6 ? tt / 6 : Math.exp(-(tt - 6) / 22); }
      bh.U.uDiskK.value = 1 + 2.4 * I; jetP.visible = burst && I > 0.02;
      if (jetP.visible) { const tt = t - b0, ja2 = jetP.geometry.attributes.position, jc = jetP.geometry.attributes.aC; for (let i = 0; i < NJ; i++) { const d = jd[i], age = tt - d.t0, ok = age > 0 && age < 9; const al = 0.26 + 0.1 * Math.sin(tt * 0.2), pre = tt * 0.0 + d.t0 * 0.12, dir = V(Math.sin(al) * Math.cos(pre + d.ph * 0.1), d.sgn * Math.cos(al), Math.sin(al) * Math.sin(pre + d.ph * 0.1)).normalize(), L = ok ? age * 9 : 0; // 方向在发射时刻确定，之后沿该方向运动
          ja2.setXYZ(i, bhp.x + dir.x * L, dir.y * L, bhp.z + dir.z * L); const k = ok ? (1 - age / 9) * I * (d.sgn > 0 ? 1 : 0.25) : 0; jc.setXYZ(i, 0.8 * k, 0.9 * k, k); } ja2.needsUpdate = true; jc.needsUpdate = true; }
    };
    return g;
  }

  // —— AT2019qiz：潮汐瓦解事件的历史重建（数值积分，预先算好帧，时间轴可拖动、可倒退重放）——
  const QIZ_STAGES = ['恒星接近', '潮汐拉伸', '物质瓦解', '回落与碰撞', '辐射与气体外流', '衰减'], QIZ_EDGE = [0, 0.18, 0.3, 0.45, 0.7, 0.88, 1];
  // 时间轴 → 物理时间（任意标度）：接近 0–400；近心点约 492；之后按阶段几何增长
  const QIZ_TP = [0, 400, 560, 3000, 60000, 200000, 500000];
  const qizT = (u) => { let k = 0; while (k < 5 && u > QIZ_EDGE[k + 1]) k++; const f = (u - QIZ_EDGE[k]) / (QIZ_EDGE[k + 1] - QIZ_EDGE[k]), a = QIZ_TP[k], b = QIZ_TP[k + 1]; return k <= 1 ? a + (b - a) * f : a * Math.pow(b / a, f); };
  function qizSim() {
    const N = 1400, GM = 0.5, RS = 1, Rst = 0.23, mstar = 1e-6 * GM, rp = 15, r0 = 120, FR = 361, F = new Float32Array(FR * N * 3), ex = new Float32Array(FR), r = rng(2019);
    const pw = (x, y, z) => { const R = Math.hypot(x, y, z), k = -GM / ((R - RS) * (R - RS) * R); return [x * k, y * k, z * k]; };
    const nu0 = -Math.acos((2 * rp) / r0 - 1), R0 = (2 * rp) / (1 + Math.cos(nu0)), h = Math.sqrt(2 * GM * rp), vt = h / R0, vr = -Math.sqrt(Math.max(0, (2 * GM) / R0 - vt * vt));
    const cx0 = R0 * Math.cos(nu0), cz0 = R0 * Math.sin(nu0), rx = cx0 / R0, rz = cz0 / R0, tx = -rz, tz = rx;
    const X = new Float64Array(N * 3), Vv = new Float64Array(N * 3), D = new Float64Array(N * 3), cap = new Uint8Array(N);
    for (let i = 0; i < N; i++) { const d = V(gauss(r), gauss(r), gauss(r)); const L = i ? Rst * Math.cbrt(r()) : 0; d.normalize().multiplyScalar(L); D[i * 3] = d.x; D[i * 3 + 1] = d.y; D[i * 3 + 2] = d.z; X[i * 3] = cx0 + d.x; X[i * 3 + 1] = d.y; X[i * 3 + 2] = cz0 + d.z; Vv[i * 3] = vr * rx + vt * tx; Vv[i * 3 + 2] = vr * rz + vt * tz; }
    let t = 0; const accel = (i, out) => { const [ax, ay, az] = pw(X[i * 3], X[i * 3 + 1], X[i * 3 + 2]); const cx = X[0], cy = X[1], cz = X[2], dx = X[i * 3] - cx, dy = X[i * 3 + 1] - cy, dz = X[i * 3 + 2] - cz, dd = Math.hypot(dx, dy, dz), k = i ? (dd < Rst ? -mstar / (Rst ** 3) : -mstar / (dd * dd * dd || 1)) : 0; out[0] = ax + dx * k; out[1] = ay + dy * k; out[2] = az + dz * k; };
    const tmp = [0, 0, 0]; let fr = 0;
    for (; fr < FR; fr++) {
      const target = qizT(fr / (FR - 1));
      while (t < target) { const rc = Math.hypot(X[0], X[1], X[2]), dt = Math.min(target - t, Math.max(0.05, Math.min(0.012 * Math.pow(Math.max(rc, 2), 1.5), 600)));
        for (let i = 0; i < N; i++) { if (cap[i]) continue; accel(i, tmp); Vv[i * 3] += 0.5 * dt * tmp[0]; Vv[i * 3 + 1] += 0.5 * dt * tmp[1]; Vv[i * 3 + 2] += 0.5 * dt * tmp[2]; X[i * 3] += dt * Vv[i * 3]; X[i * 3 + 1] += dt * Vv[i * 3 + 1]; X[i * 3 + 2] += dt * Vv[i * 3 + 2]; }
        for (let i = 0; i < N; i++) { if (cap[i]) continue; accel(i, tmp); Vv[i * 3] += 0.5 * dt * tmp[0]; Vv[i * 3 + 1] += 0.5 * dt * tmp[1]; Vv[i * 3 + 2] += 0.5 * dt * tmp[2]; if (Math.hypot(X[i * 3], X[i * 3 + 1], X[i * 3 + 2]) < 1.6) { cap[i] = 1; X[i * 3] = X[i * 3 + 1] = X[i * 3 + 2] = 0; } }
        t += dt; }
      const rs = []; for (let i = 0; i < N; i++) { F[(fr * N + i) * 3] = X[i * 3]; F[(fr * N + i) * 3 + 1] = X[i * 3 + 1]; F[(fr * N + i) * 3 + 2] = X[i * 3 + 2]; if (!cap[i]) rs.push(Math.hypot(X[i * 3], X[i * 3 + 1], X[i * 3 + 2])); }
      rs.sort((a, b) => a - b); ex[fr] = rs.length ? rs[Math.floor(rs.length * 0.9)] : 20;
    }
    let bound = 0; for (let i = 0; i < N; i++) { const R = Math.hypot(X[i * 3], X[i * 3 + 1], X[i * 3 + 2]), v2 = Vv[i * 3] ** 2 + Vv[i * 3 + 1] ** 2 + Vv[i * 3 + 2] ** 2; if (!cap[i] && v2 / 2 - GM / Math.max(R - RS, 1) < 0) bound++; }
    return { N, FR, F, ex, bound, cap };
  }
  function buildTDE(uPR) {
    const g = nebG(55, [0.45, 0.25, 0]), r = rng(20191), P = BH_PARAMS.tde, bh = bhQuad(g, P), inner = new THREE.Group(); g.add(inner);
    const S = qizSim(), N = S.N, pa = []; for (let i = 0; i < N; i++) pa.push({ p: [0, 0, 0], s: 0.9, c: [1, 0.8, 0.5] }); const debris = pointsOf(pa, 1, uPR); debris.userData.still = true; inner.add(debris);
    const NO = 420, oa = []; for (let i = 0; i < NO; i++) oa.push({ p: [0, 0, 0], s: 0.9, c: [1, 0.7, 0.4] }); const outflow = pointsOf(oa, 1, uPR); outflow.userData.still = true; inner.add(outflow);
    const od = Array.from({ length: NO }, () => { const d = V(gauss(r), gauss(r) * 0.7, gauss(r)).normalize(); return { d, v: 0.4 + 0.6 * r(), t0: 0.45 + 0.2 * r() }; });
    const sg = glow([1, 0.85, 0.6], 2.6, 4); sg.material.uniforms.uCol.value.multiplyScalar(0.5); inner.add(sg); const hg = glow([1, 0.9, 0.7], 2.6, 10); inner.add(hg);
    const a = []; starPts(a, r, 800, 140, 90, 60, BLUEW, 0.4); const bgp = pointsOf(a, 1, uPR); bgp.userData.still = true; g.add(bgp);
    // 时间轴界面（滑块＋播放）
    let ui = hasEl('qizTl'); if (!ui) { ui = document.createElement('div'); ui.id = 'qizTl'; Object.assign(ui.style, { position: 'fixed', left: '50%', top: '58px', transform: 'translateX(-50%)', zIndex: 5, display: 'none', alignItems: 'center', gap: '10px', padding: '6px 12px', borderRadius: '10px', background: 'rgba(10,14,30,.6)', border: '1px solid rgba(214,182,120,.3)', color: '#dbe6ff', font: '12px sans-serif' }); ui.innerHTML = '<button id="qizPlay" style="all:unset;cursor:pointer;padding:0 6px">⏸</button><input id="qizRng" type="range" min="0" max="1000" value="0" style="width:340px"><span id="qizStage" style="min-width:96px"></span>'; document.body.appendChild(ui); }
    const rng2 = ui.querySelector('#qizRng'), playB = ui.querySelector('#qizPlay'), stageT = ui.querySelector('#qizStage'); let tl = 0, playing = true, prev = null, dragging = false, lastZ = -2;
    rng2.oninput = () => { tl = rng2.value / 1000; playing = false; playB.textContent = '▶'; }; playB.onclick = () => { if (tl >= 0.999) tl = 0; playing = !playing; playB.textContent = playing ? '⏸' : '▶'; };
    const stageOf = (u) => { let k = 0; while (k < 5 && u >= QIZ_EDGE[k + 1]) k++; return k; };
    const dyn = () => '阶段 ' + (stageOf(tl) + 1) + '／6：' + QIZ_STAGES[stageOf(tl)];
    g.userData.zoom = QIZ_STAGES.map(() => ({ p: V(0, 0, 0), s: 1 }));
    g.userData.labels.push({ hud: [0.66, 0.89], text: '', dyn }, { p: V(0, -6, 0), text: '中央黑洞（约 100 万太阳质量量级）', k: 'minor' });
    hudNote(g, 'AT2019qiz：历史事件的科学重建（2019 年 9 月发现，宿主星系约 65.6 Mpc 外）；这是独立的历史回放，不改变宇宙当前时间；阶段比例只用于播放控制', '轨迹由预先积分的受力模型给出（含近似的黑洞引力）；辐射、外流与亮度曲线是示意；具体瓦解程度依研究模型而定');
    g.userData.tick = (t, w) => {
      const dt = prev === null ? 0 : Math.min(0.1, t - prev); prev = t; ui.style.display = w > 0.5 ? 'flex' : 'none';
      if (NAV.cur === 'cel.at2019qiz' && NAV.zsel !== lastZ) { lastZ = NAV.zsel; if (NAV.zsel >= 0) { tl = QIZ_EDGE[NAV.zsel] + 0.001; playing = false; playB.textContent = '▶'; } }
      if (playing && !dragging) { tl = Math.min(1, tl + dt / 70); if (tl >= 1) { playing = false; playB.textContent = '▶'; } } rng2.value = Math.round(tl * 1000); stageT.textContent = dyn();
      const fpos = tl * (S.FR - 1), k0 = Math.floor(fpos), k1 = Math.min(S.FR - 1, k0 + 1), f = fpos - k0, pos = debris.geometry.attributes.position, col = debris.geometry.attributes.aC, c0 = k0 * N * 3, c1 = k1 * N * 3, cx = S.F[c0] + (S.F[c1] - S.F[c0]) * f, cy = S.F[c0 + 1] + (S.F[c1 + 1] - S.F[c0 + 1]) * f, cz = S.F[c0 + 2] + (S.F[c1 + 2] - S.F[c0 + 2]) * f; // 恒星中心
      const mapR = (v) => { const R = v.length(); if (R > 20) v.multiplyScalar((20 + 25 * Math.log(1 + (R - 20) / 25)) / R); return v; }, tv = V(0, 0, 0); // 大半径对数压缩显示
      const KX = 7; // 恒星尺寸显示放大约 7 倍（近处放大，远处逐渐回到真实比例）
      for (let i = 0; i < N; i++) { const a0 = (k0 * N + i) * 3, a1 = (k1 * N + i) * 3, x = S.F[a0] + (S.F[a1] - S.F[a0]) * f, y = S.F[a0 + 1] + (S.F[a1 + 1] - S.F[a0 + 1]) * f, z = S.F[a0 + 2] + (S.F[a1 + 2] - S.F[a0 + 2]) * f; const ddx = x - cx, ddy = y - cy, ddz = z - cz, am = 1 + (KX - 1) / (1 + Math.hypot(ddx, ddy, ddz) / 6); tv.set(cx + ddx * am, cy + ddy * am, cz + ddz * am); mapR(tv); pos.setXYZ(i, tv.x, tv.y, tv.z); const R = Math.hypot(x, y, z), hot = Math.min(1.6, 14 / Math.max(R, 3)), cool = Math.min(1, tl > 0.88 ? 1 - (tl - 0.88) * 3 : 1), vis = S.cap[i] ? 0 : 1; // 越靠近黑洞越热；晚期冷却成深红褐
        const cr = R < 30 ? [1, 0.9, 0.7] : tl > 0.7 ? [0.8, 0.32, 0.14] : [1, 0.6, 0.25]; col.setXYZ(i, cr[0] * hot * 0.95 * vis * cool, cr[1] * hot * 0.95 * vis * cool, cr[2] * hot * 0.95 * vis * cool); }
      pos.needsUpdate = true; col.needsUpdate = true;
      const E = S.ex[k0] + (S.ex[k1] - S.ex[k0]) * f, sc = Math.min(1, 100 / Math.max(100, E * 1.1)), L = tl < 0.45 ? 0.02 : tl < 0.75 ? 0.02 + 0.98 * ((tl - 0.45) / 0.3) ** 1.5 : Math.max(0.08, Math.exp(-(tl - 0.75) * 6)); inner.scale.setScalar(1);
      sg.position.copy(mapR(tv.set(cx, cy, cz))); sg.scale.setScalar(tl < 0.3 ? 4 : 4 * Math.max(0.2, 1 - (tl - 0.3) * 4)); sg.material.uniforms.uCol.value.setRGB(1, 0.85, 0.6).multiplyScalar(tl < 0.3 ? 0.5 : 0.1); // 恒星起初完整发光，瓦解后不再是一个球
      hg.material.uniforms.uCol.value.setRGB(1, 0.88, 0.65).multiplyScalar(0.4 * L); hg.scale.setScalar(14 + 22 * L);
      const op = outflow.geometry.attributes.position, oc = outflow.geometry.attributes.aC; for (let i = 0; i < NO; i++) { const d = od[i], p = Math.max(0, (tl - d.t0) / (1 - d.t0)), rr = 6 + 38 * Math.pow(p, 0.6) * d.v, k = p > 0 ? Math.min(1, p * 4) * (1 - 0.5 * p) * (tl < 0.88 ? 1 : Math.max(0.2, 1 - (tl - 0.88) * 5)) : 0; op.setXYZ(i, d.d.x * rr, d.d.y * rr, d.d.z * rr); oc.setXYZ(i, 0.8 * k, 0.6 * k, 0.4 * k); } op.needsUpdate = true; oc.needsUpdate = true; // 外流：示意（速度量级约 1 万公里每秒，显示距离被压缩）
      bh.U.uDiskK.value = tl < 0.45 ? 0.02 : Math.min(1, 0.02 + (tl - 0.45) * 3.6) * (tl > 0.78 ? Math.max(0.3, 1 - (tl - 0.78) * 3) : 1);
      bh.step(1);
    };
    return g;
  }

  // —— AT2019qiz 的宿主星系（棒旋）与中央黑洞（安静的黑洞，较弱的盘）——
  function buildQizHost(uPR) {
    const g = nebG(6, [0.5, 0.25, 0]), r = rng(4463), a = [];
    const q = spiralGal(a, r, V(0, 0, 0), 2.6, { arms: 2, pitch: 0.34, tilt: 0.75, pa: 0.4, n: 9000, bulge: 0.14, knots: 0.06 });
    for (let i = 0; i < 2600; i++) { const p = V(gauss(r) * 1.0, gauss(r) * 0.12, gauss(r) * 0.28).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.7, 0))).applyQuaternion(q); a.push({ p: p.toArray(), s: 0.25 + r() * 0.4, c: [1, 0.84, 0.6].map((x) => x * (0.18 + 0.3 * r())) }); } // 棒
    g.add(pointsOf(a, 1.05, uPR)); const gl = glow([1, 0.88, 0.65], 2.4, 1.6); gl.material.uniforms.uCol.value.multiplyScalar(0.2); g.add(gl);
    g.userData.zoom = [{ p: V(0, 0, 0), s: 3 }];
    g.userData.labels.push({ p: V(0, -2.5, 0), text: '2MASX J04463790−1013349 · 棒旋星系 · 约 65.6 Mpc（约 2.1 亿光年）' }, { p: V(0, 0.5, 0), text: '星系中心区域（点击放大）', zoom: 0 }, { p: V(0, -0.4, 0), text: '中央黑洞（点击进入）', go: 'cel.qiz-smbh', lvl: [1], color: '#ffd28a' }, { p: V(0.3, 0.8, 0), text: 'AT2019qiz（历史事件，点击进入重建）', go: 'cel.at2019qiz', lvl: [1], color: '#ffd28a' });
    hudNote(g, '宿主星系形态为程序化示意（棒旋）；位置与距离为文献近似值；事件发生在星系中心附近，是 2019 年的历史事件'); return g;
  }
  function buildQizBH(uPR) { // 宿主星系的中央黑洞：安静时只有较弱的盘
    const g = nebG(30, [0.5, 0.2, 0]), P = BH_PARAMS.tde, bh = bhQuad(g, P); bh.U.uDiskK.value = 0.25; const r = rng(7), a = []; starPts(a, r, 1500, 40, 30, 25, BLUEW, 0.5); const pts = pointsOf(a, 1, uPR); pts.userData.still = true; g.add(pts);
    g.userData.labels.push({ hud: [0.66, 0.97], text: '中央黑洞：安静状态（盘很弱）；近似光线追踪（忽略自旋）；质量约 100 万太阳质量量级（估计）' }, { hud: [0.66, 0.935], text: '在 AT2019qiz 事件里，一颗恒星被它撕开——点击上级星系里的“AT2019qiz”进入历史重建' });
    g.userData.tick = () => bh.step(1); return g;
  }

  return { setRenderer, webObservable, buildVirgo, buildComplex, planetSystem, moonBody, buildBelt, buildBlackHole, buildV404Pano, buildV404Near, buildTDE, buildQizHost, buildQizBH, buildSupercluster, buildLaniakea, buildGalaxyPair, buildSombrero, buildVoid, buildPillars, buildM16, buildM42, buildHorsehead, buildM8, buildM20, buildCarina, buildTarantula, buildCrab, buildVeil, buildHelix, buildMulti, MULTI_SPECS, buildLocalGroup, buildOrionArm, decorateHood, decorateBubble, decorateOrion, decorateGalaxy, BUBBLE_FS, SYS, MOONS };
}
