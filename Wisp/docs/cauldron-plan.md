# Idea Cauldron Implementation Plan

> 执行方式：subagent-driven-development 分模块实现与审查；当前目录非 Git 仓库，不创建 Git 提交。用户已授权文档完成后继续实现。

**Goal:** 本地材料新增、TXT导入、列表管理及单材料四入口，保留旧数据与联合契约。
**Architecture:** Material 是唯一正文存储；cauldronEntries 是容量受事务保护的成员表。领域模块处理输入、来源；repository处理原子创建；运行时协调列表与现有文档状态；React面板复用能力面板。
**Tech Stack:** React/TypeScript/Zustand/idb/IndexedDB/Web Worker，既有 Vitest/Playwright，无新增依赖。

## 1. 领域与存储
- [x] 先新增 apps/web/tests/cauldron.test.ts、cauldron-storage.test.ts（含迁移用例） 并运行失败测试。
- [x] domain/cauldron.ts 提供 normalizeText、decodeTxt、createTextMaterial、sourceDescription；model.ts 扩展可选来源、快照冻结来源。
- [x] repository.ts 升v6，增加 listMaterials/listCauldronEntries/createCauldronMaterial/addCauldronEntry/removeCauldronEntry。create事务原子检查12名额、重复ID幂等且拒绝覆盖；remove只删成员。
- [x] 更新 local-storage.test.ts/watch-migration.test.ts 中当前schema断言为6；旧版本建库fixture仍保留原版本。
- [x] 测试覆盖UTF8错误、BOM/CRLF/emoji、60000边界、20MB边界、空白、来源稳定；事务容量竞争、重复创建、移出不删除；v5保留所有旧数据。

## 2. UI与文档状态接线
- [x] 新增 e2e/cauldron.spec.ts，先验证入口缺失导致测试失败。
- [x] 完整读取再写回 state/stores.ts：采用可复用 openMaterial 操作，按需窗口；新增材料接入 savedVersions/status；跨页列表刷新不覆盖已有草稿。
- [x] 新增 services/cauldron-runtime.ts 与 features/cauldron/Cauldron.tsx、cauldron.css：成员/全部列表、三加入方式、预览确认、保存错误重试、标题来源、打开/移出/重新加入、单选全文四入口。
- [x] main.tsx 加入口、面板路由与proposal避让；不创建额外能力/合并处理。
- [x] 确认与结果展示来源（含复制），复用统一SourceInfo组件；Summon、Watch与Joint结果保留来源显示，历史缺失不回填。

## 3. 验证与审查
- [x] 单元专项先绿，随后 npm test；运行 npm run build。
- [x] 浏览器专项覆盖创建粘贴TXT、失败/重试、容量、成员移除、刷新窗口、跨页、确认快照及单材料四入口。
- [x] 确认15178/15179归属Wisp，再运行 npm run test:e2e；不停止用户服务，不清日常数据。
- [x] 读取截图审查布局，执行只读规格/质量审查；对实际问题补失败用例并修复。
- [x] 更新 README、contracts/cauldron.md 与 docs/cauldron-verification.md，记录实际命令、数量、限制，不用历史结果替代。

## 命令

在 E:/dsr_version1/DeepSpaceReceiver/Wisp 工作目录使用 CMD：

    C:\Progra~1\nodejs\npm.cmd test -- apps/web/tests/cauldron.test.ts apps/web/tests/cauldron-storage.test.ts
    C:\Progra~1\nodejs\npm.cmd test
    C:\Progra~1\nodejs\npm.cmd run build
    C:\Progra~1\nodejs\npm.cmd run test:e2e -- cauldron.spec.ts
    C:\Progra~1\nodejs\npm.cmd run test:e2e

预期：新增测试先因缺少实现失败，再全部通过；最终数量以输出记录。

执行完成：迁移用例合并在 cauldron-storage.test.ts，未单设迁移文件。61 单元、43 浏览器、构建通过；未打开材料跨页同步缺陷已通过失败用例复现并修复，复审通过。详见 cauldron-verification.md。
