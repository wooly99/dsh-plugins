# DSH 插件（小毛毛熊）

个人使用的 DSH 插件合集，附带换机恢复脚本。两个自制插件保存在仓库中，Codex 接入和 Git 可视化通过 npm 安装，不复制第三方源码。

| 插件 | 功能 | 来源 |
|---|---|---|
| [侧栏中键关闭](rightbar-middle-close) | 鼠标中键关闭右侧边栏标签 | 本仓库 |
| [归档清理](archive-cleanup) | 在设置里一键永久删除已归档会话，释放磁盘空间 | 本仓库 |
| [Codex 订阅接入](https://github.com/WSL043/dsh-codex-subscription) | 使用 ChatGPT / Codex 订阅 | npm，安装时获取最新版 |
| [Git 可视化](https://github.com/cherrchen/dsh-plugin-git) | 在 DSH 中查看和操作 Git 仓库 | npm，安装时获取最新版 |

## 安装与换机恢复

DSH 需要先启动过一次，以创建默认配置。安装前完全退出 DSH（包括托盘），在外部 PowerShell 执行：

```powershell
git clone https://github.com/wooly99/dsh-plugins.git
cd dsh-plugins
powershell -NoProfile -ExecutionPolicy Bypass -File .\restore-plugins.ps1 -Apply
```

脚本通过官方 DSH CLI 安装并注册四个插件，保留其他插件和设置；确认新插件安装成功后，会卸载旧的「删除会话」。完成后重启 DSH；新电脑上的 Codex 需要重新登录。支持 PowerShell 5.1 / 7，使用桌面版自带的 Node 和 pnpm。

归档继续用 DSH 自带的操作；[归档清理](archive-cleanup/README.md)只在设置页里手动触发，不会自动删除。

### 自定义 DSH 安装位置

脚本会查找 PATH 和常见安装目录。找不到时，用 `-DshPath` 指定安装目录中的 CLI：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\restore-plugins.ps1 -Apply `
  -DshPath "D:\Apps\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
```

### 其他参数

- 不加 `-Apply`：只预览目标和安装清单，不修改文件、不下载。
- `-Profile web`：改为安装到 `web`，默认是桌面版的 `desktop`。目标配置须已初始化并停止运行。
- `-DshHome "D:\MyDshHome"`：指定数据目录；默认使用环境变量 `DSH_HOME`，未设置时使用用户目录下的 `.dsh`。

## 更新

拉取仓库更新，退出 DSH，再运行恢复脚本：

```powershell
git pull
powershell -NoProfile -ExecutionPolicy Bypass -File .\restore-plugins.ps1 -Apply
```

两个自制插件安装当前仓库中的代码；Codex 和 Git 可视化每次请求 npm 的 `latest`，不在后台自动升级。若最新版与 DSH 不兼容，官方安装器会拒绝安装，不会跳过兼容性检查。

## 需要注意

- 保留仓库目录，后续更新、重装仍会用到。移动目录后，从新位置重新运行脚本。
- 安装前会把目标配置中的依赖清单、锁文件和包管理配置备份到 `.plugin-restore-backups`。失败时显示备份位置，但不保证完整回滚已下载的依赖。
- 仓库不保存登录凭据或聊天记录；不要把完整 DSH 数据目录提交进来。
- Windows 命令转义限制：仓库和 CLI 路径不要包含 `" % ! & | < > ^ ( )` 等特殊字符；空格和中文可以使用。

## 维护

安装清单在 [plugins.json](plugins.json)：本地目录以 `./` 开头，npm 包写作 `包名@版本`，例如 `dsh-codex-subscription@latest`。

日常安装和换机恢复直接用本仓库的脚本即可，不需要启用自定义插件市场。[市场索引](market/README.md)仅保留为可选入口，目前只收录侧栏中键关闭。
