# DSH 插件转用 Git 与插件市场索引

本目录的 [index.json](index.json) 是一个 **format 1 插件市场索引**，列出 [../rightbar-middle-close](../rightbar-middle-close) 与 [../session-delete](../session-delete) 两个 bundle。DSH 自带「自定义插件市场」功能：一旦配上这个索引，另一台电脑就能在 GUI 的**插件 → 发现**里搜索并一键安装，不再需要拷贝目录。

## 0. 为什么不能「只连 git」

`dsh plugin` 是把参数转给 pnpm，所以理论上可以直接装 Git URL：

```powershell
& "D:\app-dev\dsh\resources\runtime\cli\bin\dsh.cmd" plugin --profile web add "git+https://github.com/OWNER/REPO.git#main&path:/rightbar-middle-close"
```

两个前提让它不方便日常用：

- 桌面版的 `desktop` profile 由 Electron 独占管理，CLI 会拒绝；只能走 GUI 的 `install_bundle`。
- 而且 `add` 只把包放进 `node_modules`，还要把包名加进 profile 的 `dsh.profile.bundles`，否则不会激活——这正是 `install_bundle` 替你做的事。

所以「Git 托管 + 市场索引 + 发现页安装」是官方路径里最省事的一步式方案。

## 1. 上传仓库

把本目录的**上一层**（`dsh-session`，含 `rightbar-middle-close/`、`session-delete/`、`market/`）提交到一个 **Public** 仓库。两件事决定能不能装成功：

- Git 安装语义是 `git clone repo && cd path`，所以**每个插件目录必须在仓库里自带 `package.json`**，`path` 指相对仓库根。
- 用 commit SHA 而不是分支名。市场安装目标形如 `git+https://github.com/OWNER/REPO.git#<40位commit>&path:/rightbar-middle-close`，钉死提交才不会因为后续 push 改变内容。

## 2. 填写索引

编辑 [index.json](index.json)，把两处占位替换成真实值：

- `versions[].source.url`：`https://github.com/OWNER/REPO`（不要带 `.git`、不要带 `?` 或 `#`）。
- `versions[].source.commit`：40 位小写 commit SHA。

注意格式限制（校验器实测）：版本必填 `publishTimestamp`（Unix 秒整数）；`engines.dsh` 必须是合法 SemVer range（DSH 会拒绝不兼容的安装）；`title`/`description` 用 `{ "en": ..., "zh": ... }` 时**必须包含 `en`**；`icon` 只能是 `data:` URL 或同源 / https 的相对路径。

改完最好验一遍。校验器是 DSH 自带的 `@deepseek-ai/dsh-plugin-market-index`；最省事的验证方式是在任一装了 DSH 的机器上把索引加进「发现」页读一次——格式有误时它会直接报出违规的 JSON 路径，例如 `$.plugins[0].versions[0].version must be an exact SemVer version`。

### 让图标显示出来

`icon` 写成 `./icons/...svg` 时，会被解析成索引 URL 的同目录地址。所以：

- 如果索引地址是 `https://raw.githubusercontent.com/OWNER/REPO/main/market/index.json`，`icons/` 也要在仓库的 `market/` 下（已就位）。
- 如果用了 CDN 的 `?raw` 之类带查询的地址，图标会解析失败——发现页会退回默认图；这条索引本身也**不能**带 `?` 或 `#`（会被拒绝）。

## 3. 发布索引

把 `market/index.json` 放成**最终 URL**。GitHub 上用 raw 链接：

```text
https://raw.githubusercontent.com/OWNER/REPO/main/market/index.json
```

不能用 `github.com/.../blob/...`——那是 HTML 页面，而且会重定向，DSH 明确拒绝重定向。

**改动索引时要重新发 commit 并更新 `commit` 字段**，因为安装目标是钉死的；否则新版本会装到旧代码。发布新版本时改 `version` 与 `publishTimestamp`。

## 4. 另一台电脑上安装

### 本机（先做一次，验证索引可用）

1. 打开 **插件** 页，点「实验性插件」旁的 **更多**，启用 **自定义插件市场**。
2. 页面出现 **已安装 / 发现** 两个标签，切到 **发现**。
3. 添加上面那个 raw 链接作为索引源。
4. 搜索「中键」「会话删除」，点安装。

### 另一台电脑

同样启用「自定义插件市场」，加上同一个索引链接即可。**索引源是按 profile 保存的**，不会跟着仓库走，所以那边需要手动添加这一条链接（只有这一条，不是每个插件都加）。

## 5. 常见坑

- **`@local/*` 名字**：发现页按包名识别「已安装」。如果你在别的机器上曾用目录方式装过同名包，发现页会显示已安装但版本可能不同；升级需要先卸载再装。
- **Git 安装要能访问 GitHub**：走 `git` 协议（pnpm 执行），公司网络需要代理时，代理要覆盖 git 而不只是浏览器。
- **DSH 版本**：`engines.dsh` 写的是 `>=0.2.1-rc.5 <0.3.0`。另一台装的是别的版本时，发现页会标为不兼容并拒绝安装，把版本号告诉我改这一行。
- **市场索引是「未签名」的**：索引里的名称/版本只是市场方的声明，真正生效的是包内 `package.json`。个人仓库无所谓，公开分享给自己的话别让它指向不认识的代码。
