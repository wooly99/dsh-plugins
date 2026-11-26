# DSH 插件（小毛毛熊）

个人使用的 DSH 插件合集：5 个自制插件，以及来自上游的 Codex 订阅接入、通知提醒和 DSHarness Remote。KISS模式及其与官方 Standard 的能力对比见[预设说明](kiss-preset/README.md)。

<!-- plugins:table:start -->
| 插件 | 功能 | 版本 | 来源 |
|---|---|---|---|
| [界面小增强](ui-enhancements/README.md) | 一个安装包，三个可分别启停的组件：会话工作区标记、折叠工作区状态、本轮代码差异。 | 1.4.0 | 本仓库 |
| [归档清理](archive-cleanup/README.md) | 在设置里一键永久删除已归档会话，释放磁盘空间。 | 1.1.1 | 本仓库 |
| [VS Code 打开修复](open-in-app-fix/README.md) | 修复 Windows DSH 打开 VS Code / Insiders 工作区文件夹的问题。 | 1.0.0 | 本仓库 |
| [KISS模式](kiss-preset/README.md) | 少约束、少干预，极简提速；保留实用工具与 Skills，让模型自主解决问题。 | 1.0.6 | 本仓库 |
| [Codex 订阅接入](https://github.com/WSL043/dsh-codex-subscription) | 使用 ChatGPT / Codex 订阅。 | 3.2.32 | npm |
| [通知提醒](https://github.com/chromoany/dsh-notify-me#readme) | 需要你操作或后台回复完成时，发送系统通知和提示音，支持外部推送。 | 1.27.3 | npm |
| [DSHarness Remote（远程访问）](https://github.com/liguobao/ds-harness-remote#readme) | 通过端到端加密连接，从 DSH Go、浏览器或另一台电脑访问这台 DeepSeek Harness 主机。 | 0.6.8 | npm |
| [Windows 开机自启](desktop-autostart/README.md) | 登录 Windows 10/11 后自动打开 DSH 桌面版；安装后在「设置 → 通用」开启。 | 1.0.0 | 本仓库 |
<!-- plugins:table:end -->

## 安装

### 从插件市场安装（推荐）

1. 在 DSH 侧栏打开「插件」→「发现」→「添加索引源」。如果已经添加过其他索引源，请从索引下拉菜单选择「管理索引源…」。
2. 在「索引 URL」粘贴下面的地址，点击「添加」：

   ```text
   https://raw.githubusercontent.com/wooly99/dsh-plugins/main/market/index.json
   ```

3. 在「发现」中选择「小毛毛熊的 DSH 插件」，找到想要的插件，点击「安装」。

**没有「发现」？** 到「插件」→「实验性插件」→「更多」，启用「自定义插件索引」，再回到「插件」页。

以后不用重新添加地址。回到「发现」点「刷新」，看到「更新」就可以直接更新。

### 备用：手动安装

如果无法使用插件市场，打开「插件」→「添加插件」，按需粘贴下面的安装地址：

<!-- plugins:specs:start -->
- 界面小增强：`git+https://github.com/wooly99/dsh-plugins.git#d6aef1a1cdd9b17b24a2fd1e7f6ee763b0dbd806&path:/ui-enhancements`
- 归档清理：`git+https://github.com/wooly99/dsh-plugins.git#d6aef1a1cdd9b17b24a2fd1e7f6ee763b0dbd806&path:/archive-cleanup`
- VS Code 打开修复：`git+https://github.com/wooly99/dsh-plugins.git#d6aef1a1cdd9b17b24a2fd1e7f6ee763b0dbd806&path:/open-in-app-fix`
- KISS模式：`git+https://github.com/wooly99/dsh-plugins.git#d6aef1a1cdd9b17b24a2fd1e7f6ee763b0dbd806&path:/kiss-preset`
- Codex 订阅接入：`dsh-codex-subscription@3.2.32`
- 通知提醒：`dsh-notify-me@1.27.3`
- DSHarness Remote（远程访问）：`ds-harness-remote@0.6.8`
- Windows 开机自启：`git+https://github.com/wooly99/dsh-plugins.git#d6aef1a1cdd9b17b24a2fd1e7f6ee763b0dbd806&path:/desktop-autostart`
<!-- plugins:specs:end -->

安装后按界面提示启用插件；如果提示需要重启，再重启 DSH。

Windows 开机自启仅适用于 Windows 桌面版。安装后到「设置 → 通用 → 开机自启」打开开关；如需卸载并取消自启，请先关闭开关。

## 更新与维护

[plugins.json](plugins.json) 统一管理插件列表、安装地址和市场索引。第三方 npm 插件跟踪上游 `latest`：GitHub Actions 每天查询一次，有变化就提 PR 并自动合并，发布到市场。自制插件继续固定在 Git 提交上，不随该任务更新。

本地开发：`node scripts/plugins.mjs install`。默认链接本地源码；`--remote` 安装远程版本，`--dsh <路径>` 指定 DSH CLI。

| 命令 | 用途 |
|---|---|
| `node scripts/plugins.mjs index` | 更新 README 插件列表和市场索引 |
| `node scripts/plugins.mjs index --commit <sha>` | 更新本仓库插件的提交版本 |
| `node scripts/plugins.mjs index --refresh` | 更新 npm 插件版本 |
| `node scripts/plugins.mjs check` | 检查生成内容是否一致 |
| `node scripts/plugins.mjs specs` | 打印安装地址；`--local` 打印本地地址 |

从固定 Git 提交安装的插件，可在「发现」刷新并点击「更新」。从本地链接切换到远程版时，先卸载本地版，再安装远程版。

测试：`node --test scripts/plugins.test.mjs ui-enhancements/tests/*.test.mjs archive-cleanup/tests/*.test.mjs open-in-app-fix/tests/*.test.mjs desktop-autostart/tests/*.test.mjs`。
