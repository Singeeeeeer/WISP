# Gemini Understand / Create 实施计划

日期：2026-10-18。状态：**用户已确认方案和v7升级；模块1–6完成并通过离线验收，用户确认模块7不在本轮执行，不部署、不更新ZIP。**

配套设计：[gemini-text-design-20261018.md](gemini-text-design-20261018.md)。本计划于用户明确确认后实施；未沿用旧Check阶段的真实调用授权。结果见 [本轮验证记录](gemini-text-verification-20261018.md)。

## 目标与完成标准

在保留本地模式与现有Check行为的前提下，直接Understand/Create及一次性Page Sprite/Alchemy Imp可显式选择Gemini。输出具有独立契约、材料绑定、持久保存和历史展示，并沿用小浮层复制/关闭/继续召唤。

Gemini任务仍依赖页面存续，不参与Watch、本地摘录偏好和两份联合整理邀请。旧数据与本地功能保留。离线技术验收与真实模型验收分别记录；离线通过不代表真实质量已验证。

## 实施纪律与顺序

确认后逐模块执行。每次修改前完整读取最新文件；若有未提交修改，先辨明归属，不覆盖用户内容，写入完整替换文件。下列新增模块名是拟定落点；遇到现有同名文件先读取，不能覆盖。

按“输出契约 → 服务端 → 前端数据与保存 → 任务 → 界面 → 集成验收”推进。每模块先添加能揭示相应风险的失败用例，再实现并运行针对性验证。若发现必须扩大产品范围或改变已确认契约，先报告差异。无需每个模块重复请求已经获得的实施授权。

## 模块1：独立输出契约

- [x] 新建contracts/gemini-text.md，落实设计中的请求、字段、数量/UTF-16上限、引用定位、空结果语义及服务端推导规则。
- [x] 新建apps/api/app/text_contract.py，复用现有Snapshot/Quote等稳定边界；实现两套模型输出schema和绑定器。保持check_contract.py旧Check契约。
- [x] 新建apps/web/src/domain/gemini-text.ts，两种记录分别按operation/schemaVersion校验。
- [x] 整理中立的domain/processing.ts联合分派入口；如需提取公共校验，放入domain/gemini-common.ts，避免Check与Text互相循环导入。迁移全部调用点并保留必要的Check兼容导出。
- [x] 建立后端与前端固定测试样例：brief/standard、可用摘要、缺信息摘要、草稿/纯创意/缺信息草稿。

验收：错误字段、错误类型、超长文本、空白必填项、无效引用、重复文本occurrence、重叠匹配、emoji和UTF-16边界均有测试；模型不得指定记录身份或篡改材料。summaryStyle仅属于Gemini Understand；excerptLimit仅属于本地Understand。旧gemini-check-1和旧本地样例照常通过。

## 模块2：服务端路由、传输和去重

- [x] 从apps/api/app/gemini.py提取公共的有界传输到gemini_transport.py，保留原check入口；新增understand/create独立提示与输出绑定入口。保持当前模型、Interactions格式、store=false及错误脱敏行为。
- [x] 修改apps/api/app/main.py，新增POST /api/understand和POST /api/create，保持/api/check请求/响应兼容。三个路由共享请求体限制和应用级有界去重。
- [x] 去重身份包括操作、完整快照、要求和专属参数；同ID跨操作/参数冲突必须拒绝。并发重复请求只产生一次供应商请求。
- [x] 新增apps/api/tests/test_gemini_text.py，使用httpx.MockTransport，不使用真实密钥或外网。

验收：模型只收到正文、要求和适用参数；引用失败、JSON重复键、非完成响应、超时、上游错误/超限整次失败；配置缺失的安全错误与健康探测均不调用模型。Check回归保持通过。传输提取前后的MockTransport断言用于发现格式变化，不能把重构当成供应商兼容性已验证。

## 模块3：前端请求、保存与v7兼容隔离

- [x] 新建services/gemini.ts共享请求/提交封装；services/gemini-check.ts保留Check调用兼容入口。以操作分派校验和URL，不允许由模型选择路由。
- [x] 扩展domain/model.ts、domain/joint.ts与services/repository.ts记录联合、参数与身份判断；不更改两份联合整理算法或契约。
- [x] 已验证结果在单次提交对象中缓存。保存失败后只重试保存；结果待保存时禁止更改身份参数和丢弃提交。
- [x] 用户确认v7后，将IndexedDB打开版本升为7；保持数据库名、仓库、索引和原记录，不改写、不删除。验证旧连接关闭、升级阻塞提示、旧版打开失败。
- [x] 新增存储测试，构造真实v6数据库后用新版打开，逐项检查materials/preferences/checks/tasks/watches/cauldronEntries中的旧样例保留；核对旧本地Understand缺失excerptLimit仍按8解释。

验收：HTTP成功但保存失败不重复fetch；错操作、错材料、错要求、错摘要设置一律不入库；同ID身份变化拒绝，旧first-write-wins语义保留。v7升级不恢复Watch或付费任务，不承诺保留运行中的页面执行。上线使用前关闭旧标签页，先结束现有任务和Watch。

## 模块4：Page Sprite和Alchemy Imp一次性执行

