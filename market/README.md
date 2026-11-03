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
- `publishTimestamp` 对本仓库插件取自该目录最后一次提交时间，对 npm 插件取自清单里记录的时间，所以生成过程离线且可复现。
- `engines.dsh` 只在本仓库插件（顶层 `engines`）或 npm 条目自己声明时写入；超出范围的版本在发现页显示为不兼容，可以更新范围或加版本豁免。

## 校验

```bash
node scripts/plugins.mjs check
```

生成物与清单不一致时以非零状态退出，适合放进 CI。
