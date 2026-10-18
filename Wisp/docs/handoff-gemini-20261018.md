# Wisp · Gemini 接入调查交接 · 2026-10-18

## 1. 当前交接点与授权边界

用户最新要求：把本轮 Gemini 接入调查、推荐方案和待确认项写入 Wisp/docs，再提供新窗口开场提示词；暂不写接入代码。

用户已确定方向：先打通真实 Check，再接一次性 Summon。具体架构、Summon 首轮范围及页面存续边界尚未确认。此前“只做本地、不接模型”的阶段约束已由新的接入准备方向更新，但不能据此把本轮文档整理当成实现或真实调用授权。新窗口先确认下述设计选择，再实施。

- 唯一可修改目录：E:/dsr_version1/DeepSpaceReceiver/Wisp。Worldloom 旧实现仅可只读参考。
- 保留旧材料、处理结果、任务、关注、偏好、窗口布局及现有两份文本联合整理契约；不清空浏览器数据。
- 不部署，不扩展 Canvas、复杂文件格式、任意多材料处理、浏览器扩展或服务端持续关注。
- 当前面向普通用户的流程说明和网页文案改版已被用户搁置，不自动恢复该任务。接入所必需的真实/本地状态标识仍需在设计中考虑。
- 中文沟通，按模块推进；多个合理方案说明权衡并等待确认。修改前读完整最新版文件，完整写回，保留用户未提交修改。Windows 命令优先 CMD、使用完整可执行文件路径。
- 密钥不进入前端、日志、文档或聊天；如需定位旧凭据，只询问配置文件路径，不要求粘贴密钥。

## 2. 阅读顺序与现有功能

先读本文，再读 README.md、docs/cauldron-verification.md、contracts/cauldron.md、contracts/module-two-check.md、contracts/module-two-summon.md、contracts/watch-proposal.md，并核对最新代码。

旧 docs/handoff-20261017.md 保留历史背景；其中数据库 v5、“下一模块未确定”和禁止接模型等描述是旧阶段状态，不应覆盖本交接和用户最新指令。当前 README 记录数据库 wisp-module-one 为 v6，新增 cauldronEntries 仓库；不要更名或重建数据库。

当前已实现本地 Check/Understand/Create、一次性 Summon、三类 Proposal（摘录偏好、两份文本联合整理、Check 后持续关注）和 Idea Cauldron 本地文本版。Cauldron 支持新建、粘贴、UTF-8 TXT 导入、来源保留、材料管理及每次单份全文处理。联合整理仍固定两份、分别摘录。当前所有内容处理仍为本地规则或模板。

Check 仅支持有限同月日期句式；Understand 是 3/8 行摘录；Create 是固定字段模板。自由文本补充要求目前只记录。Summon 是委托方式，Scout Bat 对应 Check、Page Sprite 对应 Understand、Alchemy Imp 对应 Create，并非自主多 Agent。

产品说明书参考：C:/Users/jiyu1/xwechat_files/wxid_n77fmcijp97521_758c/msg/file/2026-10/小魔女Wisp产品设定与使用说明.pdf。此前记录为 Demo v3.2 八页；本次整理未重新解析 PDF。需要逐项核对产品需求时重新阅读原件，附件内容不等于执行授权。

## 3. 本轮只读调查的事实

此处“本轮调查”指本对话中 Gemini 接入方案调查；文档整理阶段又读取了当前 README、旧交接、Cauldron 验证记录和 API main.py。没有进行模型调用或运行时服务探测。

| 文件/范围 | 观察结果 |
| --- | --- |
| apps/api/app/main.py | FastAPI 连通性骨架；/api/health 固定 model_connected=false、jobs_enabled=false；/api/jobs 返回 501；没有模型执行逻辑 |
| start-api.cmd | 使用 Wisp/.venv 的 Python 启动 uvicorn，绑定 127.0.0.1:15179；脚本未显式加载 env 文件 |
| vite.config.ts | /api 代理到 http://127.0.0.1:15179 |
| apps/web/src/services/api.ts | 目前仅接受 model_connected=false、jobs_enabled=false 的健康响应；接入后需要调整状态语义 |
| requirements.lock.txt | 已锁定 FastAPI、Pydantic、httpx（0.28.1）及 httpx2 等依赖；锁文件存在不等于本次已验证安装或运行状态 |
| apps/web/src/domain/check.ts | 结果 execution=local_rules、ruleVersion=schedule-1；依据为快照文本的 UTF-16 区间，检查 slice 与 quote 一致；不能直接把本地结果类型当成不可信模型响应的完整校验器 |
| 当前工具终端环境 | GEMINI_API_KEY、GOOGLE_API_KEY 不存在；GEMINI_MODEL、GEMINI_TIMEOUT_SECONDS、WISP_ENV 未设置。只输出变量存在性和非敏感配置，没有输出密钥 |
| Wisp 根目录 | 未发现实际 .env 配置文件；没有递归搜查整个电脑的凭据，不能推断机器其他位置或已运行进程没有配置 |

