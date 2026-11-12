# 加载与页面负担审核报告

- 日期：2026-11-12
- 状态：**待用户确认**
- 类型：性能 / 加载负担审核（只读，未改动任何代码）

## 1. 审核对象与范围

- 项目：`G:\selftool\worldandcity`，分支 `ui-f3.3-cosmos`，基线提交 `a3b55f1`（工作区另有未提交的 `web/public/`、`referpic/`、开发库改动）。
- 范围：`web/` 前端（`main.js`、`globe.js`、`cosmos.js`、`cosmos-models.js`、`layers.js`、`geo.js`、`tiles.js`）、`web/public/` 静态数据、`vite.config.mjs`、`worker/api.mjs` 的缓存头。
- 不在范围：后端数据正确性、视觉效果本身、安全与合规。
- 对照需求：用户全局约定中「原型要考虑初始加载负担，非首屏内容懒加载」「单人程序、最简设计」；`docs/07-cosmos-freeze-status.md` 与记忆中「宇宙系冻结，恢复前先优化加载」。

## 2. 审核方式

- 阅读上述源码；用 `vite build` 输出到临时目录（scratchpad，不污染 `dist/`）取得真实包体；`du`/`find` 统计 `web/public`。
- **未执行**：浏览器内真实帧率、网络瀑布、Lighthouse、内存抽样（未启动 dev server，结论来自静态分析与构建产物，数值型运行时影响为推断）。
- 未触碰真实或个人数据；开发库仅被 `ls` 读取大小。

## 3. 实测数据

构建产物（gzip 后）：

| 文件 | 原始 | gzip | 何时加载 |
|---|---|---|---|
| index（壳） | 29.8 KB | 12.6 KB | 首屏 |
| 共享 three 块 `OutputPass-*` | 762 KB | 190 KB | 地球或宇宙任一进入时 |
| `geo-*`（world-atlas 50m + d3-geo + topojson） | 790 KB | 249 KB | 进入地球系 |
| globe | 27 KB | 11 KB | 地球系 |
| layers | 17 KB | 7 KB | 平面地图时 |
| cosmos（含 cosmos-models） | 183 KB | 74 KB | 宇宙系 |

静态数据 `web/public`：共 567 个文件、约 **50 MB**（geo 47 MB、nebula 3.3 MB）。最大单文件：`jp/JP-40.json` 3.17 MB、`JP-13.json` 3.13 MB、`JP-11.json` 2.07 MB、`adm1/RU.json` 1.69 MB、`CA.json` 1.1 MB、`nebula/pillars_hst.jpg` 1.87 MB。

好的方面（应保留）：地球／宇宙互不加载，`layers.js` 与 `cosmos.js` 动态 import；切后台 `pause()`；进入平面地图时地球仪暂停；切领域后释放旧场景；`api` 有并发合并与缓存；地图平移瓦片 220 ms 防抖；星云图只在进入对应节点才加载。

## 4. 发现清单

### P1（建议优先处理，收益大且改动小）

| 编号 | 级别 | 问题 | 证据 | 影响 | 建议 |
|---|---|---|---|---|---|
| P1 | 高 | 地球首屏必须下载并解析 world-atlas **50m**（约 750 KB 源、gzip 250 KB），只为画地球仪／世界图 | `web/geo.js:3` 直接 `import topo from 'world-atlas/countries-50m.json'`；该块是最大的单个 JS 块 | 进入地球系的首屏最重项，且主线程要解析 JSON 并构造 feature | 地球仪阶段改用 `countries-110m`（约 100 KB）；仅在进入平面地图（`layers.js`）后再按需引入 50m。需确认 110m 的画面可接受 |
| P2 | 高 | 日本／俄罗斯／加拿大等几何文件体积大，且无压缩与长缓存策略 | `web/public/geo/jp/JP-40.json` 3.17 MB、`JP-13.json` 3.13 MB、`adm1/RU.json` 1.69 MB；`layers.js:40` 整文件 `fetch` + `r.json()` + `rewind`（逐多边形算 `geoArea`） | 点进福冈／东京／埼玉时一次下载数 MB 并在主线程解析、校正绕向，会卡顿；`worker/api.mjs` 只给 API 设了 `cache-control: private`，静态文件无缓存头约定 | ①构建期预先做 `rewind` 并写回文件，运行时不再算；②坐标精度截断到 4～5 位小数、按层级简化（topojson 量化或 mapshaper），预计可缩小 60% 以上；③部署时开启 gzip/br 与 `Cache-Control: immutable`（文件名带哈希或版本号） |
| P3 | 中 | 星云照片没有降采样版本，进入时在主线程做大量像素处理 | `cosmos-models.js:520-560` 的 `photoLayers`：1536² 图片 `getImageData`、两次 canvas `blur` 滤镜、逐像素循环生成 back/dust/stars 三层并再生成 env 层；`pillars_hst.jpg` 1.87 MB；`willReadFrequently` 强制 CPU 画布 | 进入创生之柱／M20 时主线程一次性卡数百毫秒到 1 秒以上（推断），并生成 4 张约 1536² 的纹理（每张约 9 MB 显存） | ①构建期预生成各层（WebP/PNG）运行时直接当纹理用；或至少把 `maxS` 降到 1024、改用 `OffscreenCanvas` + Worker；②JPG 用质量 80 重压缩、WebP 化；③`pillars_jwst` 等备选波段只在切换波段时才加载（现在 `srcs.forEach` 一进入就同时加载并处理两张） |

