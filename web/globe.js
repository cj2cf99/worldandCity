// 地球仪场景（宇宙系枢纽）+ 球→平面展开（现实系）。设计 §8.1：init/activate/deactivate/dispose 由 createScene 返回对象承担。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { viewZoom } from './zoom.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { drawLand, drawMask, countryView, hitCountry, mollweide, mollweideInv, MOLL_W, MOLL_H, FS, viewRect } from './geo.js';

const TAU = Math.PI * 2;
const WATER_Y = -1 / 3; // 球内约 1/3 高度（PRD §4.1）
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

// ---- 同一海浪状态：JS 与 GLSL 使用同一公式，小船由它驱动（PRD §4.2）----
export function waveH(x, z, t, s) {
  const A = 0.016 + 0.05 * s;
  return A * (0.5 * Math.sin(1.7 * x + 1.1 * t) + 0.35 * Math.sin(2.3 * z + 1.7 * t + 1.3) + 0.25 * Math.sin(1.68 * (x + z) - 1.3 * t))
    + 0.042 * s * Math.sin(2.1 * x - 2.2 * t + z * 0.8);
}
const WAVE_GLSL = /* glsl */ `
uniform float uTime; uniform float uSwell;
float waveH(vec2 p){
  float A = 0.016 + 0.05*uSwell;
  return A*(0.5*sin(1.7*p.x+1.1*uTime)+0.35*sin(2.3*p.y+1.7*uTime+1.3)+0.25*sin(1.68*(p.x+p.y)-1.3*uTime))
       + 0.042*uSwell*sin(2.1*p.x-2.2*uTime+p.y*0.8);
}`;

// ---- 着色器 ----
const NEBULA = {
  vs: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fs: /* glsl */ `
  varying vec3 vDir; uniform float uTime; uniform float uCosmic;
  float h(vec3 p){ p = fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float n(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
    return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float fbm(vec3 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=.5; } return s; }
  void main(){
    vec3 d = vDir; float t = uTime*.01;
    float f = fbm(d*2.2+vec3(t,0.,-t));
    float g = fbm(d*4.5+vec3(5.2,1.3,t*2.));
    vec3 deep = vec3(.012,.016,.045);
    vec3 c = deep + vec3(.10,.09,.20)*pow(f,2.2)*1.1 + vec3(.03,.10,.17)*pow(g,3.)*1.1;
    c += vec3(.35,.30,.38)*pow(max(0.,f-.62),2.)*1.2;
    vec3 calm = vec3(.015,.03,.06) + vec3(.02,.05,.09)*(d.y*.5+.5);
    gl_FragColor = vec4(mix(calm, c, uCosmic), 1.);
  }`,
};

const SHELL = {
  vs: /* glsl */ `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }`,
  fs: /* glsl */ `
  varying vec3 vN; varying vec3 vV; uniform float uFade; uniform float uTime;
  void main(){
    vec3 n = normalize(vN), v = normalize(vV);
    float ndv = abs(dot(n,v));
    float fres = pow(1.-ndv, 2.6);
    vec3 L1 = normalize(vec3(-.5,.8,.6)), L2 = normalize(vec3(.7,.3,.5));
    float s1 = pow(max(dot(reflect(-L1,n),v),0.), 90.);
    float s2 = pow(max(dot(reflect(-L2,n),v),0.), 40.)*.5;
    vec3 irid = .5+.5*cos(6.2831*(vec3(0.,.33,.67)+fres*1.2+uTime*.03));
    vec3 col = mix(vec3(.62,.78,.95), irid, .10)*fres*.95 + (s1+s2)*vec3(1.,.97,.92)*.8;
    float a = (fres*.62 + s1 + s2*.8 + .02)*uFade;
    gl_FragColor = vec4(col*uFade, clamp(a,0.,1.));
  }`,
};

const EARTH = {
  vs: /* glsl */ `
  attribute vec3 aFlat; attribute vec2 aLL; uniform float uU; uniform float uTime;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vLocal;
  void main(){
    vUv = uv;
    float lon = aLL.x;
    float tl = smoothstep(0.,1., clamp(uU*1.55 - abs(lon)/3.14159*.55, 0., 1.));
    vec3 sp = position;
    vec3 p = mix(sp, aFlat, tl);
    p.z += sin(tl*3.14159)*.35*(1.-abs(lon)/3.14159); // 展开时中部略向观察者隆起，形成卷开的感觉
    vec3 n = normalize(mix(normalize(sp), vec3(0.,0.,1.), tl));
    vLocal = tl;
    vec4 mv = modelViewMatrix*vec4(p,1.);
    vN = normalize(normalMatrix*n); vV = -mv.xyz;
    gl_Position = projectionMatrix*mv;
  }`,
  fs: /* glsl */ `
  uniform sampler2D uMap; uniform sampler2D uMask; uniform float uU; uniform float uTime; uniform float uHasSel;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vLocal;
  void main(){
    vec4 land = texture2D(uMap, vUv);
    vec4 mk = texture2D(uMask, vUv); float m = clamp(mk.r + mk.g, 0., 1.); float edge = smoothstep(.45, .6, mk.g);
    float pulse = .5+.5*sin(uTime*2.4);
    vec3 n = normalize(vN), v = normalize(vV);
    float ndv = abs(dot(n,v));
    vec3 oceanA = vec3(.015,.10,.20), oceanB = vec3(.03,.30,.44);
    vec3 ocean = mix(oceanA, oceanB, vUv.y*.6+.2) * (.75+.25*pow(ndv,.7));
    vec3 col = mix(ocean, land.rgb, land.a);
    if (uHasSel > .5){
      float gray = dot(col, vec3(.3,.59,.11));
      col = mix(mix(vec3(gray), col, .35)*.62, col*1.12, m);
      col += m*vec3(1.,.82,.45)*(.16+.14*pulse)*uU;
      col = mix(col, vec3(1.,.93,.6)*(1.5+.7*pulse), edge*uU);
    }
    float lit = .62 + .38*pow(ndv, .6);
    col *= mix(lit, 1., vLocal);
    col += pow(1.-ndv, 3.)*vec3(.25,.5,.8)*(1.-vLocal)*.5;
    float aGlobe = land.a + pow(1.-ndv,3.)*.05; // 陆地不透明，海洋透明
    float k = clamp(uU*1.6,0.,1.);
    float a = mix(aGlobe, 1., k);
    if (!gl_FrontFacing) a *= k; // 球面状态下隐藏背面，避免背面陆地透到前面
    gl_FragColor = vec4(col, a);
  }`,
};

