# Gemini 接入本轮验证记录

2026-10-18，Asia/Shanghai。先写设计与实施计划，用户确认的范围为：真实Check → 一次性Scout Bat；依赖页面存续；Gemini结果暂不触发Watch邀请。只修改Wisp，未部署，未修改Worldloom，也未清理日常浏览器数据。

## 已实现事实

本地FastAPI提供POST /api/check，服务端安全读取配置并调用Gemini；前端保留默认local，用户可明确选择gemini。新的Gemini结果与旧本地记录共存，数据库保持wisp-module-one v6。直接Check保存失败复用已收到结果，仅重试保存。一次性Scout复用同一服务，保留锁、取消终态、刷新中断、成功保存后未读和重新确认。Watch、另外两种使魔、两份联合整理保持本地。

密钥只由服务端读取用户指定配置；未复制到前端、文档或聊天。start-api.cmd支持第一个参数为配置文件路径，配置启动时读取。仅更新接入必要的状态说明，没有恢复此前搁置的网页说明改版。

## 本轮实际离线验证

| 验证 | 实际结果 |
| --- | --- |
| Python unittest discover -s tests -v | 最终20项通过，含3项既有API测试；退出码0 |
| npm test | 最终17文件、67项通过；退出码0 |
| npm run build | 最终TypeScript及Vite6.4.4通过，75模块；退出码0 |
| npm run test:e2e | 前端冻结后全量47项通过，约1.8分钟；退出码0 |
| 最后用量展示修复后专项 | gemini.spec.ts 4项通过（包含新增溢出断言）；未重复另外43项；之后单元及构建再次通过 |
| 截图 | 已查看真实Check、Scout回信及最终模拟用量展示；长结果使用弹层滚动，用量长行溢出已修复并验证 |
| 独立审查 | 规格复核PASS；质量审查无P0–P2；供应商Schema兼容修复另经只读复核 |

浏览器常规回归中的Gemini响应是显式HTTP模拟；Python采用MockTransport，不冒充真实调用。新增边界含重复/错误引用、中文emoji UTF16、schema额外字段、错绑定、数量长度、token计数、时间字段、网络/超时/HTTP错误、截断/超限、只读健康、重复提交与冲突、保存重试、取消/刷新中断、Watch隔离及旧数据兼容。

Cauldron阶段的61项单元、43项浏览器与构建通过继续保留在cauldron-verification.md，属于历史验证，不与本表混用。

## 真实调用与修复证据

全部真实调用仅使用合成问候或合成书店提案，没有发送用户材料库或真实研究数据。模型始终为配置中的gemini-4-argon，接口v1beta，没有静默更换。

1. 初次完整Check返回本地502/MODEL_OUTPUT_INVALID。文件gemini-live-probe-20261018.json保留失败记录。
2. 再次带脱敏诊断确认供应商HTTP400/invalid_request，见gemini-live-probe-20261017T170053Z.json。
3. 控制变量探测：最小文本和最小JSON Schema均HTTP200/completed；保持其它参数不变，完整Pydantic Schema返回400。具体不兼容关键字未单独确定，不把猜测写成事实。
4. 供应商Schema改用基础内联type/properties/items/required；服务端完整GeneratedCheck严格校验仍保留。提示词版本gemini-check-prompt-2。新增离线用例验证供应商格式和严格校验未放松。
5. 修复后完整服务端Check返回HTTP200，经引用及输出校验，见gemini-live-probe-20261017T171352Z.json。
6. 最后通过独立浏览器真实执行直接Check与Scout Bat各一次，二者均HTTP200且落盘；见gemini-live-browser-20261018.json。实际断言checks=1、tasks=1、task.status=completed、task.result.execution=gemini、db.version=6。

文件名含T…Z者采用UTC；下面时间均换算为Asia/Shanghai。

