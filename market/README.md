# 可选插件市场

使用本仓库的[恢复脚本](../README.md)即可安装四个插件，**不需要启用自定义插件市场**。

这里的 [index.json](index.json) 仅保留「侧栏中键关闭」的发现页安装入口。旧的「删除会话」已从索引移除；归档清理、Codex 和 Git 可视化直接通过恢复脚本安装。

如需使用发现页，添加以下索引地址：

```text
https://raw.githubusercontent.com/wooly99/dsh-plugins/main/market/index.json
```

市场按确切版本和 Git commit 安装，不会自动读取本地改动。更新市场条目时，先提交插件源码，再修改索引中的 `version`、`publishTimestamp` 和 `source.commit`，最后推送。
