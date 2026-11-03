# DSH 插件（小毛毛熊）

个人使用的 DSH 插件合集。两个插件源码在本仓库，另外两个从 npm 安装确切版本，不复制第三方源码。

<!-- plugins:table:start -->
| 插件 | 功能 | 版本 | 来源 |
|---|---|---|---|
| [侧栏标签中键关闭](rightbar-middle-close/README.md) | 鼠标中键关闭右侧边栏标签。 | 1.0.0 | 本仓库 |
| [归档清理](archive-cleanup/README.md) | 在设置里一键永久删除已归档会话，释放磁盘空间。 | 1.1.1 | 本仓库 |
| [Codex 订阅接入](https://github.com/WSL043/dsh-codex-subscription) | 使用 ChatGPT / Codex 订阅。 | 3.2.3 | npm |
| [Git 可视化](https://github.com/cherrchen/dsh-plugin-git) | 在 DSH 中查看和操作 Git 仓库。 | 0.2.9 | npm |
<!-- plugins:table:end -->

## 安装

插件页（侧栏「插件」）和官方 CLI 都能装。下面的 spec 由 [plugins.json](plugins.json) 生成，插件源码改动后重新生成（见[维护](#维护)）。

### 方式 A：插件页（推荐）

侧栏「插件」→「添加插件」，一行一条粘进去：

<!-- plugins:specs:start -->
- 侧栏标签中键关闭：`git+https://github.com/wooly99/dsh-plugins.git#409e1e28b8b14ef9071bbffeaf60eac9914c4436&path:/rightbar-middle-close`
- 归档清理：`git+https://github.com/wooly99/dsh-plugins.git#409e1e28b8b14ef9071bbffeaf60eac9914c4436&path:/archive-cleanup`
- Codex 订阅接入：`dsh-codex-subscription@3.2.3`
- Git 可视化：`@dsh-electron/dsh-plugin-git@0.2.9`
<!-- plugins:specs:end -->

装完确认插件页里的开关是开的；宿主代码改动后需要重启 DSH（profile 开了 HMR 时会自行重组）。卸载同样在插件页操作。

### 方式 B：一条命令装全部

官方 CLI，桌面版在 `resources/runtime/cli/bin/dsh.cmd`。不在 PATH 上时用 `--dsh` 指路径，或设置 `DSH_CLI`：

<!-- plugins:install:start -->
```bash
dsh plugin --profile desktop add --ignore-scripts "git+https://github.com/wooly99/dsh-plugins.git#409e1e28b8b14ef9071bbffeaf60eac9914c4436&path:/rightbar-middle-close" "git+https://github.com/wooly99/dsh-plugins.git#409e1e28b8b14ef9071bbffeaf60eac9914c4436&path:/archive-cleanup" "dsh-codex-subscription@3.2.3" "@dsh-electron/dsh-plugin-git@0.2.9"
```
<!-- plugins:install:end -->

在仓库 checkout 里也可以直接 `node scripts/plugins.mjs install`：默认用 `link:` 指向本地目录，改代码后重启即生效（`--remote` 改为按 pin 的 commit 安装）。

### 为什么不直接贴仓库 URL

仓库根目录没有 `package.json`。DSH 的「组合包」是**一个包**，不是仓库：贴 `https://github.com/wooly99/dsh-plugins` 时 pnpm 会把整个仓库装成一个普通依赖（版本 `0.0.0`，`package.json` 是 pnpm 生成的占位符），装完 DSH 发现它没有 `dsh.bundle.patch`，判定「这个包没有声明组合包」，然后回滚 `package.json` 与 `pnpm-lock.yaml`。

所以本仓库用 `git+…&path:/<子目录>` 指到具体的插件包，再用 `#<commit>` 锁住内容。历史版本里的 `restore-plugins.ps1` 就是因为这件事才存在，现在已经不需要了。

## 更新

- **本仓库插件**：改源码 → 提交 → `node scripts/plugins.mjs index --commit <新提交>` → 推送。已装的插件在插件页卸载后按新 spec 重装；DSH 不支持原地升级。
- **npm 插件**：清单里只写 `"tag": "latest"`，跑 `node scripts/plugins.mjs index --refresh`，它去 npm 查这个 tag 的确切版本与发布时间并写回清单；生成的 spec、市场索引、`install` 用的都是这个确切版本，`check` 仍然离线。
- **随 DSH 提供的组合包**：随 DSH 升级，不在这个清单里。

## 需要注意

- 不要在插件页贴仓库根 URL（原因见上）。
- 外部插件在 spec 里用清单解析好的确切版本，不用 `@latest`：后者会被 pnpm 记成 `^x.y.z`，「换机装到哪个版本」取决于解析时机，而不是你验证过的那个。
- 本仓库插件的 `engines.dsh` 是 `>=0.2.1-rc.5 <0.3.0`。DSH 升到范围外时安装会被拒绝，需要更新这个范围，或给该版本加豁免。
- 仓库不保存登录凭据或聊天记录；不要把完整 DSH 数据目录提交进来。
- [归档清理](archive-cleanup/README.md) 只处理已归档会话，永久删除不可恢复。

## 维护

[plugins.json](plugins.json) 是唯一真源，`scripts/plugins.mjs` 负责其余产物：

| 命令 | 作用 |
|---|---|
| `node scripts/plugins.mjs index` | 生成 `market/index.json`、`market/icons/`、本 README 的三段表格 |
| `node scripts/plugins.mjs index --refresh` | 先把 npm 条目的 `tag` 解析成确切版本写回清单，再生成（`--registry` 换源） |
| `node scripts/plugins.mjs index --commit <sha>` | 换 pin，并把它写回 `plugins.json` |
| `node scripts/plugins.mjs check` | 只校验生成物与清单一致，可放进 CI |
| `node scripts/plugins.mjs specs` | 打印四条 spec（`--local` 打印 `link:` 形式） |
| `node scripts/plugins.mjs install` | 用本地 checkout 安装；`--remote`、`--profile`、`--dsh`、`--dry-run` |

`index --commit` 在插件目录有未提交改动时会拒绝，避免 pin 到一个装不出当前代码的提交（`--allow-dirty` 可跳过）。

测试：`node --test scripts/plugins.test.mjs`（纯函数，不碰网络，也不碰 profile）。

市场索引是可选的第二个入口：启用「自定义插件市场」后添加 `https://raw.githubusercontent.com/wooly99/dsh-plugins/main/market/index.json`，见 [market/README.md](market/README.md)。
