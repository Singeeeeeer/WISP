# Witch Pointer 技术方案候选 v0.11

更新日期：2026-10-18。第 0 节记录 WP-01 的技术讨论边界；其余章节保留 2026-10-16 正式浏览器覆盖方案候选。队友 Wisp 原型已有局部实现，当前栈和能力以 [Wisp 技术说明](Wisp/docs/technical-guide.md) 为准；不将下方历史候选状态套用于已存在的原型。

## 0. 飞行朝向与杖尖召唤 WP-03（已确认实施）

当前在既有像素素材上增加镜像和有限旋转；呼出菜单时共享不可变的点击锚点与菜单边界计算，保持同一角色连续呈现。标定举杖图的实际杖尖位置，光效使用代码层，不把菜单中心替代点击点。约 250ms 动画不阻塞点选和取消，系统／设置减少动态即时生效。已实现并通过类型、76 项单元、20 项浏览器回归和构建检查。Companion 持续实例负责飞行／施法姿势，magic-layout 提供角色、杖尖与菜单共享布局；横向位移独立累计，防止细步斜向不翻转。现有 casting 图集的局部杖尖为 (254.5,45)，镜像后 (15.5,45)，随角色尺寸缩放。光效只使用 SVG/CSS，按钮命中框保持固定。不引入依赖或模型请求。

### 三线程隔离 PAR-01

用户授权初始化本地 Git 与三分支，分别承担导入／副本、多材料处理和角色表现。各自使用独立 worktree 与测试端口；本机配置、运行环境、构建和真实模型输出排除出基线。共享材料／来源契约、熔炉和任务状态相关修改在后续集成时逐项核对，单线程测试不替代合并后的回归。具体分工见 DESIGN.md 第 4.11 节。

### 复杂格式导入 PDF-02

已实现本机 `/api/import-text`，安装并锁定 python-docx、python-pptx、openpyxl、pypdf 与必要依赖。复杂格式使用独立进程解析，30 秒限时、最多 2 个并发，断连／超时回收；20 MB／60,000 UTF-16、压缩内容与页数等限额见 Wisp/contracts/import-text.md。熔炉复用事务与来源快照，支持可编辑预览／确认保存、取消迟到保护，三能力白名单已同步，不改变 IndexedDB v8。159 项前端单元、61 项 API、15 项浏览器及修复后 7 项针对性复测、类型／构建通过，15278 已更新。范围见 DESIGN.md 第 4.10 节；用户体验待审阅。

### 白板与连线 PDF-01

已实现：独立 React 便笺工作面、SVG 连线，新增 canvas 领域／运行时／组件。IndexedDB v8 新增便笺及关系仓库；内容 version 与保存 revision 分开，事务验证编辑冲突及两端快照，保留全部既有数据。POST /api/connections 接收恰好两张冻结便笺，复用 Gemini 传输与安全校验，新增双端引用契约；候选经显式确认后保存。请求取消、迟到保护、跨标签同步及现有提议互斥／冷却已验证。104 项前端单元、43 项 API、9 项浏览器回归与类型／构建通过；使用模拟 API 与模型响应，不修改代理、配置或追加真实调用。15278 已载入新接口及构建；真实关系语义与用户体验待验收。详见 Wisp/docs/pdf01-canvas-verification.md。

### Understand 阅读动作 WP-07

已确认交互流程：复用既有读书图集，跟随角色进入前台阅读／完成恢复状态，浮层旁定位避让与现有真实结果同步，减少动态静态展示，快速任务不因动画延迟。代码待实施；Check／Create／Summon 任务动作不随本条自动扩展。

### 三种结果反馈 WP-06

以轻量 captureOutcome 捕获来源、发起位置和最新操作序号，真实 Promise 结果发送短暂装饰；来源卸载／页面不可见及迟到旧操作静默。SVG 结果层复用现有减少动态状态，完成／失败／取消各有形状，720ms 后清理。局部前台运行、复制与显式取消接入，保留现有锁、保存和 abort 语义，不监听后台任务或自动保存。已实现；captureOutcome 返回是否发布当前有效结果，复制文字也据此更新，防旧回信覆盖新提示；熔炉成员变更绑定稳定面板，以免刷新移出按钮吞掉成功。Gemini 有模型结果后的保存失败始终为 error，无结果的真实请求 abort 为 cancel；保存 resolve 仍成功。31 项既有＋7 项新增回归、2 项生产保存时序检查、类型及构建通过，见 Wisp/docs/wp06-outcome-feedback-verification.md。

### 常用语义指针 WP-05

已授权四种代码 SVG 与原生 cursor CSS：标题栏 grab 牵引标记、文本 I 形、nwse-resize 双箭头、not-allowed 暗魔杖禁止符。24px 资源按实际几何配置热点，系统语义回退；禁用规则优先，实际缩放捕获覆盖同一箭头。复用已有操作和生命周期，无新状态、依赖或模型请求。已实现；grab／text／resize 热点 (12,12)，forbidden 为 (5,1)。禁用规则覆盖 :disabled、:disabled * 与 ARIA 禁用子树，实际捕获中的手势用更高优先级覆盖。类型、31 项完整专项及补充 1 项针对性复测、最终构建通过；真实选字／原生 copy 事件／编辑／缩放状态与切换均有回归，验证见 Wisp/docs/wp05-semantic-cursors-verification.md。

