# 农夫山泉 Surge 模块

自动抓取 Cookie 并执行农夫山泉小程序抽奖的 Surge 模块。

## 📁 文件说明

| 文件 | 说明 |
|------|------|
| `nfsq.sgmodule` | Surge 模块主配置文件 |
| `nfsq_cookie.js` | Cookie 自动抓取脚本 |
| `nfsq.js` | 抽奖执行脚本 |

## 🚀 使用方法

### 1. 安装模块

**方式一：本地安装**
1. 将三个文件（`nfsq.sgmodule`、`nfsq_cookie.js`、`nfsq.js`）保存到本地
2. 打开 Surge → 模块 → 安装新模块 → 从文件安装
3. 选择 `nfsq.sgmodule` 文件

**方式二：远程安装（推荐）**
1. 将文件上传到 GitHub 或其他可访问的地址
2. 修改 `nfsq.sgmodule` 中的 `script-path` 为实际的远程地址，例如：
   ```
   script-path=https://raw.githubusercontent.com/your-username/your-repo/main/nfsq.js
   ```
3. 在 Surge 中通过 URL 安装模块

### 2. 抓取 Cookie

1. **开启 MitM**：
   - 打开 Surge → 更多设置 → MitM
   - 确保「启用 MitM」已开启
   - 确保已配置并信任 CA 证书

2. **启用模块**：确保模块处于启用状态

3. **打开小程序**：在微信中打开「农夫山泉」小程序

4. **触发请求**：随便点击页面，触发任意 API 请求

5. **查看通知**：看到 「Cookie获取成功」的通知即表示抓取成功

### 3. 定时执行

- 模块默认每天 **早上 8:15** 自动执行抽奖
- 如需修改时间，编辑 `nfsq.sgmodule` 中的 cron 表达式：
  ```
  cronexp=15 8 * * *   // 每天 8:15
  cronexp=0 7,12 * * *  // 每天 7:00 和 12:00
  ```

### 4. 手动执行

在 Surge 中：首页 → 脚本 → 找到「农夫山泉抽奖」→ 运行

## 🔔 推送通知（可选）

### Telegram 推送

如果需要在中一等奖时收到 Telegram 推送：

1. 创建 Telegram Bot 并获取 Bot Token
2. 获取你的 Chat ID
3. 在 `nfsq.js` 脚本中配置（可选方式）：
   - 直接在脚本中设置全局变量
   - 或通过 Surge 的脚本参数传递

### PushPlus 推送

1. 注册 [PushPlus](https://www.pushplus.plus/)
2. 获取你的 Token
3. 在脚本中配置 `PUSH_PLUS_TOKEN`

> **注意**：Surge 模块暂不支持通过模块配置文件传递参数。如需配置推送，请直接修改 `nfsq.js` 脚本文件，在脚本顶部添加：
> ```javascript
> const TG_BOT_TOKEN = "your_bot_token";
> const TG_CHAT_ID = "your_chat_id";
> const PUSH_PLUS_TOKEN = "your_pushplus_token";
> ```

## 📝 多账号支持

- 使用不同微信账号打开小程序即可自动添加账号
- 多账号数据自动保存，使用换行符分隔
- 通过 `unique_identity` 自动识别账号，相同账号会更新而非重复添加

## ⚠️ 注意事项

1. **首次使用**必须先抓取 Cookie，否则脚本运行会失败
2. Cookie 有一定有效期，失效后需重新打开小程序抓取
3. 如果一直提示「Token失效」，请清除 Surge 中的持久化数据后重新抓取
4. 确保 `sxs-consumer.nfsq.com.cn` 在 MitM 的 hostname 列表中
5. Surge 的 MitM 功能需要在**系统设置**中信任证书才能正常工作

## 🔧 兼容性

此脚本同时兼容：
- ✅ Surge (iOS/Mac)
- ✅ Loon
- ✅ Quantumult X

其他软件使用时需要根据对应格式调整插件配置文件。

## 📊 功能说明

1. **登录验证**：每次运行前检查 Token 是否有效
2. **任务系统**：自动完成可用的日常任务
3. **双通道抽奖**：使用两个场景代码轮询抽奖
4. **自动领奖**：中奖后自动核销奖品
5. **智能停止**：达到每日上限或资格不足时自动停止
6. **大奖通知**：中一等奖时发送推送通知

## 🔍 故障排查

### Cookie 无法抓取
- 确认 MitM 功能已启用
- 确认已信任 CA 证书
- 检查 hostname 配置是否正确
- 尝试完全重启 Surge

### 脚本不执行
- 检查模块是否已启用
- 查看 Surge 日志中的错误信息
- 确认 Cookie 已成功抓取

### 推送不工作
- 检查 Token 和 Chat ID 是否正确配置
- 查看 Surge 日志中的网络请求情况
- 确认推送服务可访问

## 📄 许可证

MIT License
