# 前端数据与素材来源（PRD §22.3）

| 项 | 来源 | 许可 | 用途 |
|---|---|---|---|
| `world-atlas` countries-50m | npm `world-atlas`（Mike Bostock），由 Natural Earth 派生 | Natural Earth 公有领域；`world-atlas` 包 ISC | 世界／国家级底图 |
| `three`、`d3-geo`、`topojson-client`、`vite` | npm | MIT／ISC | 前端渲染与构建 |
| 日本都道府县几何 `web/public/geo/jp/` | github.com/dataofjapan/land（japan.topojson；基于地球地图日本／Global Map Japan） | 许可沿用原始发布者，**使用需标注出处**；几何文件**不入库**（`.gitignore` 排除），由 `scripts/build-jp.mjs` 转换 | 日本一级行政区轮廓 |
| 中国省／地级几何 `web/public/geo/cn/` | 阿里云 DataV areas_v3（高德来源） | 许可未明确允许再分发，**不入库**，由 `scripts/fetch-geo.mjs` 下载 | 中国省／地级／区县三级行政区轮廓（`scripts/fetch-geo.mjs`、`scripts/fetch-cn-counties.mjs` 下载）；节点名称与行政区划代码取自该数据 |
| 国家名单与中文名 | `scripts/build-countries.mjs`：联合国会员国＋梵蒂冈＋巴勒斯坦＋科索沃；中文名来自 Node 的 Intl.DisplayNames（CLDR） | Unicode 许可 | 国家节点 |
| 全球一级行政区 `web/public/geo/adm1/` | Natural Earth 10m admin-1 states/provinces（github.com/nvkelso/natural-earth-vector，ne_10m_admin_1_states_provinces.geojson，约 40.7 MB） | 公有领域；几何文件**不入库**，由 `scripts/build-adm1.mjs` 生成（中文／英文／日文名、类型、ISO 3166-2、区域、面积也取自该数据） | 各国二层节点与轮廓（中国、日本除外） |
| 最细行政边界 `web/public/geo/osm-raw/`、`cn/`、`jp/` 中的街道／乡镇／村／町丁目文件 | OpenStreetMap（Overpass API），由 `scripts/fetch-osm-detail.mjs`、`scripts/build-osm-detail.mjs` 取得与转换 | ODbL，**© OpenStreetMap contributors**（www.openstreetmap.org/copyright）；几何不入库；种子里的节点名称来自该数据，使用需署名 | 咸阳永寿／泾阳、西安 7 区、无锡各区、呼和浩特各区县旗，日本埼玉市、东京 23 区、北九州市的更细行政级别 |

3D 模型（帆船、仪轨、水晶）与着色器均为本项目用程序生成，无外部贴图或模型素材。
