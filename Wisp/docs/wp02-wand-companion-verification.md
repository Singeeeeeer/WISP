# WP-02 魔杖与魔女基础交互验证

日期：2026-10-18。用户已确认六项规则；范围见父目录 DESIGN.md 第 4.2 节。实现与本轮检查完成，视觉体验待用户审阅。

## 实现

- 24×24 像素 SVG：深紫杖身、金色星尖；原生 cursor 热点 (5,1)，无 JS 光标拖尾。
- 魔女保持既有 PNG 图集及大小，默认右下偏移每轴 34px（对角约 48px）；接近边缘换侧并限制位置。
- 跟随使用基于时间的缓动；停留 500ms 后，内层姿势 2.8s 周期轻浮 3px，不绕圈。
- 输入保持聚焦、真实拖选、窗口拖动／缩放时立即停靠右下，避免横穿选区；操作结束依据当前输入状态恢复。
- 文字／选择／拖窗／缩放／禁用等原生反馈保留；角色继续 pointer-events:none。
- 应用“减少动态效果”与系统 prefers-reduced-motion 均固定停靠，系统偏好中途切换可生效。
- 法阵出现时隐藏随行角色，关闭后恢复；隐藏角色开关保持可用。

## 修改范围

- apps/web/src/features/companion/Companion.tsx：角色状态与位置。
- apps/web/src/features/companion/companion.css：轻浮。
- apps/web/src/features/companion/wand-cursor.css、apps/web/public/assets/wisp/wand-cursor.svg：原生光标。
- apps/web/src/app/styles.css：移除与统一位置控制冲突的旧 still 定位。
- e2e/companion.spec.ts、playwright.companion.config.ts：针对性浏览器验收。
- README、技术说明及父目录设计／行为／技术／进度记录；dist 由生产构建更新。
- 保留原有图集、模型、数据及能力流程。

## 结果

| 检查 | 结果与范围 |
|---|---|
| TypeScript | tsc --noEmit 通过 |
| 现有单元测试 | 20 文件、76 项通过 |
| 角色浏览器测试 | 7 项通过：光标资源及原生文字／缩放、跟随→轻浮→移动、编辑／拖选让位、窗口拖动让位、边缘、应用减少动态／菜单／隐藏、系统减少动态中途切换 |
| 既有交互回归 | magic-ring 3 项、workspace 2 项、window-focus 1 项通过；合计 13 项浏览器检查通过，16.3s |
| 首轮修正 | 文字区计算光标 auto 改为明确 text，禁用优先级保留；修复后复测通过 |
| 生产构建 | 无环境文件的 Vite build 通过，dist 已更新 |
| 构建后烟测 | 独立静态预览页面错误 0；资源尺寸 24×24，计算光标 URL 与热点一致 |
| 只读代码审阅 | 未发现实质问题 |

截图：[构建后角色轻浮状态](screenshots/wp02-wand-companion.png)。普通页面截图不包含原生鼠标光标，不能把截图视为实际光标热点的目视证据；SVG 解码／热点声明／计算样式已另行检查。

## 复现与预览

在 Wisp 目录用可用 Node 执行：

    node node_modules/typescript/bin/tsc --noEmit
    node node_modules/vitest/vitest.mjs run
    node node_modules/@playwright/test/cli.js test --config playwright.companion.config.ts

专项配置用独立 15290 端口，configFile:false、envFile:false，不启动 API 或加载代理。新角色测试拦截 API 请求；既有测试在无代理前端中运行，不能触达模型服务。历史 magic-ring.png 在回归后恢复原字节。

本次独立静态预览：http://127.0.0.1:15291/ 。仅服务 dist；未提供 API，不读取环境文件。该网址的本地存储独立，不自动迁移其他端口的材料。预览进程 PID 20268（本次会话创建；重启后 PID 不具有固定意义）。常用 Start-Wisp.cmd 仍可按原方式使用，读取本次更新后的 dist。

## 验收边界

- Chrome 自动化、源码及资源检查通过；用户对魔杖样式、间距和追赶感的实际体验尚待审阅。
- 未使用真实 Gemini 请求，未更改或测试新的模型能力。
- 没有实现扶帽、打盹、阅读、巡检、熔炉或召唤任务动画；未扩展到 OS／跨软件。