### 魔杖操作反馈 WP-04

保留原生定位指针，添加同尺寸／热点的静态 hover 与 pressed SVG。独立不接收事件的装饰层提供点击与加载效果；读取真实局部 aria-busy 和窗口手势状态，按当前目标语义决定显示。窗口拖动／缩放捕获期间保持对应光标并清理取消状态。系统和设置减少动态适用，角色显示开关不控制魔杖。WandFeedback 独立于角色显隐，以真实目标、局部 aria-busy 和 data-wisp-gesture 决定装饰；刷新使用 RAF 合并，观察局部忙碌变化以更新静止指针，事件／观察器／动画均有清理。已实现并通过类型检查、29 项浏览器回归与构建，15291 生产预览已更新，见 Wisp/docs/wp04-wand-feedback-verification.md。不新增依赖或模型请求。

### 下行俯冲补充 WP-03A

已确认把下行方向角连续映射到最大约 60°，上行映射保留。已以方向角 × 2/3 映射下行（纯下 60°、45° 斜下 30°），上行方向角 × 0.2 保留，最后乘左右朝向符号。最终位置约束计入旋转后包围盒的半扩展，并保留原 8px 留白；小视口允许边距收缩，悬浮约 3px 仍可见。产品代码仅修改 Companion；新增两项浏览器回归，连同旧 20 项共 22/22 通过，类型检查与构建通过。没有新增依赖或素材。

### 此前基础交互 WP-02

六项交互规则见 DESIGN.md 第 4.2 节，已完成本轮开发验证，视觉体验待用户审阅。沿用现有 React、像素角色图集与位置更新；新增 24px 深紫金星像素 SVG 光标，使用原生 cursor 热点保持即时响应；角色单独管理跟随／悬浮／让位状态。保留文本、缩放、拖动与禁用等必要原生指针，沿用减少动态设置，不引入新依赖。

本轮影响限于角色／光标、必要交互事件、验证与文档；不改模型、存储或其他功能。类型检查、76 项单元测试、13 项浏览器回归和构建通过，详见 Wisp/docs/wp02-wand-companion-verification.md。

### 此前 WP-01 技术讨论（历史）

已确认独立魔杖指针＋魔女跟随伙伴的方向，第一阶段讨论跟随／停靠／让位。现有原型的透明像素图集、SVG 裁切和逐帧位置更新可作为实现参考。

候选拆分为魔杖点击反馈、魔女位置／姿势和交互状态协调；具体采用原生自定义光标还是网页绘制、素材来源、更新方式及状态规则尚未确认。不能把该技术参考视为新增分层素材、依赖或动画系统的授权。

后续验证关注点击热点、原有文字选择和拖动、角色遮挡、边界、停靠恢复及减少动态效果；具体实现文件、用例与参数待确认。本轮未修改代码、制作素材或运行原型／模型；范围不包括 OS 光标、跨软件、扩展权限或后端变更。

## 1. 技术分工建议

客户端本地处理跟手动画、目标反馈、选择、手势和拖放；程序负责真实采集与保存；Gemini 在材料明确后进行理解、比较、联想或召回说明。

| 模块 | 候选技术与职责 | 状态 |
|---|---|---|
| 浏览器载体 | Chrome Manifest V3；内容脚本用于页面角色／采集，扩展后台用于协调与权限 API | 浏览器与扩展方案待确认 |
| 角色与特效 | TypeScript、预制精灵或分层素材、Canvas／CSS、requestAnimationFrame | 动画工具、素材及性能标准待确认 |
| 交互与圈选 | 状态机、路径几何、DOM 命中与选区预览 | 先讨论明确入口、取消和误触；不必把每次移动交给大模型 |
| 内容采集 | Selection／Range、DOM 图片识别、资源读取、获准截图裁剪、来源定位 | 首批材料和降级方式待确认 |
| 魔法书／临托 | React 界面；扩展自身 IndexedDB 保存材料／Blob，chrome.storage 保存少量状态／设置 | 侧栏／独立页、保存边界和同步待确认 |
| Gemini 后端 | Python／FastAPI＋google-genai；文字图片理解、结构化输出 | 调用路线、模型、鉴权、限额和任务协议待确认 |
| 召回 | 多模态 embedding、相似度排序，再解释候选关联 | 只有确认召回进入首版后才确定索引方案 |
| 云服务 | Cloud Run 后端，按需配置认证、元数据与文件存储 | 尚无本项目资源；配置和部署另行确认 |

浏览器客户端需要 JavaScript／TypeScript；Python 优先用于后端。没有决定新项目沿用 Worldloom 的库版本、队列、域模型或部署参数。

## 2. 浏览器覆盖与权限边界

