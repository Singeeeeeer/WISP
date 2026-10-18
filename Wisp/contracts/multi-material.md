# PDF-05 多材料统一处理契约

2026-10-18。用户已确认 DESIGN.md 第 4.12 节。此分支实现及离线验证使用虚构材料与模拟模型；真实 Gemini 输出和用户体验仍待审阅。

## 操作与范围

熔炉“勾选多材料”进入显式批量模式，只能勾选当前熔炉成员；列表查看与处理勾选分开。选择 2～12 份后点击 Understand／Check／Create／Summon 多材料入口，仅打开确认页，不调用模型。退出批量模式保留原单材料入口和本地规则。

确认页逐份展示来源、版本、范围及冻结正文。默认是进入确认时的全文；展开“调整材料 N 的处理范围”，在只读预览里使用鼠标或键盘选择文字，再点击“使用材料 N 选中片段”。恢复全文恢复的是本次最初确认副本，不会读取后来修改的正文。原文变化独立提示；重新确认当前材料才重新取各自全文。

每份非空；2～12 份 ID／材料 ID 分别唯一。总正文最多 60,000 UTF-16 单元，要求最多 4,000。总量超限仍可打开确认以缩小范围，但不能提交；不截断、不自动略过任一材料。导入限额仍为每文件 20,000,000 bytes、每材料 60,000 UTF-16。只选择一份时使用原单材料流程。

## API 与引用

三路由：`POST /api/batch/understand`、`/api/batch/check`、`/api/batch/create`。

请求为 `{id, snapshots, instruction, summaryStyle?}`。`id` 是本批提交 ID；`snapshots` 是有序完整 `MaterialSnapshot[]`，保留每份的 ID、材料 ID／版本、标题、来源、范围、正文及捕获时间。仅 Understand 必须提供 brief／standard 摘要参数。

供应商输入只有 `sources: [{sourceIndex: 1, text: ...}, ...]`、要求及适用摘要参数；不发送标题、文件名、来源备注或本地身份。一次模型调用综合处理全部确认文字，提示词要求保留各材料的互补信息、差异及潜在冲突；不会用分别摘录冒充语义综合。

模型证据为 `{sourceIndex, quote, occurrence}`。服务端严格验证整数编号，并在该份正文内按重叠匹配计算第 occurrence 次原文出现，转换为 `{sourceIndex, start, end, quote}`。返回偏移是对应快照正文内 UTF-16 半开区间；界面原材料区间为 `snapshot.start + offset`。拒绝未知编号、跨材料拼接、错源引文、错误 occurrence 和无效 Unicode。引用只证明文字归属，不保证语义正确；不强制每份材料都出现在引文中。

响应使用 `scope: "batch"`、`schemaVersion: "gemini-batch-<operation>-1"`、批次 ID 和 `snapshots`，没有伪造的单份 `snapshot`。其余三能力内容字段沿用现有概念：Understand 摘要与要点、Check 疑点及建议、Create 草稿／来源事实／假设／待补充；引用均带材料编号。模型、提示词／校验版本、耗时和实际供应商用量随结果保留。

每字段及项数上限沿用三能力原规则；所有批次业务输出文字含引文合计最多 60,000 UTF-16。HTTP 正文最多 400,000 bytes。批量与单材料共用 8 个请求并发槽及 32 条／300 秒进程内成功缓存；完整有序快照、元数据、要求、参数、操作及 scope 参与身份。相同 ID 更换任一身份字段返回冲突；失败释放处理中身份，用户手动重试。传输、代理及模型配置不改变。

## 结果保存与一次性使魔

前台保存为 `checks` 中一条批次记录，处理记录中可查看、复制、继续召唤或重新确认当前材料。完整复制包含各来源身份、版本、范围及引用；Create 另支持仅复制草稿。生成结果不写回材料。

继续召唤沿用原结果对应的独立材料副本与要求，创建新批次／快照 ID，进入确认后才提交。重新确认当前材料读取各材料当前全文，原来的片段范围不会假装仍然有效；必须再次核对并提交。任一材料缺失时禁用重新确认，不部分重跑。

`BatchTask` 明确 `scope: "batch"`、Gemini 执行、`snapshots` 和批量结果；三种使魔复用原角色→操作映射。`SingleTask` 保留原形状。批次回信必须绑定整个批次、要求、摘要参数及角色，不能只验证第一份材料。任务回信只保存在 `tasks`，不另写一条前台处理记录，也不触发本地 Proposal／Watch。

沿用 queued／running／completed／failed／cancelled／interrupted、Web Locks、未读和归档机制。取消与完成按本地事务先后决定，终态忽略迟到回信；刷新或关闭中断未完成任务，不自动重新调用模型。

前台结果落盘失败保留内存结果并冻结范围和要求；“重试保存多材料结果”只保存，不再调用模型。批次使魔模型已返回但回信保存失败时，当前页保留待保存回信，任务保持 running 且持有原 Web Lock，显示明确错误和“重试保存回信”；成功落盘后才 completed／unread。召回丢弃待保存回信。关闭或刷新会丢失该内存缓存并按未完成任务中断；不承诺持久服务端队列或续跑。

## 数据兼容与并行集成

- IndexedDB v8 → v9，不新增仓库、不重写旧记录；版本升级隔离不能识别新批次记录的旧客户端。保留既有升级阻塞提示，不能清库绕过。
- 直接三能力 `ProcessingRecord` 仍表示原单材料结果；`StoredRecord` 增加批次分支。旧 `listChecks` 不返回无 `snapshot` 的批次 Check；完整记录用 `listRecords`。
- PDF-03／04 的来源扩展应接入共享 `MaterialSnapshot`、`gemini-common.validEnvelope` 和 Python `Snapshot`。批次复用这两处来源校验，不另维护来源白名单；新增副本是独立 materialId，允许追溯同一上游。整批身份比较包含完整来源元数据。
- 共享改动集中于 Cauldron 的批量选择入口、stores 的可选 `batchDraft`、结果／任务渲染和 repository v9；导入表单与复制领域留给 PDF-03／04。合并时保留双方入口，核对数据库版本与来源结构。
- `BatchPanel` 暴露 `data-wisp-context="cauldron"`、`data-wisp-operation`、`data-wisp-run-id`、`data-wisp-state`（idle／running／completed／failed／cancelled）及真实 `aria-busy`，供角色线程接入；不新增动画或延迟结果。Summon 的前台 busy 只表示提交保存，实际任务动作以 `useTasks.tasks` 的角色／状态为准；`pendingSaves` 表示模型完成但回信尚未落盘。
- 新模块为 `domain/batch.ts`、`services/batch.ts`、`features/batch/*`、`batch_contract.py` 和 `batch_gemini.py`；旧两文档本地联合摘录契约不改变。

## 验证入口

新增领域／请求／存储／运行时单元测试、`apps/api/tests/test_batch.py` 及 `e2e/batch.spec.ts`。浏览器配置 `playwright.batch.config.ts` 使用 15320，无环境文件或后端代理；所有 API 响应模拟。Vite 缓存写本分支 `test-results`，依赖通过被忽略 junction 复用。

最终结果及复现命令见 [PDF-05 验证记录](../docs/pdf05-multi-material-verification.md)。本分支没有合并 main、更新 15278、调用真实模型或发布。
