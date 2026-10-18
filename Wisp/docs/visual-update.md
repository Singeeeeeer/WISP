# Wisp 角色与魔法环更新 · 2026-10-17

## 参考材料与范围

完整阅读《小魔女 Wisp 产品设定与使用说明》Demo v3.2 的 8 页文字，并逐页检查渲染图。说明书是产品参考，其中提到的未来动作或命令不是本次自动执行指令。

视频可正常解码，时长 14.933333 秒、1136 × 720；检查了约 0、3.73、7.47、11.20 秒的四帧。画面展示角色跟随、圈选关系、候选关系待确认及用户确认后保留；本次没有实现或声称已有关系推断。关键帧位于 docs/reference-review。未做音轨分析。

原图 cb38854c999938943b8f551c12e17dbb.png 为 1254 × 1254 RGBA 透明图集。未经像素编辑复制到 apps/web/public/assets/wisp/wisp-atlas.png，通过 SVG viewBox 显示各格，使用 pixelated 渲染。素材来源是用户提供，本记录不推断其授权来源。

## 已实现

- 常态小魔女跟随光标；打开环时使用举杖姿态。角色显示、大小、减少动态效果设置保留。
- 四入口组成魔法环：上 Understand（书）、右 Check（金色印章）、下 Create（坩埚）、左 Summon（蝙蝠）。
- 非编辑状态按 Q、右键工作面或底部基础能力按钮唤起；正文保持原生右键菜单。
- 环在唤起位置展开并固定，以便点击；靠边自动内移，窗口尺寸变化时重新约束。关闭后继续跟随。
- 方向键定位对应入口、Tab/Shift+Tab 循环、Enter 选择、Esc 或环外点击收起。
- 继续使用原有选区校验、冻结副本和能力准备面板。无真实分析、无任务执行、无部署。

## 修改文件

- 新增：features/companion/Sprite.tsx、pointer.ts、MagicRing.tsx、magic-ring.css；public/assets/wisp/wisp-atlas.png。
- 替换：features/companion/Companion.tsx；app/main.tsx、app/styles.css；features/grimoire/Grimoire.tsx。（上述前端路径均位于 apps/web/src，public 资源除外。）
- 新增：e2e/magic-ring.spec.ts、scripts/review-video.mjs、参考检查图及 docs/screenshots/magic-ring.png。
- 更新：playwright.config.ts 允许复用已启动的本机 Wisp 服务；README.md 更新操作及素材说明。

## 验证

- TypeScript 检查及 Vite 生产构建通过。
- Vitest：2 个测试文件、5 项测试通过。
- 初次浏览器全量回归 10 项通过。补充素材加载、跟随、隐藏、减少动态效果及窄窗口测试后，魔法环专项 3 项全部通过。
- 实际查看魔法环截图，四向位置、透明素材及中心角色正常。
- 独立只读代码审查未报告重要阻断问题。此次未改后端，未重新运行后端测试。

## 后续边界

本次完成视觉前置步骤。说明书中的空闲动作、连续帧动画、Helpful proposals、圈选跨卡片关系、真实 Check 和一次性 Summon 执行仍未实现。视频中的候选关系是参考交互，不是当前系统产生的结果。没有修改 Worldloom。
