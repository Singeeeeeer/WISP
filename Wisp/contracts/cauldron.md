# Idea Cauldron 本地文本版 · 实现契约

2026-10-17，仅 Wisp，本地规则/模板，无模型或部署。设计见 docs/cauldron-design.md。

2026-10-18 补充：本文件保留初版本地文本实现记录。当前数据库已由 PDF-01 升为 v8；PDF-02 新增 DOCX／PPTX／XLSX／PDF 文字解析、可编辑预览及四种来源，不再限 TXT，见 [导入契约](import-text.md)。三能力已有独立 Gemini 路径，导入本身不调用模型。

## 数据与权限范围

Material 是唯一可编辑正文实体；source 扩展 new_text/pasted_text/txt_file，原 virtual_document 保留。新增 createdAt/origin 可选，旧记录不补造。origin 保存首次加入时间、可选粘贴来源备注或 TXT 文件名/大小/修改时间/UTF-8 编码。只通过标题/正文编辑接口修改材料；来源不随标题变化。快照复制并冻结来源，已有结果继续保留提交时副本。

数据库仍 wisp-module-one，版本 v6，只新增 cauldronEntries（materialId 主键）。createCauldronMaterial 在同事务检查最多 12 个成员并写入正文、成员；同 ID 同材料重试幂等，不同内容拒绝覆盖。移出只删成员，不删材料/快照/结果/任务/关注。初始两份示例不自动成为成员；全部本地材料可重新加入，不设置12份全局材料限制。

## 导入与状态

单文件选择 .txt，20,000,000 bytes 上限在读取前检查，严格 UTF-8（BOM允许）；CRLF/CR 转 LF；拒绝 NUL、纯空白或超过60,000 UTF-16单元；不静默截断。粘贴正文同样检查，新建允许空，已有编辑器正文不新增截断。文件来源仅元数据，不持有磁盘路径/句柄，不读取文件后续变化。

读取、确认前输入仅在内存；读取失败显示错误；写入成功才加入正式列表。保存失败保留输入并使用同创建对象重试。取消新增明确放弃表单，Escape/关闭在有表单时提示先确认或取消，离开页面提示未提交输入。编辑保存沿用 expectedVersion、防抖和错误重试。

## 窗口与能力

每材料每页最多一编辑窗口，粘贴/TXT不自动开窗，新建自动开窗。旧布局保留；无旧布局的旧材料保留历史初始化，新材料无布局则不展开。新窗口位置按有限偏移放置，底栏只列已创建窗口，横向溢出可滚动。

熔炉明确选中ID并创建全文快照，清除旧选区，不依赖当前活动窗口。单材料四入口沿用原确认、规则、Worker、回信、保存与过期提示。联合整理仍两份独立来源摘录，列表选择不计访问，真正激活窗口沿用原规则。新增来源仅是快照元数据，没有扩大处理契约。

## 同步与恢复

BroadcastChannel、focus和手动刷新重读成员和材料。无编辑窗口、已保存无错误且远端版本更新的材料可刷新，同时更新保存基线；本页编辑窗口或未保存/失败材料不覆盖。乱序读取不回滚材料版本或成员列表。保存成功后广播。成员移出不会停止关注，UI显示说明及当前关注提示。

## 修改文件

新增：
- apps/web/src/domain/cauldron.ts
- apps/web/src/services/cauldron-runtime.ts
- apps/web/src/features/cauldron/Cauldron.tsx、cauldron.css
- apps/web/src/shared/SourceInfo.tsx
- apps/web/tests/cauldron.test.ts、cauldron-storage.test.ts（含v5迁移）
- e2e/cauldron.spec.ts
- docs/cauldron-design.md、cauldron-plan.md、cauldron-verification.md
- contracts/cauldron.md、docs/screenshots/cauldron.png

修改：
- apps/web/src/domain/model.ts
- apps/web/src/services/repository.ts
- apps/web/src/state/stores.ts
- apps/web/src/app/main.tsx
- apps/web/src/features/check/CheckPanel.tsx
- apps/web/src/features/delegation/SummonPanel.tsx、TaskList.tsx、WatchPanel.tsx
- apps/web/src/features/proposals/JointPanel.tsx（仅来源展示/复制）
- apps/web/tests/local-storage.test.ts、watch-migration.test.ts（当前schema断言）
- README.md

构建和浏览器测试会更新 dist、test-results 及已有验收截图等本地产物。未修改后端、Worldloom、依赖或旧联合领域契约。实际测试结果见 docs/cauldron-verification.md。
