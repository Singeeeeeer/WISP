# 两份文本联合整理 Proposal

2026-10-17。只在独立 Wisp 目录开发，未修改 Worldloom；未接真实模型、未部署。

## 操作与实现

Settings 中 Helpful proposals 默认关闭。开启后，本页两分钟内真正激活 A→B→A 三个窗口事件，可产生联合整理邀请。重复点击当前窗口、恢复布局和历史回看不计入。触发仅代表切换线索，不代表语义理解或用户需求已确定。

两份文本必须非空且各不超过 60,000 UTF-16 单元。邀请绑定材料 ID、版本与标题，修改后或十分钟后失效。相同材料对在本会话忽略、取消、完成或失效后不重复提议。与摘录偏好提议共享单条展示和 60 秒冷却；已有偏好不会阻止联合提议。关闭开关清除未接受的邀请，刷新清除会话事件。仅保留最多三个近期激活事件，不保存行为轨迹。

“查看两份材料”只打开确认，不执行或保存结果。确认展示两份全文副本及标题、ID、版本、UTF-16 范围，明确不沿用原单份选区。每份采用独立 3/8 行配额；默认采用已确认摘录长度，没有偏好时为 8 行，可只修改本次。提交后分别调用已有本地 Understand 摘录规则，不合并事实、不推断关联，不声称语义综合摘要。

两份副本各自冻结。接受后原文变化仍处理所确认副本，面板提供“更新两份当前全文”；更新后仍需提交。每份结果保留原始引用、遗漏数、材料副本，分别显示旧版本状态。复制包含两份来源与各引用位置。“重新确认两份全文”使用本页当前材料重新确认，不覆盖旧结果。

联合结果 operation=joint，作为一条原子记录保存在原 checks 仓库；复用 saveRecord/listRecords 与顶栏“处理记录”。数据库仍为 v4，未新增仓库。旧 Check/Understand/Create 和一次性使魔记录保持兼容。相同 ID 重复提交不重复保存；改变材料或行数则拒绝复用提交标识。引用校验不通过拒绝写入，保存失败保留确认与重试，不显示成功结果。联合整理不创建使魔任务，不计入简短摘录偏好触发次数。

## 实际文件变更

新增：

- apps/web/src/domain/joint.ts：双材料快照、结果、逐来源校验及提交身份。
- apps/web/src/domain/joint-proposal.ts：A→B→A 事件规则、材料版本绑定、过期与材料对去重。
- apps/web/src/features/proposals/JointPanel.tsx：两份全文确认、联合结果与复制、重新确认。
- apps/web/tests/joint.test.ts：来源、边界、保存幂等、旧记录兼容和触发规则。
- apps/web/tests/joint-runtime.test.ts：两类型统一冷却/显示、偏好兼容、接受前版本复核。
- e2e/joint-proposal.spec.ts：四项联合整理浏览器测试。
- docs/joint-proposal-plan.md、本文件、docs/screenshots/joint-result.png、joint-updated-result.png。

修改：

- apps/web/src/services/repository.ts：StoredRecord 联合类型，联合记录校验与幂等。
- apps/web/src/services/proposal-runtime.ts：两类提议统一调度、联合邀请接受/结束和共享冷却。
- apps/web/src/state/stores.ts：真实窗口激活事件、材料更新后的失效与 jointDraft。
- apps/web/src/features/proposals/Proposal.tsx：联合邀请内容、打开双材料确认。
- apps/web/src/features/proposals/proposal.css：提议卡片限高和滚动；配合位置调整避开底部工具栏。
- apps/web/src/features/check/CheckPanel.tsx：LocalResult 支持嵌入显示；处理记录识别联合结果、查看和重新确认。
- apps/web/src/app/main.tsx：双材料面板、快捷键与其他面板互斥。
- README.md：操作、范围与限制。全量测试也重新生成既有验收截图。

## 验证事实

- npm test：11 个文件、45 项通过。
- npm run build：TypeScript 检查与 Vite 构建通过。
- npm run test:e2e：全量 30 项通过，包括最初新增 3 项联合整理流程。
- 审查后补充 1 项确认后变更的边界测试，再运行 joint-proposal.spec.ts：4 项通过。共覆盖 31 个不同浏览器场景；最后一轮未重复执行其余 27 项，生产代码没有再变更。
- 验证了两份来源、独立配额、复制出处、刷新恢复、单条保存、取消不保存、错误重试、空材料不触发、邀请版本失效、旧结果提示、重新确认，以及冻结副本和显式更新。
- 发现并修复从底部窗口按钮触发邀请时被工具栏挡住的真实点击问题，未用强制点击绕过。
- 已查看两张实际结果截图；只读审查未发现确定性重要缺陷。

故障与确认后材料编辑是测试中的显式注入，用于边界验证；正常流程使用实际本地摘录与 IndexedDB。后端无变更，本轮未重跑 Python 测试。没有外部应用读取、Sheets、持续关注、语义关联或真实模型结果。
