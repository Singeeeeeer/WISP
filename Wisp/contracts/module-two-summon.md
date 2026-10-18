# 第二模块：本地一次性 Summon

2026-10-17。仅独立 Wisp 目录变更；未修改 Worldloom、未接真实模型、未部署。

## 已实现流程

Summon 选择使魔 → 核对材料副本与要求 → 入队保存 → Web Worker 执行本地能力 → 校验并保存任务回信 → 右侧未读标记 → 魔法书 Familiars 查看、复制、收好或重新确认委托。

- Scout Bat 巡读蝠调用 Check 日期规则。
- Page Sprite 书页灵调用 Understand 原文摘录。
- Alchemy Imp 炼金灵调用 Create 活动介绍模板。
- 继承各能力的全部限制；自由文本要求仅记录，不理解执行。
- 不创建持续关注或多 Agent；无固定等待、虚构百分比或模拟完成。通常处理很快，不保证用户能观察到每个瞬时状态。
- 选择副本冻结，不读取选区外文本，不改原文；回信复用现有结果渲染、引用、复制、旧版本提示。

## 任务与保存

Task 保存 id、snapshot、instruction、familiar、operation、status、createdAt、updatedAt、unread、archived、error 和可选 result。id 为 task- 加确认快照 ID。同一输入重复提交幂等；同 ID 更换角色、要求或材料时拒绝，需重新确认。

状态 queued → running → completed/failed；pending 可变为 cancelled/interrupted。终态拒绝后续完成，不被迟到回信覆盖。未读和归档独立，收好记录不删除结果。召回与完成通过事务串行化：召回先成功则不再写回信；完成先成功则保留完成结果。

IndexedDB 升级为 v4，新增 tasks 仓库，保留 materials/preferences/checks。完成结果嵌入任务同一条记录原子保存；保存成功后才产生未读回信。使魔回信保存在 Familiars，直接处理结果仍在顶栏“处理记录”，不重复写入两处。

回信必须匹配任务操作、要求、快照及引用区间；拒绝串任务的结果。入队失败保留确认面板；Worker 失败或回信保存失败记录 failed，不展示成功结果。若存储整体无法写入则提示异常，后续恢复按未完成任务处理。

## 执行与恢复边界

每个任务使用独立 module Worker 执行已有 runLocal；Web Lock 从入队前持有到执行和保存结束。恢复使用 ifAvailable 获取同任务锁，只把无人执行的 pending 任务标记 interrupted，不自动重跑，不会打断其他标签页持锁任务。

BroadcastChannel 同步同源页面状态，2.5 秒轮询仅检查本机存储与失去执行者的任务；没有自动分析或模型请求。30 秒处理超时会失败并终止线程；该超时路径有实现，本轮未单独做时间推进测试。

关闭或刷新执行页面停止未完成 Worker。重新打开恢复记录，不承诺离线/服务端后台执行。重新委托使用当前全文新快照，保留角色和要求，返回确认面板等待用户再次提交。缺少 Worker 或 Web Locks 的浏览器不能执行该流程；本轮在本机 Chrome 验证。生产构建成功不等于已部署。

## 界面

- 右侧：进行中数量、未读回信数量、失败/中断提醒；按钮直达 Familiars。
- Familiars：任务状态、材料范围、要求、错误；处理中可召回，完成可查看，终态可收好及重新确认委托。
- 回信：使魔名称、原始能力结果、引用与旧版本提示，复制不覆盖原文。
- 归档任务保留在记录列表，可再次打开。未实现单独筛选/搜索、使魔飞行动画、暂停或持续关注。

## 实际变更文件

新增：

- apps/web/src/domain/task.ts：角色、任务契约和状态转换。
- apps/web/src/services/task-runtime.ts：锁、Worker 执行、恢复、跨页刷新及 Zustand 任务状态。
- apps/web/src/services/task.worker.ts：本地处理线程。
- apps/web/src/features/delegation/SummonPanel.tsx：范围确认及提交。
- apps/web/src/features/delegation/TaskList.tsx：右侧标记、名册和回信。
- apps/web/tests/tasks.test.ts、e2e/summon.spec.ts：任务及浏览器测试。
- docs/module-two-summon-plan.md、本文件、docs/screenshots/summon-Scout.png / summon-Page.png / summon-Alchemy.png。

修改：

- apps/web/src/services/repository.ts：v4 升级和事务化任务操作。
- apps/web/src/features/capabilities/CapabilityPanel.tsx：路由到 SummonPanel。
- apps/web/src/features/check/CheckPanel.tsx：导出共享 LocalResult，支持重新委托按钮文案。
- apps/web/src/features/grimoire/Grimoire.tsx、state/stores.ts：Familiars 与书页入口状态。
- apps/web/src/app/main.tsx：任务观察与右侧标记、状态说明。
- apps/web/tests/local-storage.test.ts：最新存储版本断言。
- e2e/workspace.spec.ts、e2e/magic-ring.spec.ts：Summon 从不可用变为可执行的断言。
- README.md：启动不变，更新操作与范围。回归也更新已有验收截图。

## 最终验证

- Vitest：7 个文件，31 项通过。包含幂等、错误授权重复拒绝、回信绑定、召回后的迟到完成、归档保留、v3 文档/偏好/处理记录升级保留，以及已有能力和保存规则。
- Playwright：23 项全量通过。新增 8 项覆盖三角色真实本地回信、切换文档、刷新和归档、跨标签页持锁保护与召回、页面刷新中断与确认重试、入队/Worker/回信保存故障、选区冻结、原文变化、双击单任务。
- 类型检查及 Vite 生产构建通过，产物包含独立 task.worker 脚本。
- 查看了 Scout Bat 与 Page Sprite 实际回信截图。独立只读审查未报告确定性重要问题；审查提醒的重复 payload 校验已补齐并测试。
- 测试中的挂起 Worker 和写入错误为显式注入，用来验证边界，不是产品模拟执行。三角色正常路径使用真实本地 Worker。后端未改，本轮未重跑 Python 测试；无模型质量或真实用户效果结论。
