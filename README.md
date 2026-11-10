# World & City

艺术化空间信息展示与综合管理入口（个人单用户 Web 应用）。详细需求见 [`WorldAndCity_PRD_v1.2_Spatial_Annotation_AI_Development.md`](WorldAndCity_PRD_v1.2_Spatial_Annotation_AI_Development.md)。

仓库地址：<https://github.com/cj2cf99/worldandCity>

## ⚠️ 公开仓库数据声明（必读）

**本项目为公开仓库。**

- ✅ **可以上传**：通用数据记录，用于支持建模与展示（公开来源且可再分发的地理／行政层级数据、示例与演示数据、数据结构样例、测试夹具等）。
- ❌ **禁止提交**：个人数据和私密数据，包括但不限于：
  - 真实人物资料、联系方式、住址、真实生活与关系记录、个人照片及附件；
  - 账号、密码、令牌、API Key、`.env` 等凭据；
  - 数据库文件、真实备份／导出文件、含个人信息的日志与截图；
  - 非公开或无再分发许可的第三方数据。
- 真实运行数据只保存在仓库之外或被 `.gitignore` 排除的本地／私有位置；演示数据须与真实数据明确分离。
- 提交前请自查 `git status` / `git diff`。若误提交敏感内容，请立即撤销并轮换相关凭据（仅删除后续提交不足以清除 Git 历史）。

## 文档索引（当前阶段：开发，自 2026-11-10 起，由用户指定进入）

- [需求分析](docs/01-requirements-analysis.md)
- [详细设计](docs/02-detailed-design.md)
- [里程碑与验证排期](docs/03-milestones.md)
- [合规复审（遗漏／偏离／最简化，两轮）](docs/04-compliance-review.md)
- [**开发记录**（每个功能一份，含需求遗漏／偏移／最简化检查，供审核）](docs/dev-log/README.md)

## 开发命令

需要 Node ≥ 22.13（本项目目前仅在 Node 26 上验证）。无第三方依赖，无需 `npm install`。

| 命令 | 作用 |
|---|---|
| `node --test` | 运行全部测试（内存库／临时目录，不改动开发库） |
| `node scripts/db.mjs migrate` | 对开发库应用迁移 |
| `node scripts/db.mjs seed` | 迁移并导入公开种子（幂等） |
| `node scripts/guard.mjs --all` | 对全部已跟踪文件运行提交守卫 |
| `git config core.hooksPath .githooks` | 启用 pre-commit 守卫（克隆后需执行一次；CI 也会运行同一守卫） |

## 部署与数据约束（2026-11-10 确认）

- 线上：Cloudflare D1（SQLite）存结构化数据，KV 存恒定设置，R2（私有桶）存文件。
- 本地：开发库为仓库内的 `data/local/worldandcity-dev.sqlite`（本项目新建的空库，允许入库，只放通用／示例数据；真实数据严禁写入）。测试在内存库上运行。
- 本项目不依赖、不引用、不复制任何其他项目的代码或数据文件。
