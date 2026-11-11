# 前端数据与素材来源（PRD §22.3）

| 项 | 来源 | 许可 | 用途 |
|---|---|---|---|
| `world-atlas` countries-50m | npm `world-atlas`（Mike Bostock），由 Natural Earth 派生 | Natural Earth 公有领域；`world-atlas` 包 ISC | 世界／国家级底图 |
| `three`、`d3-geo`、`topojson-client`、`vite` | npm | MIT／ISC | 前端渲染与构建 |
| 日本都道府县几何 `web/public/geo/jp/` | github.com/dataofjapan/land（japan.topojson；基于地球地图日本／Global Map Japan） | 许可沿用原始发布者，**使用需标注出处**；几何文件**不入库**（`.gitignore` 排除），由 `scripts/build-jp.mjs` 转换 | 日本一级行政区轮廓 |
| 中国省／地级几何 `web/public/geo/cn/` | 阿里云 DataV areas_v3（高德来源） | 许可未明确允许再分发，**不入库**，由 `scripts/fetch-geo.mjs` 下载 | 中国省／地级／区县三级行政区轮廓（`scripts/fetch-geo.mjs`、`scripts/fetch-cn-counties.mjs` 下载）；节点名称与行政区划代码取自该数据 |
| 国家名单与中文名 | `scripts/build-countries.mjs`：联合国会员国＋梵蒂冈＋巴勒斯坦＋科索沃；中文名来自 Node 的 Intl.DisplayNames（CLDR） | Unicode 许可 | 国家节点 |
| 全球一级行政区 `web/public/geo/adm1/` | Natural Earth 10m admin-1 states/provinces（github.com/nvkelso/natural-earth-vector，ne_10m_admin_1_states_provinces.geojson，约 40.7 MB） | 公有领域；几何文件**不入库**，由 `scripts/build-adm1.mjs` 生成（中文／英文／日文名、类型、ISO 3166-2、区域、面积也取自该数据） | 各国二层节点与轮廓（中国、日本除外） |

3D 模型（帆船、仪轨、水晶）与着色器均为本项目用程序生成，无外部贴图或模型素材。
| 现势地图底图（运行时加载）| OpenStreetMap 标准瓦片 tile.openstreetmap.org（浏览器按需请求，**不下载、不入库**） | © OpenStreetMap contributors（ODbL；瓦片图为 CC BY-SA 2.0）；需署名，页面右下角已显示；遵守其瓦片使用政策（只在查看指定地区时加载少量瓦片） | 咸阳、西安、无锡、呼和浩特各区县与埼玉市、东京、北九州市的局部地图底图（`web/tiles.js`） |
| 日本市区町村轮廓 `web/public/geo/jp/JP-11/13/40/35.json` 及各政令市的区 | 国土交通省 国土数値情報「行政区域データ N03-20240101」（nlftp.mlit.go.jp，埼玉／东京／福冈／山口 4 个文件，约 29 MB） | 政府标准利用规约（第2.0版）；出处：国土交通省 国土数値情報（行政区域データ）を加工して作成；几何文件**不入库**，由 `scripts/build-jp-detail.mjs` 生成 | 埼玉、东京、福冈各市区町村及下关市的节点与轮廓 |
