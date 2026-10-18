# PDF-07～10／WP-07 角色表现验证

日期：2026-10-18。分支：`codex/pdf07-10-character-states`。本分支实现及离线验证完成，用户体验与三分支集成待审阅。

## 已实现

| 项目 | 行为 |
| --- | --- |
| PDF-07 | 整理帽子、扫星屑、打盹依次出现；每项约 1.6 秒，间隔约 2 秒轻浮，移动／按下／施法立即中断 |
| PDF-08 | Settings 默认／活泼；1.2 秒／0.65 秒是小动作阈值，原 500ms 轻浮不变；本机保存，旧设置缺失／非法值回退默认 |
| PDF-09 | 委托入库成功后，从实际点击／触屏坐标或键盘控件中心飞向右侧标记，约 500ms；任务不等待动画；窄屏右侧标记隐藏时交接到魔法书入口 |
| PDF-10／WP-07 | Understand 读书光点、Check 举杖扫描、Create 读书灵感、熔炉气泡；真实处理及保存成功短亮约 720ms，失败／取消恢复；瞬时完成也不延迟结果 |

优先级：菜单施法、编辑／原生选区／拖窗让位 → 前台处理 → 最新 running 后台任务 → 待机。仍有其他运行任务时直接展示该任务，不轮播完成动画。后台历史完成记录不重播。任务状态变化不重建手势监听，实际窗口捕获状态始终优先。

复用现有 atlas 与代码 SVG/CSS；无新位图、依赖或模型请求。动作与装饰均不接收指针事件，不改变焦点。应用与系统减少动态停用飞行、浮动与内部循环动画，任务姿态／交接提示静态呈现；隐藏角色不影响功能和文字状态。

角色候选位置避开整个来源面板与正文编辑区；若飞行路径会穿过正文，直接进入安全位置。侧边不足时选择安全停靠位，仍无空间则隐藏装饰。窄屏隐藏右侧标记时不显示后台任务角色，任务与魔法书仍可操作。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| TypeScript | 通过 |
| 前端单元 | 26 文件／164 项通过（3.53 秒）；含新增 5 项旧设置兼容与保存队列测试 |
| 浏览器完整回归 | 9 文件／58 项通过（1.3 分钟），Chrome，独立 15330 |
| 生产构建 | 通过；本 worktree 的 `Wisp/dist`，103 个模块 |
| 视觉检查 | 实际阅读／巡检／构思／前后台熬制／召唤截图；48／108px 八姿态对照；减少动态内部活动动画为 0 |
| 独立源码复核 | 发现并修复任务结局导致拖动让位状态丢失；新用例修复前失败、修复后通过，再纳入最终 58 项 |

浏览器覆盖：真实处理与保存边界、保存失败只重试保存、取消迟到不覆盖新工作、快速重试／关闭、前台优先、最新后台选择、失败／召回／恢复历史、熔炉明确接线、默认／活泼保存、三待机动作、三使魔入库飞行与实际点击坐标、键盘／触屏、resize／blur 清理、隐藏角色、两种减少动态、375px 窄屏，以及既有跟随／镜像俯仰／四角／菜单／原生选字复制／拖窗缩放／魔杖结果反馈。

测试经过：首轮 7 项中 5 项通过，后续固定源码并限定状态定位后全部通过；第二轮 53 项中 49 项通过，三项飞行坐标断言改为捕获真实 click 坐标（避免按钮外框与 padding、像素取整差异），另一次测试中源码更新造成页面刷新，稳定源码复跑通过。随后 57 项完整通过；只读终审新增拖动结局回归并复现失败，修复后最终 58 项完整通过。测试期间不再修改应用源码。Sandbox 曾阻止 Vite 子进程 realpath 和共享缓存写入；最终配置把缓存放在本 worktree，离线执行权限通过后运行。

所有 API 都由 Playwright 拦截模拟，没有启动模型后端、读取 `.env` 或调用真实 Gemini。没有重测 Python API（本分支未修改后端），没有合并 main、更新主 15278 预览或重打便携 ZIP。

## 接线契约与集成冲突点

`features/companion/activity.ts`：

```tsx
const activity = useTaskActivity("brewing");
// In an explicit submit handler, capture the button before awaiting work.
const finish = activity.start(event.currentTarget);
try {
  await processAndSave();
  finish("success");
} catch (error) {
  finish(actualOutcome); // "error" or "cancel" from the real business result
}
// Call activity.clear() when resetting a result; unmount cleans up automatically.
```

- `start(origin?)` 找到最近 `.floating-panel` 或 `.dialog`。若 PDF-05 采用其他外壳，需显式补来源支持并验证定位；不要以 CSS busy、定时器或“导入文件中”代替实际开始处理。
- 回调接受 `success | error | cancel`，只有当前 operation token 可更新状态；完成不依赖原按钮仍存在。来源卸载、关闭／重试清理，迟到回调失效。
- 前台已收到模型结果后，保存成功仍为 success，即使期间按停止；保存失败为 error。尚无结果的实际中止为 cancel。
- `captureSummonFlight(familiar, origin, input?)` 返回 `launch()`，仅在 `submitTask()` 入库成功后调用；launch 不意味着后台任务完成。
- 共享 `domain/model.ts`：Settings 新增 `idleRhythm`，ActionDraft 新增临时 `presentation?: "brewing"`。不更改持久化 Task／结果协议或数据库版本。
- 共享 `state/stores.ts`：旧节奏值兼容；`prepareMaterial()` 对非 summon 草稿设置 `presentation: "brewing"`。PDF-03／04 或 PDF-05 若改此函数，保留这两处定点逻辑。
- 当前 `CheckPanel`／`GeminiPanel` 已接三能力及单材料熔炉。PDF-05 新多材料面板由集成时显式接 `useTaskActivity("brewing")`；本分支没有其新面板，不能宣称跨分支接线已验收。
- `app/main.tsx`、Task runtime、TaskMarker 和 Cauldron 组件未改；新增装饰挂载在 Companion，减少共享冲突。

## 复现命令

在本分支 `Wisp` 目录执行，`node` 指向已有 Node runtime：

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run --config vitest.character.config.mjs --configLoader native
node node_modules/@playwright/test/cli.js test --config playwright.character.config.ts
```

测试配置关闭 Vite 配置／环境文件，缓存只在本地 test-results。依赖 junction 只作复用，不安装或更改共享依赖。独立构建使用 Vite JS API：

```js
import { build } from "vite";
await build({
  configFile: false, envFile: false, root: "apps/web",
  cacheDir: process.cwd() + "/test-results/character-build-cache",
  build: { outDir: "../../dist", emptyOutDir: true },
});
```

## 审阅材料

- [阅读处理中](screenshots/pdf0710-reading-working.png)
- [巡检](screenshots/pdf0710-checking.png)／[构思](screenshots/pdf0710-creating.png)
- [前台熬制](screenshots/pdf0710-foreground-brewing.png)／[后台熬制](screenshots/pdf0710-background-brewing.png)
- [召唤飞行](screenshots/pdf09-scout-flight.png)：暂停于 250ms 只检查造型，不是动画时长测量。
- [待机打盹](screenshots/pdf0710-idle-nap.png)
- [48／108px 姿态对照](screenshots/pdf0710-pose-comparison.png)／[减少动态对照](screenshots/pdf0710-pose-comparison-reduced.png)

待用户审阅动作辨识、节奏与位置；待集成分支补接 PDF-05 新面板并回归。截图与自动化通过不替代用户观感认可。
