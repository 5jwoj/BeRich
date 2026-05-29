# Stash 插件设计文档

## 概述

为 JDCK 项目添加 Stash 客户端插件，支持远程订阅方式配置，提供京东 Cookie 自动捕获和青龙面板同步功能。

## 目标

- 创建 Stash 兼容的插件文件 (`.stoverride`)
- 创建 Stash 专用脚本文件
- 提供完整的使用文档
- 保持与现有 Surge/Loon 版本功能一致

## 文件结构

```
JDCK/
├── JD_Cookie_Sync_Stash.stoverride  # Stash 覆盖配置文件
├── JD_Cookie_Sync_Stash.js          # Stash 专用脚本
└── README_Stash.md                   # Stash 使用说明
```

## 技术设计

### 1. JD_Cookie_Sync_Stash.stoverride

**元数据部分：**
- `#!name`: JD Cookie Sync
- `#!desc`: 自动捕获京东 Cookie 并同步到青龙面板
- `#!system`: mac(stash)
- `#!arguments`: 提供三个配置参数
  - `QL_URL`: 青龙面板地址 (默认: http://127.0.0.1:5700)
  - `QL_CLIENT_ID`: Client ID
  - `QL_CLIENT_SECRET`: Client Secret

**Script 部分：**
- 类型: `http-request`
- 匹配模式: `^https?:\/\/(api\.m|me-api|plogin\.m|wq|home\.m)\.jd\.com`
- 脚本路径: 远程URL
- 超时: 20秒

**MITM 部分：**
- `api.m.jd.com`
- `me-api.jd.com`
- `plogin.m.jd.com`
- `wq.jd.com`
- `home.m.jd.com`

### 2. JD_Cookie_Sync_Stash.js

**参数获取：**
- 支持 `#!arguments` 参数注入
- 支持手动配置 fallback (MANUAL_CONFIG)
- 自动补全 URL 前缀 (http://)

**核心功能：**

1. **Cookie 捕获**
   - 从请求头提取 Cookie
   - 解析 `pt_key` 和 `pt_pin`
   - URL 解码处理

2. **本地缓存检查**
   - 使用 `$persistentStore` 缓存已同步的 Cookie
   - 避免重复处理相同 Cookie

3. **Cookie 验证**
   - 调用京东 API 验证 Cookie 有效性
   - 无效 Cookie 才触发同步

4. **青龙同步**
   - 获取 Token
   - 查找/创建/更新环境变量
   - 自动启用被禁用的变量

5. **通知策略**
   - 首次捕获：发送通知
   - Cookie 更新：发送通知
   - 同步失败：发送通知
   - 无变化：不发送通知

**错误处理：**
- 配置缺失提示
- 网络错误处理
- API 错误处理
- 详细日志输出

### 3. README_Stash.md

**内容包括：**
- 功能特点介绍
- 安装步骤（远程订阅方式）
- 配置指南（获取 Client ID/Secret）
- 使用方法
- 故障排查
- 注意事项

## 与现有版本差异

| 特性 | Surge | Loon | Stash |
|------|-------|------|-------|
| 配置方式 | 模块参数 | 手动编辑 | `#!arguments` |
| 脚本引用 | 独立 | 独立 | 独立 |
| Cookie验证 | ✓ | ✓ | ✓ |
| 本地缓存 | ✓ | ✓ | ✓ |
| 通知策略 | 仅失败 | 完整 | 完整 |

## 兼容性

- Stash iOS 版本
- Stash macOS 版本
- 使用标准 Surge 兼容 API
- 无平台特定代码

## 测试要点

1. 参数配置是否正确读取
2. Cookie 捕获是否正常
3. 青龙同步是否成功
4. 通知是否正确发送
5. 缓存机制是否生效
6. 错误处理是否完善