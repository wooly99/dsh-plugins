# VS Code 打开修复

修复 Windows DSH 右上角打开 VS Code 时错误继承 `ELECTRON_RUN_AS_NODE` 的问题。

## 安装

「插件」→「添加插件」：

```text
link:D:/projects-mine/dsh-plugins/open-in-app-fix
```

保留本目录；修改代码后重启 DSH。禁用插件即可撤销。

## 范围

仅处理 VS Code / Insiders 的单文件夹 GUI 启动。不改安装包、宿主环境或权限校验，不影响 CLI。正常升级保留插件；宿主改变启动方式时可能需要适配。

已验证 DSH `0.2.2-rc.1`。未加入仓库市场索引。

## 测试

在本目录执行 `node --test "tests/*.test.mjs"`。
