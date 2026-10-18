# Gemini 接入实施计划

> 按 subagent-driven-development 进行模块实现与审查；TDD 先失败后通过。用户已授权本会话连续执行，确认范围见 gemini-design-20261018.md。

**Goal:** 先真实 Check，再一次性 Scout Bat，保留本地能力与旧数据。
**Architecture:** React → 本地 FastAPI → Gemini；页面负责执行生命周期，IndexedDB v6保存结果。
**Tech Stack:** TypeScript/React/Zustand/idb，Python/FastAPI/Pydantic/httpx，Vitest/Playwright/unittest。

## 1. 服务端 Check
- [x] 新建 apps/api/tests/test_gemini.py：POST /api/check 未配置返回503而不是404；健康不调用模型。先运行确认失败。
- [x] 新建 apps/api/app/gemini.py、check_contract.py、config.py：严格请求/输出schema、配置白名单读取、引用 occurrence 与UTF-16转换、固定安全错误、流式1MiB限制、总超时、进程内去重。
- [x] 修改 apps/api/app/main.py：接入 /api/check 和配置健康状态，保留 /api/jobs 501；请求输入错误不回显输入。新增 .env.example（只占位）及服务端配置说明。
- [x] MockTransport验证中文/emoji/重复引用、schema错误、401/403/404/429/5xx、网络/超时/超限、不泄露正文和密钥；实际执行全部Python测试。

## 2. 前端 Check 和保存
- [x] 新建 apps/web/tests/gemini.test.ts：模拟正确/错绑定/错引用HTTP响应；检查同ID换模式拒绝；保存失败重试不再fetch；先跑失败基线。
- [x] 新建 domain/gemini-check.ts：新结果类型、严格运行时校验；services/gemini-check.ts：HTTP请求和绑定检查；features/check/GeminiResult.tsx：明确Gemini来源、疑点/待补充/无发现、真实元数据、复制/过期/重新确认。
- [x] 修改 domain/joint.ts 的StoredRecord联合及 services/repository.ts校验/身份；不改变双材料算法或数据库版本。
- [x] 修改 domain/model.ts 的ActionDraft可选execution；CheckPanel与独立GeminiPanel接入模式选择、busy、结果缓存、仅重试保存和历史；services/api.ts健康状态不再拒绝已配置服务。
- [x] 检查旧本地、偏好、联合结果仍能保存和显示，执行前端单元及构建。

## 3. Scout Bat
- [x] 扩展任务测试：仅scout_bat允许gemini；watch禁止；错绑定/迟到结果/模式变化拒绝，旧任务缺省local。
- [x] 修改 domain/task.ts 的结果联合、模式和终态验证；domain/watch.ts明确local；repository任务身份含模式。
- [x] 修改 services/task-runtime.ts：Gemini HTTP分支、AbortController、独立超时；保留Worker及Web Locks、恢复和未读事务；Gemini不调用completedForProposal。
- [x] 修改 SummonPanel/TaskList 的模式、真实/本地标识、补充要求文案及回信渲染；重新委托保留执行模式。

## 4. 集成与审查
- [x] 新建 e2e/gemini.spec.ts：模拟HTTP直接Check、保存失败不重复请求、历史刷新、冻结选区、Scout完成/取消/刷新中断、Watch不邀请；保留现有43场景。
- [x] 独立规格审查，再代码质量审查；修复确定性问题并重跑相关测试。
- [x] 全量Python、npm test、npm run build、npm run test:e2e；只停止测试自己启动的服务，独立浏览器上下文。
- [x] 询问旧配置文件路径，禁止读取输出密钥；完成小样本真实调用并单独记录。无凭据时明确此项未完成。
- [x] 更新 README、Gemini契约和 docs/gemini-verification-20261018.md，记录实际文件与实际验证，不覆盖历史验收。

## 命令（CMD，工作目录Wisp；Python测试工作目录apps/api）
    E:\dsr_version1\DeepSpaceReceiver\Wisp\.venv\Scripts\python.exe -m unittest discover -s tests -v
    C:\Progra~1\nodejs\npm.cmd test
    C:\Progra~1\nodejs\npm.cmd run build
    C:\Progra~1\nodejs\npm.cmd run test:e2e

预计成功标准为退出码0且目标用例通过；这些是计划，不是执行结果。当前Git命令已确认此目录不在Git仓库内；不创建仓库或提交。所有修改先完整读文件、完整写回，保留用户内容，不使用局部补丁。

实际执行结果及过程差异见gemini-verification-20261018.md；TDD、API兼容性修复、真实调用与最后显示修复均有记录。无Git仓库，不执行提交。