const WATER = {
  vs: /* glsl */ `${WAVE_GLSL}
  varying vec3 vPos; varying vec3 vWP; void main(){ vec3 p = position; p.y += waveH(p.xz); vPos = p; vWP = (modelMatrix*vec4(p,1.)).xyz; gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.); }`,
  fs: /* glsl */ `
  uniform float uTime; uniform float uSwell; varying vec3 vPos; varying vec3 vWP;
  void main(){
    vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos))); if (n.y < 0.) n = -n;
    vec3 V = normalize(cameraPosition - vWP);
    vec3 c1 = vec3(.02,.36,.44), c2 = vec3(.02,.17,.34), c3 = vec3(.10,.46,.44);
    float k = .5+.5*sin(vPos.x*2.2+vPos.z*1.6+uTime*.35+n.x*7.);
    vec3 base = mix(mix(c1,c2,k), c3, smoothstep(.5,1., n.z*.5+.5)*.5);
    float fres = pow(1.-max(dot(n,V),0.), 3.);
    vec3 L = normalize(vec3(-.4,.9,.5));
    float sp = pow(max(dot(reflect(-L,n),V),0.), 70.);
    float foam = smoothstep(.014, .05, vPos.y + .33 - (-.33)) * uSwell * .5;
    vec3 col = base + fres*vec3(.45,.65,.8)*.4 + sp*.9 + foam*.3;
    gl_FragColor = vec4(col, .72);
  }`,
};

const BODY = {
  vs: /* glsl */ `varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }`,
  fs: /* glsl */ `
  uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV;
  void main(){
    vec3 n = normalize(vN), v = normalize(vV);
    float fres = pow(1.-abs(dot(n,v)), 2.2);
    float k = clamp((vP.y + 1.)/ .67, 0., 1.);
    vec3 deep = vec3(.01,.05,.16), mid = vec3(.02,.20,.34), top = vec3(.04,.40,.46);
    vec3 col = mix(mix(deep, mid, smoothstep(0.,.6,k)), top, smoothstep(.6,1.,k));
    col += fres*vec3(.5,.7,.9)*.35 + .03*sin(vP.x*9.+uTime)*sin(vP.z*9.-uTime*.7);
    gl_FragColor = vec4(col, .5 + fres*.2);
  }`,
};

// ---- 几何构件 ----
function earthGeometry(W = 256, H = 128) {
  const pos = [], flat = [], ll = [], uv = [], idx = [];
  for (let j = 0; j <= H; j++) {
    for (let i = 0; i <= W; i++) {
      const lon = (i / W) * TAU - Math.PI, lat = (j / H) * Math.PI - Math.PI / 2;
      pos.push(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
      const [x, y] = mollweide(lon, lat);
      flat.push(x * FS, y * FS, 0);
      ll.push(lon, lat);
      uv.push(i / W, j / H);
    }
  }
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const a = j * (W + 1) + i, b = a + 1, c = a + W + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFlat', new THREE.Float32BufferAttribute(flat, 3));
  g.setAttribute('aLL', new THREE.Float32BufferAttribute(ll, 2));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6); // 展开后超出单位球，避免被视锥裁掉
  return g;
}

