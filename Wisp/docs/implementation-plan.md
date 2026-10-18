# Wisp 第一模块实施计划

Goal: 独立浏览器虚拟桌面，可靠的文档保存、选区与材料副本；不接真实模型、不部署。
Architecture: React 组件使用 Zustand 状态和独立领域规则；IndexedDB 事务保存文档，FastAPI 只提供健康检查和明确不可用的能力状态。
Tech Stack: React / TypeScript / Vite / Zustand / IndexedDB / FastAPI。

1. 建立独立工程、依赖和测试入口。
2. 先写 domain.test.ts、repository.test.ts：验证 UTF-16 范围、旧选区拒绝、快照冻结、初始化不覆盖、版本冲突。执行失败后实现 domain/model.ts、services/repository.ts。
3. state/stores.ts 管理文档、窗口、交互。保存串行执行，失败保留正文；冲突阻止覆盖。
4. workspace、documents 组件实现窗口拖动缩放、编辑、保存恢复。
5. capabilities、delegation 共享材料确认，明确四能力未接通，无提交和假任务。
6. companion、grimoire 实现角色、设置、快捷键和真实空状态。
7. Python unittest 验证健康检查与统一错误；实现后端。
8. TypeScript 检查、生产构建、领域与存储测试、无界面浏览器端到端验证。记录限制及操作说明。

所有源文件只在 Wisp 内创建。浏览器自动化用于验证，不启动可见网页预览。现有 Worldloom 不改动。