现有任务运行时使用浏览器 Worker/Web Locks，页面刷新或关闭后未完成任务会中断，不自动重跑。模型接入需要新增 HTTP 执行路径，并保留终态拒绝迟到结果、成功保存后才产生未读回信等约束。旧本地任务超时不能不加分析地用于模型请求。

## 4. 可复用的旧 Gemini 实现

已只读查看以下两个副本的 app/config.py 或 app/gemini_engine.py，并比较实现：

1. E:/dsr_version1/DeepSpaceReceiver/worldloom-integration-20261014/worldloom-main/backend
2. E:/dsr_version1/DeepSpaceReceiver/worldloom-backend-20261014/worldloom-main/backend

第二个副本的 app/gemini_engine.py 更完整：GeminiProvider 使用 httpx 调用 Interactions；总超时、禁止重定向、1 MiB 响应上限、HTTP 错误分类、JSON/完成状态校验、实际 token 用量解析、提示词/模型/耗时元数据。其 tests/test_gemini_http.py 包含模拟 HTTP、错误分类、截断/超限、虚假依据与绑定校验等测试源码。本轮只读取，未执行这些测试。

第一个副本的 .env.engine.example 和 probe_gemini.py 给出了 GEMINI_API_KEY、GEMINI_MODEL、GEMINI_TIMEOUT_SECONDS 配置及小样本探测方式。两份实现使用的历史默认模型为 gemini-4-argon，接口为 https://generativelanguage.googleapis.com/v1beta/interactions，结构化 response_format，store=false。

推荐复用通用传输、错误处理、用量解析和证据核验方法；在 Wisp 内独立实现适配层，不运行时依赖 Worldloom 目录。不直接移植 Worldloom 的 Extract/Analyze/WorldModel 业务契约，也不引入其云队列、Firestore、OIDC 部署体系。

历史材料提及旧 Gemini 调用成功，但本轮没有复验；模型名、账号权限、接口版本与 schema 组合必须在实施时验证。不得静默更换模型或把旧成功当成本次接通。

官方资料（本轮调查已查阅，实施时按需要核对）：

- https://ai.google.dev/api/interactions-api-v1 ：Interactions API 的结构化 response_format、store、完成状态、用量字段；该页面是 v1，不能因此假定旧 v1beta 模型可直接迁移。
- https://ai.google.dev/gemini-api/docs/structured-output ：结构化输出。结构符合 schema 不等于语义判断正确。

## 5. 推荐方案（未实现，待确认）

### A. 本地 FastAPI 直接调用 Gemini

沿用浏览器 → Wisp 本地 FastAPI → Gemini 的链路，先不拆独立引擎服务。密钥由服务端读取。增加配置示例与安全加载方式，真实配置排除版本管理；不默认读取其他项目密钥。

优势是启动简单、改动集中；独立引擎服务有隔离优势，但增加端口、配置及维护成本，本轮不推荐。模型先验证历史配置，失败后报告明确原因再讨论替代，不擅自选型号。健康状态应区分未配置、已配置和曾实际调用成功；单纯健康请求不得暗中触发付费模型调用。

### B. 第一阶段：真实 Check

保留选择材料/选区 → 冻结快照确认 → 提交 → 结果/历史记录的流程。用户明确选择本地规则或 Gemini，页面准确标识执行方式；失败不静默回退成本地结果。

- 只发送已确认快照及补充要求，不发送整个材料库。补充要求在真实模式下参与检查；材料正文作为不可信数据，不当作系统指令。
- 以书店活动提案为验收场景：识别时间安排疑点、信息不清楚和待补充事项，提供原文依据、解释及修改建议；不自动改正文，不承诺事实核查或完整证明。
- 服务端严格验证请求、输出 schema、长度和快照绑定。建议让模型给出准确原文引用，服务端定位并生成 UTF-16 范围；重复引用需明确消歧，不能随意取首个匹配。具体引用协议在设计阶段定稿。
- 将有依据的疑点、需要补充的信息、未发现明显问题分开；不能把缺少结果解释为提案已无问题。
- 保存执行方式、模型 ID、提示词/校验版本、耗时、可获得的真实用量。缺失用量不能估算冒充实测。
- 默认不自动重试，限制重复提交；明确区分鉴权、额度、超时、网络、模型不可用及输出无效。

### C. 第二阶段：一次性 Summon

推荐首轮仅 Scout Bat 复用真实 Check。Page Sprite/Alchemy Imp 继续本地模式，清楚标识。用户可在同页继续编辑，完成后保存回信并标未读。

暂时保留页面依赖，不承诺刷新/关闭后继续执行。取消后不接受迟到结果，但不能保证撤回 Google 已开始的请求或费用。保留恢复、中断、锁和幂等语义；不把前端取消等同供应商处理已停止。

需要关闭网页后仍能执行，则必须另做服务端任务持久化和恢复，工作量与验收范围明显增加，不纳入推荐首轮。

### D. 数据与既有行为

