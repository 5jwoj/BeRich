# 农夫山泉 (NFSQ)

农夫山泉小程序自动抽奖脚本，支持 Loon 和 Surge。

## ✨ 功能特点

- 🎣 **自动抓取**: 自动捕获登录 Cookie。
- 🎯 **自动任务**: 自动完成每日任务。
- 🎰 **混合抽奖**: 支持双通道混合抽奖。
- 🎁 **自动领奖**: 中奖后自动领取奖品。
- 🔄 **多账号**: 自动识别并保存多账号数据。
- 🔔 **通知推送**: 中一等奖时实时推送通知。

## 📦 安装说明

### Surge

#### 方式一：使用模块 (推荐)

| 类型 | 链接 |
| :--- | :--- |
| **模块地址** | `https://raw.githubusercontent.com/5jwoj/BeRich/main/NFSQ/nfsq.sgmodule` |

#### 方式二：手动配置

```ini
[Script]
农夫山泉Cookie = type=http-request,pattern=^https:\/\/sxs-consumer\.nfsq\.com\.cn\/geement,script-path=https://raw.githubusercontent.com/5jwoj/BeRich/main/NFSQ/nfsq_cookie.js,requires-body=false,timeout=10
农夫山泉抽奖 = type=cron,cronexp=15 8 * * *,script-path=https://raw.githubusercontent.com/5jwoj/BeRich/main/NFSQ/nfsq.js,timeout=120,wake-system=1

[MITM]
hostname = %APPEND% sxs-consumer.nfsq.com.cn
```

### Loon

| 类型 | 链接 |
| :--- | :--- |
| **插件地址** | `https://raw.githubusercontent.com/5jwoj/BeRich/main/NFSQ/nfsq.plugin` |

## 📖 使用指南

1.  **配置环境**: 开启 MITM 并信任证书。
2.  **获取 Cookie**:
    -   确保模块/插件已启用。
    -   打开微信小程序「农夫山泉」。
    -   在页面内交互，直到看到 "Cookie 获取成功" 通知。
3.  **自动执行**: 脚本默认在每天 8:15 运行。
4.  **多账号**: 切换微信账号重复步骤 2 即可。

## ⚙️ 高级配置 (可选)

如需启用中奖通知，请编辑 `nfsq.js` 顶部：

```javascript
const TG_BOT_TOKEN = "your_telegram_bot_token";
const TG_CHAT_ID = "your_telegram_chat_id";
```

## ⚠️ 注意事项

-   首次使用**必须**先抓取 Cookie。
-   Token 失效后请清除持久化数据并重新抓取。
-   仅供学习研究使用。
