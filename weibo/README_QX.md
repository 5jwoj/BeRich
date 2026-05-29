# 微博签到 (Quantumult X 版本)

新浪微博每日自动签到脚本，专为 Quantumult X 适配。

## ✨ 功能特点

- 📝 **每日签到**: 自动完成微博每日签到。
- 🍬 **领取奖励**: 自动领取签到积分和红包奖励。
- 🔄 **多账号**: 支持无限添加账号，自动去重。
- 🔔 **消息通知**: 签到结果实时通知。
- 🧹 **自动清理**: 自动检测并移除失效的账号 Token。
- 📦 **BoxJS 支持**: 支持 BoxJS 管理数据。

## 📦 安装说明

### 方式一：配置文件导入 (推荐)

在配置文件的 `[rewrite_local]` 和 `[task_local]` 区域添加如下内容：

```ini
[rewrite_local]
# 1) 抓 Token
^https?:\/\/api\.weibo\.cn\/\d+\/users\/show url script-request-header https://raw.githubusercontent.com/5jwoj/BeRich/main/weibo/weibo_qx.js

# 2) 抓 Cookie
^https?:\/\/(m\.weibo\.cn|pay\.sc\.weibo\.com)\/ url script-request-header https://raw.githubusercontent.com/5jwoj/BeRich/main/weibo/weibo_qx.js

[task_local]
# 3) 定时签到: 每天 8:15 / 23:15
15 8,23 * * * https://raw.githubusercontent.com/5jwoj/BeRich/main/weibo/weibo_qx.js, tag=微博签到, img-url=https://raw.githubusercontent.com/Orz-3/mini/master/Color/weibo.png, enabled=true
```

同时确保已配置 MITM：

```ini
[mitm]
hostname = api.weibo.cn, pay.sc.weibo.com, m.weibo.cn
```

### 方式二：BoxJS 订阅

BoxJS 订阅链接：`https://raw.githubusercontent.com/5jwoj/BeRich/main/weibo/weibo.boxjs.json`

## 📖 使用指南

1.  **配置环境**: 确保 Quantumult X 的 MitM 功能已开启，并且证书已安装并信任。
2.  **获取 Token**:
    -   打开「微博」APP。
    -   浏览首页或点击「我」的页面。
    -   等待通知提示 "微博 Token ✅ 已更新"。
3.  **获取 Cookie (钱包签到)**:
    -   如果需要钱包签到积分，请确保浏览了微博钱包相关页面或移动端页面。
    -   等待通知提示 "微博 Cookie ✅ 已更新"。
4.  **多账号**: 切换微博账号，重复上述步骤即可添加新账号。
5.  **自动运行**: 脚本默认在每天 8:15 和 23:15 执行。

## ⚠️ 注意事项

-   Cookie 有效期取决于 APP 登录状态，若签到失败请重新获取。
-   仅供学习交流使用。