function buildBoat() {
  const boat = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a4a24, roughness: 0.62, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x5a3818, roughness: 0.7 });
  const sailM = new THREE.MeshStandardMaterial({ color: 0xd8cbb0, roughness: 0.92, side: THREE.DoubleSide, emissive: 0x1a1408, emissiveIntensity: 0.15 });
  const s = new THREE.Shape();
  s.moveTo(-0.17, 0.045); s.quadraticCurveTo(-0.16, -0.045, -0.06, -0.05); s.lineTo(0.09, -0.05); s.quadraticCurveTo(0.19, -0.02, 0.23, 0.055);
  s.quadraticCurveTo(0.05, 0.03, -0.17, 0.045);
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.085, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 10 }), wood);
  hull.position.z = -0.042; boat.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.006, 0.07), dark); deck.position.set(0.03, 0.05, 0); boat.add(deck);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0075, 0.34, 8), dark); mast.position.set(0.02, 0.22, 0); boat.add(mast);
  const sail = (pts, bulge) => {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ShapeGeometry(sh, 6); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getY(i) - 0.06) * 8) * bulge * (1 - Math.abs(p.getX(i)) * 2));
    g.computeVertexNormals(); return new THREE.Mesh(g, sailM);
  };
  const main = sail([[-0.1, 0.07], [0.015, 0.07], [0.015, 0.37]], 0.018); boat.add(main);
  const jib = sail([[0.035, 0.07], [0.2, 0.065], [0.035, 0.34]], 0.014); boat.add(jib);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.03), new THREE.MeshBasicMaterial({ color: 0xff4d6d, side: THREE.DoubleSide }));
  flag.position.set(0.05, 0.375, 0); boat.add(flag);
  boat.userData.flag = flag; boat.userData.sails = [main, jib];
  return boat;
}

// 琉璃龙：沿水下曲线游动的中国龙。龙身为一串渐细的半透明蓝色琉璃珠（内有发光脊线），带龙角、龙须、背鬃、尾鳍，前方一颗龙珠。
function buildDragon() {
  const N = 46, DU = 0.036, group = new THREE.Group();
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x2f8cff, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, opacity: 0.78, emissive: 0x0b3fa8, emissiveIntensity: 0.6, iridescence: 0.8, iridescenceIOR: 1.45, envMapIntensity: 2.2, depthWrite: false });
  const light = new THREE.MeshPhysicalMaterial({ color: 0x8fdcff, roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.85, emissive: 0x3aa8ff, emissiveIntensity: 0.8, envMapIntensity: 2, depthWrite: false });
  const body = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14), glass, N); body.frustumCulled = false;
  const core = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.4, 2.4), transparent: true, opacity: 0.9, depthWrite: false }), N); core.frustumCulled = false;
  const SPK = 30, spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(0.011, 0.07, 6), light, SPK); spikes.frustumCulled = false;
  group.add(body, core, spikes);

  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), glass); skull.scale.set(0.042, 0.036, 0.058); head.add(skull);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), glass); snout.scale.set(0.03, 0.022, 0.042); snout.position.set(0, -0.006, 0.06); head.add(snout);
  for (const x of [1, -1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.1, 6), light); horn.position.set(x * 0.022, 0.044, -0.03); horn.rotation.set(-1.0, 0, x * 0.35); head.add(horn);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.7, 0.6) })); eye.position.set(x * 0.03, 0.014, 0.03); head.add(eye);
    const wh = new THREE.CatmullRomCurve3([new THREE.Vector3(x * 0.016, -0.012, 0.085), new THREE.Vector3(x * 0.07, -0.02, 0.1), new THREE.Vector3(x * 0.12, -0.05, 0.04), new THREE.Vector3(x * 0.15, -0.09, -0.06)]);
    head.add(new THREE.Mesh(new THREE.TubeGeometry(wh, 24, 0.0028, 5), light));
  }
  group.add(head);
  const tailG = new THREE.ShapeGeometry(new THREE.Shape([[0, 0], [0.035, -0.04], [0.06, -0.095], [0.025, -0.125], [0, -0.17], [-0.025, -0.125], [-0.06, -0.095], [-0.035, -0.04]].map(([x, y]) => new THREE.Vector2(x, y))), 6); tailG.rotateX(Math.PI / 2);
  const tail = new THREE.Mesh(tailG, new THREE.MeshPhysicalMaterial({ color: 0x5fc3ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, emissive: 0x2a8cff, emissiveIntensity: 0.7, depthWrite: false })); group.add(tail);
  const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.6, 3) })); group.add(pearl);

  const P = (u) => { const R = 0.52 + 0.1 * Math.sin(u * 0.5 + 0.7); return new THREE.Vector3(R * Math.cos(u), -0.5 + 0.06 * Math.sin(1.7 * u + 0.5), R * Math.sin(u)); };
  const pos = Array.from({ length: N + 2 }, () => new THREE.Vector3()), o = new THREE.Object3D(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), dir = new THREE.Vector3(), n2 = new THREE.Vector3();
  const radius = (i) => 0.007 + 0.03 * Math.pow(1 - i / N, 0.75);
  function update(t) {
    const a = t * 0.45;
    for (let i = 0; i < N + 2; i++) { // 含头前、尾后各一点，便于取切向
      const j = i - 1, u = a - j * DU, p = P(u);
      tmp.copy(P(u + 0.01)).sub(P(u - 0.01)).normalize(); n2.set(-tmp.z, 0, tmp.x).normalize();
      const A = 0.025 * (0.25 + Math.max(0, j) / N * 1.1) * Math.sin(j * 0.5 - t * 3.2);
      pos[i].copy(p).addScaledVector(n2, A); pos[i].y += 0.012 * Math.sin(j * 0.45 - t * 2.4);
    }
    let sp = 0;
    for (let i = 0; i < N; i++) {
      const c = pos[i + 1], r = radius(i);
      o.position.copy(c); o.rotation.set(0, 0, 0); o.scale.setScalar(r); o.updateMatrix(); body.setMatrixAt(i, o.matrix);
      o.scale.setScalar(r * 0.42); o.updateMatrix(); core.setMatrixAt(i, o.matrix);
      if (i > 1 && i < 1 + SPK && sp < SPK) { // 背鬃：沿身体上方，向后倾
        dir.copy(pos[i]).sub(pos[i + 2]).normalize();
        tmp.copy(up).addScaledVector(dir, -0.9).normalize(); q.setFromUnitVectors(up, tmp);
        o.position.copy(c).addScaledVector(up, r * 0.95); o.quaternion.copy(q); o.scale.setScalar(1 - i / N * 0.6); o.updateMatrix(); spikes.setMatrixAt(sp++, o.matrix); o.quaternion.identity();
      }
    }
    body.instanceMatrix.needsUpdate = core.instanceMatrix.needsUpdate = spikes.instanceMatrix.needsUpdate = true;
    // 头：朝向切向并轻摆
    head.position.copy(pos[1]); dir.copy(pos[0]).sub(pos[2]).normalize();
    head.lookAt(tmp.copy(pos[1]).add(dir)); head.rotateZ(Math.sin(t * 2.2) * 0.12);
    // 尾鳍：贴在尾端并随游动摆
    tail.position.copy(pos[N]); dir.copy(pos[N - 1]).sub(pos[N + 1]).normalize(); tail.lookAt(tmp.copy(pos[N]).add(dir)); tail.rotateZ(Math.sin(t * 4) * 0.35);
    pearl.position.copy(P(a + 0.55)).add(tmp.set(0, 0.05 + 0.02 * Math.sin(t * 2), 0)); pearl.scale.setScalar(1 + 0.12 * Math.sin(t * 3));
  }
  group.userData.update = update;
  return group;
}