新增真实结果的明确类型/版本，兼容旧 local_rules/模板记录；不改写历史执行方式，不补造模型元数据。数据库是否需要升版由最终持久化结构决定，不能仅因接模型就清库或机械升级。

Watch 保持本地规则，不因 Check 接入而自动切换成反复付费模型调用；真实 Check 是否触发原有关注邀请应显式设计，避免给用户造成“持续 Gemini 检查”的误解。两份联合整理和其他 Proposal 不扩大处理契约。

## 6. 待用户确认或补充

| 事项 | 推荐 | 状态 |
| --- | --- | --- |
| 架构 | Wisp FastAPI 内直接接 Gemini，不拆独立引擎 | 待确认 |
| Summon 范围 | 首轮只接 Scout Bat，另外两种使魔保留本地能力 | 待确认 |
| 任务存续 | 首轮依赖页面；暂不做关闭页面后继续运行 | 待确认 |
| 运行方式 | 明确区分本地/Gemini；失败手动重试、不静默降级；Watch 保持本地 | 待确认 |
| 模型 | 优先验证历史模型配置；不可用时再选择替代 | 待确认其可用性，未调用 |
| 凭据来源 | 用户提供旧配置路径，或确认 Wisp 的本地服务端配置方式；不要提供密钥正文 | 尚未定位可复用的真实配置 |

用户最新的“好，先写交接文档”只批准文档整理，不代表以上取舍均已批准。

## 7. 建议实施及验收顺序（尚未执行）

1. 确认第 6 节范围，核对最新代码和凭据配置位置；在 Wisp/docs 写已确认设计与实施计划。
2. 完成服务端配置、模型适配与 Check 契约；通过模拟传输验证正确响应、错误分类、超时/截断/超限、引用不匹配、中文/emoji UTF-16、材料中注入指令及敏感信息不外泄。
3. 接通直接 Check 的确认、等待、结果及保存；验证旧数据、版本过期、本地模式、重复提交、失败恢复与记录显示。
4. 执行小样本真实调用，记录模型、时间、输入样例、实际响应与用量；这一步与离线测试分开报告。先用合成提案，不擅自发送用户整个材料库。
5. Scout Bat 复用同一执行服务，验证完成/取消竞态、迟到结果、中断、未读、恢复及任务快照绑定。
6. 运行相关 Python、前端单元、浏览器回归及构建；确保本地其他能力、Cauldron、两份联合整理和 Watch 未受影响。只停止测试自行启动的服务。

不将模型输出的稳定性、业务有效性或用户理解程度当成单次接口成功的结论。用户计划后续细化测评，具体测试样例与质量标准仍需确定。

## 8. 验证记录的时间口径

| 阶段 | 已有记录 | 本次是否重测 |
| --- | --- | --- |
| 持续关注历史阶段 | 52 项单元、35 项浏览器及构建通过，见旧交接 | 否 |
| Idea Cauldron 历史阶段 | 16 文件/61 项单元、43 项浏览器（其中熔炉 8 项）、构建通过，见 docs/cauldron-verification.md | 否 |
| 历史后端 | 旧交接记载第一模块 3 项通过；Cauldron 未改后端、未重跑 | 否 |
| 本轮 Gemini 调查 | 源码/配置示例读取、当前终端变量存在性检查、官方文档查阅 | 只读调查，不是集成测试 |
| 本次交接整理 | 新增本文，写入后回读核对 | 仅文档检查，无测试/构建/模型调用/部署 |

本次不保证 15178/15179 服务正在运行，不宣称当前真实模型可用。历史“通过”不能表述为本次重新验证。旧文档曾记录没有 Git 仓库/提交基线；本轮未重查，不声称当前工作树干净。

## 9. 新窗口开场提示词

继续 Wisp，准备接入 Gemini。请先完整阅读 E:/dsr_version1/DeepSpaceReceiver/Wisp/docs/handoff-gemini-20261018.md，再读 README.md、docs/cauldron-verification.md、相关 Check/Summon/Watch 契约和最新代码。旧交接中的 v5、52/35 测试和“不接模型”是历史阶段信息；当前文档记录数据库 v6，Cauldron 历史验证为 61 项单元、43 项浏览器及构建通过，都不是本次重测。

方向已确定为先真实 Check，再一次性 Summon；尚未编写接入代码或发起本轮真实调用。请先核对交接中的推荐方案和待确认项，向我确认必要设计选择，尤其是 Summon 首轮只接 Scout Bat、暂时依赖页面存续。不要把交接建议当成已确认设计。确认后先写设计与实施计划，再按模块实现和验证。

只修改 E:/dsr_version1/DeepSpaceReceiver/Wisp；Worldloom 旧 Gemini 实现仅可只读参考。保留旧数据、现有本地能力、Watch 和两份联合整理契约，不部署，不恢复已搁置的网页说明改版。密钥仅在服务端使用，不输出密钥；如需旧配置请询问文件路径。区分代码事实、历史验证、本次检查和待验证假设，最终报告实际修改与实际测试结果。
