# 农夫山泉自动抽奖

农夫山泉小程序自动抽奖脚本，支持 Loon 和 Surge。

## ✨ 功能特点

- 🔄 自动抓取登录 Cookie
- 🎯 自动完成每日任务
- 🎁 双通道混合抽奖
- 🎊 自动领取奖品
- 📱 支持多账号
- 🔔 中一等奖推送通知

## 📦 支持平台

- ✅ Surge (iOS/Mac)
- ✅ Loon
- ✅ Quantumult X

## 🚀 快速开始

### Surge 用户

#### 方法一：一键安装（推荐）

1. 在 Surge 中点击「模块」→ 右上角「+」
2. 输入以下 URL：
   ```
   https://raw.githubusercontent.com/5jwoj/BeRich/main/NFSQ/nfsq.sgmodule
   ```
3. 点击「好」安装
4. 确保模块已启用

#### 方法二：配置远程脚本

在配置文件中添加：

```ini
[Script]
农夫山泉Cookie = type=http-request,pattern=^https:\/\/sxs-consumer\.nfsq\.com\.cn\/geement,script-path=https://raw.githubusercontent.com/5jwoj/BeRich/main/NFSQ/nfsq_cookie.js,requires-body=false,timeout=10

农夫山泉抽奖 = type=cron,cronexp=15 8 * * *,script-path=https://raw.githubusercontent.com/5jwoj/BeRich/main/NFSQ/nfsq.js,timeout=120,wake-system=1

[MITM]
hostname = %APPEND% sxs-consumer.nfsq.com.cn
```

### Loon 用户

1. 在 Loon 中点击「配置」→「插件」→「+」
2. 输入以下 URL：
   ```
   https://raw.githubusercontent.com/5jwoj/BeRich/main/NFSQ/nfsq.plugin
   ```
3. 点击「确定」安装

## 📖 使用说明

### 1. 启用 MitM

**Surge:**
- 打开 Surge → 更多设置 → MitM
- 确保「启用 MitM」已开启
- 按提示配置并信任 CA 证书

**Loon:**
- 打开 Loon → 配置 → MitM
- 确保 MitM 已开启并已信任证书

### 2. 抓取 Cookie

1. 确保模块/插件已启用
2. 打开微信中的「农夫山泉」小程序
3. 随便点击页面，触发请求
4. 看到「Cookie获取成功」通知即可

### 3. 自动运行

- 脚本会在每天早上 8:15 自动执行抽奖
- 也可以在脚本列表中手动运行

### 4. 修改执行时间（可选）

编辑配置文件中的 cron 表达式：

```
15 8 * * *      # 每天 8:15
0 7,12,18 * * * # 每天 7:00、12:00、18:00
30 */2 * * *    # 每2小时的30分
```

## 🔔 推送通知配置（可选）

如需在中一等奖时收到推送通知，编辑 `nfsq.js` 文件，在顶部添加：

```javascript
const TG_BOT_TOKEN = "your_telegram_bot_token";
const TG_CHAT_ID = "your_telegram_chat_id";
const PUSH_PLUS_TOKEN = "your_pushplus_token";  // 可选
```

### Telegram 推送
1. 与 [@BotFather](https://t.me/BotFather) 对话创建 Bot，获取 Token
2. 与你的 Bot 对话，发送任意消息
3. 访问 `https://api.telegram.org/bot你的TOKEN/getUpdates` 获取 Chat ID

### PushPlus 推送
1. 访问 [PushPlus](https://www.pushplus.plus/) 注册
2. 获取你的 Token

## 📝 多账号支持

- 使用不同微信账号打开小程序即可自动添加
- 多账号数据自动保存，使用换行符分隔
- 通过 `unique_identity` 自动识别账号，相同账号会更新而非重复添加

## ⚠️ 注意事项

1. **首次使用**必须先抓取 Cookie，否则脚本无法运行
2. Cookie 有效期有限，失效后需重新打开小程序抓取
3. 如果提示「Token失效」，请清除持久化数据后重新抓取
4. 确保 MitM 功能正常工作且已信任证书

## 🔍 故障排查

### Cookie 无法抓取
- ✅ 确认 MitM 功能已启用
- ✅ 确认已信任 CA 证书
- ✅ 检查 hostname 配置是否包含 `sxs-consumer.nfsq.com.cn`
- ✅ 尝试完全重启 App

### 脚本不执行
- ✅ 检查模块/插件是否已启用
- ✅ 查看日志中的错误信息
- ✅ 确认 Cookie 已成功抓取

### 推送不工作
- ✅ 检查 Token 和 Chat ID 是否正确
- ✅ 查看日志中的网络请求情况
- ✅ 确认推送服务可访问

## 📄 文件说明

| 文件 | 说明 |
|------|------|
| `nfsq.sgmodule` | Surge 模块配置文件 |
| `nfsq.plugin` | Loon 插件配置文件 |
| `nfsq.js` | 抽奖执行脚本 |
| `nfsq_cookie.js` | Cookie 自动抓取脚本 |
| `README.md` | 使用说明文档 |

## 📜 许可证

MIT License

## 🙏 致谢

感谢所有为此项目做出贡献的人！
