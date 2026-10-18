# Gemini Understand / Create 契约

2026-10-18。基于已批准的 [设计](../docs/gemini-text-design-20261018.md)。本契约补充 Gemini Check 契约；原 Check 请求、输出、prompt 与 Interactions wire 结构保持兼容。

## 请求与身份

- POST /api/understand：严格接收 snapshot、instruction、summaryStyle（必填 brief 或 standard）。
- POST /api/create：严格接收 snapshot、instruction；拒绝 summaryStyle、excerptLimit 及未知字段。
- snapshot 沿用 Check 完整快照契约：正文非空、最多 60,000 UTF-16 单元，instruction 最多 4,000；长度与 start/end 一致，元数据原样回填。
- 三路由共享进程内去重：身份包括 operation、完整原始 snapshot、instruction 和操作参数。同 ID 跨操作或字段改变返回 409 REQUEST_CONFLICT，同身份处理中返回 REQUEST_IN_PROGRESS。成功结果缓存最多 32 条、300 秒；并发最多 8 条。失败不缓存，不自动重试。
- 三路由请求体上限 400,000 字节；未知字段、显式 null、重复 JSON 键或不符合严格类型的数据拒绝。

## 传输与隐私

共享 gemini_transport 维持当前 Interactions endpoint、配置模型、store=false、max_output_tokens=16384、既有总超时和错误分类。仅发送 text、instruction，Understand 另发送 summaryStyle。标题、文件名、备注和快照身份不发送；无工具、检索、持久记忆或自动降级。

供应商响应最多 1 MiB；只接受 completed 的文本结果，支持既有 outputs 或 steps 结构，拒绝混用与工具步骤。基础内联 JSON Schema 仅使用 type/properties/items/required，服务端实施严格校验。元数据 modelId、durationMs、validatorVersion 和真实 usage 沿用既有形状；不估算缺失用量。promptVersion 分别为 gemini-understand-prompt-1、gemini-create-prompt-1，Check 保持 gemini-check-prompt-2。

## 引用与共有输出

模型仅返回业务字段；id、operation、status=completed、execution=gemini、schemaVersion、snapshot、instruction、createdAt、metadata 由服务端填充。Understand 另回填 summaryStyle。

引用输入为 quote + occurrence：quote 非空、最多 2,000 UTF-16 单元；occurrence 为 1 起整数，计重叠匹配。服务端转换为快照内部 start/end/quote，范围为 UTF-16 半开区间。任何错误引用拒绝整个结果，绝不静默丢弃。新增结果业务文本字段（含引文）合计最多 60,000 UTF-16 单元，在供应商对象和引用绑定后分别检查，不计快照及服务端身份字段。

## Understand

schemaVersion=gemini-understand-1。字段 summary、summaryEvidence、keyPoints、missingInformation 必填。

- brief：summary 最多 1,200 单元，keyPoints 最多 3；standard：4,000 / 8。
- 非空 summary 必须有 1–8 条 summaryEvidence；outcome=ready。
- 每个要点 title 非空且最多 200，explanation 非空且最多 2,000，evidence 为 1–4 条。
- summary 为空时，summaryEvidence/keyPoints 必须为空，missingInformation 至少一条；outcome=needs_information。
- missingInformation 最多 10 条，每条非空且最多 2,000；ready 也可包含待补充项。

## Create

schemaVersion=gemini-create-1。字段 draft、alternatives、sourceFacts、assumptions、missingInformation 必填。

- 非空 draft 最多 12,000 单元，outcome=draft。
- alternatives 最多 2 项：非空 title 最多 200，非空 description 最多 4,000。
- sourceFacts 最多 12 项：非空 statement 最多 1,000，evidence 为 1–4 条；允许无引用事实的创意草稿。
- assumptions 与 missingInformation 各最多 10 条，每条非空且最多 2,000。
- 空 draft 要求 alternatives 为空、missingInformation 至少一条；outcome=needs_information。保留的 sourceFacts 仍须合法依据。
- 提示词要求新想法标为建议/假设，缺少关键事实使用【待补充：…】，不得虚构既有日期、金额、人物、引文、研究结论。

## 验证边界

MockTransport 覆盖两接口、精确/超限 UTF-16、重复与重叠引用、空产出、严格字段、总预算、跨操作缓存/并发冲突、错误与隐私；旧 Check 测试原样回归。引用机械校验只证明文字存在，不能证明摘要正确、事实分类正确或创作质量。新增模型 schema 的真实接受性和语义质量仍需独立授权真实调用验证。
