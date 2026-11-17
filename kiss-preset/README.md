# KISS模式

**少约束、少干预，极简提速。**

以 DSH 0.2.2-rc.3 官方 Standard 为底，移除不必要的流程约束与任务编排，减少提示词干预和管理开销，让模型自主思考、直接解决问题。保留实用工具与 Skills，不额外规定解题套路。

## 与官方 Standard 对比

以下对比基于 DSH **0.2.2-rc.3**。保留项沿用官方参数，只删去不需要的插件，不增加人设或流程指令。

| 能力 | 官方 Standard | KISS模式 |
|---|---|---|
| 人设 | 官方编码 Agent 人设 | 完全相同，不加字 |
| 文件读写、编辑、读图 | 保留 | 保留 |
| 文件名搜索、内容搜索 | 保留 | 保留 |
| PowerShell / Bash | Windows 用 PowerShell，其他平台用 Bash | 相同 |
| 后台任务与输出管理 | 保留 | 保留 |
| 全局和项目规则自动加载 | 保留 | 保留 |
| Skills 自动发现、目录和按需加载 | 保留 | 保留 |
| 历史压缩、`/compact`、大输出裁剪 | 保留 | 保留 |
| 结构化提问 | 保留 | 保留 |
| 网页搜索、网页抓取 | 保留 | 保留 |
| 文件交付卡片 `present` | 保留 | 保留 |
| 插件管理 | 保留 | 保留 |
| 已有 Figma、Playwright 等宿主 MCP | 可用 | 保持原配置 |
| 子智能体、分叉、智能体通信 | 可用 | 移除 |
| Workflow 编排 | 可用 | 移除 |
| Todo 任务管理 | 可用 | 移除 |
| 目标命令、目标管理工具 | 可用 | 移除 |
| Plan 模式审批流程 | 可用 | 移除 |
| 定时任务工具 | 可用 | 移除 |
| 时间自动注入 | 可用 | 移除 |
| Office 专用工具 | 可用 | 移除 |
| 插件市场工具 | 默认关闭 | 不挂载 |

官方人设原文保持不变：

```text
You are a coding agent powered by the {{model}} model.
```

保留必要工具说明，不使用 `complete: true` 全量清除系统提示词。全局、项目规则与已加载 Skills 仍提供各自指导；原有权限、安全策略和共享宿主服务不变。

## 安装与使用

从仓库根目录 README 的 **KISS模式** 安装地址安装。地址固定远程提交和 `kiss-preset` 子目录，不依赖本地源码链接。已有本地安装时，先在插件管理中卸载同名包，再用远程地址安装。

新建会话，在模式选择器中选择 **KISS模式**。不替换 Standard，不修改默认模式，不切换已有会话。

本地维护源码位于 `kiss-preset/`；修改后先提交源码，再运行 `node scripts/plugins.mjs index --commit <源码提交 SHA>` 更新远程安装 pin，最后推送。

## 验证

`verify.cjs` 使用当前 DSH 安装中的 YAML 解析器，将 14 个保留的顶层插件条目与官方 Standard 逐项比较，检查人设不变、9 个移除条目、平台 Shell 条件和插件管理条件。应通过 DSH 提供的 Electron/Node 运行时运行，并保留 `DSH_INSTALL_DIR`；它不请求模型、不修改用户配置。

## English

A subtractive Standard preset for DSH 0.2.2-rc.3: fewer workflow constraints, less prompt interference and less orchestration overhead. Keep the official persona, practical tools, skills and workspace rules. Choose **KISS模式** in a new session. Install from the repository's commit-pinned remote subdirectory spec, not a local link.

No custom runtime code, dependencies or install scripts. Existing sessions, the default preset, permissions and MCP connections are unchanged. The optional detail image is omitted; the K icon is original SVG artwork.
