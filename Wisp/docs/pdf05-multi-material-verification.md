# PDF-05 多材料统一处理验证

日期：2026-10-18。分支：`codex/pdf05-multi-material`。依据用户确认的 DESIGN 第 4.12 节，完成熔炉多材料三能力及一次性使魔链路；测试材料为虚构文本，模型响应全部模拟。

## 实现与结果

- 熔炉明确勾选 2～12 份，逐份确认冻结全文或预览选段。只读预览支持鼠标和键盘选择，emoji 代理对不能被范围边界切开。总量最多 60,000 UTF-16 单元，超限可缩小范围，不能提交或静默截断。
- Understand／Check／Create 一次请求综合全部材料；供应商只收到编号、正文和处理参数，来源元数据保留本地。引用按指定材料逐份匹配，界面与完整复制显示材料编号、版本及原文区间。
- 前台保存一条批次记录；三种使魔保存一条任务回信。继续召唤保留原结果的材料副本，重新确认才读取当前全文。原文更新不修改既有快照。
- 前台及使魔保存失败只重试落盘，不再调用模型。使魔待保存期间保持 Web Lock；召回丢弃缓存，刷新将未完成任务恢复为中断，取消／终态不接纳迟到结果。
- IndexedDB v9 沿用原仓库和旧数据，隔离不能识别新结果格式的旧客户端；原单材料、旧联合摘录和 Watch 范围保留。

| 检查 | 结果 |
| --- | --- |
| TypeScript `tsc --noEmit` | 通过（含最终键盘选段修改） |
| 前端单元 | 29 文件、184／184 通过；其中批量新增 25 项 |
| Python API 全量离线回归 | 77／77 通过，7.297 秒；新增批量 16 项 |
| 多材料及原单材料浏览器回归 | 46／46 通过，1.2 分钟；16 项批次＋30 项既有回归 |
| 最终生产构建 | 通过，103 模块；`index-DS62IqOv.js` |
| 独立只读复核 | 修复旧 `listChecks` 混入批次 Check 后，未发现新的确定性问题 |

功能提交：`834670d`。提交后源码工作树无残留。文档 UTF-8 读取正常；六份文档共 52 个本地链接中 51 个可达，唯一不可达项为基线 README 中既有 `../worldloom/WORLDLOOM_DESIGN.md`（隔离 worktree 不含该兄弟项目）；本次新增链接全部可达，旧来源记录保留。

领域／客户端／存储测试覆盖完整快照绑定、来源元数据、独立偏移、重复引用、UTF-16 边界、总量、响应校验、保存重试、取消、批次角色匹配、旧数据兼容、任务召回与恢复。API 测试覆盖三操作单次调用、隐私字段不出站、未知材料编号与错源引用拒绝、输出预算、幂等身份、并发和缓存界限，以及模型超时／错误的失败路径。

浏览器在 `127.0.0.1:15320` 使用真实页面和 IndexedDB，所有 `/api` 请求默认失败，只有每项测试显式配置的 mock 可响应。三能力验证真实鼠标选段、emoji 与原文绝对区间、复制、记录刷新恢复和安全文本展示；另验证键盘正反向选择、单份禁用、60,001 拒绝／60,000 接受、保存失败仅重试保存、前台取消／模型错误、三使魔、跨标签锁、召回迟到、刷新中断及原文变更后的继续／重新确认区别。

原有回归覆盖熔炉、三能力、Summon、工作区和窗口聚焦。已查看 [确认页](screenshots/pdf05-confirmation.png)、[Understand 结果](screenshots/pdf05-understand-result.png)、[Check 结果](screenshots/pdf05-check-result.png)、[Create 结果](screenshots/pdf05-create-result.png)，确认滚动正文、固定操作栏、独立来源与引用可读；旧测试重写的六张历史截图均已恢复。

## 复现命令

前端命令在 `Wisp` 目录执行。复用已有 Node 和依赖，不安装新包；本分支的 `node_modules` 是被忽略的依赖 junction，Vite 测试缓存写在本分支 `test-results`。

```powershell
$pdf05Node = 'C:/Users/xerry/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
& $pdf05Node node_modules/typescript/bin/tsc --noEmit
& $pdf05Node node_modules/vitest/vitest.mjs run --configLoader runner --no-cache --pool=threads
& $pdf05Node node_modules/@playwright/test/cli.js test --config playwright.batch.config.ts --output test-results/batch-final --max-failures=2
& $pdf05Node --input-type=module -e 'import {build} from "vite"; await build({configFile:false,envFile:false,root:"apps/web",build:{outDir:"../../dist",emptyOutDir:true}});'
```

API 命令在 `Wisp/apps/api` 执行；应用导入前替换配置加载，随后每项测试使用空配置或 `httpx.MockTransport`。

```powershell
& 'D:/xerry/Documents/GitHub/witch-pointer/Wisp/runtime/python/python.exe' -c @'
import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path.cwd()))
sys.path.insert(0, str(Path.cwd() / 'tests'))
from unittest.mock import patch
from app.config import Settings
with patch('app.config.load_settings', return_value=Settings()):
    import app.main
suite = unittest.defaultTestLoader.discover('tests')
result = unittest.TextTestRunner(verbosity=1).run(suite)
sys.exit(not result.wasSuccessful())
'@
```

Windows 沙箱首次限制依赖 junction 解析及 asyncio socket；获批的本机测试进程运行后通过。开发期间源码更新触发的 HMR 曾中断浏览器测试，最终运行使用稳定源码。浏览器发现 Chrome 只读 textarea 的方向键默认滚动，现已增加不修改文字的标准选段处理并验证。上述过程不涉及真实模型调用或模型配置变更。

## 集成与边界

共享契约、API、来源扩展和角色状态接入点见 [多材料契约](../contracts/multi-material.md)。PDF-03／04 合并需核对 `MaterialSnapshot`、共享来源校验、Cauldron 入口、repository 数据库版本；角色线程需适配 `BatchTask` 的 `snapshots` 与待保存状态，复用 BatchPanel 的真实状态属性。

本分支类型、构建及离线测试不能证明真实 Gemini 的语义质量。真实综合输出和用户体验仍待审阅；未合并 main、未更新或重启主 15278 预览、未更改代理、未发布或重打便携 ZIP。