- [x] 修改domain/task.ts，三使魔与操作固定映射；在创建、入队、执行、完成四处校验Gemini不得带watchId。
- [x] 修改services/task-runtime.ts，按操作调用Gemini；保留Web Locks、AbortController、取消/迟到回信拒绝、刷新中断及未读回信原子保存。
- [x] 修改domain/continuation.ts，沿用原材料快照内容、新委托ID、执行方式与适用参数；不能将生成草稿自动作为下一任务原文。
- [x] 更新repository任务身份及TaskList重新委托路径，显式比较summaryStyle，不对Gemini套用excerptLimit默认8。
- [x] 所有Gemini完成结果跳过Proposal来源逻辑，本地路径保持不变。

验收：三角色的成功、失败、取消、刷新恢复、重复执行锁和错回信绑定都有覆盖。继续召唤与重新委托参数一致。带watchId的Gemini不能越过任一入口；本地Watch及联合整理仍通过原测试。回信保存失败不引入自动模型重试。

## 模块5：小浮层、模式选择与历史结果

- [x] 修改CheckPanel/GeminiPanel/SummonPanel/ExecutionChoice及相关历史、Grimoire文案，三能力和三使魔均能显式选择Gemini；新操作与切换角色默认本地，继续召唤/重新委托保留明确选择。
- [x] 增加SummaryChoice与GeminiTextResult组件；Understand模式切换后显示各自设置，Gemini摘要设置不读取/改写本地摘录偏好。
- [x] 结果按operation分派；Check仍使用现有GeminiResult。旧代码中“execution=gemini即Check”的所有显示分支需搜索并替换。
- [x] Understand显示概述、要点与来源；Create显示草稿、备选、原文事实、假设和缺失信息；普通复制包含标签，Create另有明确“仅复制草稿”按钮。
- [x] 沿用双指点按对应的contextmenu入口、选区/当前文档快照、小浮层位置与尺寸、复制/关闭/继续召唤、过期提示和待保存导航保护。

验收：不因切换选项触发网络请求；长结果可在浮层内滚动，不退回大遮罩对话框。模型输出纯文本渲染。浏览器自动化验证contextmenu行为；触控板实际双指点按另列人工检查，不能用模拟事件冒充硬件验证。

## 模块6：回归、文档和交付

- [x] 新增e2e/gemini-text.spec.ts，用模拟HTTP覆盖直接Understand/Create、Page/Alchemy回信、历史刷新、继续召唤、复制、保存失败仅重试保存和Watch不邀请。
- [x] 检查本地三能力、旧Gemini Check/Scout、两份联合整理、Watch、熔炉及小浮层已有测试。
- [x] 执行全部Python测试、前端单元测试、构建与浏览器测试。新增测试在无真实Gemini配置情况下运行，记录具体用例数、命令、退出码和失败情况。
- [x] 更新README.md、docs/technical-guide.md与新建docs/gemini-text-verification-20261018.md。记录实际修改文件、新数据库版本、用户升级步骤、离线与真实验证边界；不把计划勾选当测试证据。
- [x] 核查无密钥或正文被写入日志、文档或测试快照。只检查受控输出，不打印已有私密.env内容。

本次实际执行命令（CMD；每条在注明的目录运行，结果见验证记录）：

Python工作目录：E:\dsr_version1\DeepSpaceReceiver\Wisp\apps\api

~~~cmd
E:\dsr_version1\DeepSpaceReceiver\Wisp\.venv\Scripts\python.exe -m unittest discover -s tests -v
~~~

前端工作目录：E:\dsr_version1\DeepSpaceReceiver\Wisp

~~~cmd
"C:\Program Files\nodejs\npm.cmd" test
"C:\Program Files\nodejs\npm.cmd" run build
"C:\Program Files\nodejs\npm.cmd" run test:e2e -- --config playwright.offline.config.ts
~~~

需要启动测试服务时使用独立测试端口，仅结束本轮测试创建的进程，不停止用户已有服务。

## 可选模块7：单独授权的真实验收

用户已明确本轮只做离线测试，不调用模型、不部署、不更新ZIP；本模块不在本轮执行。以下仅保留后续另行授权时的方案：建议使用合成非私密材料各执行1次直接Understand、直接Create、Page Sprite、Alchemy Imp，共最多4次；不自动重试，不顺带重复调用Check。

由服务端使用此前已提供的旧配置路径，不在客户端嵌入密钥，不打印密钥。逐条记录响应成功与否、引用有效性、任务保存和语义人工评估；供应商是否接受新增schema尚待这一阶段验证。若不授权，交付标注“离线验收完成、真实模型待验证”。

## 执行边界

用户明确本轮不调用模型、不部署；现有15179服务不重启。其余边界：不初始化/上传GitHub、不更新私密ZIP、不修改Worldloom、不恢复网页说明改版、不做多轮聊天、联网工具、持续Gemini Watch或自动付费重试。

## 本次文档检查记录

最初仅完成源码/契约阅读和草案写作；用户确认后完成模块1–6。本轮后端30项、前端76项、单次完整浏览器65项及构建通过；v7迁移使用独立测试数据库，未操作日常浏览器资料。历史Cauldron的61/43及小浮层69/54仍保留为历史，不冒充本轮结果。未执行真实模型调用、部署或ZIP更新。

实施细节：ExecutionChoice已有通用模式选择能力，无需修改；新增playwright.offline.config.ts和vite.offline.config.ts隔离测试端口及凭据。旧浏览器外发检查改为按baseURL比较origin。各模块实际文件与失败/通过证据见验证记录。
