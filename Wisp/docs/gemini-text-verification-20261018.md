# Gemini Understand / Create 本轮验证记录

日期：2026-10-18。状态：**实现及离线验收完成；用户已反馈Understand、Create、Page Sprite和Alchemy Imp的Gemini手动验证全部通过。本次仅更新记录，不额外调用模型、不部署、不更新ZIP。**

## 事实与授权边界

用户已确认推荐方案，包括数据库v6→v7、保留所有旧数据和本地能力。本轮已实现直接Understand/Create和一次性Page Sprite/Alchemy Imp的Gemini入口，并回归旧Check/Scout、本地能力、Watch、两份联合整理和熔炉。

实现与离线验收阶段按用户要求不调用真实模型、不重启日常服务、不部署、不更新ZIP。此后用户另行授权仅重启Wisp的15179 API并使用此前的旧配置路径；该重启及选项检查已完成，检查期间未提交模型请求。随后用户自行在页面测试，并明确反馈四项Gemini手动验证全部通过。当前请求仅授权更新记录，不额外调用模型、不部署、不更新ZIP。

服务重启前，15179只有/api/health、/api/check、/api/jobs；重启后的接口清单已包含/api/understand和/api/create。独立浏览器检查确认三种基础能力和三种使魔均默认本地且可选择Gemini，提交请求为0，检查时模型状态为configured、model_connected=false。这是此前重启检查的结果，不作为用户手动测试后的实时健康状态。本次未再次探测服务或调用模型。

## 用户手动验证（真实Gemini，用户反馈）

用户明确反馈：“Understand、Create、Page Sprite 和 Alchemy Imp 的 Gemini 手动验证都通过了”。

| 验证入口 | 结果 | 证据来源 |
| --- | --- | --- |
| Understand直接调用 | 用户手动验证通过 | 用户在本会话的明确反馈 |
| Create直接调用 | 用户手动验证通过 | 用户在本会话的明确反馈 |
| Page Sprite一次性委托 | 用户手动验证通过 | 用户在本会话的明确反馈 |
| Alchemy Imp一次性委托 | 用户手动验证通过 | 用户在本会话的明确反馈 |

这是用户自行执行的真实模型手动验收，不是代理额外调用，也不是模拟响应测试。记录四个入口的通过结论，不据此推定精确请求次数、模型型号、耗时、用量、费用或逐项输出内容；这些细节未在本次反馈中提供。没有新增真实响应日志或截图，也没有用之前的模拟截图充当真实调用证据。

## 实现阶段的离线验证（历史结果，本次记录更新未重测）

| 检查 | 最终结果 | 范围 |
| --- | --- | --- |
| Python unittest | 30通过，退出码0 | 旧20项API/Check + 新10项文本契约/路由/模拟供应商测试 |
| Vitest | 76通过，20个文件，退出码0 | 旧69项更新必要角色/版本断言 + 新7项契约、HTTP、任务、存储测试 |
| TypeScript + Vite构建 | 通过，退出码0 | 83模块，生成dist；没有部署 |
| Playwright完整回归 | **单次65项全部通过，2.1分钟，退出码0** | 原54项 + 新11项文本能力浏览器流程 |
| 规格与代码质量审查 | 审查通过 | 服务端/数据层与UI分别审查，修复偏好读取边界后复审 |
| 新结果截图 | 已查看 | 440px小浮层、内部滚动与底部操作，模型响应为模拟数据 |

后端命令，工作目录Wisp/apps/api：

~~~cmd
E:\dsr_version1\DeepSpaceReceiver\Wisp\.venv\Scripts\python.exe -m unittest discover -s tests -v
~~~

前端命令，工作目录Wisp：

~~~cmd
C:\Progra~1\nodejs\npm.cmd test
C:\Progra~1\nodejs\npm.cmd run build
C:\Progra~1\nodejs\npm.cmd run test:e2e -- --config playwright.offline.config.ts
~~~

浏览器使用独立15288/15289端口、独立浏览器上下文。测试API显式清空GEMINI_API_KEY、GOOGLE_API_KEY和GEMINI_MODEL，并使用不存在的测试配置路径；模型响应由测试模拟。没有复用或停止用户现有15178/15179服务。

最初沙箱中的Vitest因临时目录rename权限失败、Python TestClient停滞；调整测试执行环境后基线69前端/20后端通过。最终测试使用获准的沙箱外执行环境。控制台有NO_COLOR/FORCE_COLOR提示，不影响测试通过；没有将环境失败记作代码测试通过。

## 从失败到修复的证据

1. 新后端成功路径先返回404，新增接口和契约后通过。
2. 前端新记录被旧Check校验器拒绝、Page被旧Scout限制拒绝、v6未触发升级：三项失败后分别实现并通过。
3. 新共享HTTP提交接口初始不存在；实现后确认参数绑定和保存失败只重试保存。
4. 浏览器Understand最初没有执行方式选择器；接入后通过。
5. 同一浮层brief切换本地再切回Gemini时错误回到standard；补测试复现后保留各自参数。
6. Gemini继续召唤最初读取一次本地摘录偏好；补计数测试复现后改为仅本地模式读取。
7. 第一轮全量64项中63通过，旧外发检测把端口写死15178，将15288测试资源误报；改为比较baseURL的URL.origin，不放宽外部来源检测。
8. Proposal测试从无效CSS选择器改为真实“主动提议”可访问区域断言。针对性15项通过后，因UI参数逻辑有修改，再执行最终全量65项，全部通过。

