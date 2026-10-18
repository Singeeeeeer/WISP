# 小浮层交互与新手文档 · 本轮验证

2026-10-18。仅修改 Wisp。没有重启服务、部署、真实模型调用、Git 初始化/提交/推送，也没有改写 Worldloom 配置或读取密钥。

## 事实与证据口径

- **用户实测**：本轮开始前，用户明确反馈本地、Gemini Check、Scout Bat 验证通过。这不是本轮自动化结果，也不代表新浮层已由用户验收。
- **历史记录**：Cauldron 的61项单元/43项浏览器及 Gemini 旧阶段记录保持原样，不计入下表。
- **本轮代码事实**：三个基础能力确认与直接结果、Summon确认改为440px宽、最高560px的非模态浮层，内部滚动、视口约束、复制与关闭；正文contextmenu唤起魔法环并保留选区；继续召唤新建提交ID并保留原始材料范围、模式和要求，仍需明确确认。原生菜单可用Shift+右键。
- **本轮验证**：见下表，独立浏览器上下文，不操作日常浏览器数据库。Gemini响应来自显式HTTP mock，复制内容测试通过拦截clipboard.writeText验证，不冒充系统剪贴板手工验收。
- **待用户设备验证**：触控板启用辅助点按后的真实双指手势、设备缩放与使用舒适度。网页只能接收系统映射的contextmenu，不能保证每种触控板设置。未测试macOS/Safari、手机、真实辅助技术或全新电脑安装。

## 实际验证结果

| 检查 | 本轮结果 |
| --- | --- |
| npm test | 18个文件，69项通过 |
| npm run build | TypeScript及Vite生产构建通过 |
| npm run test:e2e | 最终54项全量通过，耗时约1.9分钟 |
| continuation专项 | 最后将用例明确为非零起点选区，再跑2项通过；产品代码未再改变 |
| 截图检查 | 查看 floating-result.png、gemini-check-mocked.png、summon-preparation.png；原文可见，无全屏遮罩，浮层内滚动，操作栏可达 |
| 健康状态 | 只读GET返回verified，与用户此前调用一致；本轮没有为此调用模型 |
| 文档 | 新README、上传指南、技术说明及本地链接检查；GitHub流程核对官方文档，未实际发布 |
| Python/API测试 | 后端未修改，本轮未重跑，不引用历史结果作为本轮通过 |

复现：在 Wisp 目录的 CMD 中执行 C:\Progra~1\nodejs\npm.cmd test、run build、run test:e2e。现有15178/15179须确认为Wisp服务，测试复用它们。

## 发现并修复的问题

1. 初始新增测试失败：正文右键后没有基础能力菜单；接入contextmenu后通过。提交前确认和结果都改为独立FloatingPanel，未改变公共Dialog，避免影响Watch/联合整理/魔法书契约。
2. 首轮全回归47/49通过。旧health测试硬编码“AI未接通”，但本机已verified；改为三个健康状态的显式模拟UI测试，并独立保留jobs=501实测。
3. 缩放用例立即读取布局时拿到resize之前的位置；诊断记录重排两帧后已正确约束。用例改为等待实际布局满足边界，不使用固定sleep掩盖问题。
4. 非模态背景面板可卸载待保存结果：新增失败用例后，在草稿/结果浮层存续期间禁用顶栏其他面板、底部新能力与使魔名册入口。文档窗口仍可切换、编辑；关闭浮层后入口恢复。Esc经原有提交锁处理，不能绕过保存保护。
5. 独立只读审查指出旧Understand记录缺失excerptLimit时应保留历史默认8行。核对现有validExtraction语义后，新增失败单测，修正为record.excerptLimit ?? 8。当前用户偏好不会改写旧结果的委托参数。

## 实际文件修改

新增：
- apps/web/src/shared/FloatingPanel.tsx：非模态浮层、定位、缩放、焦点与关闭。
- apps/web/src/shared/floating-panel.css：紧凑布局、内部滚动和固定可达操作区。
- apps/web/src/domain/continuation.ts：从单份结果生成新的待确认委托。
- apps/web/tests/continuation.test.ts：新提交身份、选区/版本/参数保留、旧记录默认8行。
- e2e/floating.spec.ts：选区与全文、尺寸边界、复制关闭、Gemini模拟与历史继续召唤、背景面板保护。
- docs/floating-plan-20261018.md、本文、docs/github-upload.md、docs/technical-guide.md。
- docs/screenshots/floating-result.png。

完整写回已有文件：
- apps/web/src/domain/model.ts：仅新增可选的临时fromResult说明字段，无DB迁移。
- apps/web/src/features/documents/DocumentEditor.tsx：正文辅助点按/右键、选区捕获与提示。
- apps/web/src/app/main.tsx：Esc交给浮层、背景入口保护、纠正过时的未接AI文案。
- apps/web/src/features/check/CheckPanel.tsx、GeminiPanel.tsx、GeminiResult.tsx：确认/结果浮层与继续召唤。
- apps/web/src/features/delegation/SummonPanel.tsx：紧凑确认、沿用结果材料说明。
- apps/web/src/features/delegation/TaskList.tsx：浮层打开时阻止名册导航卸载草稿；任务执行逻辑未改。
- e2e/api.spec.ts：三种健康显示与未实现jobs测试。
- README.md：小白安装、启动、使用、配置、保存和常见问题。
- .gitignore：补充配置变体、日志/私钥和本机产物排除，仍允许空.env.example。

构建刷新dist（忽略目录）；浏览器回归刷新既有docs/screenshots验收图及test-results（忽略目录）。无Git基线，不把当前全部工程文件虚称为本轮新增。

## 保持的边界

数据库仍v6，旧材料/结果/任务保留。Watch及两份联合整理的执行与数据契约未变，历史记录/魔法书仍用原容器。Gemini仅Scout Bat可用，页面存续约束不变，Gemini结果不触发Watch邀请。继续召唤使用原始材料快照，不把生成结果混入原文。上传指南仅覆盖Wisp独立源码仓库，不包含IndexedDB数据或任何真实密钥，不承诺部署完成。
