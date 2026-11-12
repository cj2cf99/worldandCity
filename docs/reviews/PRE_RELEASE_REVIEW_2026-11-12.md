# 合并前自审（Bug 与合规）

- 日期：2026-11-12
- 状态：**待用户确认**（自审，不是第三方审核）
- 对照需求：README「公开仓库数据声明」「部署与数据约束」；`web/SOURCES.md`（数据来源与许可）；用户指示「确认没 bug 和合规性问题后合并主站并上线，上线时保留已录入的个人数据」；用户的最简设计原则。

## 1. 范围与基线

- 分支 `ui-f3.3-cosmos`，HEAD `a3b55f1`（已推送到 `origin/ui-f3.3-cosmos`）；`main` 与 `origin/main` 为 `8c49ddb`，落后该分支 3 个提交（`git diff --stat main..HEAD`：57 个文件，约 +108,889/−414，主要是种子数据与前端）。
- 范围：本次会话所有未提交改动（`web/geo.js`、`globe.js`、`layers.js`、`labels.js`、`main.js`、`fx.js`、`tiles.js`、`index.html`、`style.css`、`vite.config.mjs`、`README.md`、`scripts/optimize-geo.mjs`，删除 `worker/node-write.mjs`、`worker/search-norm.mjs`、`tests/node-write.test.mjs`、`spikes/`）与「能否合并、能否上线」的合规检查。
- 不在范围：宇宙系场景内容（冻结，未改）；Cloudflare 侧配置（仓库里没有）。

## 2. 审核方式与实际执行

- 读完整 `git diff -- web/` 与相关源码；读 README、`web/SOURCES.md`、`scripts/guard.mjs`、`docs/decisions/0003`。
- 用 `node:sqlite` 只读检查工作区、`HEAD`、`origin/main`、`origin/ui-f3.3-cosmos` 三处的开发库行数（只看计数与前几条标签的类型，**报告不记录标签内容**）。
- 执行：`node --test` → 40 项**全部通过**；`node scripts/guard.mjs --all` → **通过（91 个文件）**；`vite build` 成功；浏览器（内置，localhost dev server）：地球仪、东京千代田区平面地图（232 条路径、18 块瓦片）、银河系场景、特效面板、纯观赏开关，均无控制台错误；`/api/v1/labels` 返回 23 条、`/api/v1/nodes?kind=country` 返回 197 个国家。
- **未执行**：Cloudflare 部署与 D1/KV/R2 绑定（本机不装 wrangler，见 decisions/0003 的 B1–B8）；Worker 运行时的契约测试；1000% 放大下轮廓与瓦片对齐的目视核对；在他人机器／移动端的实测。

## 3. 发现清单

