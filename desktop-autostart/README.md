# Windows 开机自启

在 Windows 10/11 的 DSH 桌面版上，首次安装后会自动开启自启。可以在「设置 → 通用 → 开机自启」关闭；关闭后，重启 DSH 或更新插件不会重新开启。

普通模式使用当前用户的 `DSH Desktop Autostart` 启动项。DSH 以管理员身份运行时，插件会创建当前用户登录时以最高权限运行的计划任务，并移除旧版启动项，无需手动迁移。

如需卸载并取消自启，请先关闭开关，再卸载插件。若已卸载，普通模式可在 Windows「设置 → 应用 → 启动」禁用 `DSH Desktop Autostart`；管理员模式可在任务计划程序中移除 `DSH Desktop Autostart <用户 SID>`。
