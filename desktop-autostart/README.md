# Windows 开机自启

在 Windows 10/11 的 DSH 桌面版中，打开「设置 → 通用 → 开机自启」。开启后，下次登录 Windows 会打开 DSH；安装插件本身不会开启自启。

插件只管理当前用户的 `DSH Desktop Autostart` 启动项，不需要管理员权限，也不会额外运行后台进程。如果从 Windows 启动应用列表禁用了此项，重新进入通用设置即可看到关闭状态。

如需卸载并取消自启，请先关闭开关，再卸载插件。若已卸载，可在 Windows 的「设置 → 应用 → 启动」禁用 `DSH Desktop Autostart`。
