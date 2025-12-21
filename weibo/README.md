# Weibo Daily Sign

新浪微博每日签到脚本，支持 Loon 和 Surge，支持多账号。

## 功能特性

- 📝 每日自动签到
- 🍬 领取微博签到奖励
- 🔄 支持多账号
- 🔔 签到结果通知

## 📦 安装方法

### Surge

#### 模块安装 (推荐)

在 Surge 配置文件中添加模块:

```ini
[Module]
微博签到 = https://raw.githubusercontent.com/5jwoj/BeRich/main/weibo/weibo.sgmodule
```

或在 Surge iOS 中:
1. 打开 Surge
2. 配置 → 模块 → 安装新模块
3. 输入链接: `https://raw.githubusercontent.com/5jwoj/BeRich/main/weibo/weibo.sgmodule`

#### 脚本配置

如果不想使用模块，可以在配置文件中手动添加:

```ini
[Script]
Weibo Token = type=http-request,pattern=^https://api\.weibo\.cn/\d/users/show,script-path=https://raw.githubusercontent.com/5jwoj/BeRich/main/weibo/weibo_sign.js
Weibo Cookie = type=http-request,pattern=^https://api\.weibo\.cn/2/logservice/attach,script-path=https://raw.githubusercontent.com/5jwoj/BeRich/main/weibo/weibo_sign.js
Weibo Sign = type=cron,cronexp=15 8,23 * * *,timeout=60,script-path=https://raw.githubusercontent.com/5jwoj/BeRich/main/weibo/weibo_sign.js

[MITM]
hostname = %APPEND% api.weibo.cn
```

### Loon

请使用对应的 Loon 插件 (如果提供)，或参照 Surge 脚本配置进行手动配置。

## 📖 使用指南

1. **配置 MITM**: 确保 hostname 包含 `api.weibo.cn`。
2. **获取 Cookie**:
    - 打开微博 App
    - 浏览首页或点击"我"
    - Surge/Loon 弹出通知提示 "Weibo Token" 或 "Weibo Cookie" 获取成功
3. **自动签到**:
    - 脚本会在每天 8:15 和 23:15 自动运行
    - 也可以在脚本列表手动运行测试

## ⚠️ 注意事项

- Cookie 可能会失效，如果签到失败，请尝试重新打开微博 App 获取 Cookie。
- 仅供学习交流使用。
