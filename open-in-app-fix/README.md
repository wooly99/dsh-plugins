# VS Code 打开修复

修复 Windows DSH 右上角「在 VS Code 中打开」无法正常启动的问题，支持 VS Code 和 Insiders 打开工作区文件夹。

## 安装

使用[仓库首页](../README.md#安装)的安装地址，或在「插件」→「添加插件」中填入本地路径：

```text
link:D:/projects/dsh-plugins/open-in-app-fix
```

安装后重启 DSH；禁用后重启即可停用。

## 原理

启动 VS Code 时，从子进程环境中移除误传的 `ELECTRON_RUN_AS_NODE`。仅处理单文件夹 GUI 启动，其他 CLI 调用保持原样。

已验证 DSH `0.2.2-rc.1`。

## 测试

仓库根目录执行：`node --test open-in-app-fix/tests/*.test.mjs`。
