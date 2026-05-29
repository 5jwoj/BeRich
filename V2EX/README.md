# V2EX 每日签到助手

自动化 V2EX 每日登录奖励领取脚本，支持多账号、Telegram 消息推送。

## ✨ 功能特性

- ✅ 自动领取 V2EX 每日登录奖励
- ✅ 支持多账号批量签到
- ✅ **三层 Cookie 有效性检测机制**
- ✅ 账户余额查询（铜币、银币、金币）
- ✅ Telegram 消息推送通知
- ✅ 完善的错误处理和日志输出
- ✅ 支持青龙面板等定时任务平台

## 📋 环境要求

- Python 3.6+
- requests 库

## 🚀 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置环境变量

需要配置以下环境变量：

| 环境变量 | 说明 | 必填 |
|---------|------|------|
| `V2EX_COOKIE` | V2EX 登录 Cookie | ✅ 是 |
| `TG_BOT_TOKEN` | Telegram Bot Token | ❌ 否 |
| `TG_USER_ID` | Telegram 用户 ID | ❌ 否 |

#### 获取 V2EX Cookie

1. 登录 [V2EX](https://www.v2ex.com/)
2. 打开浏览器开发者工具（F12）
3. 切换到 Network 标签
4. 刷新页面
5. 找到任意请求，复制 Cookie 请求头的值

示例 Cookie 格式：
```
A2=your_token_here; PB3_SESSION=your_session_here; V2EX_LANG=zhcn; V2EX_TAB=your_tab_here
```

#### 获取 Telegram 推送配置（可选）

1. 在 Telegram 中搜索 `@BotFather` 创建 Bot，获取 `TG_BOT_TOKEN`
2. 在 Telegram 中搜索 `@userinfobot` 获取你的 `TG_USER_ID`

### 3. 运行脚本

#### 方式一：直接运行

```bash
# Linux/Mac
export V2EX_COOKIE="your_cookie_here"
export TG_BOT_TOKEN="your_bot_token"  # 可选
export TG_USER_ID="your_user_id"      # 可选
python3 v2ex_daily.py

# Windows
set V2EX_COOKIE=your_cookie_here
set TG_BOT_TOKEN=your_bot_token
set TG_USER_ID=your_user_id
python v2ex_daily.py
```

#### 方式二：多账号支持

多个 Cookie 用换行符分隔：

```bash
export V2EX_COOKIE="cookie1
cookie2
cookie3"
```

---

## 🐳 青龙面板部署

### 1. 添加脚本

在青龙面板中添加订阅或直接上传 `v2ex_daily.py` 文件。

**订阅地址**：
```
https://raw.githubusercontent.com/5jwoj/BeRich/main/V2EX/v2ex_daily.py
```

### 2. 配置环境变量

在青龙面板的环境变量中添加：

```
V2EX_COOKIE=your_cookie_here
TG_BOT_TOKEN=your_bot_token  # 可选
TG_USER_ID=your_user_id      # 可选
```

### 3. 添加定时任务

```
名称：V2EX 签到
命令：task v2ex_daily.py
定时：0 9 * * *
```

### 4. 运行任务

保存后即可手动运行或等待定时执行。

---

## 📊 输出示例

### 成功签到

```
--- 开始执行第 1 个 V2EX 账户签到 ---
正在检测 Cookie 有效性...
检测结果: Cookie 有效
正在尝试获取 Once Code...
成功获取到 Once Code: 12345
正在尝试领取每日登录奖励...
【V2EX 签到】✅ 恭喜！每日登录奖励领取成功。
正在查询最新账户余额...
**账户余额:** 1234 铜币、56 银币
**总额 (铜币当量):** 6834
Telegram 消息推送请求发送成功。
```

### Cookie 失效

```
正在检测 Cookie 有效性...
检测结果: Cookie 有效
正在尝试获取 Once Code...
❌ 获取 Once Code 失败：Cookie 已失效，页面跳转到登录页。请更新 Cookie。
```

---

## 🔧 故障排查

### Cookie 失效

如果提示 Cookie 失效，请：

1. 重新登录 V2EX 获取新的 Cookie
2. 更新青龙面板中的 `V2EX_COOKIE` 环境变量
3. 建议每 1-2 周主动更新一次 Cookie

### 余额查询失败

如果出现"未能通过正则匹配到账户余额信息"警告：
- 脚本会自动保存 `debug_balance_error.html` 文件
- 检查该文件内容，可能是 V2EX 页面结构发生变化
- 提交 Issue 反馈问题

### SSL 证书错误

如果遇到 SSL 证书错误：
```bash
pip install --upgrade certifi
```

---

## 🛡️ Cookie 检测机制

本脚本采用**三层防护机制**确保 Cookie 有效性：

1. **初始检测**：`check_cookie_status()` - 在签到前验证 Cookie
2. **获取阶段检测**：`_get_once_code()` - 获取 Once Code 时检查重定向
3. **领取阶段检测**：`redeem_daily_reward()` - 领取奖励时检查重定向

任何阶段检测到 Cookie 失效都会立即停止并通知用户。

---

## 📝 更新日志

### v1.2.0 (2026-01-18)
- 🐛 修复 Cookie 检测逻辑缺陷
- ✨ 新增三层 Cookie 失效检测机制
- 🔧 优化错误提示信息
- 📝 完善文档说明

### v1.1.0 (2025-12-02)
- ✨ 新增多种页面结构支持（图片/文本显示货币）
- ✨ 新增调试模式，自动保存失败页面 HTML
- 🐛 修复余额解析失败问题
- 🔧 优化正则表达式匹配逻辑

### v1.0.0
- 🎉 初始版本发布
- ✅ 基础签到功能
- ✅ Telegram 推送支持

---

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## ⚠️ 免责声明

本脚本仅供学习交流使用，请勿用于商业用途。使用本脚本所产生的一切后果由使用者自行承担。
