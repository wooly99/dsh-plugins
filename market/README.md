# 插件市场索引

[index.json](index.json) 与 [icons/](icons/) 由 `node scripts/plugins.mjs index` 从 [../plugins.json](../plugins.json) 生成，**不要手改**。

## 使用

插件页 →「实验性插件」→「更多」→ 启用「自定义插件市场」，然后在「发现」里添加：

```text
https://raw.githubusercontent.com/wooly99/dsh-plugins/main/market/index.json
```

## 约定

- 本仓库插件按 `source.type: git` 安装：`url` + `commit` + `path`，内容锁在提交上，不会读到本地改动。
- npm 插件按 `source.type: npm` 与确切的 `version` 安装。
- 上游 Git 插件直接从作者仓库的固定提交安装，不复制源码；包位于上游仓库根目录时不加 `path`，本地安装模式也仍使用上游地址。
- `publishTimestamp` 对本仓库插件取自该目录最后一次提交时间；npm 插件由 `index --refresh` 更新，上游 Git 插件在清单里记录对应版本的发布时间。生成时无需联网。
- `engines.dsh` 优先使用插件条目自己的 `engines`；本仓库插件未单独声明时回退到清单顶层范围。KISS 模式自 1.0.6 起用 `engines: {}` 表示不限制 DSH 版本。
- 从同一 Git 仓库、同一子目录的固定提交安装后，刷新「发现」即可检查新版并点击「更新」。本地链接需要先换成远程安装。

## 校验

```bash
node scripts/plugins.mjs check
```

生成物与清单不一致时以非零状态退出，适合放进 CI。
