# 三分支合并验证（2026-10-18）

用户已确认将以下本地分支合入 `main`，解决冲突、运行集成回归并提交。

| 分支 | 合并来源提交 | 内容 |
| --- | --- | --- |
| `codex/pdf03-04-import-copies` | `93f0bc2` | 单文件拖放、文档／选区冻结副本、来源与启动器配置入口 |
| `codex/pdf05-multi-material` | `42be6b6` | 多材料处理、独立引用、处理记录及使魔回信 |
| `codex/pdf07-10-character-states` | `7b73874` | 待机节奏、召唤飞行、四类任务动作及 WP-07 |

主分支起点为 `cef5a15`。PDF-03／04、PDF-05 分别以 `fb06e22`、`365bc16` 合并；第三分支通过本记录所在的最终合并提交纳入；三个来源提交均已纳入 main 历史。

## 冲突与交叉接线

- 保留主分支忽略规则、三线程入口，以及各分支确认、实现和验收历史。设计文档的多材料处理保持第 4.12 节，角色表现改为第 4.13 节，修正当前引用；历史 DONE 记录保留原编号。
- 熔炉同时保留副本只读预览、原文事务验证、owner 占用及清理、多材料选择；批量确认草稿同步阻止新导入，避免覆盖待确认范围。
- 副本来源与批次契约叠加，采用 IndexedDB v9。新增全文副本＋选区副本参与三能力、二次选段、记录与使魔回信保存、损坏／被替换来源拒绝的回归。
- 多材料前台处理显式使用熬制动作，成功以结果保存为准，失败／取消及卸载清理；多材料使魔仅在真实入库后触发召唤飞行，后台继续读取任务真实状态。

## 本轮结果

| 验证 | 结果 |
| --- | --- |
| 前端单元 | 34 文件，248/248 通过 |
| API 离线回归 | 83/83 通过 |
| TypeScript | 通过 |
| 生产构建 | 112 模块；`index-D9hoBsYC.js`、`index-BJbi8Mgd.css` |
| 既有浏览器完整回归 | 159/159 通过，4.3 分钟；统一配置 15340＋15310 |
| 新增多材料角色交叉浏览器回归 | 4/4 通过，8.1 秒；临时隔离 Vite 15341 |
| 三分支祖先关系、冲突标记与最终工作区 | 三分支均为 main 祖先，无冲突标记，工作区干净 |

所有模型响应均模拟；本机文件解析使用真实解析库。API 与浏览器解析服务显式使用空 `Settings()`，不加载真实模型配置。本轮不验证 Gemini 语义质量；此前连接失败、真实成功待验收和用户视觉审阅继续单列。生产构建已更新本地 dist，主预览服务未重启，便携 ZIP 未重打。

新增浏览器专项首轮 3/4，后台 720ms success 相位的断言未及时采样；改为在回信前用 MutationObserver 记录真实相位后，单项及完整 4 项复测通过，未调整产品动画逻辑。

## 复现入口

在 `Wisp` 目录运行已有依赖：

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run --config vitest.character.config.mjs --configLoader native
node --input-type=module -e 'import { build } from "vite"; await build({configFile:false,envFile:false,root:"apps/web",build:{outDir:"../../dist",emptyOutDir:true}});'
node node_modules/@playwright/test/cli.js test --config playwright.integration.config.ts
```

统一浏览器配置使用 Vite 15340 和空模型配置的本机解析服务 15310，包含全部 `e2e/*.spec.ts`，不会使用既有主预览进程。API 全量执行沿用 [PDF-05 验证入口](pdf05-multi-material-verification.md) 的 `load_settings` patch 后再 `unittest.discover('tests')`；Python 使用现有 `runtime/python/python.exe -I -B`。

浏览器回归会重写历史截图；测试完成后仅恢复这些已跟踪截图的合并来源字节，测试输出留在被忽略的 `test-results`。
