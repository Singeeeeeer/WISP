# 一次性 Summon 实施计划

已授权：只修改 Wisp，复用本地三能力，无模型、无部署。沿用已批准设计，采用 writing-plans / 测试先行流程。

1. 新增 domain/task.ts：角色映射、不可变任务输入、queued/running/completed/failed/cancelled/interrupted 状态；未读和归档独立。
2. repository.ts 升为 v4，新建 tasks 仓库。入队幂等；完成结果与任务同事务保存；召回后拒绝迟到结果；验证输入/结果绑定。
3. services/task-runtime.ts + task.worker.ts：浏览器 Web Worker 运行真实本地处理，Web Locks 保证同任务只有一处执行。持锁范围包含入队到完成；其他页面恢复只将无人持锁的未完任务标为 interrupted，不自动重跑。30 秒超时失败；无百分比、无演示等待。BroadcastChannel 通知同源页面刷新任务列表。
4. SummonPanel 复用材料确认，明确角色限制和一次性范围。任务创建落盘后关闭确认面板；执行与窗口切换无关。
5. TaskList、右侧标记及 Grimoire Familiars 共用任务状态；完成结果复用现有 LocalResult 展示、引用、旧版提示和复制；支持查看、已读、收好、召回、重新确认当前全文再委托。
6. 测试：状态竞争、重复提交、引用绑定、归档保留、版本升级；E2E 三角色回信、刷新、修改原文、跨标签页保护、受控挂起 Worker 的召回与中断、失败重试；全量回归与构建。

关闭页面会停止该页面 Worker，重新打开只恢复记录，不承诺离线后台运行。现有 API jobs 仍未接通；浏览器本地任务不调用它。自由文本要求仅记录不解释；无持续关注、无多 Agent。

实施状态：六步已实现；最终验证与范围限制见 contracts/module-two-summon.md。