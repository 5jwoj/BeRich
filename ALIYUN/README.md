# 阿里云社区 Surge iOS 模块

> 阿里云社区自动签到、任务完成脚本的 Surge iOS 模块版本

## 功能特点

- ✅ 每日自动签到
- ✅ 自动完成点赞、分享、评论、收藏任务
- ✅ 场景体验任务
- ✅ 视频观看任务
- ✅ 积分自动领取
- ✅ 库存查询

## 安装方法

### 1. 安装模块

在 Surge 配置文件中添加模块:

```ini
[Module]
阿里云社区 = https://raw.githubusercontent.com/5jwoj/BeRich/main/ALIYUN/aliyun.sgmodule
```

或在 Surge iOS 中:
1. 打开 Surge
2. 配置 → 模块 → 安装新模块
3. 输入链接: `https://raw.githubusercontent.com/5jwoj/BeRich/main/ALIYUN/aliyun.sgmodule`

### 2. 配置 MITM

确保 Surge 已开启 MITM 功能并信任证书:
- 配置 → MITM → 生成新的CA证书
- 安装证书并在设置中信任

### 3. 获取 Cookie

1. 打开阿里云 APP
2. 进入 首页 → 积分商城
3. Surge 会自动捕获 Cookie
4. 提示 "阿里云Web Cookie 更新成功" 即可

## 配置说明

### 环境变量 (可选)

可以在 Surge 的脚本编辑器中配置以下变量:

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `aliyunWeb_time` | 执行时间(1-23) | 12 |
| `aliyunWeb_scene` | 场景任务开关 | true |
| `aliyunWeb_video` | 视频任务开关 | true |
| `aliyunWeb_stock` | 库存查询开关 | true |

### 执行时间说明

⚠️ **重要**: 因评论需要审核,建议分两次执行:
- **12点前**: 签到、点赞、收藏、分享、评论
- **12点后**: 积分收取、取消点赞、取消收藏

默认配置为每天 7:00 和 13:00 自动执行。

## 使用说明

1. 安装模块后,首次需要手动获取 Cookie
2. 打开阿里云 APP 并访问积分商城
3. 看到 Cookie 获取成功提示后,脚本会自动在设定时间执行
4. 可在 Surge 日志中查看执行结果

## 注意事项

1. 本脚本仅供学习研究使用
2. Cookie 有效期较长,但建议定期更新
3. 如遇到问题,请先检查 Cookie 是否有效
4. 执行失败请查看 Surge 日志排查原因

## 免责声明

1. 此脚本仅用于学习研究,不保证其合法性、准确性、有效性
2. 使用本脚本产生的任何后果由使用者自行承担
3. 请勿将此脚本用于任何商业或非法目的
4. 下载后请在24小时内删除

## 致谢

- 原作者: [@Leiyiyan](https://github.com/leiyiyan)
- Surge iOS 适配: 5jwoj

## 更新日志

### 2025-12-20
- 适配 Surge iOS 模块格式
- 优化脚本兼容性
- 更新说明文档