| 成功验收 | 完成时间 | 耗时 | 实际输入tokens | 实际输出tokens | 实际总tokens |
| --- | --- | --- | --- | --- | --- |
| 服务端完整Check | 2026-10-18 01:13:52 | 44534.560ms | 588 | 326 | 914 |
| 浏览器直接Check | 2026-10-18 01:15:01 | 20294.361ms | 550 | 315 | 865 |
| 浏览器Scout Bat | 2026-10-18 01:15:14 | 11951.182ms | 550 | 310 | 860 |

以上三次成功业务验收均报告cached/tool/thought tokens为0。最小协议探测只记录结构不记录用量；失败请求是否计费未知，不估算费用或全轮token总数。三次成功样例均报告了时间安排疑点及待补充信息；这是合成样例观察，不是模型准确率、稳定性或研究效果结论。

## 过程中的失败与处理

- 沙箱下Vitest临时文件rename出现EPERM，Python/TestClient出现挂起，本机服务探测也受限；按权限流程改在沙箱外执行，未将环境失败当作产品失败。已结束自己启动的挂起测试。
- 最初前端模块缺失、模式选择控件缺失是预期TDD失败基线；新增严格schema边界和用量溢出用例也先失败再修复。
- 浏览器测试两处测试假设修正：先展开执行信息才断言可见；Summon先明确选择Scout Bat，不能假定默认角色就是Scout。
- 一轮全量为45通过、1个Watch失败；发生于共享模块修改期间，热更新干扰是推测。停止前端修改后Watch专项4项与后续全量47项均通过，不改Watch测试来掩盖失败。
- 最后真实截图发现用量JSON长行溢出，补断言复现，改逐项中文标签展示，4项专项回归通过；真实截图记录的是当时调用状态，最终排版另见gemini-check-mocked.png（明确为模拟响应）。

## 实际修改文件

新增：
- apps/api/app/config.py、check_contract.py、gemini.py
- apps/api/tests/test_gemini.py；.env.example
- apps/web/src/domain/gemini-check.ts；apps/web/src/services/gemini-check.ts
- apps/web/src/features/check/ExecutionChoice.tsx、GeminiPanel.tsx、GeminiResult.tsx
- apps/web/tests/gemini.test.ts；e2e/gemini.spec.ts
- scripts/gemini_probe.py、gemini_compat_probe.py、run_gemini_validation_api.py、gemini_live_browser.mjs
- docs/gemini-design-20261018.md、gemini-plan-20261018.md、本记录
- contracts/gemini-check.md
- docs下上述真实调用JSON记录及screenshots/gemini-check-live.png、gemini-scout-live.png、gemini-check-mocked.png

修改：
- apps/api/app/main.py
- apps/web/src/domain/model.ts、joint.ts（只扩展StoredRecord联合）、task.ts、watch.ts
- apps/web/src/services/repository.ts、task-runtime.ts、api.ts
- apps/web/src/features/check/CheckPanel.tsx
- apps/web/src/features/delegation/SummonPanel.tsx、TaskList.tsx
- apps/web/src/features/grimoire/Grimoire.tsx（必要能力状态）
- README.md、start-api.cmd

测试/构建还更新dist、test-results及既有验收截图等生成产物。旧contracts文件、既有单元测试和既有浏览器测试均未改写；Worldloom目录仅只读。当前无Git仓库基线，不宣称已提交或工作树干净。

## 服务与剩余边界

真实浏览器脚本自行启动127.0.0.1:15189的验证服务，结束时关闭该子进程并等待退出；没有停止或替换15179原服务。结束核对15179仍返回旧健康契约，model_connected=false；因此当前常用端口尚未加载新后端。用户需在原API终端Ctrl+C后，用start-api.cmd加配置文件路径重新启动才能在日常页面使用Gemini。

页面关闭/刷新仍中断，取消不能保证供应商不计费。进程内短时缓存不是持久任务队列。若网络中断后改补充要求导致REQUEST_CONFLICT，可关闭面板重新确认；尚未增加专门的冲突重确认按钮。严格结构与原文引用校验不能保证模型解释准确，个别模型措辞可能过于肯定，需要人工审阅；未完成系统质量测评、长期可靠性、Safari/移动端验收。
