# PDF-02 文件文字导入契约

日期：2026-10-18。用户确认范围见项目 DESIGN.md 第 4.10 节。

## 接口与保存

`POST /api/import-text?format=docx|pptx|xlsx|pdf`，`Content-Type: application/octet-stream`，请求体为单文件二进制。文件名由浏览器保留，不发送给解析接口。TXT 不经过此接口，继续浏览器严格 UTF-8 解码。

成功为 `{schemaVersion:"import-text-1", format, text, warnings}`；失败为 `{error:{code,message,request_id}}`。错误不回显原文、路径或库异常。前端严格校验版本、格式、键和文字／提示限额，拒绝无效响应。

解析／预览阶段不写文件或 IndexedDB；确认加入时复用原事务创建一份文本 Material 和熔炉成员，最多 12 个成员。来源新增 `docx_file/pptx_file/xlsx_file/pdf_file`，保留文件元数据与提示，不保存原文件。三项 Gemini 前后端白名单同步，模型提示词不包含文件名或来源备注。数据库仍 v8。

读取可停止；新读取、取消新增和组件卸载均取消旧请求，票号防止迟到覆盖。保存失败保留编辑过的正文及同一材料标识，重试不重复解析。

## 提取范围

| 格式 | 提取与位置 | 明确限制 |
| --- | --- | --- |
| DOCX | 正文段落、表格及嵌套表格，按文档顺序；合并单元格不重复 | 不含图片、页眉页脚、批注、文本框、修订标记内文字；不生成虚构页码 |
| PPTX | 幻灯片号、文本框、组合对象、表格；含隐藏幻灯片 | 文件内对象顺序可能不同于视觉顺序；不含图片、图表、SmartArt、备注、母版文字 |
| XLSX | 工作表名、行号、列名；含隐藏表／行／列，空白行略去 | 不信任声明 dimension；公式带“未计算”标记保留原公式，数字格式、图片、图表、批注不保留 |
| PDF | 按页提取已有文字层，保留页码；部分空页标记并提示 | 不含 OCR；全部无文字报错；分栏、表格、文字顺序需核对原件 |

预览允许修改；这会改变导入副本，不会修改原文件。解析器不联网，不执行宏、公式或外链。

## 限额与错误

- 单文件 20,000,000 bytes；正文含位置标记和换行最多 60,000 UTF-16 单元；拒绝 NUL、纯空白，CRLF／CR 转 LF。不静默截断。
- 一次性 Python 子进程、30 秒解析限时、最多 2 个并发导入；超时、请求断连或任务取消均终止并回收子进程。上传结束后开始解析限时。
- Office ZIP 至多 2,000 项、解压大小合计 50 MB、单项 12 MB；拒绝重复条目、XML DTD／实体、加密容器、宏和类型不匹配。
- DOCX 表格和 PPTX 组合嵌套至多 20 层；PPTX 至多 300 幻灯片、10,000 个对象。
- XLSX 至多 100 工作表，每表 10,000 行／200 列，累计读取 200,000 个单元格。
- PDF 至多 300 页；单页内容／单流解码上限 8 MB，流解码工作上限 24 MB。加密 PDF 拒绝，不尝试密码。
- 错误代码：`IMPORT_FORMAT_UNSUPPORTED`、`IMPORT_FILE_TOO_LARGE`、`IMPORT_TEXT_TOO_LARGE`、`IMPORT_FILE_INVALID`、`IMPORT_ENCRYPTED`、`IMPORT_NO_TEXT`、`IMPORT_LIMIT_EXCEEDED`、`IMPORT_TIMEOUT`、`IMPORT_BUSY`、`IMPORT_FAILED`。解析库版本见 requirements.lock.txt。

## 验证入口

API 用 `apps/api/tests/test_import_text.py`；前端用 `import-text.test.ts`、`imported-material.test.ts` 和既有熔炉测试；浏览器用 `playwright.import.config.ts`（4 格式真实解析与既有熔炉流程）。

先运行 `runtime\python\python.exe -I -B apps/api/tests/import_fixtures.py e2e/fixtures/pdf02` 生成虚构样例，并运行 `npm run build`。随后 `npx playwright test --config=playwright.import.config.ts` 会启动 15289 隔离服务，使用空模型配置并提供 dist。不会加载真实 .env。详细结果见 [验证记录](../docs/pdf02-import-verification.md)。
