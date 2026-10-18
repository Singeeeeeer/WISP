# 第二模块首步：本地 Check

2026-10-17。本轮只实现 Check，不宣称整个第二模块已完成。无模型、无部署；Worldloom 未修改。Understand/Create/Summon 保留准备入口。

## 实际行为

确认快照 → 本地有限规则计算 → 校验原文引用 → 原子保存 → 显示结果。历史记录由顶部“检查记录”进入；不占用使魔名册，也不伪装后台任务。

日期规则版本 schedule-1：同月、无年份、单个匹配的活动开放日期和海报定稿后开放报名日期。定稿不早于活动开放时提示核对，不认定用户有错。无匹配/多匹配、额外日期、非法日历日期、跨月及已识别的取消等上下文标记返回 unsupported；顺序未触发规则时返回 no_findings。两者都不表示全文正确。未实现通用否定语义或事件归属判断，任意补充要求只记录。

## 数据契约

CheckRecord：id 等于此次 snapshot.id；operation=check，execution=local_rules，status=completed，ruleVersion=schedule-1。包含原文快照、补充要求、创建时间、outcome 和 findings。outcome 为 findings / no_findings / unsupported。每个 evidence 保存 quote 和快照内 UTF-16 半开区间；展示时加 snapshot.start 转为原文区间。保存前校验引用与快照一致。

IndexedDB 沿用 wisp-module-one，schema v2 新增 checks，不删除 materials/preferences。完成记录和快照保存在同一条记录中，同事务检查 id、首次写入；重复提交返回已存在记录，不覆盖。提交期间按钮锁定；写入成功前不显示完成。失败保留确认材料，可重试。计算不依赖后端 API，API jobs 仍为 501。

旧标签页阻塞升级时显示先备份/保存草稿再关闭其他页面的提示。新连接遇到更高版本升级请求时关闭自身连接。历史结果不会随原文修改；版本、标题或选区文本不一致时显示过期提示。跨标签页的文档自动同步仍未实现，刷新后加载持久化文档；不是实时协作。

本轮没有 queued/running 的持久任务和恢复执行机制：本地计算同步完成后原子写入。刷新不会自动重试；完整结果是否已写入，以历史记录为准。一次性使魔任务状态机仍属后续步骤。

## 实际修改文件

- 新增 apps/web/src/domain/check.ts：有限规则、结果契约、引用校验。
- 新增 apps/web/src/features/check/CheckPanel.tsx：确认、结果、复制、历史与重新确认。
- 修改 apps/web/src/services/repository.ts：v2 升级、检查记录原子保存、升级阻塞提示。
- 修改 apps/web/src/state/stores.ts：显示具体初始化错误。
- 修改 apps/web/src/app/main.tsx：检查记录入口与独立弹层。
- 修改 apps/web/src/features/capabilities/CapabilityPanel.tsx：Check 路由。
- 修改 apps/web/src/features/grimoire/Grimoire.tsx：功能状态说明。
- 新增 apps/web/tests/check.test.ts、check-storage.test.ts、e2e/check.spec.ts；更新旧 E2E 中 Check 从禁用变为可用的断言。
- 更新 README.md、contracts/module-one.md；新增 docs/module-two-check-plan.md 和本文件。
- 验收截图 docs/screenshots/local-check-findings.png、local-check.png；回归运行也更新原有验收截图。

## 验证记录

- Vitest 4 文件、19 项测试通过：支持/不支持句式、日期变化、emoji 引用、空/超限材料、错误引用、数据库 v1 升级保留、重复提交、升级阻塞，以及原有领域与保存测试。
- Playwright 13 项通过：完整 Check、选区隔离、刷新历史、旧版本提示、重新确认、双击防重复、空材料、模拟磁盘写入失败后重试、复制拒绝；原有魔法环、窗口、保存冲突、API 状态检查回归通过。
- TypeScript 与 Vite 生产构建通过。截图检查使用真实运行的本地页面。
- 存储失败是测试中显式注入的异常，不是真实磁盘故障。没有做真实模型质量测评；后端未改，本轮未重跑 Python 测试。
