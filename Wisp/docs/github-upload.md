# 把 Wisp 上传到 GitHub：第一次操作指南

这份指南只上传 Wisp 的代码，不部署网站，不上传 Worldloom，也不包含浏览器内保存的材料和回信。本轮只准备文件和步骤，尚未创建 Git 仓库、提交或上传。

## 三个词先看懂

- **仓库 Repository**：一个保存项目文件及修改历史的文件夹。
- **提交 Commit**：在自己电脑上保存一次代码版本，不等于已经上传。
- **推送 Push / 发布 Publish**：把提交传到 GitHub。发布仓库不是发布网站。

建议首次用 GitHub Desktop 的按钮完成。以下按钮名称按 GitHub 官方文档核对（2026-10-18），界面可能因版本或语言略有变化。

## 1. 准备账号和软件

注册并登录 [GitHub](https://github.com/)，安装 [GitHub Desktop](https://desktop.github.com/)，在 Desktop 中登录相同账号。官方说明：[首次使用 GitHub Desktop](https://docs.github.com/en/desktop/overview/creating-your-first-repository-using-github-desktop)。

本次本机检查：Wisp 和其直接父目录没有 .git 目录，因此按“尚未建立仓库”操作。如果你之后自己建过仓库，就使用 Add Local Repository 添加它，别重复新建或删除历史。

## 2. 确认上传范围

正确的项目根目录是：

~~~text
E:\dsr_version1\DeepSpaceReceiver\Wisp
~~~

打开它，应直接看到 README.md、package.json、apps、docs。不要选择上一级 DeepSpaceReceiver，也不要选到 node_modules 或再次嵌套的 Wisp/Wisp。

| 应保留在仓库 | 不应上传 |
| --- | --- |
| apps 源代码及网页必需的 public 素材 | node_modules、.venv、.npm-cache |
| package.json、package-lock.json、requirements.lock.txt | dist、test-results、playwright-report、coverage |
| contracts、docs、e2e、scripts | 真实 .env、.env.local 等配置、私钥、日志 |
| README、启动脚本、配置示例 .env.example | Worldloom 整个项目及其旧配置 |

.gitignore 已排除右列常见文件。它不会自动撤回曾经提交过的文件，因此第一次提交前也要看清文件列表。只在本机服务端填写密钥；不要把配置内容粘贴到 GitHub、Issues 或 README。

项目文档中可能有本机路径和演示截图；公开前阅读一次。角色素材来自提供的图集，当前没有为整个项目补造开源许可。首次建议保持私人仓库，公开时由你确认代码与素材授权。

## 3. 在现有 Wisp 文件夹建立本地仓库

1. GitHub Desktop → File → Add Local Repository，选择上述 Wisp 目录。
2. 如果提示它还不是 Git repository，点击提示里的 **create a repository here**。如果版本中没有这个链接，使用 File → New Repository。
3. 新建对话框中，Name 填 **Wisp**，Local path 应是它的父目录 **E:\dsr_version1\DeepSpaceReceiver**。确认最终位置是现有 Wisp，不能生成 Wisp/Wisp。
4. 不勾选 Initialize with README；Git ignore 和 License 保持 None。项目已有 README 和 .gitignore，保留它们。
5. 点击 Create Repository。此步骤只建立本地版本记录，不上传，也不替换项目文件。

GitHub Desktop 的 Local path 是父目录，Name 会作为最后一级目录；参见 [官方创建仓库说明](https://docs.github.com/en/desktop/overview/creating-your-first-repository-using-github-desktop)。

## 4. 检查并提交第一个版本

1. 左上角 Current repository 确认是 Wisp。
2. 在 Changes 查看待提交文件。应该看到源码和说明；不应看到真实 .env、node_modules 或 .venv。目录中有这些文件是正常的，关键是它们不在提交列表里。
3. 点击 README.md 看看是不是小白版说明；确认截图只是示例内容。不要对这些文件使用 Discard changes。
4. 在 Summary 填：**Initial Wisp prototype**，点击 Commit to main（按钮尾部可能是其他分支名）。
5. 有些版本在创建仓库时已经完成初始提交。如果 Changes 为空，到 History 查看首次提交及文件清单即可；不用制造空提交。

Commit 只保存在本机。每次修改后都可以按同样方式记一个版本，再决定何时推送。

## 5. 发布到 GitHub

1. 点击顶部 **Publish repository**。
2. Name 使用 Wisp 或你希望的名称；保留 **Keep this code private**，让它先成为私人仓库。
3. 选择自己的账号，点击 Publish Repository。
4. 完成后用 Repository → View on GitHub 打开网页，核对有 apps、docs、README，以及最新提交。
5. 在 GitHub 网页上确认没有真实配置文件和依赖目录。看到 README 正常展示、文件齐全才算上传完成；仅本地提交成功不算。

发布按钮与私人选项见 [GitHub 官方：发布已有项目](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-an-existing-project-to-github-using-github-desktop)。本项目目前没有远程仓库，因此无需按其他迁移教程删除 remote。

## 6. 以后怎么更新？

1. 正常修改 Wisp，做完对应验证。
2. GitHub Desktop → Changes，逐项检查修改。
3. Summary 写这次做了什么，例如“Improve floating result panel”。
4. 点击 Commit to main，然后点击 **Push origin**。
5. 到 GitHub 网页确认最新提交出现。Commit 是本机记录，Push 才同步到 GitHub。

多台电脑协作前先 Fetch origin / Pull origin；如果提示冲突，停下来检查冲突文件，不使用强制推送覆盖别人的修改。

## 常见疑问

**我能直接拖整个文件夹到 GitHub 网页吗？**
不建议。当前目录包含安装依赖和虚拟环境，体积很大，也容易带入私密配置。使用 Desktop 与 .gitignore 更容易核对范围。

**为什么电脑里的材料没有跟着上传？**
材料和回信存在浏览器 IndexedDB，源码仓库不包含它们。重要文字请另存；当前没有完整数据备份导出。

**别人下载后能直接用我的 Gemini 吗？**
不能。仓库只提供空配置示例，每个人需在自己的本机服务端填写可用凭据。你的旧配置不在 Wisp 仓库范围内。

**上传以后会自动上线吗？**
不会。这里没有配置部署、GitHub Pages 或在线 API。下载者按 README 在本机安装和启动。

**发现密钥已提交怎么办？**
先不要继续发布。如果已经传到远端，先到供应商处撤销/轮换密钥；仅删除最新文件不能清除历史里的密钥。不要在求助信息中贴出旧密钥。