### P2（运行时负担）

| 编号 | 级别 | 问题 | 证据 | 影响 | 建议 |
|---|---|---|---|---|---|
| P4 | 中 | 宇宙场景渲染管线偏重且无降档 | `cosmos.js:693` `antialias:true` 同时 `cosmos.js:711` composer 目标 `HalfFloatType, samples: 4`；像素比上限 1.75；`bloom` 全分辨率；全部 `Points` 叠加混合；全局无 FPS 探测（`globe.js:522` 有「前 90 帧过慢则降档」，`cosmos.js` 没有） | 4K／高 DPI 屏上填充率很高，低端 GPU 或笔记本集显风扇会转；星云、黑洞等叠加层叠 overdraw | ①去掉 `renderer` 的 `antialias`（有 composer 时无效，多占一份多重采样缓冲）；②把 globe 的帧率探测抄到 cosmos（默认像素比 1.25～1.5，掉帧降到 1）；③bloom 分辨率减半 |
| P5 | 中 | 常驻循环：空闲「纯观赏」与失焦不降帧，但窗口可见时永远全速渲染 | `cosmos.js:734` 无条件 `requestAnimationFrame`；仅 `visibilitychange` 暂停 | 对「只看着」的场景耗电高 | 空闲（`zen` 模式或 N 秒无交互且无动画）时限帧到 30 fps；`prefers-reduced-motion` 下降到更低 |
| P6 | 低 | 每秒 `setInterval` 更新时钟、`pointermove` 全局监听中同时调用 `wake` 的 `clearTimeout/setTimeout` | `main.js:228-240` | 开销很小，但鼠标移动时每个事件都重置定时器 | 可忽略；若要精简，改为 `lastMove` 时间戳 + 一个低频检查 |
| P7 | 低 | 局部地图是纯 SVG，高精度行政区（数万节点路径）一次性挂入 DOM | `layers.js` 以 `path` 绘制 JP/RU 等大文件（P2 相同文件） | 缩放、拖动时 SVG 重绘成本随路径复杂度上升 | 与 P2 的几何简化一起解决；不需要换 Canvas |

### P3（可选 / 低优先）

| 编号 | 级别 | 问题 | 建议 |
|---|---|---|---|
| P8 | 低 | `cosmos-models.js` 源码 180 KB（构建后 cosmos 块 183 KB，gzip 74 KB）全部在进入宇宙系时一次加载 | 目前可接受；若后续继续增加天体，再按层级拆分 `import()` |
| P9 | 低 | 地球侧 OSM 瓦片：每块 PNG、无 `loading`/并发限制，一个视图最多 80 块 | 单人使用可接受；可把上限降到 ~40，或只在稳定 220 ms 后加载（已做） |
| P10 | 低 | `dist/` 为旧构建（11-10，仅含 `dist/geo/cn`），与当前源码不同步 | 发布前重新 `npm run build`；当前 `web/public` 为未提交状态，注意别漏提交，也注意 50 MB 数据会进入每次构建 |
| P11 | 低 | 全局 `three` 约 190 KB gzip 无法再小，除非换用 `three/webgpu` 之外的精简导入 | 保持现状；已经只导入了需要的 pass |

