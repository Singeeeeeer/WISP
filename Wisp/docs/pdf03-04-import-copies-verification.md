# PDF-03／04 拖放与冻结副本验证

日期：2026-10-18。分支：`codex/pdf03-04-import-copies`。实现／测试提交：`b1845c6`。本分支已实现并离线验证，尚未合并 main；用户体验与三分支集成回归待完成。

## 实现与边界

- 单个 TXT／DOCX／PPTX／XLSX／PDF 拖入页面或熔炉，复用本机提取、可编辑预览和确认保存。单文件 20,000,000 bytes、60,000 UTF-16，不截断；多文件、文件夹和不支持格式明确拒绝。
- 桌面标题栏独立“入炉”把手拖向顶部熔炉入口；点击把手、文档全文／选区按钮、熔炉当前文档／选区按钮提供替代操作。原拖窗和文字选择保持。
- 文档副本的标题、文本、原版本及范围在预览前冻结；预览只读，确认才保存。生成独立材料，之后原文编辑不改变副本；副本本身可继续独立编辑。
- 未保存、保存失败、无效选区不创建副本；首次保存事务内核对原文存在、版本、标题、来源与范围文本，防跨标签旧窗口冒充最新版本。冲突保留预览，取消后先保护未保存正文，再重载页面获取原文。
- 同步占用锁保护待处理请求、预览、读取和保存，按 owner 释放，迟到旧操作不能清掉新预览。其他模态阻止拖入；拒绝原因在遮罩上方显示。停止读取／取消新增保留原有语义。
- 文件读取成功只形成预览；真实保存成功才触发完成装饰。事务失败原子回滚、保留候选 ID 和预览供重试，沿用 12 份容量。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| TypeScript `tsc --noEmit` | 通过 |
| 全量前端单元 | 28 文件，212 项通过（原 159＋副本领域 8＋存储 24＋导入服务 21） |
| 全量 API 离线测试 | 64 项通过，新增 3 个副本测试组；其中包含两种来源 × 三能力往返 |
| 15310 浏览器 | 13 项新专项＋18 项既有回归覆盖全部通过；全量首轮 30/31，修正一处旧文案断言后定向 2/2 通过 |
| 生产构建 | 100 模块；`index-CDUz3bmJ.js`、`index-DxrheRSH.css` |
| 独立审查 | 发现的占用锁释放、错误层级与冲突恢复文案问题已修复并复核 |
| 视觉检查 | 选区副本、模态拒绝、拖入高亮三张实际截图已查看，来源与确认入口可见 |

新浏览器专项包含真实 `dragTo` 的桌面入炉把手及原拖窗、TXT 和 DOCX／PDF 真实解析、可编辑预览、有效选区 UTF-16 范围、原文后改与刷新持久化、防覆盖、非法投放、存储失败重试、未保存原文阻止、12 份容量、跨标签保存冲突及可放入／不可放入高亮。既有回归含四格式选择导入、原熔炉、工作区与窗口焦点。

测试过程中的非产品修正：独立 worktree 开启 `core.autocrlf`，原有文本型 PDF 夹具被换行转换，导致 xref 字节偏移错误；恢复 HEAD 原始字节并加 `*.pdf -text`，两份夹具通过严格解析，内容未改变。首轮新测试还修正了 React 选区驱动和目录拖入模拟方式。原有测试覆盖的两张历史截图已恢复原字节。

所有材料为虚构内容，API 使用 MockTransport；浏览器测试服务显式注入空 Settings，不读取真实 `.env`，导入自身不调用模型。测试进程结束后释放 15310，未更新 15278 主预览，未修改代理、共享依赖或便携 ZIP。

## 复现入口

- `playwright.copies.config.ts`：固定 15310、Chrome、单 worker；包含新专项及四份旧测试文件。
- `scripts/serve-copy-tests.py`：本分支 dist＋本机解析，空模型配置。先构建后运行 `node node_modules/@playwright/test/cli.js test -c playwright.copies.config.ts`。
- 复用 junction 时构建用程序化 `vite.build({configFile:false, root:"apps/web", build:{outDir:"../../dist", emptyOutDir:true}})`，避免向共享 node_modules 写配置缓存。
- 单元测试用 `startVitest("test", ["apps/web/tests"], {config:false, cache:false, watch:false})`；不要把 e2e 的 Playwright 文件交给 Vitest。
- API 运行前把本分支 `apps/api` 加入 Python sys.path，patch `app.config.load_settings` 为 `Settings()` 后导入 `app.main`，再运行 `unittest` discover。测试内模型调用均为 mock。

## 集成时需保留的共享接口

| 文件／接口 | 本分支变化与集成要求 |
| --- | --- |
| `domain/model.ts` | 新 `MaterialSource`／`MaterialCopyOrigin`，source 与 origin.kind 增 `document_copy`、`selection_copy`；`origin.copy = {materialId, materialVersion, title, start, end, source}`；snapshot 深冻结 copy |
| `domain/material-copy.ts` | 独立 `createMaterialCopy(material, selection?, id?)`；不归一化原文，范围半开且按 UTF-16；独立 ID／version 1，保留继承的文件信息 |
| `services/cauldron-import.ts` | 待接收请求、占用及错误；`claimImport`／`releaseImport` 按 owner 隔离。PDF-05 如在熔炉内增加异步处理，也应在该期间占用导入入口，不能让新拖入覆盖其草稿 |
| `Cauldron.tsx` | 新 copy 模式与请求消费；保留文件预览、候选重试和来源展示。合并 PDF-05 的多选／处理入口时不能覆盖此逻辑或忙碌保护 |
| `repository.ts` | 材料身份含 copy 全字段；create 输入立即深复制；首次副本创建在同一事务核对原文，相同已存副本优先幂等返回。成员关系和真正副本必须继续区分 |
| `gemini-common.ts`／`gemini-check.ts` | 两处验证共享 `validSourceMetadata`；完整新来源字段必须贯通前端响应与历史恢复 |
| API `check_contract.py` | `Origin.copy` 严格嵌套约束，三能力统一接受；来源不参与模型提示，只随请求身份／结果契约保留。Pydantic 有与旧 `BaseModel.copy` 同名的提示，序列化及校验已测试通过 |
| `SourceInfo.tsx`／`domain/cauldron.ts` | 原标题、版本和范围，以及继承文件来源说明。PDF-05 的每份来源不能只显示合成标题 |
| `app/main.tsx` | 挂载全局 CauldronDropTarget、顶部熔炉投放标记；合并角色分支时保留其位置和原有组件 |

本分支未改 `state/stores.ts` 或 `services/cauldron-runtime.ts`；使用其现有创建及观察接口。多材料统一处理、角色动画及主分支预览由其他线程／集成阶段完成，本记录不替代集成后的三能力回归。

## 截图

- [选区冻结副本](screenshots/pdf03-04-selection.png)
- [其他模态内拒绝投放](screenshots/pdf03-04-blocked.png)
- [可放入高亮](screenshots/pdf03-04-drop.png)
