# Check 后持续关注 · 本地实现契约

2026-10-17。仅独立 Wisp；无真实模型、外部浏览器监控、服务端任务或部署。

## 邀请与授权

- Helpful proposals 默认关闭。主动 Check 已保存结果为 findings/no_findings 时可邀请；一次性 Scout Bat 回信也支持。unsupported 不邀请，历史回看与自动关注检查不产生邀请。
- 三类 Proposal 共用一个展示位置及 60 秒冷却；确认面板、魔法书等打开时推迟出现。邀请十分钟过期，绑定材料 ID、标题和版本；材料变化则失效。
- 同材料每页最多一次邀请，拒绝、取消、完成及过期后不重复询问。刷新重新建立邀请会话，不恢复已有关注。
- “查看关注范围”不授权执行。确认面板显示指定文档完整副本，不沿用局部选区；只有“确认开始关注”成功写入授权才启动。
- 写入前在同一事务对照已保存的版本、正文、标题；未保存或已变化则失败，保持确认界面。当前版本是起点，不立即重复检查。

## 执行与停止

- Web Lock 按材料 ID 绑定发起页面；每 500ms 检查 IndexedDB 中该材料已保存版本，稳定至少 750ms 后入队。这是最佳努力调度，浏览器节流、休眠可造成延迟。
- 同关注串行执行，一个版本最多提交一次；处理中发生的编辑在结束后取最新稳定版本，不承诺覆盖每次编辑。空白及超 60,000 UTF-16 单元的版本跳过并注明原因，后续有效版本继续。
- 复用 Scout Bat、本地 Check Worker、任务锁、结果校验和保存机制。每条任务通过 watchId 关联授权，保留该次全文和版本；本地规则不理解任意自然语言。
- 入队与 lastVersion 推进在同一事务；失败任务不对同版本自动无限重试。运行时或存储异常可导致关注中断，应查看错误后重新确认。
- 停止与关联 queued/running 任务取消在同一事务；迟到回信不能把终态改回完成。已经完成的回信保留。其他同源 Wisp 页面可停止，但不能接管执行。
- 关闭/刷新发起页面后中断；重新打开只恢复记录，需再次明确确认才能继续。Helpful proposals 开关只控制邀请，不取消已授权关注。

## UI 与记录

右侧显示关注数量、进行中任务与未读回信；Familiars 展示关注状态、起点/最近版本、提示、确认时间和停止/重新确认入口。关联任务复用查看回信、复制、已读、收好机制；“重新委托当前全文”仍为一次性任务，重新关注使用独立的“重新确认关注”。数据库 v5 增加 watches，旧材料、设置、checks 和 tasks 保留。

## 实际修改文件（均位于 Wisp）

- 新增 `apps/web/src/domain/watch.ts`、`watch-proposal.ts`：授权记录、任务构造、邀请条件和生命周期。
- 修改 `apps/web/src/domain/task.ts`：可选 watchId。
- 新增 `apps/web/src/services/watch-runtime.ts`：页面所有权、版本合并、恢复、停止和跨页同步。
- 修改 `apps/web/src/services/repository.ts`：v5、关注事务；`task-runtime.ts`：关联任务分派及等待完成；`proposal-runtime.ts`：第三类邀请与共享展示协调。
- 新增 `apps/web/src/features/delegation/WatchPanel.tsx`：全文确认和关注记录。
- 修改 `apps/web/src/features/delegation/TaskList.tsx`、`features/proposals/Proposal.tsx`、`state/stores.ts`、`app/main.tsx`：邀请、弹窗、生命周期、任务和状态展示。
- 新增 `apps/web/tests/watch.test.ts`、`watch-proposal.test.ts`、`watch-migration.test.ts`；更新 `local-storage.test.ts` 的数据库版本断言。
- 新增 `e2e/watch.spec.ts`、`docs/watch-plan.md`、`docs/screenshots/watch-stopped.png`；更新 `README.md`。构建和测试另生成 dist/test-results 等本地产物。

## 验证范围

单元覆盖授权版本、重复关注、重复入队、停止与迟到完成竞争、保留已有回信、邀请条件/冷却/失效，以及 v4 升 v5 保留数据。浏览器覆盖取消不执行、保存新版本回信、关闭提议后仍持续关注、停止后不再检查、跨页不重复、关闭与刷新中断、处理中跨页停止、空版本跳过、处理中连续修订合并。

验收使用独立浏览器测试上下文和测试材料，不代表真实用户数据或研究结果。未验收 Safari、移动端或长期休眠可靠性。

2026-10-17 实测：npm test 为 14 个文件、52 项通过；npm run test:e2e 为 35 项通过，其中持续关注 4 项；npm run build 通过。已查看停止关注截图并完成只读代码审查。后端未修改，本轮未重跑后端测试。