function buildArmillary(env) {
  const root = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xb88f4c, metalness: 1, roughness: 0.38, envMapIntensity: 1.1 });
  const defs = [
    { r: 1.2, tilt: [0.35, 0, 0.1], spin: [0, 0.18, 0], beads: 1 },
    { r: 1.34, tilt: [-0.9, 0.2, 0.4], spin: [0.1, 0, 0.22], beads: 0 },
    { r: 1.5, tilt: [1.25, 0.1, -0.5], spin: [0, -0.14, 0.08], beads: 2 },
    { r: 1.68, tilt: [0.15, 0, 0.9], spin: [0.06, 0.1, 0], beads: 0 },
  ];
  const rings = defs.map((d) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.TorusGeometry(d.r, 0.0085, 10, 220), gold));
    const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.004, 0.028, 0.016), gold, 120);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * TAU, big = i % 10 === 0;
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
      m.compose(new THREE.Vector3(Math.cos(a) * d.r, Math.sin(a) * d.r, 0), q, new THREE.Vector3(1, big ? 2 : 1, big ? 1.5 : 1));
      ticks.setMatrixAt(i, m);
    }
    g.add(ticks);
    for (let b = 0; b < d.beads; b++) {
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.035 + b * 0.012, 20, 14), new THREE.MeshStandardMaterial({ color: b ? 0x7fd8ff : 0xffb86b, emissive: b ? 0x1a6a8a : 0x8a4a10, emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.25 }));
      bead.userData.phase = b * 2.4; g.add(bead); (g.userData.beads ||= []).push(bead);
    }
    g.userData.r = d.r; g.userData.spin = d.spin;
    const holder = new THREE.Group(); holder.rotation.set(...d.tilt); holder.add(g); root.add(holder);
    return g;
  });
  // 子午环：贯穿两极，倾斜 23.4°（地球仪外框）
  const mer = new THREE.Group(); mer.rotation.z = 0.41;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.012, 12, 200), gold); ring.rotation.y = Math.PI / 2; mer.add(ring);
  for (const s of [1, -1]) { const cap = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 20), gold); cap.position.y = s * 1.1; cap.rotation.x = s > 0 ? 0 : Math.PI; mer.add(cap); }
  root.add(mer);
  return { root, rings };
}

