# 第一模块契约

本文保留第一模块完成时的契约。当前 Check 与数据库 v2 的增量变更见 module-two-check.md；不代表真实 AI 接入。

## 材料

Material.id 在编辑时稳定；version 随正文或标题编辑递增，保存可以合并中间版本。type 为 text，source 为 virtual_document。首次启动初始化示例，不覆盖用户草稿。

SelectionContext 使用 UTF-16 半开区间 [start,end)，必须属于当前材料版本。半个代理对、越界和空选区拒绝；非法选区阻止打开能力面板，不退回全文。

MaterialSnapshot 是不可变、独立文本副本。打开操作面板时冻结；原文变化仅显示过期提示，用户可明确更新为当前全文。

## 操作

ActionDraft.entry = understand | check | create | summon。前三项是内容任务入口；summon 是委托入口。familiar = scout_bat | page_sprite | alchemy_imp。第一模块只准备范围和用户要求，不发送模型请求、不创建 Job。

## 本地保存

IndexedDB 名称 wisp-module-one、schema version 1；materials 保存材料，preferences 保存初始化标记、窗口布局与设置。文档写入在同一 readwrite 事务中比较 expectedVersion；冲突保留当前内存草稿并提示复制备份，不强制覆盖。界面只有落盘后才显示已保存。

正文保存防抖 350ms，布局 150ms。关闭前应等待保存完成；页面对未保存正文提供离开提示。浏览器崩溃或清理站点数据仍可能丢失本地内容。多标签页只保证文档冲突保护，不做实时协作；设置/布局采用最后一次写入。

## HTTP

GET /api/health 返回 status=ok, service=wisp, environment=local（可由 WISP_ENV 改变）, model_connected=false, jobs_enabled=false。

POST /api/jobs 返回 HTTP 501；error 包含 code=NOT_IMPLEMENTED、message、request_id。未读取模型凭据、未实现任务队列。未知路由使用相同错误外壳并返回 404。日志不包含材料正文。

后续 Job 建议包含 id、owner、snapshotId、operation、execution、familiarType、status、createdAt、error；Result 包含 jobId、snapshotId、summary/findings/draft、evidence、modelId、usage。当前未创建这些执行实体，不应将契约建议当成已实现服务。
