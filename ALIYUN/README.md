# 阿里云社区 (Aliyun)

阿里云社区自动任务脚本，支持 Surge iOS。

## ✨ 功能特点

- 📝 **每日签到**: 自动完成每日签到任务。
- 👍 **互动任务**: 自动完成点赞、收藏、分享、评论等社区任务。
- 🎁 **积分领取**: 自动领取任务奖励积分。
- 🔍 **库存查询**: 监控商品库存状态。
- 📺 **视频任务**: 自动完成视频观看任务。
- 🎭 **场景任务**: 自动完成场景体验任务。

## 📦 安装说明

### Surge iOS

#### 方式一：使用模块 (推荐)

在 Surge 的「模块」页面安装新模块：

| 类型 | 链接 |
| :--- | :--- |
| **模块地址** | `https://raw.githubusercontent.com/5jwoj/BeRich/main/ALIYUN/aliyun.sgmodule` |

或者在配置文件 `[Module]` 段落下添加：

```ini
[Module]
阿里云社区 = https://raw.githubusercontent.com/5jwoj/BeRich/main/ALIYUN/aliyun.sgmodule
```

#### 方式二：手动配置

如果不使用模块，请自行配置脚本和 MITM：

```ini
[Script]
Aliyun Cookie = type=http-request,pattern=^https:\/\/m\.aliyun\.com\/club\/activity\/sign,script-path=https://raw.githubusercontent.com/5jwoj/BeRich/main/ALIYUN/aliyun.js,requires-body=false
Aliyun Task = type=cron,cronexp=0 7,13 * * *,wake-system=1,script-path=https://raw.githubusercontent.com/5jwoj/BeRich/main/ALIYUN/aliyun.js

[MITM]
hostname = %APPEND% m.aliyun.com
```

## ⚙️ 配置说明

您可以在 Surge 的脚本编辑器中修改以下变量来定制行为：

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `aliyunWeb_time` | `12` | 任务执行时间分界点 (小时)。建议分两次运行以错开评论审核时间。 |
| `aliyunWeb_scene` | `true` | 是否开启场景体验任务。 |
| `aliyunWeb_video` | `true` | 是否开启视频观看任务。 |
| `aliyunWeb_stock` | `true` | 是否开启库存查询。 |

## 📖 使用指南

1.  **配置环境**: 确保 Surge 开启 MITM 并信任证书。
2.  **获取 Cookie**:
    -   打开「阿里云」APP。
    -   进入「我的」->「积分商城」。
    -   等待 Surge 弹出 "阿里云Web Cookie 更新成功" 通知。
3.  **自动运行**: 脚本将按照 Cron 计划（默认每天 7:00 和 13:00）自动执行。
4.  **手动运行**: 也可以在 Surge 脚本列表中手动点击运行进行测试。

## ⚠️ 注意事项

-   Cookie 有效期较长，但如果任务失败，请尝试重新获取 Cookie。
-   评论任务可能需要人工审核，建议保留默认的两次执行时间。
-   仅供学习交流，请勿用于商业用途。
