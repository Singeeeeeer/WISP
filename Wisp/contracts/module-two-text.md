# 第二模块：Understand 本地摘录与 Create 模板

2026-10-17。已实现本地摘录与活动介绍模板，未接真实模型、未部署，Worldloom 未修改。Summon 执行仍未接通。

## 功能与限制

Understand 将本次冻结快照按 CR/LF 分行，忽略空行、去除行首尾空白，按原顺序展示前 8 个非空行；每行带快照内 UTF-16 引用区间，显示剩余未展示行数。没有排序、改写或语义提炼。材料标题作为来源元信息展示，不伪装成自动提炼的标题。

Create 目前只有活动介绍模板。仅采用独占一行的主题、时间、地点、参与方式字段，支持中英文冒号。每个字段必须唯一且非空；重复字段标待确认，缺失/空字段标待补充。固定标题、介绍正文占位和发布前核实提示均属于模板结构，不是原文事实或模型新增事实。其他正文和补充要求不参与字段推断。

两者均限制非空输入且最多 60,000 个 UTF-16 单元。引用仅来自确认快照，不读取选区外文字。补充要求随结果保存，但不解释执行。结果不自动写回文档。

## 复用机制

原 features/check/CheckPanel.tsx 泛化导出 LocalPanel/LocalHistory，保留文件位置减少无关变更；三类能力复用材料确认、提交锁、保存后展示、复制反馈、旧版本提示、重新确认全文及历史列表。顶栏改为“处理记录”，每条记录按 operation 标明能力，Check 的原始疑点展示保持。

LocalRecord 为 CheckRecord | TextRecord。TextRecord 包含 operation、execution（local_extract/local_template）、ruleVersion=text-1、snapshot、instruction、excerpts、omittedLines、draft、createdAt；id=snapshot.id。历史记录仍存于原 checks 对象仓库，名字保留兼容，不代表所有记录都是 Check。saveRecord/listRecords 统一处理；saveCheck/listChecks 保留兼容且只返回 Check。同一提交 ID 已被其他操作使用时拒绝，不返回错误类型结果。

数据库版本从 v2 升至 v3，保留现有对象仓库、文档、偏好和 Check 记录，避免旧 v2 客户端继续将所有结果当作 Check 读取。升级阻塞沿用提示：先保存或复制其他页面草稿，再关闭其他 Wisp 页面、重新载入，不清除数据。

## 修改清单

- 新增 apps/web/src/domain/local-text.ts：文本处理、联合结果类型和界面文案。
- 修改 apps/web/src/features/check/CheckPanel.tsx：复用确认、结果、复制和历史。
- 修改 apps/web/src/services/repository.ts：统一保存/读取、v3 升级与操作冲突保护。
- 修改 apps/web/src/features/capabilities/CapabilityPanel.tsx：接通 Understand/Create；Summon 保持不可执行。
- 修改 apps/web/src/app/main.tsx：处理记录入口及模块标识。
- 修改 apps/web/src/features/grimoire/Grimoire.tsx：现有能力说明。
- 新增 apps/web/tests/local-text.test.ts、local-storage.test.ts、e2e/local-text.spec.ts；更新 e2e/check.spec.ts 的记录入口名称。
- 更新 README.md；新增 docs/module-two-text-plan.md、本契约及截图 local-understand.png/local-create.png。回归同时更新原有截图。

## 实际验证

- Vitest：6 个测试文件，26 项通过。覆盖 CRLF/emoji 引用、摘录遗漏、重复/缺失字段、自由文本不执行、空/超限输入、选区隔离、三类记录混存和幂等、v2 原有文档/Check 保留、冲突操作拒绝，包含原有 Check 和文档保存测试。
- Playwright：15 项全量回归通过。新增两项覆盖摘录与模板结果、复制文本、重复点击、原文不变、刷新恢复、旧版本提示、再次确认、选区外内容不带走、写入失败不显示完成及重试；原 Check、魔法环、文档与窗口测试通过。
- TypeScript 检查与 Vite 生产构建通过。实际查看两张新增浏览器截图，内容和证据展示正常；长结果面板可滚动。
- 复制测试截获 clipboard.writeText 检查输出，存储故障为测试注入，不是实际系统故障。未测试真实模型能力，后端未修改且本轮未重跑 Python 测试。
- 独立只读审查未发现新增确定性重要问题；审查提出的旧客户端兼容风险已通过 v3 升级及保留测试处理。
