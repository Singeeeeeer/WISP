# 两份文本联合整理提议实施计划

2026-10-17，用户授权继续实现。仅独立 Wisp，无模型、无部署。

设计：沿用已批准的两份文本分来源摘录路线。Helpful proposals 开启后，本页 120 秒内发生 A→B→A 三次不同窗口激活，才提出联合整理邀请；不从启动布局、重复点击当前窗口或历史回看推断需求。参数为可调整的产品默认值，不是研究结论。两份材料必须非空且各不超过 60,000 UTF-16 单元。

邀请绑定材料 ID/版本；任一材料修改或十分钟过期即失效。接受只打开两份全文副本的确认，明确提示不是原先单份选区；点击“联合整理两份文本”才执行。每份独立采用 3/8 行限额，保留标题、ID、版本、全文范围、UTF-16 引用和遗漏计数。确认后仍处理冻结副本；更新两份全文需重新确认。

公共机制：复用 Dialog、ExcerptChoice、LocalResult 的来源展示、repository.saveRecord/listRecords 与 checks 仓库；联合结果作为一条 operation=joint 的记录，不伪装为单材料。无单独后台任务，不触发摘录偏好计数。两个 Proposal 类型统一单条展示和 60 秒冷却；同材料对本会话忽略/取消/完成/失效后不再问；刷新不恢复行为计数。已有偏好不会禁用联合提议。

- [x] 1. 先写失败测试：来源分离、UTF-16、输入边界、幂等、历史兼容；来回切换、开关、版本过期和冷却。
- [x] 2. 实现 domain/joint.ts、domain/joint-proposal.ts；扩展存储记录 union，保持数据库 v4。
- [x] 3. 接入 Proposal 事件/调度/邀请与双材料确认；扩展处理记录查看、复制和重新确认。
- [x] 4. 浏览器验证：接受不执行、取消、空材料、旧提议失效、保存故障、刷新后来源、旧版本提示、复制和重新确认；回归偏好与 Summon。
- [x] 5. 全量单测、浏览器测试、构建、截图检查与只读审查；更新说明。

新增：domain/joint.ts、domain/joint-proposal.ts、features/proposals/JointPanel.tsx、apps/web/tests/joint.test.ts、e2e/joint-proposal.spec.ts。修改：repository.ts、proposal-runtime.ts、stores.ts、Proposal.tsx、CheckPanel.tsx、main.tsx、README.md。不改 Worldloom；不清除用户存储，不停止用户服务。

完成：45 项单测、全量 30 项浏览器回归通过；后补确认版本边界测试后联合专项 4 项通过；类型检查和构建通过。两张结果截图已查看，只读审查无重要发现。详见 ../contracts/joint-proposal.md。
