# 微博签到 (Weibo Sign)

新浪微博每日自动签到脚本，支持 Loon 和 Surge，支持多账号。

## ✨ 功能特点

- 📝 **每日签到**: 自动完成微博每日签到。
- 🍬 **领取奖励**: 自动领取签到积分和红包奖励。
- 🔄 **多账号**: 支持无限添加账号，自动去重。
- 🔔 **消息通知**: 签到结果实时通知。

## 📦 安装说明

### Surge

#### 方式一：使用模块 (推荐)

| 类型 | 链接 |
| :--- | :--- |
| **模块地址** | `https://raw.githubusercontent.com/5jwoj/BeRich/main/weibo/weibo.sgmodule` |

#### 方式二：手动配置

```ini
[Script]
Weibo Token = type=http-request,pattern=^https://api\.weibo\.cn/\d/users/show,script-path=https://raw.githubusercontent.com/5jwoj/BeRich/main/weibo/weibo_sign.js
Weibo Cookie = type=http-request,pattern=^https://api\.weibo\.cn/2/logservice/attach,script-path=https://raw.githubusercontent.com/5jwoj/BeRich/main/weibo/weibo_sign.js
Weibo Sign = type=cron,cronexp=15 8,23 * * *,timeout=60,script-path=https://raw.githubusercontent.com/5jwoj/BeRich/main/weibo/weibo_sign.js

[MITM]
hostname = %APPEND% api.weibo.cn
```


### Loon

请使用对应的 Loon 插件（如有），或参考 Loom 的脚本配置格式添加上述脚本路径。

### Quantumult X

#### 方式一：配置文件导入 (推荐)

在配置文件的 `[rewrite_local]` 和 `[task_local]` 区域添加如下内容：

```ini
[rewrite_local]
# Token 和 Cookie 获取
^https?:\/\/api\.weibo\.cn\/\d+\/users\/show url script-request-header https://raw.githubusercontent.com/5jwoj/BeRich/main/weibo/weibo_qx.js
^https?:\/\/(m\.weibo\.cn|pay\.sc\.weibo\.com)\/ url script-request-header https://raw.githubusercontent.com/5jwoj/BeRich/main/weibo/weibo_qx.js

[task_local]
# 定时签到: 每天 8:15 / 23:15
15 8,23 * * * https://raw.githubusercontent.com/5jwoj/BeRich/main/weibo/weibo_qx.js, tag=微博签到, img-url=https://raw.githubusercontent.com/Orz-3/mini/master/Color/weibo.png, enabled=true
```

#### 方式二：BoxJS 订阅

BoxJS 订阅链接：`https://raw.githubusercontent.com/5jwoj/BeRich/main/weibo/weibo.boxjs.json`


## 📖 使用指南

1.  **配置环境**: 开启 MITM 并信任证书。
2.  **获取 Cookie**:
    -   打开「微博」APP。
    -   浏览首页或点击「我」的页面。
    -   等待通知提示 "Weibo Token 获取成功" 或 "Weibo Cookie 获取成功"。
3.  **多账号获取**: 切换微博账号，重复步骤 2 即可添加新账号。
4.  **自动运行**: 脚本默认在每天 8:15 和 23:15 执行。

## ⚠️ 注意事项

-   Cookie 有效期取决于 APP 登录状态，若签到失败请重新获取。
-   仅供学习交流使用。