## 离线测试已验证的边界

- 新schema严格限制未知字段、类型、必填项、数量、UTF-16长度和60,000总输出文本预算；缺信息状态不伪造摘要/草稿。
- 精确引用、重复/重叠occurrence、emoji与UTF-16位置；无效引用整次拒绝。
- Check请求与模型传输格式保持兼容；三路由共享操作/快照/要求/专属参数身份，跨操作同ID冲突。
- 只提交冻结选区或当前文档副本；来源文件名和其他材料不发送给模型。前端只显示纯文本。
- 保存失败后锁定材料与参数，只重试保存，不重复请求模型；取消、迟到回信和刷新中断不自动重跑。
- 本地摘录3/8与Gemini brief/standard独立；同一浮层切换模式保留各自选择，角色切换重置本地。
- Page/Alchemy完成回信、未读状态、历史、重新委托与继续召唤保持材料/模式/适用参数绑定。
- 所有Gemini结果不计入本地Proposal；本地Watch、摘录偏好和两份联合整理仍通过原场景。
- v6六个仓库升级后原样保留样例记录；旧连接响应versionchange，旧版重新打开被拒绝；被旧页面阻塞时明确报错且保留材料。v2/v4/v5迁移旧测试同时通过。没有操作日常浏览器资料进行迁移测试。

## 修改文件

服务端与契约：
- apps/api/app/text_contract.py（新增）
- apps/api/app/gemini_transport.py（新增）
- apps/api/app/gemini.py
- apps/api/app/main.py
- apps/api/tests/test_gemini_text.py（新增）
- contracts/gemini-text.md（新增）

前端领域与服务：
- apps/web/src/domain/gemini-common.ts（新增）
- apps/web/src/domain/gemini-text.ts（新增）
- apps/web/src/domain/processing.ts（新增）
- apps/web/src/domain/gemini-check.ts
- apps/web/src/domain/model.ts
- apps/web/src/domain/task.ts
- apps/web/src/domain/continuation.ts
- apps/web/src/domain/joint.ts（仅记录类型接入；不改联合算法）
- apps/web/src/services/gemini.ts（新增）
- apps/web/src/services/gemini-check.ts
- apps/web/src/services/repository.ts
- apps/web/src/services/task-runtime.ts

界面：
- apps/web/src/features/check/CheckPanel.tsx
- apps/web/src/features/check/GeminiPanel.tsx
- apps/web/src/features/check/GeminiTextResult.tsx（新增）
- apps/web/src/features/check/SummaryChoice.tsx（新增）
- apps/web/src/features/delegation/SummonPanel.tsx
- apps/web/src/features/delegation/TaskList.tsx
- apps/web/src/features/grimoire/Grimoire.tsx

测试与离线配置：
- apps/web/tests/gemini-text.test.ts（新增）
- apps/web/tests/gemini-text-http.test.ts（新增）
- apps/web/tests/gemini.test.ts
- apps/web/tests/cauldron-storage.test.ts
- apps/web/tests/local-storage.test.ts
- apps/web/tests/watch-migration.test.ts
- e2e/gemini-text.spec.ts（新增）
- e2e/gemini.spec.ts
- e2e/boundaries.spec.ts
- playwright.offline.config.ts（新增）
- vite.offline.config.ts（新增）

说明与产物：
- README.md
- docs/technical-guide.md
- docs/gemini-text-design-20261018.md（同步确认和实施状态）
- docs/gemini-text-plan-20261018.md（同步完成项与已确认边界）
- 本验证记录（新增）
- docs/screenshots/gemini-understand-mocked-20261018.png（新增，模拟响应）
- docs/screenshots/gemini-create-mocked-20261018.png（新增，模拟响应）
- dist/为本次构建产物；test-results/为测试产物。旧19张历史截图在回归后按原始字节恢复。

没有修改Worldloom、旧私密ZIP、两份联合整理契约或Watch契约。没有安装依赖、初始化Git、提交或上传GitHub。

## 历史事实与待验证项

用户此前确认本地、Gemini Check与Scout Bat真实验证通过；那是此前功能的用户反馈。30/76/65与构建属于本次功能实现阶段已经执行的离线证据，本次文档更新没有重跑。Cauldron的61单元/43浏览器、小浮层阶段的69单元/54浏览器均属于历史记录。

四个新增Gemini入口已获得用户手动通过反馈，不再列为“尚未真实验证”。该结论不等于已经系统评估摘要或草稿质量、任意输入下的稳定性与完整事实准确性；引文精确匹配也不能证明概括正确或没有幻觉。真实触控板双指辅助点按、队友实体电脑及其他平台没有新增专项验证证据。

v7升级仍保留旧数据；首次打开新版前应保存草稿、完成/召回任务、停止Watch并关闭旧标签页，不能用清库解决版本问题。此前获授权的15179重启已经完成，本次只更新本文，不修改代码、不重新迁移数据、不重启服务、不额外调用模型、不部署、不更新ZIP。