// ---- 场景 ----
export async function createScene(host, hooks = {}) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let quality = (navigator.hardwareConcurrency || 4) <= 4 || innerWidth < 700 ? 'mid' : 'high';
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const applyPR = () => renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 2 : quality === 'mid' ? 1.5 : 1));
  applyPR();
  renderer.setClearColor(0x03040c);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.85;

  const uni = { uTime: { value: 0 }, uSwell: { value: 0 } };

  // 背景：星云（宇宙系）+ 星点
  const uCosmic = { value: 1 };
  const nebula = new THREE.Mesh(new THREE.SphereGeometry(80, 48, 24), new THREE.ShaderMaterial({ vertexShader: NEBULA.vs, fragmentShader: NEBULA.fs, side: THREE.BackSide, depthWrite: false, uniforms: { uTime: uni.uTime, uCosmic } }));
  scene.add(nebula);
  const starN = 2600, sp = new Float32Array(starN * 3), ss = new Float32Array(starN), sc = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * TAU, r = Math.sqrt(1 - u * u), d = 60 + Math.random() * 15;
    sp.set([r * Math.cos(a) * d, u * d, r * Math.sin(a) * d], i * 3);
    ss[i] = Math.random() ** 3 * 2.2 + 0.4;
    const t = Math.random(); sc.set([0.8 + 0.2 * t, 0.85, 1 - 0.3 * t], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  starGeo.setAttribute('aS', new THREE.BufferAttribute(ss, 1));
  starGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  const uStar = { value: 1 };
  const stars = new THREE.Points(starGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: uni.uTime, uStar, uPR: { value: renderer.getPixelRatio() } },
    vertexShader: /* glsl */ `attribute float aS; attribute vec3 color; varying vec3 vC; varying float vT; uniform float uTime; uniform float uPR;
      void main(){ vC = color; vT = .65+.35*sin(uTime*(.8+aS)+position.x); vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = aS*uPR*(1.+.35*vT); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: /* glsl */ `varying vec3 vC; varying float vT; uniform float uStar; void main(){ float d = length(gl_PointCoord-.5); float a = smoothstep(.5,0.,d); gl_FragColor = vec4(vC*vT, a*uStar); }`,
  }));
  scene.add(stars);

  // 灯光
  const key = new THREE.DirectionalLight(0xfff0dd, 2.2); key.position.set(-3, 4, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x7fa8ff, 1.2); rim.position.set(4, -1, -3); scene.add(rim);
  scene.add(new THREE.AmbientLight(0x6070a0, 0.35));

  // 展品（球内）：玻璃壳、水晶海洋、帆船、水晶簇
  const exhibit = new THREE.Group(); scene.add(exhibit);
  const shellU = { uFade: { value: 1 }, uTime: uni.uTime };
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({ vertexShader: SHELL.vs, fragmentShader: SHELL.fs, transparent: true, depthWrite: false, uniforms: shellU, side: THREE.DoubleSide }));
  shell.renderOrder = 6; scene.add(shell);

  const th0 = Math.acos(WATER_Y / 0.985);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.985, 64, 40, 0, TAU, th0, Math.PI - th0), new THREE.ShaderMaterial({ vertexShader: BODY.vs, fragmentShader: BODY.fs, transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime: uni.uTime } }));
  body.renderOrder = 1; exhibit.add(body);
  const wGeo = new THREE.RingGeometry(0.0001, 0.93, 56, 22); wGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(wGeo, new THREE.ShaderMaterial({ vertexShader: WATER.vs, fragmentShader: WATER.fs, transparent: true, side: THREE.DoubleSide, uniforms: uni }));
  water.position.y = WATER_Y; water.renderOrder = 2; exhibit.add(water);
  const dragon = buildDragon(); exhibit.add(dragon);
  const boat = buildBoat(); exhibit.add(boat);

  const { root: arm, rings } = buildArmillary(envTex); scene.add(arm);

  // 地表（国家轮廓／展开地图）
  const LW = quality === 'high' && renderer.capabilities.maxTextureSize >= 8192 ? 8192 : 4096; // 展开放大后保持清晰
  const landC = Object.assign(document.createElement('canvas'), { width: LW, height: LW / 2 });
  const maskC = Object.assign(document.createElement('canvas'), { width: LW, height: LW / 2 });
  drawLand(landC); drawMask(maskC, null);
  const landT = new THREE.CanvasTexture(landC); landT.colorSpace = THREE.SRGBColorSpace; landT.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  const maskT = new THREE.CanvasTexture(maskC); maskT.anisotropy = 8;
  const earthU = { uMap: { value: landT }, uMask: { value: maskT }, uU: { value: 0 }, uTime: uni.uTime, uHasSel: { value: 0 } };
  const earth = new THREE.Mesh(earthGeometry(), new THREE.ShaderMaterial({ vertexShader: EARTH.vs, fragmentShader: EARTH.fs, transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: earthU }));
  earth.renderOrder = 4; earth.frustumCulled = false;
  const earthG = new THREE.Group(); earthG.add(earth); earthG.scale.setScalar(1.006); scene.add(earthG);

  // 选中标记（仅展开后的地图使用）
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: uni.uTime },
    vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: /* glsl */ `uniform float uTime; varying vec2 vP; void main(){ float k = fract(uTime*.7); float r = length(vP); float a = (1.-k)*.9; gl_FragColor = vec4(1.,.82,.45, a); }`,
  }));
  marker.visible = false; marker.renderOrder = 7; earthG.add(marker);

  // 后期：泛光
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.4, 0.96);
  composer.addPass(bloom); composer.addPass(new OutputPass());

  // ---- 状态 ----
  const S = {
    dragT: -1e9, vYaw: 0, vTilt: 0, p: 0, pTarget: 0, dive: 0, diveT: 0, diveDist: 2.4, off: { dx: 0, dy: 0 }, cb: null, vo: false, baseYaw: 0.5, baseTilt: 0.18, focus: null, // 地球仪朝向
    mapView: { s: 1, cx: 0, cy: 0 }, mapTween: null, panelPx: 0,
    pointer: { x: 0, y: 0 }, camYaw: 0, camPitch: 0,
    swellT: 6, swellPhase: 0, swell: 0, running: false, ids: new Set(), frames: 0, acc: 0,
  };
  let raf = 0, last = performance.now(), dist = 4.4, zS = viewZoom.f;

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false); composer.setSize(w, h); bloom.resolution.set(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    S.aspect = w / h;
    const wide = w > 820;
    S.panelPx = wide ? 120 : 0; // 面板半透明、压在地图两端窄角上：地图占据主体
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
  }
  const ro = new ResizeObserver(resize); ro.observe(host); resize();

  function flatDist() { // 让整幅地图恰好放进右侧可用区域
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    const availW = 1 - S.panelPx / host.clientWidth;
    const needW = (2 * MOLL_W * FS) * 1.0, needH = (2 * MOLL_H * FS) * 1.0;
    return Math.max(needW / (2 * tan * S.aspect * availW), needH / (2 * tan));
  }
  function visExtent(d) { const h = 2 * d * Math.tan((camera.fov * Math.PI) / 360); return { h, w: h * S.aspect * (1 - S.panelPx / host.clientWidth) }; }
  const offsetX = (d) => (S.panelPx / host.clientWidth) * (2 * d * Math.tan((camera.fov * Math.PI) / 360) * S.aspect) / 2;

  const tween = (to, ms = 1400) => { const f = { ...S.mapView }; S.mapTween = { f, to, t0: performance.now(), ms: reduce ? 1 : ms }; };

  // ---- 对外 API ----
  const api = {
    quality: () => quality,
    setQuality(q) { quality = q; applyPR(); stars.material.uniforms.uPR.value = renderer.getPixelRatio(); bloom.enabled = q !== 'low'; resize(); },
    setConfigured(numIds) { S.ids = new Set(numIds); },
    enterMap() { S.pTarget = 1; },
    /** 俯冲：地球仪转向已选国家、镜头推近、展品退场（之后由局部地图淡入接替）。 */
    dive(on) { S.diveT = on ? 1 : 0; },
    /** 转向、推近、镜头聚焦全部落定后回调一次（用于无缝切换到局部地图）。 */
    settled(cb) { S.cb = cb; },
    exitMap() { S.pTarget = 0; },
    get mode() { return S.pTarget >= 0.5 ? 'map' : 'globe'; },
    get progress() { return S.p; },
    /** 选中国家（数字编码）或清除；center 为无独立几何的节点沿用父国家。 */
    select(numId, view) {
      drawMask(maskC, numId); maskT.needsUpdate = true; earthU.uHasSel.value = numId ? 1 : 0;
      const v = view || (numId && countryView(numId));
      if (!v) { S.focus = null; marker.visible = false; tween({ s: 1, cx: 0, cy: 0 }); return false; }
      S.focus = { lon: (v.lon * Math.PI) / 180, lat: (v.lat * Math.PI) / 180 };
      { // 俯冲收尾：让国家范围恰好占满可用区域，且居中（与局部地图的拟合一致）
        const W = host.clientWidth, H = host.clientHeight, rc = viewRect(W, H), tanV = Math.tan((camera.fov * Math.PI) / 360);
        const need = (th, half) => { th = Math.min(1.3, Math.max(0.02, th)); return Math.cos(th) + (Math.sin(th) * (H / 2)) / (half * tanV); };
        const hl = (((v.e - v.w) / 2) * Math.PI) / 180 * Math.cos(S.focus.lat), hv = (((v.n - v.s) / 2) * Math.PI) / 180;
        S.diveDist = Math.min(4.4, Math.max(1.3, Math.max(need(hl, rc.hw), need(hv, rc.hh))));
        S.off = { dx: rc.cx - W / 2, dy: rc.cy - H / 2 };
      }
      const [fx, fy] = mollweide(S.focus.lon, S.focus.lat);
      const [x0, y0] = mollweide((v.w * Math.PI) / 180, (v.s * Math.PI) / 180), [x1, y1] = mollweide(((v.e > 180 ? v.e - 360 : v.e) * Math.PI) / 180, (v.n * Math.PI) / 180);
      const spanX = Math.max(Math.abs(x1 - x0), 0.02) * FS, spanY = Math.max(Math.abs(y1 - y0), 0.02) * FS;
      const ext = visExtent(flatDist());
      const s = Math.min(60, Math.max(1.6, 0.66 * Math.min(ext.w / spanX, ext.h / spanY)));
      tween({ s, cx: fx * FS, cy: fy * FS }, 1400);
      marker.position.set(fx * FS, fy * FS, 0.02);
      return true;
    },
    pause() { S.running = false; cancelAnimationFrame(raf); },
    resume() { if (S.running) return; S.running = true; last = performance.now(); loop(); },
    dispose() {
      api.pause(); ro.disconnect(); removeEventListener('pointermove', onMove); removeEventListener('pointermove', onDrag); removeEventListener('pointerup', endDrag); removeEventListener('pointercancel', endDrag);
      renderer.domElement.remove(); composer.dispose(); renderer.dispose(); pmrem.dispose();
      scene.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => x.dispose()); });
      landT.dispose(); maskT.dispose();
    },
  };

  // ---- 指针：视角视差、悬停、点击 ----
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function mapPick(ev) { // 展开后：射线与 z=0 平面求交，反算 Mollweide → 经纬度
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const inv = new THREE.Matrix4().copy(earthG.matrixWorld).invert();
    const o = ray.ray.origin.clone().applyMatrix4(inv), d = ray.ray.direction.clone().transformDirection(inv);
    if (Math.abs(d.z) < 1e-6) return null;
    const t = -o.z / d.z; const x = o.x + d.x * t, y = o.y + d.y * t;
    const ll = mollweideInv(x / FS, y / FS);
    return ll ? { lon: ll[0], lat: ll[1] } : null;
  }
  function onMove(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    S.pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1; S.pointer.y = ((ev.clientY - r.top) / r.height) * 2 - 1;
    if (S.p > 0.97 && ev.target === renderer.domElement) {
      const ll = mapPick(ev);
      const id = ll && hitCountry((ll.lon * 180) / Math.PI, (ll.lat * 180) / Math.PI, S.ids);
      renderer.domElement.style.cursor = id ? 'pointer' : 'default';
      hooks.onHover?.(id || null, ev.clientX, ev.clientY);
    } else if (S.p < 0.05) renderer.domElement.style.cursor = 'pointer';
  }
  addEventListener('pointermove', onMove);
  // 拖拽 = 对应方向的旋转（仅地球仪状态；展开后是平面地图，不旋转）
  let drag = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { if (e.isPrimary) drag = { x: e.clientX, y: e.clientY }; });
  const onDrag = (e) => {
    if (!drag || !e.isPrimary) return;
    if (S.p > 0.05 || S.dive > 0.05 || S.diveT) { drag = null; return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    S.vYaw = dx * 0.006; S.vTilt = dy * 0.006;
    S.baseYaw += S.vYaw; S.baseTilt = Math.max(-1.25, Math.min(1.25, S.baseTilt + S.vTilt)); S.dragT = performance.now();
  };
  const endDrag = () => { drag = null; };
  addEventListener('pointermove', onDrag); addEventListener('pointerup', endDrag); addEventListener('pointercancel', endDrag);
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('click', (e) => {
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    if (S.pTarget < 0.5) { hooks.onEnter?.(); return; }
    if (S.p < 0.97) return;
    const ll = mapPick(e);
    hooks.onPick?.(ll ? hitCountry((ll.lon * 180) / Math.PI, (ll.lat * 180) / Math.PI, S.ids) : null);
  });

  // ---- 主循环 ----
  const q = new THREE.Quaternion();
  function loop() {
    if (!S.running) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = (uni.uTime.value += dt);

    // 帧率探测：前 90 帧平均过慢则降档
    if (S.frames < 90) { S.frames++; S.acc += dt; if (S.frames === 90 && S.acc / 90 > 0.03 && quality !== 'low') { api.setQuality(quality === 'high' ? 'mid' : 'low'); hooks.onQuality?.(quality); } }

    // 转场进度
    const speed = reduce ? 6 : S.pTarget > S.p ? 0.42 : 0.55;
    S.p += Math.sign(S.pTarget - S.p) * Math.min(Math.abs(S.pTarget - S.p), dt * speed);
    const p = S.p;
    S.dive += Math.sign(S.diveT - S.dive) * Math.min(Math.abs(S.diveT - S.dive), dt / 1.6);
    const dv = ease(S.dive);
    const f = (1 - seg(p, 0, 0.42)) * (1 - seg(dv, 0, 0.6)); // 展品存在度（仪轨退让／淡出；俯冲时同样退场）
    const u = ease(seg(p, 0.22, 0.97));     // 展平
    earthU.uU.value = u;
    uCosmic.value = 1 - 0.85 * seg(p, 0.2, 0.9); uStar.value = 1 - 0.9 * seg(p, 0.15, 0.8);
    shellU.uFade.value = f; shell.visible = f > 0.01;

    // 海浪状态（偶发翻涌）
    S.swellT -= dt;
    if (S.swellT < 0 && !reduce) { S.swellPhase = 1; S.swellT = 9 + Math.random() * 8; }
    if (S.swellPhase > 0) { S.swellPhase += dt / 4.2; if (S.swellPhase >= 2) S.swellPhase = 0; }
    const swellTarget = S.swellPhase > 0 ? Math.sin(Math.min(1, S.swellPhase - 1 > 0 ? 2 - S.swellPhase : S.swellPhase) * Math.PI / 2) : 0;
    S.swell += (swellTarget - S.swell) * Math.min(1, dt * 2);
    uni.uSwell.value = S.swell;

    // 展品
    exhibit.visible = f > 0.01; exhibit.scale.setScalar(Math.max(0.0001, f)); exhibit.position.y = -(1 - f) * 0.6;
    if (exhibit.visible) {
      const bx = 0.14, bz = 0.06, d = 0.05;
      const h0 = waveH(bx, bz, t, S.swell), hx1 = waveH(bx + d, bz, t, S.swell), hx0 = waveH(bx - d, bz, t, S.swell), hz1 = waveH(bx, bz + d, t, S.swell), hz0 = waveH(bx, bz - d, t, S.swell);
      boat.position.set(bx, WATER_Y + h0 + 0.01, bz);
      boat.rotation.set(Math.atan2(hz1 - hz0, 2 * d) * 1.4, 0.35 + Math.sin(t * 0.2) * 0.05, -Math.atan2(hx1 - hx0, 2 * d) * 1.4 + 0);
      boat.userData.flag.rotation.y = Math.sin(t * 6) * 0.35;
      boat.userData.sails.forEach((s, i) => { s.scale.z = 1 + 0.1 * Math.sin(t * 1.3 + i); });
    }
    if (exhibit.visible) dragon.userData.update(t);
    arm.visible = f > 0.01; arm.scale.setScalar(1 + (1 - f) * 0.35);
    if (arm.visible) rings.forEach((g, i) => {
      g.rotation.x += g.userData.spin[0] * dt; g.rotation.y += g.userData.spin[1] * dt; g.rotation.z += g.userData.spin[2] * dt;
      (g.userData.beads || []).forEach((b) => { const a = t * (0.5 + i * 0.12) + b.userData.phase; b.position.set(Math.cos(a) * g.userData.r, Math.sin(a) * g.userData.r, 0); });
    });
    arm.rotation.y += dt * 0.03;

    // 地表朝向：自转／聚焦；展开时回正
    const interacting = performance.now() - S.dragT < 2500; // 拖拽后 2.5 秒内不自转、不回正
    if (!drag && (Math.abs(S.vYaw) > 1e-4 || Math.abs(S.vTilt) > 1e-4)) { // 惯性
      S.baseYaw += S.vYaw; S.baseTilt = Math.max(-1.25, Math.min(1.25, S.baseTilt + S.vTilt));
      const k = Math.pow(0.94, dt * 60); S.vYaw *= k; S.vTilt *= k;
    }
    if (S.focus && p < 0.3 && !interacting) {
      const k = Math.round(S.baseYaw / TAU) * TAU, target = -S.focus.lon + k;
      const kf = Math.min(1, dt * (S.diveT ? 4 : 2.4));
      S.baseYaw += (target - S.baseYaw) * kf; S.baseTilt += (S.focus.lat - S.baseTilt) * kf;
    } else if (!reduce && !interacting) { S.baseYaw += dt * 0.06 * (1 - seg(p, 0, 0.2)); S.baseTilt += (0.18 - S.baseTilt) * Math.min(1, dt * 1.5); }
    const sRot = ease(seg(p, 0, 0.35)), nearest = Math.round(S.baseYaw / TAU) * TAU;
    earthG.rotation.set(S.baseTilt * (1 - sRot), S.baseYaw + (nearest - S.baseYaw) * sRot, 0);

    // 地图镜头
    if (S.mapTween) {
      const k = clamp01((now - S.mapTween.t0) / S.mapTween.ms), e = ease(k), { f: a, to } = S.mapTween;
      S.mapView = { s: a.s + (to.s - a.s) * e, cx: a.cx + (to.cx - a.cx) * e, cy: a.cy + (to.cy - a.cy) * e };
      if (k >= 1) S.mapTween = null;
    }
    const fd = flatDist();
    const base = 4.4 + (fd - 4.4) * ease(seg(p, 0.08, 1));
    dist = base * (1 - dv) + S.diveDist * dv; zS += (viewZoom.f - zS) * Math.min(1, dt * 6); dist /= zS; // 主动放大
    if (dv > 0.001) { camera.setViewOffset(host.clientWidth, host.clientHeight, -S.off.dx * dv, -S.off.dy * dv, host.clientWidth, host.clientHeight); S.vo = true; }
    else if (S.vo) { camera.clearViewOffset(); S.vo = false; }
    if (S.cb && !S.mapTween && Math.abs(S.dive - S.diveT) < 0.002 && Math.abs(S.p - S.pTarget) < 0.002) { const cb = S.cb; S.cb = null; cb(); }
    const sc = 1.006 + (S.mapView.s - 1.006) * u;
    earthG.scale.setScalar(sc);
    earthG.position.set(offsetX(fd) * u - S.mapView.cx * sc * u, -S.mapView.cy * sc * u, 0);
    if (hooks.onFrame && p > 0.3) { // 供 SVG 图层同步：正视相机下世界→屏幕为仿射变换
      const k = (host.clientHeight / 2) / (dist * Math.tan((camera.fov * Math.PI) / 360));
      hooks.onFrame({ tx: host.clientWidth / 2 + earthG.position.x * k, ty: host.clientHeight / 2 - earthG.position.y * k, s: sc * k, u });
    }
    marker.visible = !!S.focus && p > 0.97;
    if (marker.visible) { const m = (0.05 + Math.sin(t * 2) * 0.004) ; marker.scale.setScalar(m * (1 + ((t * 0.7) % 1) * 0.9)); }

    // 相机：视差 → 正视
    const par = (1 - seg(p, 0, 0.5)) * (1 - dv), yaw = S.pointer.x * 0.32 * par, pitch = -S.pointer.y * 0.2 * par + 0.08 * par;
    S.camYaw += (yaw - S.camYaw) * Math.min(1, dt * 3); S.camPitch += (pitch - S.camPitch) * Math.min(1, dt * 3);
    camera.position.set(Math.sin(S.camYaw) * Math.cos(S.camPitch) * dist, Math.sin(S.camPitch) * dist, Math.cos(S.camYaw) * Math.cos(S.camPitch) * dist);
    camera.lookAt(0, 0, 0);
    nebula.position.copy(camera.position);

    if (bloom.enabled) { bloom.strength = 0.22 * f + 0.05; composer.render(); } else renderer.render(scene, camera);
  }
  bloom.enabled = quality !== 'low';
  api.resume();
  return api;
}
