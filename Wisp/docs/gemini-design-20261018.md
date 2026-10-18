# Gemini Check 与 Scout Bat 设计

2026-10-18。用户已确认本方案，随后先写设计/计划再实现。仅修改 Wisp；不部署，不修改 Worldloom，不清库，不恢复网页说明改版。

## 范围与数据流
浏览器确认单份冻结快照和补充要求 → 本地 FastAPI POST /api/check → Gemini Interactions → 服务端严格校验及引用定位 → 浏览器再校验绑定 → IndexedDB 原子保存。直接 Check 先接通；一次性 Scout Bat 复用同一请求。Understand/Create、其他使魔、Watch 和两份分别摘录保持本地。

用户显式选择 local / gemini，默认 local；选择属于本次委托，重试和重新确认保留它。Gemini 结果不触发 Watch 邀请。已有本地邀请规则不变。健康检查不调用模型，区分 unconfigured/configured/verified（仅本进程当前配置曾成功），不承诺当前账户一定可用。jobs_enabled 保持 false，代表没有持久服务端任务。

## 请求及输出
请求 {snapshot, instruction}，快照沿用 MaterialSnapshot。正文非空且 <=60000 UTF-16 单元，补充要求 <=4000 UTF-16 单元；严格拒绝未知字段、非法范围及过长请求。只向供应商发送确认文本与补充要求，不发材料库、文件名/来源备注等无关元数据。快照/要求由服务端回填，不信任模型生成身份字段。

GeminiCheckRecord: id=snapshot.id, operation=check, status=completed, execution=gemini, schemaVersion=gemini-check-1, snapshot, instruction, createdAt, outcome=findings|needs_information|no_findings, findings=[{title,explanation,suggestion,evidence:[{start,end,quote}]}], missingInformation:string[], metadata={modelId,promptVersion,validatorVersion,durationMs,usage?}。无发现不等于正确；缺失信息与有引用疑点分开，不伪造不存在文字的依据。

供应商传输Schema采用仅type/properties/items/required的内联结构（完整Pydantic Schema曾被当前模型接口400拒绝；具体不兼容关键字未单独定位）。服务端仍使用完整GeneratedCheck严格校验，不把供应商约束当作信任边界。模型返回 findings 和 missingInformation；每个引用给出 quote 和 occurrence（从1开始、包含重叠出现）。服务端枚举精确匹配，检查 occurrence 范围并转换 Python 字符索引为 UTF-16；重复引用不可默认选择第一个。引用最多2000字符，最多20个疑点、每疑点1至8个依据；缺失信息最多20条。模型返回错误格式、空引用、不可定位引用、非完成状态、截断或超1MiB均拒绝。结构正确不能证明语义正确。

## 服务端和配置
独立 Wisp 适配层，复用 httpx；固定 Google HTTPS 主机、禁止重定向、不自动重试。GEMINI_API_KEY（或 GOOGLE_API_KEY）、GEMINI_MODEL、GEMINI_TIMEOUT_SECONDS（默认110秒，上限180秒）、GEMINI_API_VERSION（默认v1beta，允许v1）。不默认替换历史模型；未配置模型时不可调用。WISP_ENV_FILE 可指定服务端配置文件，未设置时仅考虑 Wisp/.env；只加载白名单键，不执行配置内容，不输出密钥。真实 .env 不纳入版本管理。读取旧配置前由用户提供路径。

鉴权、额度、模型不存在、服务不可用、网络、超时、无效输出及未配置有固定中文错误；不返回供应商正文、异常字符串或验证器中的输入内容。输入无效统一返回安全错误。日志仅请求ID、方法、状态。模型参数不来自浏览器。保存实际返回模型ID、提示词/校验版本、耗时及实际可用用量，不估算缺失数据。

## 重复、保存与生命周期
单页提交锁防双击；服务端以快照ID及完整请求身份做进程内有界去重，运行中拒绝重复；成功短时缓存用于同一请求安全保存重试。不同内容/要求复用同ID拒绝。缓存非持久任务，不承诺进程重启后的 exactly-once，网络失败后手动再试可能再次计费，页面需说明。

直接 Check 缓存已收到且校验通过的结果；保存失败保留结果，只重试保存，锁定材料/要求/模式直到保存成功或明确放弃。不显示未落盘为成功。

Summon 保留 Web Lock、queued/running/终态、回信原子写入和未读语义。task.execution 可选 local|gemini，旧记录缺省local；Gemini只允许一次性scout_bat。Watch构造并校验local任务。取消通过AbortController取消浏览器等待；终态拒绝迟到完成。HTTP路径超时与本地30秒Worker分离，浏览器上限195秒。刷新/关闭失去页面执行者后标interrupted，不自动重跑，不跨页接管。Google可能仍继续计算和收费。

## 存储兼容
继续 wisp-module-one v6；仅扩展记录联合类型和任务可选字段，不新增仓库/索引，不改写旧记录。StoredRecord 接纳新结果；旧本地执行标识和元数据保持。新增 Gemini 记录的提交身份比较涵盖快照、要求、操作、执行方式；既有 task/joint 身份约束保留。本地直接处理保留历史 first-write-wins 行为（同ID重试返回原记录，不覆盖），不借接入更改此既有契约；跨本地/Gemini模式复用ID拒绝。联合整理固定两份、各自3/8行配额与来源。

## 验证与事实口径
离线：Python MockTransport检查成功、错误分类、超时/超限/截断、注入文本隔离、UTF-16与重复引用、日志不泄露；前端检查响应验证、保存重试、旧数据、取消竞态、Watch隔离。浏览器以显式模拟HTTP验证UI，不冒充真实Gemini。
真实：用户提供配置路径后用合成书店提案小样本，报告实际模型、时间、用量与结果；不发用户材料库。一次成功不等于质量测评。Cauldron历史61单元/43浏览器/构建通过不是本次验证。
