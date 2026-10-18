# Gemini Understand / Create 与一次性使魔设计

日期：2026-10-18。状态：**方案与v7升级已确认，实现及离线验收完成。用户明确本轮仅离线测试，不调用模型、不部署、不更新ZIP。**

## 1. 授权范围与事实

本轮用户要求：Understand、Create 接入 Gemini，Page Sprite、Alchemy Imp 同步支持；保留本地模式；先提交设计和实施计划，确认后才写接入代码。

设计起草时的基线：Gemini Check 和一次性 Scout Bat、非模态小浮层、原文依据、复制/关闭/继续召唤、保存失败仅重试保存。当时数据库 v6；当前新版打开版本为v7。用户此前已实测本地、Gemini Check、Scout Bat；小浮层阶段记录69项前端单元/54项浏览器/构建通过，均为历史验证，不代表新能力已验证。

设计起草阶段只读取源码/契约与官方API文档。用户随后确认方案及v7升级，已在Wisp完成实现和离线验证；本轮未发起真实模型调用、部署或更新私密ZIP。实际结果见 [验证记录](gemini-text-verification-20261018.md)。

## 2. 方案比较与推荐

| 方案 | 好处 | 代价 | 选择 |
| --- | --- | --- | --- |
| 保留/api/check，新增/api/understand与/api/create；共享传输，独立输出契约 | Check接口兼容，操作边界明确，各能力可分别验收 | 需整理现有Check专用代码中的公共部分 | **推荐** |
| 全部迁往/api/process统一接口 | 入口统一 | 需要同步迁移已经验证的Check调用方，扩大回归范围 | 本轮不采用 |
| 直接返回自由文本，三能力共用同一种结果 | 上手快 | 难以稳定绑定引用、区分事实与创作、校验任务回信 | 不采用 |

数据流：单份冻结材料 + 用户要求 + 本次参数 → 本地FastAPI → 当前已配置Gemini模型 → 严格校验与引用定位 → 浏览器校验操作/材料/参数绑定 → 本地保存 → 小浮层或使魔回信。

## 3. 用户可见行为

| 入口 | 本地模式保持 | Gemini模式新增 | 一次性使魔 |
| --- | --- | --- | --- |
| Understand | 原文前3/8个非空行摘录 | 有引用依据的概述与要点、材料未交代的问题 | Page Sprite |
| Check | 原有有限日期规则 | 保持现有疑点与依据契约 | Scout Bat |
| Create | 原有活动介绍模板 | 一份可复制草稿、最多两个备选方向、来源依据/假设/待补充信息 | Alchemy Imp |

新打开的能力/委托默认本地。三能力及三使魔均可显式选Gemini。仅切换选项不发送；仍需点击运行/召唤。失败不自动降级或重试。切换使魔时保持现有行为：执行方式回到本地，避免角色切换沿用未注意到的付费选择；重新委托与从结果继续召唤则保留该结果的明确模式。

沿用小浮层和操作栏，不增加新的主界面。不自动覆盖正文。历史单份结果和回信保留模式、版本、过期提示；继续召唤只沿用原始材料副本，不把模型输出当原文、不自动拼接历史结果。

### Understand长度与偏好

新增Gemini专用summaryStyle：brief（简短，最多3个要点）/ standard（标准，最多8个要点），默认standard，仅本次使用。

不将本地excerptLimit=3/8解释为语义摘要长度。两个设置分别保存；切换执行方式不修改持久偏好。本轮Gemini结果不计入本地摘录偏好Proposal的触发次数，不读取/改写用户已有摘录偏好。历史本地记录缺失excerptLimit仍按8处理。

### Create创作边界

允许改写表达、构思结构和提出备选方向，但不得把材料未提供的日期、金额、人物、引文或研究结论当成既有事实。缺少关键事实时，草稿明确使用【待补充：…】；新构思归入建议/假设。

结果分区展示“AI草稿（待人工确认）”“备选方向”“采用的原文依据”“创作假设”“待补充信息”。复制结果包含这些标签；另提供“仅复制草稿”，清楚说明只复制草稿正文。所有内容按纯文本渲染，不执行模型输出HTML或脚本。

**机械校验只能证明引用文字确实来自材料，不能证明模型的概括、事实分类、假设披露或整篇草稿语义正确。**这些需要提示词约束、测试样例和人工验收，不能宣称已阻止一切幻觉。

