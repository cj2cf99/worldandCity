# 0002 S2：触发器与 `RAISE(ABORT)`（仅本地部分）

- 日期：2026-11-10 ／ 对应：设计 §4.3、§13 S2
- 复现：`node spikes/s2-local-trigger.mjs`
- **状态：部分完成。本地 SQLite 侧已验证；D1 侧未验证（本机不安装 wrangler）。S2 因此不能算通过。**

## 问题

触发器与 `RAISE(ABORT)` 在 D1 与本地行为是否一致，错误消息能否被 Worker 解析为统一错误码？

## 本地结果（`node:sqlite`，SQLite 3.54.0）

| 检查 | 结果 |
|---|---|
| 同一 `from` 插入第 4 条 `involves` | 被拒；前 3 条保留（`rowsAfter: 3`） |
| 错误消息 | `E_HISTORY_OBJECT_LIMIT: max 3`；可用 `/^E_[A-Z_]+/` 取出错误码 |
| 其他错误字段 | `errcode: 1811`（`SQLITE_CONSTRAINT_TRIGGER`），`errstr: "constraint failed"` |
| 事务内第 4 条失败 | 整个事务可回滚，库中 0 行 |

## 对设计的影响

- 设计 §4.3 "触发器消息以错误码开头，Worker 解析"在本地成立。
- 触发器检查用 `count(*)`，依赖 `wc_item_relations(from_item_id, relation_type)` 索引（设计 §4.4），后续迁移须建该索引。

## 未验证（阻塞于 wrangler）

- D1（本地模拟 `wrangler dev` 与线上）是否支持同样的触发器、`RAISE(ABORT, …)`。
- D1 返回给 Worker 的异常里，消息是否原样保留、是否带前缀（如 `D1_ERROR: …`）。**Worker 的解析必须容忍前缀**，实现时用 `message.match(/E_[A-Z_]+/)` 而非 `^`，否则可能失效。该写法是对实现的预防性要求，不是已验证事实。
- `batch` 中途失败 D1 是否整体回滚（设计假设成立，官方文档称 batch 为事务，但未实测）。

失败时的备选保持设计 §13 不变：改为单条 `INSERT … SELECT … WHERE count<N` 并检查 `changes`。**该备选在 M5 之前不需要触发，但 M0 退出条件要求在进入 M1 前确定，见 [`0003`](0003-wrangler-blocked-steps.md)。**