## 5. 结论

**有条件通过（有明显优化空间，但无阻断问题）**。结构上的懒加载方向正确（地球／宇宙互不加载、场景按需 import、后台暂停），主要负担来自三处：**地球首屏的 50m 底图块、日本等大几何文件的整文件下载与解析、星云照片的主线程像素处理**。

建议的最小实施顺序（改动小、收益大优先）：
1. P1：地球仪改用 110m 底图，50m 仅在平面地图时引入。
2. P2：构建期预先 `rewind` + 精度/简化 + 部署压缩与缓存头。
3. P3：星云预处理离线化，备选波段延迟加载。
4. P4：宇宙场景去冗余 `antialias`、加 FPS 降档、bloom 半分辨率。

达到「通过」的最低条件：P1、P2 落实，并在浏览器中实测首屏进入地球系与点进福冈／东京的耗时（本次未实测）。

## 6. 本次审核对环境的影响

- 未修改代码、数据或配置。
- 仅新增本报告；构建产物输出在 scratchpad 临时目录，不在项目内。

---

## 7. 整改记录（同日，用户确认「两个都做」：P1、P2）

状态：**已实施并做了基本验证，待用户确认**。

### P1 已实施：地球首屏改用 110m，50m 后台加载
- `web/geo.js`：静态引入改为 `countries-110m`（约 108 KB）；新增 `loadFull()` 动态引入 50m 并替换 `countries`（含 110m 缺少的 64 个小国，故不会丢失点选与高亮）。
- `web/globe.js`：首屏先用 110m 出图，`loadFull()` 完成后后台重绘陆地与当前选中遮罩。
- `web/layers.js`：顶层 `await loadFull()`，平面地图始终使用精版。
- 构建结果（gzip）：`geo` 块 249 KB → **53 KB**；50m 拆为独立块 `countries-50m`（243 KB），不再阻塞首屏。
- 取舍：50m 仍会在后台下载一次（为保留小国可点），首屏不被阻塞但总流量不变；若愿意放弃小国的地球仪点选，可彻底不加载（需用户决定）。

### P2 已实施：几何文件离线优化
- 新增 `scripts/optimize-geo.mjs`（可重复运行、幂等）：统一绕向 + Douglas–Peucker 简化（jp 0.0002°≈20 m，cn 0.0004°，adm1 0.003°）+ 单行压缩，文件加 `"rewound":true`。
- `web/layers.js`：带该标记的文件跳过运行时 `rewind`（不再对每个多边形算球面面积）。
- 结果：`web/public/geo` 的 jp/cn/adm1 合计 47.0 MB → **31.7 MB**；`JP-40` 3.17 → 0.55 MB，`JP-13` 3.13 → 0.70 MB，`RU` 1.69 → 1.16 MB。
- 备份：优化前的原文件已备份在会话临时目录（scratchpad `geo-backup`），**会话结束后可能被清理**；这些文件不入库，若需长期保留原始精度，请自行另存。
- 未做：静态资源的压缩与长缓存头——仓库内没有静态托管配置（`worker/api.mjs` 只管 API），需在实际部署平台设置。

### 验证（实际执行）
- `vite build` 成功；dev 模式下首页地球仪正常显示、控制台无错误；深链接 `/n/geo.jp-40-fukuoka?s=geo` 进入福冈市平面地图正常渲染，`JP-40.json` 传输约 538 KB（原 3.1 MB）。
- `node --test`：守卫测试 `tests/guard.test.mjs` 失败，原因为 `data/local/worldandcity-dev.sqlite` 的表 `wc_labels` 无规则（`devdb-no-rule-for-table`），与本次改动无关（改动前工作区就已有该开发库改动），未处理。
- 未执行：东京／埼玉等其他大文件的逐一目视对比；高缩放（500%）下简化后的边界与 OSM 瓦片对齐度；真实网络瀑布与耗时对比。

### 本次改动的文件
`web/geo.js`、`web/globe.js`、`web/layers.js`、新增 `scripts/optimize-geo.mjs`；修改了 `web/public/geo/**` 下 jp/cn/adm1 的 JSON（未入库）。临时构建产物在 scratchpad，不在项目内。