## 4. 请求与模型边界

保留Check请求与响应原样。新增接口请求：

~~~json
{"snapshot":"现有MaterialSnapshot对象","instruction":"补充要求","summaryStyle":"standard"}
~~~

上例为Understand字段说明，snapshot实际传完整对象而非字符串。Create请求只有snapshot和instruction。新接口不允许客户端传模型名、API地址、系统提示、密钥或工具参数；不接受不属于该操作的参数。

材料非空且不超过60,000 UTF-16单元，要求最多4,000；请求字节上限400,000、供应商响应上限1MiB、浏览器响应上限沿用2MiB字符检查。当前超时、最大输出tokens、错误分类沿用已实现配置，不新增自动工具调用、联网检索或多轮记忆。

Gemini只接收text、instruction，以及Understand的summaryStyle；来源文件名、备注、其他材料和标题等元数据不发送。快照、操作、ID、时间与schemaVersion由服务端回填，不能信任模型返回的身份字段。正文视作待处理数据，不执行其中嵌入的指令；用户要求不能覆盖系统约束。

传输继续使用既有Interactions与store=false。保持基础内联JSON Schema（type/properties/items/required），服务端严格验证未知字段、类型、长度、数量、完成状态、重复键、UTF-16与引用；不依赖供应商schema代替校验。官方文档说明结构化输出仅支持JSON Schema子集；当前模型对新增schema的接受性必须在后续真实调用中验证。

