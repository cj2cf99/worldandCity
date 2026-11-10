// 宇宙系的专题模型：太阳系内的行星／卫星／小行星带／彗星、重做的本超星系团与拉尼亚凯亚，以及可观测宇宙层的彩蛋。
// 由 cosmos.js 注入共用的着色器与几何助手（避免循环依赖）。天体走写实风格；距离与比例以画面表现优先。
export function createModels(kit) {
  const { THREE, V, TAU, rng, gauss, ease, NOISE, SPHERE_VS, ATMO_FS, SUN_FS, RING_VS, RING_FS, POINTS_VS, POINTS_FS, smat, sphereMat, sphere, circle, lineMat, pointsOf, glow, blob, PLANETS } = kit;

  // ---------------- 通用天体表面着色器（行星／卫星／小天体的“表面图像级”程序纹理）----------------
  const SURF_FS = /* glsl */ `${NOISE}
varying vec3 vP; varying vec3 vN; varying vec3 vV; varying vec3 vL;
uniform float uType; uniform vec3 uRim; uniform float uTime; uniform float uA;
float ridge(vec3 p){ return 1.-abs(2.*fbm(p)-1.); }
float spot(vec3 p, vec3 c, vec2 sz){ float a=atan(p.z,p.x), ac=atan(c.z,c.x); float dl=atan(sin(a-ac),cos(a-ac)); return smoothstep(1.,.35,length(vec2(dl/sz.x,(p.y-c.y)/sz.y))); }
void main(){
  vec3 p=normalize(vP), n=normalize(vN), v=normalize(vV), L=normalize(vL);
  int t=int(uType+.5); vec3 col=vec3(.5);
  if(t==0){ float c=crater(p*2.5)*.7+crater(p*7.)*.4+crater(p*20.)*.2; col=vec3(.46,.43,.4)*(1.+c*.9)*(.85+.3*fbm(p*8.)); }
  else if(t==1){ vec3 q=p*3.; q+=fbm(q*2.+uTime*.01)*1.4; float k=fbm(q*1.6+vec3(uTime*.015,0.,0.)); col=mix(vec3(.84,.68,.4),vec3(.99,.92,.72),k)*(.92+.16*sin(p.y*40.+k*8.)); }
  else if(t==2){ float land=fbm(p*3.+2.); col=mix(vec3(.56,.25,.12),vec3(.84,.52,.3),fbm(p*6.)); col=mix(col,vec3(.3,.15,.1),smoothstep(.52,.66,land)*.75);
    float cr=crater(p*5.)*.3+crater(p*14.)*.18; col*=1.+cr;
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
    float c=crater(p*6.); col*=1.+c*.5; col+=smoothstep(-.4,-.9,c)*.18; }
  else if(t==10){ col=vec3(.24,.2,.17)*(1.+crater(p*4.)*.7+crater(p*12.)*.45); col+=smoothstep(-.5,-1.,crater(p*5.))*.25; }
  else if(t==11){ col=mix(vec3(.82,.5,.14),vec3(.96,.72,.32),fbm(p*2.)); col*=.94+.1*sin(p.y*12.+fbm(p*3.)*2.); }
  else if(t==12){ col=vec3(.95,.97,1.)*(.92+.08*fbm(p*10.)); float s=smoothstep(.9,1.,ridge(vec3(p.x*6.,p.y*2.,p.z*6.)))*smoothstep(-.55,-.85,p.y); col=mix(col,vec3(.5,.78,.95),s); col*=1.+crater(p*8.)*.18; }
  else if(t==13){ col=mix(vec3(.84,.74,.68),vec3(.68,.76,.8),fbm(p*3.)); col*=1.+crater(p*10.)*.12; col=mix(col,vec3(.97,.82,.8),smoothstep(-.35,-.8,p.y)); }
  else if(t==14){ col=vec3(.3,.28,.26)*(1.+crater(p*3.)*.8+crater(p*9.)*.5)*(.8+.4*fbm(p*12.)); }
  else { col=vec3(.44,.42,.4)*(1.+crater(p*4.)*.6+crater(p*11.)*.4); col=mix(col,vec3(.99),smoothstep(.09,.0,distance(p,normalize(vec3(.5,.45,.6)))));
    col=mix(col,vec3(.95),smoothstep(.04,.0,distance(p,normalize(vec3(.4,.5,.7))))*.8); }
  float d=max(dot(n,L),0.);
  col*=.09+1.1*pow(d,.85);
  col+=uRim*pow(1.-max(dot(n,v),0.),3.)*(.35+d);
  gl_FragColor=vec4(col,uA);
}`;
  const SUN_DIR = V(-40, 10, 30);
  const surfMat = (type, rim = [0, 0, 0]) => sphereMat(SURF_FS, SUN_DIR, { uType: { value: type }, uRim: { value: new THREE.Color(...rim) } });
  const atmoMat = (col) => smat(SPHERE_VS, ATMO_FS, { uSunW: { value: SUN_DIR }, uCol: { value: new THREE.Color(...col) } }, { side: THREE.BackSide, blending: THREE.AdditiveBlending });
  const ringMat = (inR, outR) => smat(RING_VS, RING_FS, { uIn: { value: inR }, uOut: { value: outR } }, { side: THREE.DoubleSide });

  // ---------------- 行星系统：行星 + 卫星 + 光环 ----------------
  function planetSystem(o) {
    const g = new THREE.Group(), tilt = new THREE.Group(); tilt.rotation.z = o.tilt || 0; g.add(tilt);
    const body = sphere(o.R, surfMat(o.type, o.rim), 128); tilt.add(body);
    if (o.atmo) g.add(new THREE.Mesh(new THREE.SphereGeometry(o.R * 1.07, 64, 32), atmoMat(o.atmo)));
    if (o.ring) { const rg = new THREE.RingGeometry(o.R * o.ring[0], o.R * o.ring[1], 160); rg.rotateX(-Math.PI / 2); const rm = new THREE.Mesh(rg, ringMat(o.R * o.ring[0], o.R * o.ring[1])); rm.rotation.z = o.ringTilt ?? 0.45; g.add(rm); }
    if (o.thin) for (const f of [1.55, 1.7, 1.85, 2.0]) { const l = new THREE.LineLoop(circle(o.R * f, 160), lineMat(0xdfe8ea, 0.25)); l.rotation.z = o.tilt || 0; g.add(l); }
    const labs = [{ p: V(0, -o.R - 0.35, 0), text: o.name }], moons = [];
    for (const m of o.moons || []) {
      g.add(new THREE.LineLoop(circle(m.a, 128), lineMat(0xffd28a, 0.22)));
      const mesh = sphere(m.r, surfMat(m.type), 64); if (m.shape) mesh.scale.set(...m.shape);
      const lb = { p: V(0, 0, 0), text: m.name }; labs.push(lb); g.add(mesh); moons.push({ mesh, m, lb, ph: Math.random() * TAU });
    }
    g.userData.labels = labs;
    g.userData.tick = (t) => {
      body.rotation.y = t * 0.06;
      for (const s of moons) { const ang = s.ph + (TAU / s.m.p) * t * 0.9; s.mesh.position.set(Math.cos(ang) * s.m.a, 0, -Math.sin(ang) * s.m.a); s.mesh.rotation.y = -ang; s.lb.p.set(s.mesh.position.x, -s.m.r - 0.22, s.mesh.position.z); }
    };
    return g;
  }
  const SYS = {
    'cel.mercury': { name: '水星', R: 1.2, type: 0 },
    'cel.venus': { name: '金星', R: 1.25, type: 1, rim: [0.95, 0.8, 0.45], atmo: [1, 0.8, 0.45] },
    'cel.mars': { name: '火星', R: 1.0, type: 2, rim: [0.9, 0.5, 0.3], atmo: [0.9, 0.55, 0.35], moons: [{ name: '火卫一', type: 14, r: 0.12, a: 1.9, p: 3, shape: [1.3, 0.95, 1.05] }, { name: '火卫二', type: 14, r: 0.08, a: 2.9, p: 8, shape: [1.2, 0.95, 1] }] },
    'cel.jupiter': { name: '木星', R: 1.8, type: 3, rim: [0.8, 0.65, 0.5], moons: [{ name: '木卫一', type: 7, r: 0.2, a: 3.0, p: 5 }, { name: '木卫二', type: 8, r: 0.17, a: 3.8, p: 8 }, { name: '木卫三', type: 9, r: 0.27, a: 4.9, p: 14 }, { name: '木卫四', type: 10, r: 0.25, a: 6.2, p: 24 }] },
    'cel.saturn': { name: '土星', R: 1.4, type: 4, rim: [0.9, 0.8, 0.55], ring: [1.35, 2.4], moons: [{ name: '土卫二', type: 12, r: 0.1, a: 3.9, p: 7 }, { name: '土卫六', type: 11, r: 0.25, a: 5.2, p: 16 }] },
    'cel.uranus': { name: '天王星', R: 1.15, type: 5, rim: [0.5, 0.85, 0.9], atmo: [0.5, 0.85, 0.9], tilt: 1.71, thin: true },
    'cel.neptune': { name: '海王星', R: 1.15, type: 6, rim: [0.3, 0.5, 1], atmo: [0.3, 0.5, 1], moons: [{ name: '海卫一', type: 13, r: 0.22, a: 3.0, p: -9 }] },
  };
  // ---------------- 卫星／矮行星特写 ----------------
  const MOONS = {
    'cel.phobos': { name: '火卫一', type: 14, R: 1.3, scale: [1.35, 1, 1.1] }, 'cel.deimos': { name: '火卫二', type: 14, R: 1.2, scale: [1.2, 0.95, 1] },
    'cel.ceres': { name: '谷神星（矮行星）', type: 15, R: 1.45 }, 'cel.io': { name: '木卫一', type: 7, R: 1.4, plume: [1, 0.8, 0.45] },
    'cel.europa': { name: '木卫二', type: 8, R: 1.4 }, 'cel.ganymede': { name: '木卫三', type: 9, R: 1.5 }, 'cel.callisto': { name: '木卫四', type: 10, R: 1.45 },
    'cel.titan': { name: '土卫六', type: 11, R: 1.45, haze: [0.95, 0.6, 0.2] }, 'cel.enceladus': { name: '土卫二', type: 12, R: 1.3, jets: true }, 'cel.triton': { name: '海卫一', type: 13, R: 1.4 },
  };
  function moonBody(id, uPR) {
    const s = MOONS[id], g = new THREE.Group(), r = rng(id.length * 97), body = sphere(s.R, surfMat(s.type, s.haze || [0, 0, 0]), 128);
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

  // ---------------- 彗星：真实的开普勒轨道 ----------------
  // 闭合椭圆＝会飞回来；开放双曲线＝一去不返。离子尾（蓝，笔直背向太阳）与尘埃尾（黄，微弯）。
  const solveKepler = (M, e) => { let E = M; for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); return E; };
  const solveHyp = (M, e) => { let H = Math.asinh(M / e); for (let i = 0; i < 10; i++) H -= (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1); return H; };
  function cometSystem(defs, uPR, planetOrbits = true) {
    const g = new THREE.Group(), O = V(0, 0, 0), labs = [];
    g.add(sphere(0.22, smat(SPHERE_VS, SUN_FS, { uSunW: { value: O } }), 48), glow([1, 0.65, 0.25], 2.4, 1.8));
    if (planetOrbits) for (const pl of PLANETS) g.add(new THREE.LineLoop(circle(pl.a), lineMat(0xffd28a, 0.16)));
    const items = defs.map((d) => {
      const pts = [], hyp = d.e > 1, o = { ...d };
      if (!hyp) { const b = o.a * Math.sqrt(1 - o.e * o.e); for (let i = 0; i <= 400; i++) { const E = (i / 400) * TAU; pts.push(V(o.a * (Math.cos(E) - o.e), 0, b * Math.sin(E))); } }
      else { o.A = o.q / (o.e - 1); o.B = o.A * Math.sqrt(o.e * o.e - 1); const Hm = 2.3; for (let i = 0; i <= 400; i++) { const H = -Hm + (i / 400) * 2 * Hm; pts.push(V(o.A * (o.e - Math.cosh(H)), 0, o.B * Math.sinh(H))); } o.range = 2 * (o.e * Math.sinh(Hm) - Hm); }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(hyp ? 0xff7a8a : 0x9fd0ff, 0.6)));
      const head = glow([0.9, 0.97, 1], 2.2, 0.55), N = 260, pos = new Float32Array(N * 3), s = new Float32Array(N), c = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { const u = (i % 130) / 130, ion = i < 130; s[i] = 0.85 * (1 - u) + 0.15; const k = 1 - u * 0.85; (ion ? [0.45, 0.7, 1] : [1, 0.85, 0.55]).forEach((x, j) => (c[i * 3 + j] = x * k)); }
      const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); tg.setAttribute('aS', new THREE.BufferAttribute(s, 1)); tg.setAttribute('aC', new THREE.BufferAttribute(c, 3));
      const tail = new THREE.Points(tg, smat(POINTS_VS, POINTS_FS, { uPR: { value: uPR }, uSize: { value: 1.3 } }, { blending: THREE.AdditiveBlending })); tail.frustumCulled = false;
      g.add(head, tail);
      const lb = { p: V(0, 0, 0), text: d.name }; labs.push(lb, { p: d.tagAt || V(0, 0, 0), text: d.tag });
      return { o, head, tail, pos, lb, hyp, prev: V(0, 0, 0) };
    });
    g.userData.labels = labs;
    g.userData.tick = (t) => {
      for (const it of items) {
        const d = it.o; let p;
        if (!it.hyp) { const M = ((t * TAU) / d.T) % TAU, E = solveKepler(M, d.e), b = d.a * Math.sqrt(1 - d.e * d.e); p = V(d.a * (Math.cos(E) - d.e), 0, b * Math.sin(E)); }
        else { const M = ((t * d.range) / d.T % d.range) - d.range / 2, H = solveHyp(M, d.e); p = V(d.A * (d.e - Math.cosh(H)), 0, d.B * Math.sinh(H)); }
        const vel = p.clone().sub(it.prev).normalize(); it.prev.copy(p);
        const dist = Math.max(p.length(), 0.05), dir = p.clone().normalize(), L = Math.min((d.tail * 2.2) / (0.3 + dist), d.tail * 3);
        it.head.position.copy(p); it.lb.p.set(p.x, p.y - 0.4, p.z);
        for (let i = 0; i < 260; i++) {
          const ion = i < 130, u = (i % 130) / 130, jit = Math.sin(i * 12.9898 + t) * 0.5 * 0.03 * (u + 0.2);
          const q = ion ? p.clone().addScaledVector(dir, L * u) : p.clone().addScaledVector(dir, L * u * 0.8).addScaledVector(vel, -L * u * u * 0.5);
          it.pos[i * 3] = q.x + jit; it.pos[i * 3 + 1] = q.y + jit * 0.6; it.pos[i * 3 + 2] = q.z - jit;
        }
        it.tail.geometry.attributes.position.needsUpdate = true;
      }
    };
    return g;
  }
  const HALLEY = { name: '哈雷彗星', a: 4.6, e: 0.967, T: 30, tail: 0.7, tag: '会飞回来：约 76 年一圈（下次约 2061 年）', tagAt: V(-9.2, 0.2, 0) };
  const HALE = { name: '海尔-波普彗星', a: 12, e: 0.993, T: 60, tail: 0.9, tag: '会飞回来：约 2,500 年一圈', tagAt: V(-23.5, 0.2, 0) };
  const OUMU = { name: '奥陌陌', q: 0.9, e: 1.2, T: 36, tail: 0.25, tag: '一去不返：开放的双曲线轨道', tagAt: V(-9, 0.3, 11) };

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
    // 标注与缩放：层级 0＝整体，1＝区域（子团），2＝星系
    const lbl = [], zoom = [], add = (p, text, o = {}) => lbl.push({ p, text, ...o });
    [['M87 子团（Virgo A）', COMP[0][1], 2.4], ['M49 子团（Virgo B）', COMP[1][1], 1.7], ['M60 / M59 周边（C）', COMP[2][1], 1.9], ['M86 / M84 周边', COMP[3][1], 1.9]].forEach(([text, c, dy], i) => { zoom.push({ p: c, s: 4.5, lvl: 1 }); add(c.clone().add(V(0, dy, 0)), text, { zoom: i, lvl: [0, 1], color: '#ffd28a' }); });
    const BIG = ['M87', 'M49', 'M84', 'M86', 'M60', 'M100', 'M88', 'M61', 'M85', 'M59', 'M89', 'M99', 'M98', 'M90', 'M58', 'NGC 4636', 'M91', 'NGC 4535'];
    BIG.forEach((nm, i) => { const G = MEM.find((x) => x.name === nm); zoom.push({ p: G.c, s: 6.6 / G.R * 9.5 / 11, lvl: 2 }); add(G.c.clone().add(V(0, -G.R * 1.4 - 0.25, 0)), nm + (G.kind === 'E' ? '（椭圆）' : G.kind === 'S0' ? '（透镜）' : '（旋涡）'), { zoom: 4 + i, lvl: i < 2 ? [0, 1, 2] : [1, 2] }); });
    add(V(0, -10.2, 0), '细点＝矮星系统计密度样本（程序生成，深度为模拟）；亮成员位置、距离为近似值', { lvl: [0] });
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
  //  · 流域轮廓：按吸引子与结点的朝向生成的不规则面，只是示意，不是真实物理外壳，默认隐藏。
  function buildLaniakea(uPR) {
    const g = new THREE.Group(), r = rng(91), a = [], U = 9, C0 = V(-33, 16, -3);
    const S = (p) => V((p.x - C0.x) / U, (p.z - C0.z) / U, -(p.y - C0.y) / U); // 超星系坐标（Mpc）→ 场景
    const GA = [[-62, 22, -6, 1.6, '诺玛星系团一带'], [-41, 18, -8, 1.3, '半人马座星系团'], [-38, 34, -4, 1.0, '长蛇座星系团'], [-52, 4, -17, 0.9, ''], [-47, 28, -5, 0.7, ''], [-70, 8, -10, 0.8, '']].map(([x, y, z, w, name]) => ({ p: V(x, y, z), w, name }));
    const VIRGO = V(-3.4, 16.1, -0.7), SHAP = V(-150, 50, -20), REP = V(95, -35, 12);
    const ph = Array.from({ length: 4 }, () => r() * 6.3);
    const field = (p) => { const n = Math.sin(0.09 * p.x + ph[0] + 1.1 * Math.sin(0.07 * p.z + ph[1])) * Math.sin(0.08 * p.z + ph[2] + 0.9 * Math.sin(0.06 * p.x)) + 0.5 * Math.sin(0.2 * p.x + 0.17 * p.y + ph[3]); const t = Math.min(1, Math.max(0, (n + 0.55) / 0.9)); return t * t * (3 - 2 * t); };
    const add = (p, s, c, k) => a.push({ p: S(p).toArray(), s, c: c.map((x) => x * k) });
    // 结点：巨引源区的几个星系团＋室女座＋程序生成的其余结点（不以巨引源为中心辐射）
    const nodes = GA.map((n) => ({ c: n.p, w: n.w * 3.2, ga: true })); nodes.push({ c: VIRGO, w: 1.6, ga: false });
    for (let i = 0; i < 70; i++) { const p = V(C0.x + gauss(r) * 38, C0.y + gauss(r) * 26, C0.z + gauss(r) * 20), w = Math.exp(gauss(r) * 0.7); if (field(p) > 0.5 && nodes.every((n) => n.c.distanceTo(p) > 7)) nodes.push({ c: p, w, ga: false }); }
    const wmax = nodes.reduce((m, n) => Math.max(m, n.w), 0);
    nodes.forEach(({ c, w }) => { const nb = 2 + Math.floor(r() * 3 + w), n0 = Math.floor(70 + 260 * Math.min(1, w / wmax)), sg = (3 + 5 * Math.sqrt(w / wmax)); for (let b = 0; b < nb; b++) { const o = V(gauss(r), gauss(r) * 0.5, gauss(r)).multiplyScalar(0.6 * sg), sx = sg * (0.3 + r() * 0.4), sy = sx * (0.35 + r() * 0.3), sz = sg * (0.25 + r() * 0.4); for (let i = 0; i < n0 / nb * 1.6; i++) add(V(c.x + o.x + gauss(r) * sx, c.y + o.y + gauss(r) * sy, c.z + o.z + gauss(r) * sz), 0.4 + r() * 0.7, r() < 0.25 ? [1, 0.88, 0.62] : [0.72, 0.82, 1], 0.2 + r() * 0.25); } });
    // 弱纤维：结点之间按概率连接（不强行全部连通），断续
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const A = nodes[i], B = nodes[j], d = A.c.distanceTo(B.c); if (d > 45) continue; if (r() > Math.exp(-d / 20) * Math.min(1, Math.sqrt(A.w * B.w) / (0.5 * wmax) + 0.1) * 1.8) continue;
      const mid = A.c.clone().lerp(B.c, 0.5).add(V(gauss(r), gauss(r), gauss(r)).multiplyScalar(0.12 * d)), f1 = r() * 6.3;
      for (let k = 0, N = Math.floor(d * 1.6); k < N; k++) { const t = r(); if (Math.sin(t * 11 + f1) < -0.2) continue; const u = 1 - t, p = V(u * u * A.c.x + 2 * u * t * mid.x + t * t * B.c.x + gauss(r) * 1.2, u * u * A.c.y + 2 * u * t * mid.y + t * t * B.c.y + gauss(r) * 1.0, u * u * A.c.z + 2 * u * t * mid.z + t * t * B.c.z + gauss(r) * 1.2); if (r() < field(p)) add(p, 0.16 + r() * 0.3, [0.55, 0.68, 1], 0.14 + r() * 0.2); }
    }
    for (let i = 0; i < 3200; i++) { const p = V(C0.x + gauss(r) * 40, C0.y + gauss(r) * 27, C0.z + gauss(r) * 21); if (r() < Math.pow(field(p), 1.4)) add(p, 0.14 + r() * 0.26, [0.5, 0.62, 0.95], 0.1 + r() * 0.18); } // 散落的单个星系，被空洞挖空
    g.add(pointsOf(a, 1.0, uPR));
    // 程序化速度场：吸引子（巨引源区、沙普利方向、本地室女座）与一个排斥区；沿场做三维积分得到流线
    const att = [...GA.map((n) => ({ p: n.p, w: n.w })), { p: SHAP, w: 14 }, { p: VIRGO, w: 0.7 }, { p: REP, w: -5 }, ...nodes.filter((n) => !n.ga).map((n) => ({ p: n.c, w: 3.0 * n.w / wmax }))]; // 各结点也有各自的引力：流线先汇入局部结点，再被更大尺度的汇聚区牵引
    const vel = (p, out) => { out.set(0, 0, 0); for (const k of att) { const d = k.p.clone().sub(p), L2 = d.lengthSq() + 100; out.addScaledVector(d, k.w / Math.pow(L2, 1.5)); } return out.normalize(); };
    const streams = [], pos = [], col = [], arr = [], h = 4, v1 = V(0, 0, 0), v2 = V(0, 0, 0), seeds = nodes.filter((n) => !n.ga);
    for (let n = 0, tries = 0; n < 36 && tries < 500; tries++) {
      const s0 = seeds[Math.floor(r() * seeds.length)].c.clone().add(V(gauss(r) * 4, gauss(r) * 3, gauss(r) * 4)), pts = [s0.clone()], p = s0.clone();
      for (let k = 0; k < 70; k++) { vel(p, v1); const mid = p.clone().addScaledVector(v1, h * 0.5); vel(mid, v2); p.addScaledVector(v2, h); pts.push(p.clone()); if (GA.some((q) => q.p.distanceTo(p) < 14) || p.distanceTo(C0) > 95) break; }
      if (pts.length < 6) continue; n++; streams.push(pts);
      pts.forEach((q, k) => { if (k === 0) return; const f = k / pts.length, br = 0.1 + 0.16 * f, p0 = S(pts[k - 1]), p1 = S(q); pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z); const c = [0.42 + 0.58 * f, 0.6 + 0.22 * f, 1 - 0.55 * f]; col.push(c[0] * br, c[1] * br, c[2] * br, c[0] * br, c[1] * br, c[2] * br); });
      for (const f of [0.3, 0.62]) { const k = Math.floor(f * (pts.length - 1)), p0 = S(pts[k]), d = S(pts[k + 1]).sub(p0).normalize(), pr = V(-d.z, 0, d.x).normalize().multiplyScalar(0.05), tip = p0.clone().addScaledVector(d, 0.08); arr.push(tip, tip.clone().addScaledVector(d, -0.1).add(pr), tip, tip.clone().addScaledVector(d, -0.1).sub(pr)); } // 微弱的方向箭头
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const sm = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }); sm.userData.base = 0.4; g.add(new THREE.LineSegments(sg, sm));
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(arr), lineMat(0xcfdcff, 0.3)));
    // 流域轮廓（可选）：按各吸引子与本地方向给出不规则的半径函数；半透明、仅示意
    const lobes = [[GA[0].p, 1.0, 5], [GA[1].p, 0.9, 5], [GA[2].p, 0.8, 5], [VIRGO, 0.95, 5], [V(-30, 50, 5), 0.6, 3], [V(-35, -20, 0), 0.55, 3]].map(([p, w, k]) => ({ u: p.clone().sub(C0).normalize(), w, k }));
    const ico = new THREE.IcosahedronGeometry(1, 4), pa = ico.attributes.position, du = V(0, 0, 0);
    for (let i = 0; i < pa.count; i++) { du.fromBufferAttribute(pa, i).normalize(); let R = 0, ws = 0; for (const l of lobes) { const e = Math.exp(l.k * (du.dot(l.u) - 1)); R += l.w * e; ws += e; } R = 38 + 24 * (R / (ws + 1e-6)); const q = S(C0.clone().add(V(du.x, du.y, du.z).multiplyScalar(R))); pa.setXYZ(i, q.x, q.y, q.z); }
    const basin = new THREE.Mesh(ico, new THREE.MeshBasicMaterial({ color: 0x7f9cff, transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); basin.material.userData.base = 0.045; basin.visible = false; g.add(basin);
    // 流动的亮点（沿流线缓缓移动，指示方向）
    const NP = 150, ppos = new Float32Array(NP * 3), pc = new Float32Array(NP * 3).fill(0.85), ps = new Float32Array(NP).fill(0.6), off = Array.from({ length: NP }, () => r());
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(ppos, 3).setUsage(THREE.DynamicDrawUsage)); pg.setAttribute('aS', new THREE.BufferAttribute(ps, 1)); pg.setAttribute('aC', new THREE.BufferAttribute(pc, 3));
    const flow = new THREE.Points(pg, smat(POINTS_VS, POINTS_FS, { uPR: { value: uPR }, uSize: { value: 0.6 } }, { blending: THREE.AdditiveBlending })); flow.frustumCulled = false; g.add(flow);
    g.userData.tick = (t) => { for (let i = 0; i < NP; i++) { const st = streams[i % streams.length], f = (off[i] + t * 0.03) % 1, x = f * (st.length - 1), k = Math.min(st.length - 2, Math.floor(x)), u = x - k, q = S(st[k].clone().lerp(st[k + 1], u)); ppos[i * 3] = q.x; ppos[i * 3 + 1] = q.y; ppos[i * 3 + 2] = q.z; } pg.attributes.position.needsUpdate = true; };
    const lab = (p, text, o = {}) => ({ p: S(p).add(V(0, 0.35, 0)), text, ...o });
    g.userData.labels = [
      { p: S(C0).add(V(0, 5.2, 0)), text: '拉尼亚凯亚超星系团' },
      lab(GA[0].p, '巨引源区域（诺玛／半人马／长蛇一带的星系团群）'),
      lab(VIRGO, '室女座星系团'),
      lab(V(0, 0, 0), '银河系（我们）— 点击展开', { color: '#ffd28a', go: 'cel.milkyway' }),
      lab(SHAP.clone().lerp(C0, 0.45), '→ 沙普利方向（流域之外的更远汇聚区）'),
      { p: S(C0).add(V(-5.5, -3.8, 0)), text: '显示／隐藏：流域轮廓（示意，非物理外壳）', toggle: () => { basin.visible = !basin.visible; } },
      { p: S(C0).add(V(5.5, -4.6, 0)), text: '科学概念示意：流线由程序化速度场积分得到，非 Cosmicflows 实测；巨引源区星系团位置为近似值' },
    ];
    g.userData.fitR = 6.6; g.rotation.set(0.5, 0.4, 0.1); return g;
  }

  // ---------------- 星云与尘埃：域扭曲的程序云团（发射／反射星云，加性混合）与暗色尘埃（普通混合，压暗背景）----------------
  const NEB_VS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
  const NEB_FS = `${NOISE} varying vec2 vUv; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform float uSeed; uniform float uA; uniform float uTime; uniform float uK; uniform float uDark;
void main(){ vec2 q=vUv-.5; float d=length(q)*2.; if(d>1.) discard;
  vec3 p=vec3(q*3.2+uSeed, uSeed*.7+uTime*.008);
  float w=fbm(p+fbm(p*1.7+3.)*1.3);
  float shape=smoothstep(1.,.12,d)*smoothstep(.22,.78,w);
  vec3 col=mix(uC1,uC2,smoothstep(.3,.85,w)); col=mix(col,uC3,smoothstep(.62,.95,fbm(p*2.+9.))*.75);
  float a=shape*uK*uA;
  gl_FragColor=vec4(uDark>.5?col:col*a, uDark>.5?a:a); }`;
  const neb = (pos, size, c1, c2, c3, seed, k = 0.6, dark = false) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), smat(NEB_VS, NEB_FS, { uC1: { value: new THREE.Color(...c1) }, uC2: { value: new THREE.Color(...c2) }, uC3: { value: new THREE.Color(...c3) }, uSeed: { value: seed }, uK: { value: k }, uDark: { value: dark ? 1 : 0 } }, dark ? {} : { blending: THREE.AdditiveBlending }));
    m.material.side = THREE.DoubleSide; m.position.set(...pos); m.scale.setScalar(size); m.userData.billboard = true; m.renderOrder = dark ? 3 : 0; return m;
  };
  const HII = [[1, 0.28, 0.42], [1, 0.5, 0.55], [0.5, 0.75, 1]];   // 发射星云：粉红为主，核心带蓝
  const DUST = [[0.02, 0.012, 0.01], [0.03, 0.018, 0.012], [0.015, 0.01, 0.01]];

  function decorateHood(g) {
    const r = rng(2101);
    for (let i = 0; i < 14; i++) g.add(neb([gauss(r) * 6, gauss(r) * 3, gauss(r) * 6], 3.5 + r() * 4, [0.35, 0.5, 0.9], [0.55, 0.4, 0.85], [0.3, 0.7, 0.9], r() * 50, 0.1)); // 局部星际云的稀薄气体丝缕
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
    const named = [ // [名称, l, b, d(千光年), 所属, 显示尺寸, 色1, 色2, 亮度]
      ['猎户座大星云 M42', 209.0, -19.4, 1.34, '猎户臂', 0.42, [1, 0.34, 0.52], [0.45, 0.72, 1], 0.9],
      ['北美洲星云 NGC 7000', 85.0, -0.5, 2.59, '猎户臂', 0.55, [1, 0.28, 0.3], [1, 0.5, 0.45], 0.7],
      ['玫瑰星云', 206.3, -2.1, 5.2, '猎户臂外侧（近似归属）', 0.6, [1, 0.18, 0.24], [1, 0.45, 0.5], 0.65],
      ['船底星云', 287.6, -0.7, 7.5, '人马–船底臂', 0.8, [1, 0.5, 0.35], [1, 0.3, 0.45], 0.8],
      ['鹰状星云 M16', 17.0, 0.8, 5.7, '人马臂', 0.55, [1, 0.55, 0.3], [0.9, 0.35, 0.4], 0.7],
    ];
    const lab = [], ob = []; named.forEach(([name, l, b, d, arm, size, c1, c2, k], i) => { const p = gal(l, b, d); ob.push(p); clump(p, size * 0.9, size * 0.5, size * 0.9, 90, [0.7, 0.82, 1], 0.6, 0.4); g.add(Object.assign(neb(p.toArray(), size * 1.9, c1, c2, [0.9, 0.7, 0.8], 10 + i * 7, k * 0.55), {})); lab.push({ p: p.clone().add(V(0, -size * 0.7, 0)), text: name, lvl: [0] }); });
    for (let i = 0; i < 9; i++) { const th = -0.5 + r() * 1.0, R = LOCAL(th) + gauss(r) * 0.6, p = pol(R, th, gauss(r) * 0.15); clump(p, 0.25, 0.1, 0.25, 40, [0.7, 0.82, 1], 0.5, 0.4); } // 其余年轻星团（程序生成的示意）
    // ③ 疏散星团层：昴星团 M45（l=166.6°, b=-23.5°, 约 445 光年）＝一小群蓝白恒星
    const m45 = gal(166.6, -23.5, 0.445); clump(m45, 0.09, 0.07, 0.09, 55, [0.6, 0.78, 1], 1.0, 0.5); g.add(neb(m45.toArray(), 0.4, [0.4, 0.6, 1], [0.6, 0.8, 1], [0.9, 0.95, 1], 70, 0.35)); // 反射星云（淡蓝）
    lab.push({ p: m45.clone().add(V(0, -0.3, 0)), text: '昴星团 M45（约 445 光年）', lvl: [0] });
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
    const toPer = pol(PER(0), 0).clone(), toSag = pol(SAG(0), 0).clone(); ref.add(arrow(toPer, 0xffd28a), arrow(toSag, 0x9fc6ff)); ref.visible = false; g.add(ref);
    g.userData.labels = [
      { p: sun.clone().add(V(0, -0.35, 0)), text: '太阳（定位点）', color: '#ffd28a', lvl: [0] },
      { p: pol(LOCAL(0.45), 0.45).clone().add(V(0, 0.5, 0)), text: '猎户臂（本地臂）', lvl: [0] },
      ...lab,
      { p: sun.clone().add(V(0.7, 0.55, 0)), text: '本地泡（点击进入）', go: 'cel.local-bubble', lvl: [0] },
      { p: V(-10.5, 0, 9.6), text: '显示／隐藏：本地泡轮廓、尺度环、邻臂方向', toggle: () => { bubPts.visible = !bubPts.visible; ref.visible = bubPts.visible; }, lvl: [0] },
      { p: V(10.5, 0, -9.6), text: '示意：臂线为对数螺线近似；命名天体位置为近似观测值；星云显示尺寸已放大', lvl: [0] },
    ];
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
  function decorateGalaxy(g) { // 星云全部沿 buildGalaxy 给出的旋臂放置：发射星云在臂上，暗色尘埃在臂内缘，棒上有一条暗带
    const r = rng(2104), arm = g.userData.armAt, pick = () => (r() < 0.32 ? 0 : r() < 0.5 ? 1 : r() < 0.7 ? 2 : 3), RR = (lo, hi) => lo + r() * (hi - lo);
    for (let i = 0; i < 120; i++) g.add(neb(arm(pick(), RR(3.4, 12), gauss(r) * 0.12), 0.4 + r() * 0.8, HII[i % 3], HII[(i + 1) % 3], [1, 0.6, 0.7], r() * 99, 0.4)); // 臂上的发射星云（粉红）
    for (let i = 0; i < 40; i++) g.add(neb(arm(pick(), RR(3.5, 12), gauss(r) * 0.2), 1.6 + r() * 1.2, [0.4, 0.55, 1], [0.6, 0.7, 1], [0.8, 0.85, 1], r() * 99, 0.1)); // 弥散的蓝白星光
    for (let i = 0; i < 110; i++) g.add(neb(arm(pick(), RR(3.2, 11.5), -0.35 + gauss(r) * 0.1), 0.5 + r() * 1.0, DUST[0], DUST[1], DUST[2], r() * 99, 0.4, true)); // 臂内缘的暗色尘埃带（局部暗区）
    for (let i = 0; i < 14; i++) { const x = (r() * 2 - 1) * 2.6, c = Math.cos(0.47), s = Math.sin(0.47); g.add(neb([x * c - 0.1 * s, gauss(r) * 0.04, x * s + 0.1 * c], 0.6 + r() * 0.6, DUST[0], DUST[1], DUST[2], r() * 99, 0.4, true)); } // 贯穿核球的暗带
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
    g.userData.zoom = [{ p: cMW, s: 6 }, { p: cM31, s: 2.7 }, { p: cM33, s: 8 }]; g.userData.fitR = 6.3; // 默认视角同时容纳三大星系；点击星系名称放大，再点一次返回
    g.userData.labels = [lab(cMW, '银河系（我们）· 约 10 万光年', '#ffd28a', -1.1, 0), lab(cM31, '仙女座星系 M31 · 约 22 万光年', undefined, -1.5, 1), lab(cM33.clone(), '三角座星系 M33 · 约 6 万光年', undefined, -0.8, 2), lab(at(280.5, -32.9, 50).clone().add(V(0, 0.55, 0)), '大、小麦哲伦云'), { p: sat.m32.clone().add(V(0.2, -0.3, 0)), text: 'M32' }, { p: sat.m110.clone().add(V(0, 0.3, 0)), text: 'M110' }, lab(at(25.3, -18.4, 490), 'NGC 6822', undefined, -0.4), lab(at(119, -3.3, 794), 'IC 10', undefined, -0.4)];
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

  return { setRenderer, webObservable, buildVirgo, buildComplex, planetSystem, moonBody, buildBelt, cometSystem, buildSupercluster, buildLaniakea, buildLocalGroup, buildOrionArm, decorateHood, decorateBubble, decorateOrion, decorateGalaxy, BUBBLE_FS, SYS, MOONS, HALLEY, HALE, OUMU };
}
