# 前端数据与素材来源（PRD §22.3）

| 项 | 来源 | 许可 | 用途 |
|---|---|---|---|
| `world-atlas` countries-50m | npm `world-atlas`（Mike Bostock），由 Natural Earth 派生 | Natural Earth 公有领域；`world-atlas` 包 ISC | 世界／国家级底图 |
| `three`、`d3-geo`、`topojson-client`、`vite` | npm | MIT／ISC | 前端渲染与构建 |
| 日本都道府县几何 `web/public/geo/jp/` | github.com/dataofjapan/land（japan.topojson；基于地球地图日本／Global Map Japan） | 许可沿用原始发布者，**使用需标注出处**；几何文件**不入库**（`.gitignore` 排除），由 `scripts/build-jp.mjs` 转换 | 日本一级行政区轮廓 |
| 中国省／地级几何 `web/public/geo/cn/` | 阿里云 DataV areas_v3（高德来源） | 许可未明确允许再分发，**不入库**，由 `scripts/fetch-geo.mjs` 下载 | 中国一级／二级行政区轮廓；节点名称与行政区划代码取自该数据 |
| 国家名单与中文名 | `scripts/build-countries.mjs`：联合国会员国＋梵蒂冈＋巴勒斯坦＋科索沃；中文名来自 Node 的 Intl.DisplayNames（CLDR） | Unicode 许可 | 国家节点 |

3D 模型（帆船、仪轨、水晶）与着色器均为本项目用程序生成，无外部贴图或模型素材。
