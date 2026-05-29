# 🛴 Ninebot Helper (九号出行自动签到助手)

[![v1.2.1](https://img.shields.io/badge/version-v1.2.1-blue)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

适配青龙面板的九号出行自动签到脚本，支持多账号、自动领取任务奖励、自定义 User-Agent 等功能。

## ✨ 功能特性

- ✅ **自动签到**：每日自动完成签到任务
- ✅ **自动领取奖励**：自动领取已完成的任务奖励（支持 v3 API）
- ✅ **多账号支持**：支持配置无限个账号，并发执行
- ✅ **灵活配置**：支持多种配置格式（分隔符、JSON）
- ✅ **青龙面板集成**：完美适配青龙面板，支持消息推送
- ✅ **自定义 UA**：支持为每个账号设置独立的 User-Agent
- ✅ **失败重试**：请求失败自动重试，提高稳定性

## 🚀 快速部署

### 青龙面板

1. **安装依赖**
   - 进入青龙面板 → **依赖管理** → **NodeJs**
   - 添加依赖：`axios` 和 `moment`

2. **添加脚本**
   - 进入青龙面板 → **脚本管理**
   - 新建脚本 `ninebot_daily.js`，复制本项目中的代码并保存

3. **配置环境变量**
   - 进入青龙面板 → **环境变量**
   - 添加变量 `NINEBOT_ACCOUNTS`
   - 填入您的账号信息（见下文配置说明）
   - (可选) 添加 `ENABLE_AUTO_REWARD=true` 启用自动领取奖励

4. **添加定时任务**
   - 进入青龙面板 → **定时任务**
   - 命令：`task ninebot_daily.js`
   - 定时规则：`0 8 * * *`（建议每天早上 8 点执行）

## 📋 配置说明

### 环境变量：`NINEBOT_ACCOUNTS`

支持三种格式，推荐使用 **格式 1**。

#### 格式 1：分隔符格式（推荐 ⭐）

使用 `#` 分隔字段，使用 `&` 分隔账号。

```bash
# 格式
deviceId#Authorization#UA&deviceId2#Authorization2#UA2

# 示例
DB63B81C-04CA-4A43-95BE-B20C8C134280#eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...#Mozilla/5.0 (iPhone)&AB25DF68-72A0-4E0B-B3F5-B4FF07DDBCF9#eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 格式 2：JSON 格式

```json
[
  {
    "name": "账号1",
    "deviceId": "...",
    "authorization": "...",
    "userAgent": "..."
  }
]
```

#### 格式 3：单账号独立变量

```bash
NINEBOT_DEVICE_ID=...
NINEBOT_AUTHORIZATION=...
NINEBOT_UA=...
```

### 环境变量：`ENABLE_AUTO_REWARD`

- `true`: 启用自动领取任务奖励功能
- `false`: 关闭该功能（默认）

## 📝 如何获取账号信息

### 方法 1：使用抓包工具 (推荐)

1. 安装抓包工具（如 Stream, Charles, Fiddler, HttpCanary）
2. 打开九号出行 App
3. 进入任务中心或执行签到
4. 查找目标请求：`https://cn-cbu-gateway.ninebot.com/portal/api/task-center/task/v3/list` (或者 `sign`, `status` 等接口)
5. 从请求头中获取：
   - `deviceId`: 设备 ID
   - `Authorization`: 认证 Token (以 `eyJ` 开头)
   - `User-Agent`: (可选) 模拟真实的客户端环境

### 方法 2：浏览器开发者工具

1. 访问九号出行 H5 页面
2. 按 F12 打开开发者工具 → Network
3. 登录并签到，查找相关请求

## 🔧 常见问题

**Q: 提示"未配置任何有效的九号出行账号信息"？**
A: 请检查 `NINEBOT_ACCOUNTS` 环境变量是否正确设置，注意不要包含多余的空格或中文符号。

**Q: 签到失败，提示 Token 失效？**
A: Authorization Token 有效期有限，请重新抓包获取最新的 Token。

**Q: 自动领取奖励失败？**
A: 确保已设置 `ENABLE_AUTO_REWARD=true`。如果仍然失败，可能是接口变动，请提交 Issue 反馈。

## 📄 许可证

本项目采用 [MIT 许可证](LICENSE)。仅供学习交流使用，请勿用于商业用途。
