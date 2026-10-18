# Gemini Check 与一次性 Scout Bat 契约

2026-10-18。仅Wisp，本地FastAPI直连Gemini；页面生命周期，不部署、不持久后台任务。设计见../docs/gemini-design-20261018.md。

- POST /api/check仅接收确认snapshot与instruction；模型只收到其中text与instruction。请求和响应严格校验；模型引用quote+occurrence映射成快照内UTF-16半开区间，UI加snapshot.start显示原文位置。
- 传输JSON Schema使用基础内联结构；服务端Pydantic仍严格拒绝未知字段、长度/数量超限及错误引用。供应商schema接受性与语义质量是不同验收项目。
- execution=gemini、schemaVersion=gemini-check-1的新记录与旧local_rules/local_extract/local_template/local_joint_extract共存；不变更数据库v6。
- 新Gemini结果身份绑定快照/要求/模式；已有local直接结果保留历史first-write-wins。已有联合结果/任务的幂等和身份约束保留。
- 直接Check保存失败缓存已校验结果，只重试保存，不重付模型调用；离开页面不保证未保存结果存续。
- 一次性task.execution缺省local，新Gemini仅scout_bat；watch任务强制local。状态和未读事务沿用既有机制，终态拒绝迟到结果。
- Gemini结果不触发Watch邀请；本地Check原邀请契约不变。其他使魔与两份分别摘录不接模型。
- HTTP总超时服务端默认110秒、最多180秒，浏览器195秒；本地Worker仍30秒。无自动重试或隐式降级。停止等待/召回不能保证供应商停止计费。
- /api/health只检查配置和进程成功历史，不调用模型；/api/jobs仍501。配置仅服务端，真实密钥不进前端、文档或日志。
- 完整测试与真实调用结果见../docs/gemini-verification-20261018.md；离线MockTransport/浏览器模拟不作为真实成功证据。
