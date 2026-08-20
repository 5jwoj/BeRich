# BeRich - Loon 插件使用指南 (JDCK)

> **作者**: z.W.  
> **版本**: v1.0.0

包含 **京东 Cookie 自动同步**、**京豆资产查询** 与 **JD 账号过期检测** 的 Loon 专属插件配置说明。

---

## 📦 插件列表与安装

在 **Loon App** → **配置** → **插件** 中点击右上角 **➕**，按需添加以下插件链接：

| 插件名称 | 插件链接 | 类型 | 说明 |
| :--- | :--- | :--- | :--- |
| **京东Cookie同步** | `https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/JD_Cookie_Sync_Loon.plugin` | 抓包同步 (MitM) | 打开京东 APP 自动抓取并静默同步至青龙 `JD_COOKIE` |
| **京豆资产查询** | `https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/JD_Bean_Query_Loon.plugin` | 定时任务 (`23:35`) | 定时读取青龙资产日志并推送今日收益与余额 |
| **JD账号过期检测** | `https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/JD_Cookie_Check_Loon.plugin` | 定时任务 (`6:35-23:35/h`) | 定时检测日志中账号是否失效，并发送预警 |

---

## ⚙️ 参数配置（推荐使用 BoxJS）

### 1. 订阅 Loon 专属 BoxJS 合集
在 **BoxJS** 中添加以下订阅链接：
```
https://raw.githubusercontent.com/5jwoj/BeRich/main/boxjs/BeRich_Loon.boxjs.json
```

### 2. 配置说明
订阅后进入「**BeRich Loon 合集**」：
- **青龙面板配置**：填写青龙面板地址（如 `http://192.168.1.1:5700`）、Client ID 与 Client Secret（三款插件共享基础配置，填写一次即可）。
- **指定 Pin 查询/检测（可选）**：在「京豆资产查询」或「JD账号过期检测」中填写 `jd_local_pin` / `jd_check_pin`（多个逗号分隔），留空则默认处理日志中全部账号。

---

## 📖 使用与注意事项

1. **证书与 MitM**：使用 Cookie 同步功能前，请确保 Loon 已开启 **MitM** 并已信任证书，且主机名包含 `api.m.jd.com`。
2. **定时任务**：定时任务会自动按 Cron 表达式执行，也可在 Loon 的「脚本」列表中手动点击运行测试。