- 内容脚本可在获准、已注入的网页共享 DOM，但其 JavaScript 环境与页面隔离；不会自然取得全部应用内部状态。
- activeTab 属于用户主动调用后的临时授权；常驻授权站点随行需另行讨论站点权限，普通页面点击不自动授予访问权。
- iframe 需逐框架匹配与授权；all_frames 不代表任意跨域框架都可读。Canvas／WebGL 视觉对象也不会自动成为可提取的语义 DOM。
- captureVisibleTab 获取活动页可见像素，需相应权限，不能作为高频指针反馈；截图不等于原图、全文或原始文件。
- img.currentSrc 等提供资源线索，取得原图字节还受资源权限、登录、过期等影响。读取失败如何退化为截图，必须明确标注。
- 扩展后台 service worker 可能终止；托盘和任务状态不能只放在后台全局变量中。跨标签托管应保存独立材料数据，不保存失效的 DOM／Range／DataTransfer 引用。
- 网页浮层仅覆盖可注入页面；浏览器工具栏、受限页面和其他桌面软件不在已确认覆盖承诺内。
- 投放素材需验证接收目标支持的格式，不能保证任意内容直接作为系统文件拖进任意软件。

## 3. 建议的一次采集过程

用户明确指定内容 → 显示实际选区 → 保存材料与来源 → 反馈入书成功 → 按功能需要调用 AI → 附加模型结果。

需要分别管理交互状态与保存／AI 任务状态。原始材料、用户注记与模型生成内容分开存放；模型慢、失败或字段不合法时，已保存材料仍可保留。以上是方案建议，尚未冻结数据结构、重试、取消或撤销规则。

建议材料记录至少考虑：材料 ID、类型、原文或文件引用、来源 URL／标题／位置、采集时间、用户注记、主题与关系、AI 附加信息及其处理状态。这里只列讨论字段，不是接口协议。

## 4. Gemini 接入参考

- 官方统一 SDK：Python google-genai，JavaScript／TypeScript @google/genai；实施前复核接口和具体模型支持。
- 图文理解适合问答、描述、标签、多材料比较；原型可先直接调用，再按效果决定是否需要训练。
- JSON Schema／Pydantic 可帮助约束结构；程序仍需校验字段，结构正确不等于内容真实。
- 函数调用由模型提出函数名和参数，应用执行。普通收藏、移动、连线等明确流程可由程序直接完成，首版不必引入完整 Agent／MCP 系统。
- API 密钥应留在后端。客户端只提交当前功能所需的明确材料和上下文；调用条件、认证、限额待确认。
- 旧灵感召回需自己的材料库和索引。可考虑多模态 embedding；向量模型／版本／维度需一致，规模较小时再评估是否需要独立向量数据库。
- 模型文件上传服务不作为魔法书的永久存储；本项目自行确定材料保存与删除方式。

## 5. 技术验证候选

| 要证明的体验 | 候选检查 |
|---|---|
| 始终跟手且不挡原操作 | 普通点击、选词、滚动、拖放与角色让位；动画帧表现 |
| 选中与保存一致 | 文字／图片／局部范围、缩放与滚动后的坐标、来源保真、截图类型标识 |
| 材料状态可靠 | 标签切换、刷新、后台重启、取消与重复操作后的结果 |
| AI 错误可理解 | 超时／失败／非法输出时原材料保留，模型说明与用户原话分开 |
| 可以继续使用素材 | 在明确支持的目标中验证投放、复制或下载的实际结果 |

测试页面、数据、设备、具体阈值和首版必验子集均待方案确认，尚无新项目测试结果。

## 6. 后续桌面扩展边界

桌面跨软件是后续方向，当前不实施。若未来讨论，需重新评估透明置顶窗口、事件穿透、全局输入、多屏坐标、Windows UI Automation／截图，以及逐应用的内容读取与投放；显示覆盖层不等于已理解底层软件。

## 7. 官方技术来源

- [Chrome 内容脚本](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)。
- [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)、[截图 API](https://developer.chrome.com/docs/extensions/reference/api/tabs)。
- [跨域请求](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)、[后台生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)。
- [扩展存储](https://developer.chrome.com/docs/extensions/reference/api/storage)、[侧栏 API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)。
- [Gemini SDK](https://ai.google.dev/gemini-api/docs/libraries)、[图片理解](https://ai.google.dev/gemini-api/docs/image-understanding)。
- [结构化输出](https://ai.google.dev/gemini-api/docs/structured-output)、[函数调用](https://ai.google.dev/gemini-api/docs/function-calling)。
- [Embedding](https://ai.google.dev/gemini-api/docs/embeddings)、[API 密钥](https://ai.google.dev/gemini-api/docs/api-key)、[文件输入](https://ai.google.dev/gemini-api/docs/files)。
- [WHATWG 拖放模型](https://html.spec.whatwg.org/multipage/dnd.html)、[$1 单笔手势识别参考](https://depts.washington.edu/acelab/proj/dollar/index.html)。

这些链接是前序调研与实施前核对入口，不表示项目已安装、已调用或已验证对应能力。
