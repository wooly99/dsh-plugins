# DSH 插件（小毛毛熊）

个人使用的 DSH 插件合集：4 个自制插件，以及来自上游 npm 的 Codex 订阅接入和通知提醒。KISS模式及其与官方 Standard 的能力对比见[预设说明](kiss-preset/README.md)。

<!-- plugins:table:start -->
| 插件 | 功能 | 版本 | 来源 |
|---|---|---|---|
| [界面小增强](ui-enhancements/README.md) | 一个安装包，三个可分别启停的组件：会话工作区标记、折叠工作区状态、本轮代码差异。 | 1.4.0 | 本仓库 |
| [归档清理](archive-cleanup/README.md) | 在设置里一键永久删除已归档会话，释放磁盘空间。 | 1.1.1 | 本仓库 |
| [VS Code 打开修复](open-in-app-fix/README.md) | 修复 Windows DSH 打开 VS Code / Insiders 工作区文件夹的问题。 | 1.0.0 | 本仓库 |
| [KISS模式](kiss-preset/README.md) | 少约束、少干预，极简提速；保留实用工具与 Skills，让模型自主解决问题。 | 1.0.6 | 本仓库 |
| [Codex 订阅接入](https://github.com/WSL043/dsh-codex-subscription) | 使用 ChatGPT / Codex 订阅。 | 3.2.3 | npm |
| [通知提醒](https://github.com/chromoany/dsh-notify-me#readme) | 需要你操作或后台回复完成时，发送系统通知和提示音，支持外部推送。 | 1.21.6 | npm |
<!-- plugins:table:end -->

## 安装

侧栏「插件」→「添加插件」，按需粘贴下面的安装地址：

<!-- plugins:specs:start -->
- 界面小增强：`git+https://github.com/wooly99/dsh-plugins.git#996ce8053f94209fee0a02496603dc627274b682&path:/ui-enhancements`
- 归档清理：`git+https://github.com/wooly99/dsh-plugins.git#996ce8053f94209fee0a02496603dc627274b682&path:/archive-cleanup`
- VS Code 打开修复：`git+https://github.com/wooly99/dsh-plugins.git#996ce8053f94209fee0a02496603dc627274b682&path:/open-in-app-fix`
- KISS模式：`git+https://github.com/wooly99/dsh-plugins.git#996ce8053f94209fee0a02496603dc627274b682&path:/kiss-preset`
- Codex 订阅接入：`dsh-codex-subscription@3.2.3`
- 通知提醒：`dsh-notify-me@1.21.6`
<!-- plugins:specs:end -->

安装后启用插件并重启 DSH。上面的地址已指向各插件子目录，直接复制即可。

### 命令行安装全部

<!-- plugins:install:start -->
```bash
dsh plugin --profile desktop add --ignore-scripts "git+https://github.com/wooly99/dsh-plugins.git#996ce8053f94209fee0a02496603dc627274b682&path:/ui-enhancements" "git+https://github.com/wooly99/dsh-plugins.git#996ce8053f94209fee0a02496603dc627274b682&path:/archive-cleanup" "git+https://github.com/wooly99/dsh-plugins.git#996ce8053f94209fee0a02496603dc627274b682&path:/open-in-app-fix" "git+https://github.com/wooly99/dsh-plugins.git#996ce8053f94209fee0a02496603dc627274b682&path:/kiss-preset" "dsh-codex-subscription@3.2.3" "dsh-notify-me@1.21.6"
```
<!-- plugins:install:end -->

本地开发：`node scripts/plugins.mjs install`。默认链接本地源码；`--remote` 安装远程版本，`--dsh <路径>` 指定 DSH CLI。

也可以通过[自定义插件市场](market/README.md)浏览安装。

## 更新与维护

[plugins.json](plugins.json) 统一管理插件列表、安装地址和市场索引。

| 命令 | 用途 |
|---|---|
| `node scripts/plugins.mjs index` | 更新 README 插件列表和市场索引 |
| `node scripts/plugins.mjs index --commit <sha>` | 更新本仓库插件的提交版本 |
| `node scripts/plugins.mjs index --refresh` | 更新 npm 插件版本 |
| `node scripts/plugins.mjs check` | 检查生成内容是否一致 |
| `node scripts/plugins.mjs specs` | 打印安装地址；`--local` 打印本地地址 |

从固定 Git 提交安装的插件，可在「发现」刷新并点击「更新」。从本地链接切换到远程版时，先卸载本地版，再安装远程版。

测试：`node --test scripts/plugins.test.mjs ui-enhancements/tests/*.test.mjs archive-cleanup/tests/*.test.mjs open-in-app-fix/tests/*.test.mjs`。
