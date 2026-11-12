// 宇宙视觉特效设置（观赏模式 / 科学模式、星云、暗尘、辉光、闪烁、动态强度、性能质量），记住上次设置。
// 只影响显示层：不改任何天体的坐标、数量与形态；闪烁、呼吸都是观赏性的艺术效果，不代表真实天体在秒级时间内的物理变化。
const KEY = 'wc.fx.v2', DEF = { mode: 'view', neb: true, dust: true, glow: true, twinkle: true, dyn: 1, preset: 'std', band: 3, gals: 1, basinRef: 0, flow: 2, moons: 1, belt: 1, comets: 1, tails: 1, parker: 0, labels: 1, atmo: 1, refOn: 1, ref: { cut: 0, orbit: 0, xray: 0 }, quality: 'auto', rich: 1, star: 1, spike: 3, bloom: 1, glowK: 1, auto: true, wind: 1 };
export const FX = { ...DEF };
try { Object.assign(FX, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* 隐私模式等：用默认值 */ }
Object.assign(FX, { rich: DEF.rich, star: DEF.star, spike: DEF.spike, bloom: DEF.bloom, glowK: DEF.glowK, twinkle: DEF.twinkle }); // 这几项已从面板移除，固定为默认值（不再读取旧的本地设置）
export const NAV = { cur: '', zsel: -1, vz: 1 }; // 当前场景与缩放选择（场景内部读取，如 AT2019qiz 的阶段跳转）
export const FXU = { uBr: { value: 1 } }; // 星云“呼吸”幅度（着色器共享）
export const saveFX = () => { try { localStorage.setItem(KEY, JSON.stringify(FX)); } catch { /* 忽略 */ } };
// 各层级的闪烁参数 [幅度, 周期秒]（观赏模式初始值，按“统一亮点动画系统”表；未列出的层级不闪烁）
export const TWINKLE = {
  'cel.milkyway': [0.09, 8], 'cel.orion-arm': [0.1, 9], 'cel.local-bubble': [0.08, 10], 'cel.neighborhood': [0.04, 10], 'cel.oort': [0.08, 12], 'cel.laniakea': [0.04, 20], 'cel.local-group': [0.04, 14], 'cel.virgo-cluster': [0.025, 20],
  'cel.local-supercluster': [0.02, 25], 'cel.laniakea': [0.03, 20], 'cel.pisces-cetus': [0.02, 30], 'cel.sloan-wall': [0.01, 35], 'cel.hcb-wall': [0.01, 35],
};
export const DYN = [0, 1, 1.6]; // 动态强度：关 / 标准 / 增强
export const ATMO = [0.5, 1, 1.6]; // 氛围背景（银河局部辉光与薄雾）：低 / 中 / 高
// 各层级的色彩丰富度（多色温粒子的着色强度）与短暂星芒的出现概率系数；未列出的层级为 0（太阳、太阳系等用各自的材质）
export const RICH = { 'cel.neighborhood': 0, 'cel.local-bubble': 0.3, 'cel.orion-arm': 0.9, 'cel.milkyway': 0.5, 'cel.local-group': 0.35, 'cel.virgo-cluster': 0.3, 'cel.local-supercluster': 0.5, 'cel.laniakea': 0.5, 'cel.pisces-cetus': 0.5, 'cel.sloan-wall': 0.5, 'cel.hcb-wall': 0.4 };
// 星芒出现频率系数（银河 = 1；越往上层越少，最顶层为银河的 1/5；系数越小，同一槽位换星的间隔越长）
export const GLINT = { 'cel.oort': 0.6, 'cel.neighborhood': 1, 'cel.local-bubble': 0.8, 'cel.orion-arm': 1, 'cel.milkyway': 1, 'cel.local-group': 0.8, 'cel.virgo-cluster': 0.65, 'cel.local-supercluster': 0.5, 'cel.pisces-cetus': 0.32, 'cel.sloan-wall': 0.26, 'cel.hcb-wall': 0.2 };
export const SPIKE = { n: [0, 0.3, 0.6, 0.9, 1.2], i: [0, 0.3, 0.6, 0.9, 1.2] }; // 星芒五档：数量与亮度系数同为 0–1.2，由同一个开关控制
export const STEP3 = { rich: [0.5, 1, 1.4], star: [-0.2, 0, 0.2], bloom: [0.6, 1, 1.4], glowK: [0.6, 1, 1.3] }; // 低 / 标准 / 高（有上限，避免过曝）
// 参考系统预设：纯观赏／标准／科学（自定义＝手动改过开关）。“参考线”是唯一总开关，接管所有层级的辅助线（拉尼亚凯亚的引力流线除外）；
// 剖切观察、软 X 射线热气体、彗星轨道演示不是参考线，各自独立，不受预设影响。
export const PRESETS = {
  view: { basinRef: 0, flow: 2, refOn: 0, parker: 0, labels: 1, atmo: 2, mode: 'view' },
  std: { basinRef: 0, flow: 2, refOn: 1, parker: 0, labels: 1, atmo: 1, mode: 'view' },
  sci: { basinRef: 1, flow: 1, refOn: 1, parker: 1, labels: 2, atmo: 0, mode: 'sci' },
};
export const applyPreset = (name) => { const p = PRESETS[name]; FX.preset = name; FX.refOn = p.refOn; FX.basinRef = p.basinRef; FX.flow = p.flow; FX.parker = p.parker; FX.labels = p.labels; FX.atmo = p.atmo; FX.mode = p.mode; };
// 统一模拟时间：距 J2000.0 的年数。行星、彗星共用；1 倍速＝0.12 年/秒（见 cosmos.js）。观赏用的时间压缩，不是实时。
export const SIM = { yr: (Date.now() - Date.UTC(2000, 0, 1, 12)) / 31557600000, speed: 1, jump: 0 };
export const SIM_RATE = [0, 1, 8, 40];
export const nowYr = () => (Date.now() - Date.UTC(2000, 0, 1, 12)) / 31557600000;
export const simDate = (yr) => { try { return new Date(Date.UTC(2000, 0, 1, 12) + yr * 31557600000).toISOString().slice(0, 10); } catch { return '—'; } };
export const JUMPS = [['当前日期', null], ['1986 哈雷回归', -13.8], ['1997 海尔-波普', -2.76], ['2015 67P 与罗塞塔', 15.61]];
