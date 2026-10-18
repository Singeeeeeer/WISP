# Proposal 公共框架与简短摘录偏好

2026-10-17。只在独立 Wisp 目录实现，未修改 Worldloom、未接真实模型、未部署。

## 已实现

Helpful proposals 默认关闭。开启后，本页主动成功完成并持久化的 Understand（包括 Page Sprite）按提交 ID 去重计数；3 次后生成偏好邀请。一次最多一条，材料/结果/魔法书/魔法环打开时隐藏或推迟展示。60 秒展示冷却和十分钟待展示/展示过期由纯规则管理。本版只有一种提议，忽略、取消确认、关闭已有邀请或完成后本会话不再提议；刷新开始新会话，历史记录不重新计数。计数不跨标签页合并。

“查看设置”只接受邀请，进入 About you 的确认页。只有点击“保存偏好”才写入简短 3 行或标准 8 行设置。保存失败保留确认和错误提示，支持重试；忘记失败保留原偏好。About you 显示来源和确认时间，可忘记。已接受但未保存的确认在关闭/切换书页后取消；点击保存已授权的写入会完成，不因界面关闭撤销。

直接 Understand 和 Page Sprite 的材料确认采用已保存默认值，允许仅覆盖本次。摘录保持原文顺序、UTF-16 引用和遗漏行数；不是语义摘要。结果与任务保存本次摘录参数，后续改变偏好不改写历史。旧记录无参数时按 8 行解释；任务拒绝与确认行数不匹配的回信；同提交 ID 改参数会被存储拒绝。

IndexedDB 仍为 v4，复用 preferences 中 confirmed-excerpt-preference 键。偏好通过 BroadcastChannel 和页面 focus 重读同步；事件计数只在内存。不额外保存材料正文、鼠标轨迹或行为历史。已有处理记录与任务仍按原机制保存材料副本。关闭 Helpful proposals 不取消已授权任务，也不删除已确认偏好。

## 实际变更文件

新增：

- apps/web/src/domain/proposal.ts：事件计数、提议生命周期、偏好类型与校验。
- apps/web/src/services/proposal-runtime.ts：Zustand 会话、明确保存/忘记、偏好恢复与跨页面同步。
- apps/web/src/features/proposals/Proposal.tsx：邀请卡片、About you 确认和管理。
- apps/web/src/features/proposals/ExcerptChoice.tsx：本次摘录长度选择。
- apps/web/src/features/proposals/proposal.css：提议卡片与选项样式。
- apps/web/tests/proposal.test.ts、proposal-text.test.ts：规则、参数与历史兼容测试。
- e2e/proposal.spec.ts：四项浏览器流程测试。
- docs/proposal-plan.md、本文件、docs/screenshots/proposal-invitation.png。

修改：

- apps/web/src/domain/model.ts：ExcerptLimit 与可选请求参数。
- apps/web/src/domain/local-text.ts：参数化摘录、结果参数与引用/行数校验、动态说明。
- apps/web/src/domain/task.ts：冻结行数、回信参数绑定。
- apps/web/src/services/repository.ts：重复提交时检查摘录参数一致。
- apps/web/src/services/task.worker.ts：按任务参数运行。
- apps/web/src/services/task-runtime.ts：仅成功保存完成回信时上报事件。
- apps/web/src/state/stores.ts：启动恢复偏好、开关联动。
- apps/web/src/features/check/CheckPanel.tsx：直接处理参数、成功事件、结果与复制说明。
- apps/web/src/features/delegation/SummonPanel.tsx：委托确认参数。
- apps/web/src/features/grimoire/Grimoire.tsx：About you 与设置说明。
- apps/web/src/app/main.tsx：提议显示、对话框避让和偏好观察生命周期。
- README.md：操作说明与边界更新。全量回归亦重新生成已有验收截图。

## 实际验证

- 新摘录参数测试先观察到 3 项预期失败，再实现至通过；Proposal 浏览器测试先确认缺失邀请，再接通实现。
- npm test：9 个文件、37 项通过。
- npm run test:e2e：27 项全量通过，含新增 4 项 Proposal 流程。
- npm run build：TypeScript 检查与 Vite 构建通过。
- 新流程覆盖开启、三次触发、结果面板避让、忽略/取消不保存、刷新恢复、3 行直接与使魔摘录、忘记恢复 8 行、旧结果保留、故障注入后重试、跨页保存/忘记同步、关闭提议和单次参数覆盖。
- 规则单测覆盖重复 ID、非 Understand、关闭、已有偏好、阻塞、60 秒冷却和十分钟过期。时间阈值不是用户研究结论。
- 已查看真实浏览器生成的 proposal-invitation.png；只读审查未发现确定性重要缺陷。

测试使用隔离 Chrome 上下文；偏好写入故障为明确测试注入。未运行后端 Python 回归，本轮后端无变更。未实现联合整理、Canvas 关联、持续关注或真实语义分析。
