# Proposal 公共框架与摘录偏好实施计划

用户已确认方案，2026-10-17。只修改独立 Wisp，无模型、无部署。

目标：三次主动成功的 Understand 后可提出偏好邀请，明确保存后应用于未来直接处理与 Page Sprite；历史结果不变。

架构：domain/proposal.ts 提供纯规则状态机；services/proposal-runtime.ts 管理会话与持久偏好；features/proposals 提供邀请、确认和本次摘录控制。事件只由成功持久化的主动执行路径产生，恢复与查看记录不产生事件。会话指本次页面生命周期，不跨标签页累计；提交 ID 去重。偏好在同源页面之间刷新同步。

约束：默认关闭；开启后累计三次成功；一条提议；60 秒展示冷却；待展示/展示提议十分钟过期；忽略、取消确认或忘记后本会话不重问。设置关闭清除待展示邀请，已接受的确认不自动保存。偏好明确保存、可遗忘；保存失败保留确认。Proposal 不额外持久化全文、指针轨迹或行为历史；现有任务/结果仍保存材料副本。

- [x] 1. 新增失败测试：3/8 行、UTF-16、旧记录、规则去重/关闭/冷却/过期、任务参数绑定。
- [x] 2. 实现摘录参数贯穿 ActionDraft、TextRecord、Task、Worker 与结果说明；旧记录默认 8 行。
- [x] 3. 实现规则与偏好运行时；IndexedDB 复用 preferences 仓库，不升级 schema。
- [x] 4. 接入成功执行事件、设置开关、提议卡片、About you 明确保存/忘记；直接和使魔确认面板允许覆盖默认值。
- [x] 5. 浏览器验证：开启与三次触发、对话框延迟、取消不保存、保存/刷新/忘记、Page Sprite 和直接处理生效、旧结果不变、保存失败、跨标签页同步。
- [x] 6. 全量 npm test、npm run test:e2e、npm run build；截图检查、只读审查和更新交付说明。

实现文件：新增 domain/proposal.ts、services/proposal-runtime.ts、features/proposals/Proposal.tsx、ExcerptChoice.tsx、proposal.css；修改 domain/model.ts、local-text.ts、task.ts、services/repository.ts、task-runtime.ts、task.worker.ts、state/stores.ts、CheckPanel.tsx、SummonPanel.tsx、Grimoire.tsx、app/main.tsx。测试新增 proposal.test.ts、proposal-text.test.ts、e2e/proposal.spec.ts。

验证命令在 Wisp 工作目录用完整路径 C:\Progra~1\nodejs\npm.cmd 执行。复用现有本地服务；不清除用户浏览器存储。当前目录无 Git 仓库，不创建提交。

完成验证：37 项单元测试、27 项浏览器测试、类型检查与构建通过；已查看提议截图并完成只读审查。实际文件清单与边界见 ../contracts/proposal.md。
