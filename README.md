# DSH 插件（小毛毛熊）

两个个人 DSH bundle，配一个 format 1 的插件市场索引，供 DSH 的「插件 → 发现」安装。

| 目录 | 包名 | 作用 |
|---|---|---|
| [rightbar-middle-close](rightbar-middle-close) | `@local/dsh-rightbar-middle-close` | 右侧边栏标签上点鼠标中键 = 关闭该标签页（同浏览器标签页） |
| [session-delete](session-delete) | `@local/dsh-session-delete` | 会话菜单中加入「删除会话」，永久删除该会话的聊天记录 |
| [market](market) | — | 插件市场索引 `index.json` 与图标，发布后由「发现」页读取 |

## 在另一台电脑上安装

1. 打开 DSH Web GUI →「插件」页 →「实验性插件」旁的 **更多** → 启用 **自定义插件市场**。
2. 切到 **发现** 标签，添加下面的索引地址（索引源按 profile 保存，每台机器只需加这一条）：

   ```text
   https://raw.githubusercontent.com/wooly99/dsh-plugins/main/market/index.json
   ```

3. 搜索「中键」「会话删除」并安装，然后 `Ctrl+R` 刷新页面。

## 维护

- 索引格式与坑位说明见 [market/README.md](market/README.md)。
- 发布新版本：改对应插件的 `package.json` 版本 → 推送到仓库 → 把 `market/index.json` 里的 `commit` 更新为新提交、`version` 与 `publishTimestamp` 同步更新 → 再推送。安装目标钉死 commit，所以不改 `commit` 就会装到旧代码。

## 许可

本仓库为个人自用插件，未附带开源许可证；如需复用请先联系作者。
