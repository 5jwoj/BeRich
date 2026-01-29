# 京东 Cookie 同步 (JDCK)

> **作者**: z.W.

自动捕获京东 App 或小程序中的 Cookie (`pt_key`, `pt_pin`) 并同步到青龙面板环境变量 (`JD_COOKIE`)。

## ✨ 功能特点

- 🎣 **自动捕获**: 打开京东 App 或小程序时自动捕获 Cookie
- 🔄 **自动同步**: 捕获后立即同步到配置的青龙面板
- 🛠️ **自动更新**: 自动识别并更新已有环境变量的值
- ⚡ **状态检查**: 自动确保环境变量处于启用状态
- 🔔 **智能通知**: 首次捕获或同步成功时发送通知
- 📝 **详细日志**: 在 Loon 日志中可查看详细运行信息

## 📦 安装说明

### Loon (本地版)

**推荐使用本地版本，配置更简单，运行更稳定**

1. 下载以下两个文件到本地：
   - `JD_Cookie_Sync_Loon.js`
   - `JD_Cookie_Sync_Loon_Local.plugin`

2. 编辑 `JD_Cookie_Sync_Loon.js` 文件，找到 `MANUAL_CONFIG` 部分：
   ```javascript
   const MANUAL_CONFIG = {
       url: "http://192.168.1.1:5700",  // 改成您的青龙地址
       id: "your_client_id",             // 改成您的 Client ID
       secret: "your_client_secret",     // 改成您的 Client Secret
       debug: false                      // 调试模式，遇到问题可设为 true
   };
   ```

3. 将两个文件放到 Loon 的插件目录（通常是 iCloud Drive/Loon/Plugin/）

4. 在 Loon 中安装插件：
   - 打开 Loon App
   - 进入「配置」→「插件」
   - 点击右上角「+」
   - 选择「从本地安装」
   - 找到并选择 `JD_Cookie_Sync_Loon_Local.plugin`

### Surge

在 Surge 的「模块」或「脚本」中添加：

| 类型 | 链接 |
| :--- | :--- |
| **模块地址** | `https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/JD_Cookie_Sync_Surge.sgmodule` |

### Quantumult X

在 Quantumult X 的配置文件中添加以下内容：

**方法一：使用远程脚本（推荐）**

在 `[rewrite_local]` 部分添加：
```
^https?://api\.m\.jd\.com/ url script-request-header https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/JD_Cookie_Sync_QX.js
```

在 `[mitm]` 部分的 `hostname` 中添加：
```
hostname = api.m.jd.com
```

**方法二：查看详细说明**

详细的安装和配置说明请查看：[README_QX.md](README_QX.md)

## ⚙️ 配置指南

### 获取 Client ID 和 Secret

1. 登录青龙面板
2. 进入 **系统设置** → **应用设置**
3. 点击 **新建应用**
4. 权限选择 **环境变量**（或所有权限）
5. 复制生成的 Client ID 和 Client Secret

### Loon 配置方法

编辑 `JD_Cookie_Sync_Loon.js` 文件中的 `MANUAL_CONFIG`：

| 参数 | 说明 | 示例 |
| :--- | :--- | :--- |
| **url** | 青龙面板地址 (带端口) | `http://192.168.1.1:5700` |
| **id** | 青龙面板 API Client ID | `xYzAbCdE...` |
| **secret** | 青龙面板 API Client Secret | `123456...` |
| **debug** | 调试模式（可选） | `false` 或 `true` |

## 📖 使用指南

1. **启动插件**: 确保 Loon/Surge 处于开启状态
2. **触发捕获**: 打开「京东」App 或微信「京东购物」小程序
3. **浏览页面**: 随便浏览商品或个人中心
4. **查看通知**: 首次捕获或 Cookie 更新时会收到通知
5. **核对结果**: 登录青龙面板，确认 `JD_COOKIE` 已成功创建或更新

## 🔍 故障排查

### 没有收到通知

1. **检查 MITM**: 确保 Loon 的 MITM 功能已开启并信任证书
2. **查看日志**: 在 Loon 中查看日志，搜索 `[jd_cookie_sync]`
3. **启用调试**: 在脚本中设置 `debug: true`，查看详细日志
4. **检查域名**: 确认访问的是京东相关域名

### 提示"配置未生效"

1. 检查 `MANUAL_CONFIG` 是否正确填写
2. 确认三个参数（url, id, secret）都不为空
3. URL 格式正确，包含 `http://` 或 `https://`

### 提示"无法获取青龙 Token"

1. 检查青龙面板地址是否正确（包括端口号）
2. 检查 Client ID 和 Secret 是否正确
3. 确认青龙面板网络可访问（可在浏览器中测试）
4. 检查青龙面板应用权限是否包含"环境变量"

### Cookie 同步失败

1. 查看 Loon 日志中的详细错误信息
2. 确认青龙面板应用权限正确
3. 尝试在青龙面板手动创建 `JD_COOKIE` 变量测试

## ⚠️ 注意事项

- 请确保青龙面板的外网访问权限或在同一内网环境
- 本插件需要 MITM 功能支持，请确保已正确配置证书
- 配置信息包含敏感数据，请妥善保管，不要分享给他人
- 如遇问题，可开启调试模式查看详细日志

## 📝 更新日志

### v2.1.0 (2026-01-29)
- ✅ 优化通知逻辑，首次捕获和同步成功时发送通知
- ✅ 扩展域名匹配，支持更多京东域名
- ✅ 添加调试模式，方便排查问题
- ✅ 改进日志输出，更详细的运行信息
- ✅ 简化配置方式，统一使用 MANUAL_CONFIG
