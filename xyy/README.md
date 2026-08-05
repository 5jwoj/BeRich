# 小阅阅全自动阅读 📖

支持微信端全自动阅读文章金币结算及满 3000 金币自动提现，集成重写自动抓包及 Quantumult X 定时任务。

---

## 🛠️ 配置说明 (Quantumult X)

### 1. 配置文件模式

在 Quantumult X 配置文件中添加以下规则：

```ini
[rewrite_local]
# 1) 自动抓包重写
^https?:\/\/.*\/xiaoxinxin\/ url script-request-header https://raw.githubusercontent.com/5jwoj/BeRich/main/xyy/xyy_qx.js

[task_local]
# 2) 定时任务
15 6,8,10,12,14,16 * * * https://raw.githubusercontent.com/5jwoj/BeRich/main/xyy/xyy_qx.js, tag=小阅阅全自动阅读, img-url=https://raw.githubusercontent.com/Orz-3/mini/master/Color/wechat.png, enabled=true

[mitm]
hostname = *.info, *.asia, *.9d0hl2.info, *.ohqnjl.asia
```

---

### 2. 使用方法

1. 配置好重写与 MITM 证书后，在微信内点击打开小阅阅的入口链接。
2. 看到 QuanX 弹出“**抓包成功 🎉 已自动捕获并保存 Cookie 和 UnionID！**”通知后即可。
3. 脚本将在设定的 Cron 时间自动触发运行并统计收益发送通知，达到 3000 金币自动执行提现。

---

### 3. 环境变量 (可在持久化存储或变量配置设置)

| 环境变量名 | 说明 | 默认值 |
| :--- | :--- | :--- |
| `xyy_cookie` | 微信抓包获取的 Cookie (`ysmuid=...`) | 自动获取 |
| `xyy_unionid` | 账号 UnionID 标识 | 自动获取 |
| `xyy_entry_url` | 动态主接口域名 | 自动解析 |
| `xyy_max_read` | 单次运行最大阅读篇数 | `180` |

*支持多账号：使用 `&` 或 `@` 或 `换行` 分隔。*