| 编号 | 级别 | 问题 | 证据 | 处理 |
|---|---|---|---|---|
| C1 | **阻断（已处理）** | 入库的开发库里被写入了 23 条个人标签（家、亲属住处等地点标注），一旦提交就会进入公开仓库 | `data/local/worldandcity-dev.sqlite` 工作区 `wc_labels` 23 行；`HEAD`／`origin/ui-f3.3-cosmos` 为 0 行（即**尚未泄露**）；守卫测试 `guard.test.mjs` 失败正是因为该表有数据、无规则——守卫起作用了 | ① 先把整份库复制到 `data/private/worldandcity.sqlite`（被 `.gitignore` 排除），并导出 `labels-export.json`／`labels-import.sql`（均在 `data/private/`）；② `vite.config.mjs` 让页面读写该私有库，缺失时才从示例库复制；③ 用 `git checkout` 把入库开发库还原为 `HEAD`（0 个标签）。复核：私有库 23 条，API 返回 23 条；入库库 0 条；守卫与测试通过 |
| C2 | **阻断（上线）** | 目前不具备「上线」条件 | 仓库没有 `wrangler.jsonc`、没有 D1/KV/R2 绑定；`docs/decisions/0003` 的 B5–B8（部署、绑定、Worker 契约测试、线上种子导入）全部「未开始」；本机不安装 wrangler | **本次未上线**。需要先有可用的 Cloudflare 环境与部署步骤（见第 5 节） |
| C3 | **高（上线前必须解决）** | 没有任何访问控制：`/api/v1/labels` 可被任何访问者读写，上线后个人标签会暴露 | `worker/api.mjs` 无认证；设计文档要求 `workers.dev` 关闭、私有访问，但尚未实现 | 上线前必须加访问保护（如 Cloudflare Access 只允许本人），并把 `labels-import.sql` 只导入受保护的线上库 |
| C4 | **高（上线前必须解决）** | 公开托管＝再分发第三方数据，其中两类许可未确认 | `web/SOURCES.md`：中国几何来自阿里云 DataV（高德来源），「许可未明确允许再分发」；`web/public/nebula/`、`referpic/` 的图片来源与许可「未核实」（`docs/07-cosmos-freeze-status.md` §2.5） | 上线版本不要打包 `web/public/nebula/` 与 `referpic/`；中国几何要么确认许可，要么线上只给本人访问（与 C3 同一措施），要么上线时去掉。本次**没有把这些文件加入提交** |
| C5 | 中（已修） | 日本行政区轮廓需要署名 | `SOURCES.md`：国土数値情報要求标注出处；界面原先只显示 OSM 署名 | `layers.js` 的地图署名已加「日本轮廓：国土交通省 国土数値情報を加工して作成」 |
| B1 | 低 | 删除标签旧迁移后，若某个浏览器里仍有未迁移的旧本地标签，会随下次保存丢失 | `labels.js` 旧逻辑只在首次加载把 `localStorage` 标签搬进库；本机标签已全在库里（23 条）。其它浏览器（Chrome 等）里是否残留**未验证** | 如在别的浏览器用过旧版本，先在那里打开一次旧版本迁移；否则忽略 |
| B2 | 低 | 深链接直达 110m 底图里没有的小国，首次取景可能落空 | 复审 R3 | 已知，未处理 |
| B3 | 低 | 本地脚本 `node scripts/db.mjs seed/migrate` 默认仍指向入库的示例库，页面用的是私有库，二者可能结构不同步 | `scripts/db.mjs` 默认路径 | README 已注明对私有库要加 `--db data/private/worldandcity.sqlite`；以后新增迁移后需对两个库各执行一次 |
| B4 | 低 | 地球仪 8192 贴图会绘制两次（110m、50m 到位后） | 复审 R4 | 已知，未处理 |

结论（自审）：**代码层面有条件通过——可以提交并合并到 `main`**（无已知功能性 bug，测试全过，守卫通过，个人数据已隔离）；**不通过上线**：C2、C3、C4 未解决。

## 4. 个人数据处理说明

- 个人数据只存在于：`data/private/worldandcity.sqlite`（运行库）、`data/private/labels-export.json`、`data/private/labels-import.sql`、`data/private/labels-backup-2026-11-11.json`（早先已有的备份）。这些路径都被 `.gitignore` 排除，守卫测试覆盖。
- 本次没有删除或改写任何个人标签；报告不写标签内容。
- 入库的开发库已还原到 `HEAD`，不含个人数据。
- 上线时保留个人数据的办法：对受保护的线上 D1 执行 `labels-import.sql`（`INSERT OR REPLACE`，可重复执行，不会清掉线上其它数据）。**未执行**。

## 5. 上线前最低条件（建议顺序）

1. 在可运行 wrangler 的环境（另一台电脑或明确允许本机安装）补做 B1–B8，建立 `wrangler.jsonc`、D1/KV/R2 绑定。
2. 访问保护（C3）：线上只允许本人访问，关闭 `workers.dev`。
3. 数据与素材清单（C4）：不打包 nebula/referpic；确认或排除中国几何；OSM 瓦片与 N03 署名保留。
4. 线上库迁移 + 种子导入 + `labels-import.sql`，随后核对标签数量为 23。
5. 部署后在线上做一次冒烟检查（首页、一次平面地图、标签读取）。

## 6. 合并建议

- 提交时只加入明确列出的文件；`web/public/`（含 nebula）、`referpic/` 不提交。
- 合并到 `main` 后会改变公开仓库的默认分支内容（**对外可见**），需要用户明确同意再执行 `git merge`／`git push`。

## 7. 审核过程中的变更

- 修改了：`vite.config.mjs`、`README.md`、`web/layers.js`（署名）；还原了入库开发库；新增 `data/private/` 下的私有库副本与标签导出（不入库）。
- 未提交的临时文件：无（构建产物在会话临时目录）。