来源：[结构化输出](https://ai.google.dev/gemini-api/docs/structured-output)、[Interactions概览](https://ai.google.dev/gemini-api/docs/interactions-overview)、[输出格式迁移说明](https://ai.google.dev/gemini-api/docs/interactions-breaking-changes-may-2026)。本轮不因官方示例变化擅自迁移已经验证的Check传输格式或模型。

## 5. 输出契约（已确认并实现）

共有记录字段：id、operation、status=completed、execution=gemini、schemaVersion、snapshot、instruction、createdAt、metadata。metadata沿用modelId、promptVersion、validatorVersion、durationMs、供应商实际usage（缺失不估算）。

模型返回引用为quote + occurrence（从1开始，计重叠出现）；服务端映射为快照内start/end/quote。引文必须精确匹配，单条最多2,000 UTF-16单元；错误引用整次拒绝，不静默删除错误段落或随意选第一次出现。

### GeminiUnderstandRecord

~~~text
operation: understand
schemaVersion: gemini-understand-1
summaryStyle: brief | standard
outcome: ready | needs_information       # 服务端推导
summary: string
summaryEvidence: Evidence[]
keyPoints: [{ title, explanation, evidence: Evidence[] }]
missingInformation: string[]
~~~

- brief：summary最多1,200 UTF-16单元，要点0–3条；standard：summary最多4,000，要点0–8条。上限不是要求凑满。
- ready：summary非空且有1–8条精确依据；每个要点title非空且最多200、explanation非空且最多2,000、有1–4条依据。
- needs_information：summary为空字符串、summaryEvidence和keyPoints为空，missingInformation至少1条。不是虚构摘要，也不是网络失败。
- missingInformation最多10条，每条非空且最多2,000；ready也允许同时存在待补充项。
- 没有excerptLimit字段，也不声称覆盖全文所有信息。

### GeminiCreateRecord

~~~text
operation: create
schemaVersion: gemini-create-1
outcome: draft | needs_information      # 服务端推导
draft: string
alternatives: [{ title, description }]
sourceFacts: [{ statement, evidence: Evidence[] }]
assumptions: string[]
missingInformation: string[]
~~~

- draft非空时outcome=draft，正文最多12,000 UTF-16单元；不要求与原文逐字相同。
- alternatives最多2项，title非空最多200、description非空最多4,000；标为备选建议，不伪装原文事实。
- sourceFacts最多12项，statement非空最多1,000，每项1–4条精确依据；允许没有可引用事实，不为创意硬造引用。
- assumptions与missingInformation各最多10条，每条非空最多2,000。
- 无法负责任地产出草稿时：draft为空、alternatives为空、missingInformation至少1项，outcome=needs_information；其余非空事实仍须有效依据。空草稿且无待补充项拒绝。
- 两种新输出的全部文本字段（含引文）合计上限60,000 UTF-16单元，防止合法小字段组合成过大的结果。供应商字段边界和服务端返回记录分别校验。

以上没有承诺学术事实核查或创作质量。新契约独立于gemini-check-1，不改写旧结果。

## 6. 任务、重复与保存

- 三使魔operation固定由角色映射：Scout→check、Page→understand、Alchemy→create；Gemini只允许一次性任务，任意watchId + gemini必须在创建、入队、执行、完成校验各层拒绝。
- Understand的summaryStyle加入ActionDraft/Task/结果和请求身份；非Understand不能使用这个字段。excerptLimit只用于本地Understand，不用缺省8比较Gemini摘要。
- 服务端共享有界进程内去重，身份包含operation、完整snapshot、instruction和该操作参数。所有三个路由共享同一ID命名空间；同ID跨操作或参数改变返回冲突，不能误取其他能力的缓存。
- 浏览器单次提交锁，收到并校验过的结果缓存后重试保存，不二次发模型请求；待保存期间锁定材料/参数/模式。离开确认沿用当前提示与导航保护。
- 一次性任务仍通过Web Locks执行、原子保存回信再显示未读；取消/关闭/刷新规则不变。召回拒绝迟到结果，不承诺撤销供应商处理或费用。回信落盘失败保留当前失败语义，本轮不新增后台自动付费重跑。
- 直接结果与任务回信匹配operation、execution、快照、要求及summaryStyle；旧本地记录first-write-wins和联合结果身份比较不改。
- 所有Gemini结果均不触发Watch，也不触发本地摘录偏好或两份联合整理邀请。其他已有Proposal继续保持原触发来源与授权流程。

## 7. 兼容性与数据库版本：建议v7

**用户已确认v7，代码与迁移测试已完成。**新版仅把openDB版本从6升到7，仓库名、索引和旧数据原样保留，不清库、不改写旧记录。

理由：当前旧前端把任意execution=gemini当成Check；它无法正确渲染新Understand/Create记录，旧任务执行器也拒绝其他Gemini角色。仅扩大TypeScript类型但保持v6，旧标签页可能读取并误处理新记录。v7用于触发旧连接的versionchange关闭和拒绝旧版重新打开，而非更换数据库结构。

权衡：升级时必须先保存草稿、完成或召回现有页面任务、停止当前Watch，然后关闭旧页面并打开新版。不能承诺升级保留正在执行的页面任务；它们本来就依赖页面存续。既有资料、回信和授权记录保留，未完成任务按恢复契约标中断，不自动恢复关注。旧ZIP在同一浏览器来源上不能读取v7；不同端口仍是不同本地数据库。

替代方案是保持v6但额外实施所有旧客户端的能力协商/隔离机制，旧版无法后补协商，因此本轮不推荐。

## 8. 验收与交付边界

先离线：后端MockTransport、前端单元/存储、浏览器HTTP模拟，覆盖新输出、非法引用/重复文本/emoji、错操作/参数、保存重试、任务终态、旧记录迁移及Watch隔离；再回归原Check/本地三能力/两份联合整理/熔炉/小浮层。

真实接口验证是独立阶段：建议用户另行明确授权后最多4次，分别为直接Understand、直接Create、Page Sprite、Alchemy Imp，使用合成非私密文本，每条1次且不自动重试。沿用已提供的服务端配置路径，不输出密钥。模型可用和输出语义质量分别记录，不能用一次成功推断稳定质量。

本轮不部署、不上传GitHub、不覆盖已发给队友的旧ZIP。实现完成并验收后再按用户要求生成新版本包。

## 9. 确认状态

1. 已确认并实现：采用三个接口、共享传输、三套独立输出契约的方案。
2. 已确认并实现：Understand采用独立brief/standard摘要设置；Create产出一份草稿+最多两个方向，并单列依据/假设/缺失信息。
3. 已确认并实现：Page Sprite与Alchemy Imp只接一次性Gemini，继续依赖页面；Gemini不触发Proposal，保留本地默认与全部旧能力。
4. 已确认并实现：数据库v6→v7只作客户端兼容隔离，保留所有旧数据；升级前结束旧页面的任务和Watch。
5. 离线验收已完成。用户已明确本轮只做离线测试，不调用模型、不部署、不更新ZIP；本轮按此范围完成。
