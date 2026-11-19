# KISS模式

**少约束、少干预，极简提速。**

以 DSH 0.2.2-rc.5 官方 Standard 为底，移除不必要的流程约束与任务编排，减少提示词干预和管理开销，让模型自主思考、直接解决问题。保留实用工具与 Skills，不额外规定解题套路。

## 与官方 Standard 对比

以下对比以 DSH **0.2.2-rc.5** 为验证基线，不是安装限制。升级 DSH 不会因版本号变化而停用 KISS；接口实际变化时再适配。保留项沿用官方参数，不增加人设或流程指令。两处宿主注入只在 KISS 的会话范围内调整。

| 能力 | 官方 Standard | KISS模式 |
|---|---|---|
| 人设 | 官方编码 Agent 人设 | 完全相同，不加字 |
| 文件读写、编辑、读图 | 保留 | 保留 |
| 文件名搜索、内容搜索 | 保留 | 保留 |
| PowerShell / Bash | Windows 用 PowerShell，其他平台用 Bash | 相同 |
| 后台任务与输出管理 | 保留 | 保留 |
| 全局和项目规则自动加载 | 保留 | 保留 |
| Skills 自动发现、目录和按需加载 | 保留 | 保留；内置 Office Skills 仅手动调用 |
| Web GUI 地址和相关提示 | 注入 | 桌面版不注入，Web 版不变 |
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
| Office 文件编辑 | 可用 | 保留，可用 Python 库编辑 `.docx`、`.xlsx`、`.pptx` |
| Office 专用渲染、转换、公式重算 | 按需启用 | 不挂载 |
| 插件市场工具 | 默认关闭 | 不挂载 |

官方人设原文保持不变：

```text
You are a coding agent powered by the {{model}} model.
```

桌面版只省略 `app:web-surface`，不会关闭本地服务。工作目录、权限规则和 DSH 源码位置仍照常提供。

KISS 不把四个内置 Office Skills 放进模型目录。需要官方编辑指引时，在消息里加 `/office-docx`、`/office-xlsx` 或 `/office-pptx`。普通编辑不依赖专用工具；需要渲染、格式转换或公式重算时，用 Standard 模式。

## 安装与使用

已发布版本使用仓库根目录 README 的 **KISS模式** 安装地址。测试当前源码时，在「插件」→「添加插件」中选择本地 `kiss-preset` 目录。替换版本或安装来源时，先卸载同名包。

新建会话，在模式选择器中选择 **KISS模式**。不替换 Standard，不修改默认模式，不切换已有会话。

本地维护源码位于 `kiss-preset/`；修改后先提交源码，再运行 `node scripts/plugins.mjs index --commit <源码提交 SHA>` 更新远程安装 pin，最后推送。

## 验证

`verify.cjs` 对照当前 DSH 的 Standard 预设检查保留项，并使用 DSH 的提示词与 Skills 注册表验证 Desktop/Web 差异、Office 手动加载及作用域隔离。通过 DSH 提供的 Electron/Node 运行时运行，并保留 `DSH_INSTALL_DIR`；不请求模型，也不修改用户配置。

## English

A subtractive Standard preset for DSH 0.2.2-rc.5: fewer workflow constraints, less prompt interference and less orchestration overhead. Keep the official persona, practical tools, skills and workspace rules. Choose **KISS模式** in a new session. Install a published build from the repository's pinned spec, or add the local directory to test this checkout.

On Desktop, KISS omits the Web GUI address and related prompt guidance. Bundled Office skills are available through explicit invocation but are not advertised to the model. The default preset, permissions and MCP connections are unchanged.
