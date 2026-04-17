# 京东 Cookie 同步 - Stash 版

> **作者**: z.W.

自动捕获京东 App 或小程序中的 Cookie (`pt_key`, `pt_pin`) 并同步到青龙面板环境变量 (`JD_COOKIE`)。

## ✨ 功能特点

- 🎣 **自动捕获**: 打开京东 App 或小程序时自动捕获 Cookie
- 🔄 **自动同步**: 捕获后立即同步到配置的青龙面板
- 🛠️ **自动更新**: 自动识别并更新已有环境变量的值
- ⚡ **状态检查**: 自动确保环境变量处于启用状态
- 🔔 **智能通知**: 首次捕获、更新和失败时发送通知
- ✅ **有效性验证**: 自动验证 Cookie 有效性，避免无效同步
- 📝 **详细日志**: 在 Stash 日志中可查看详细运行信息

## 📦 安装说明

### 方法一：覆写订阅（推荐）

1. 打开 Stash App
2. 进入「配置」→「覆写」
3. 点击右上角「+」→「从 URL 添加覆写」
4. 粘贴以下地址：
   ```
   https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/JD_Cookie_Sync_Stash.stoverride
   ```
5. 点击「下载」并启用覆写

### 方法二：手动安装

1. 下载以下文件：
   - `JD_Cookie_Sync_Stash.stoverride`
   - `JD_Cookie_Sync_Stash.js`
2. 将文件放到 Stash 的配置目录
3. 在 Stash 中手动添加覆写配置

## ⚙️ 配置指南

### 步骤一：获取 Client ID 和 Secret

1. 登录青龙面板
2. 进入 **系统设置** → **应用设置**
3. 点击 **新建应用**
4. 权限选择 **环境变量**（或所有权限）
5. 复制生成的 Client ID 和 Client Secret

### 步骤二：配置覆写参数

1. 在 Stash 中进入「配置」→「覆写」
2. 找到「JD Cookie Sync」覆写
3. 点击进入编辑页面
4. 在「Arguments」区域填写参数：

| 参数 | 说明 | 示例 |
|------|------|------|
| **QL_URL** | 青龙面板地址 (带端口) | `http://192.168.1.1:5700` |
| **QL_CLIENT_ID** | 青龙面板 API Client ID | `xYzAbCdE...` |
| **QL_CLIENT_SECRET** | 青龙面板 API Client Secret | `123456...` |

5. 保存并启用覆写

### 步骤三：配置 MITM

1. 确保 Stash 的 MITM 功能已开启
2. 安装并信任 Stash 的 CA 证书
3. 确保 MITM 主机列表包含以下域名：
   - `api.m.jd.com`
   - `me-api.jd.com`
   - `plogin.m.jd.com`
   - `wq.jd.com`
   - `home.m.jd.com`

> 覆写配置会自动添加这些域名，无需手动配置。

## 📖 使用指南

1. **启动 Stash**: 确保 Stash 处于开启状态
2. **触发捕获**: 打开「京东」App 或微信「京东购物」小程序
3. **浏览页面**: 随便浏览商品或个人中心
4. **查看通知**: 首次捕获或 Cookie 更新时会收到通知
5. **核对结果**: 登录青龙面板，确认 `JD_COOKIE` 已成功创建或更新

## 🔍 故障排查

### 没有收到通知

1. **检查 MITM**: 确保 Stash 的 MITM 功能已开启并信任证书
2. **查看日志**: 在 Stash 中查看日志，搜索 `[jd_cookie_sync]`
3. **检查域名**: 确认访问的是京东相关域名

### 提示"配置未生效"

1. 检查覆写配置中的 Arguments 参数是否正确填写
2. 确认三个参数（QL_URL, QL_CLIENT_ID, QL_CLIENT_SECRET）都不为空
3. URL 格式正确，包含 `http://` 或 `https://`

### 提示"无法获取青龙 Token"

1. 检查青龙面板地址是否正确（包括端口号）
2. 检查 Client ID 和 Secret 是否正确
3. 确认青龙面板网络可访问（可在浏览器中测试）
4. 检查青龙面板应用权限是否包含"环境变量"

### Cookie 同步失败

1. 查看 Stash 日志中的详细错误信息
2. 确认青龙面板应用权限正确
3. 尝试在青龙面板手动创建 `JD_COOKIE` 变量测试

### 手动配置方式

如果覆写配置界面无法输入参数，可以直接编辑脚本文件：

1. 下载 `JD_Cookie_Sync_Stash.js` 到本地
2. 编辑文件开头的 `MANUAL_CONFIG` 部分：
   ```javascript
   const MANUAL_CONFIG = {
     url: "http://192.168.1.1:5700",  // 改成您的青龙地址
     id: "your_client_id",             // 改成您的 Client ID
     secret: "your_client_secret"      // 改成您的 Client Secret
   };
   ```
3. 在覆写配置中将 `script-path` 指向本地文件

## ⚠️ 注意事项

- 请确保青龙面板的外网访问权限或在同一内网环境
- 本插件需要 MITM 功能支持，请确保已正确配置证书
- 配置信息包含敏感数据，请妥善保管，不要分享给他人
- 如遇问题，可查看 Stash 日志获取详细信息

## 📝 更新日志

### v1.0.0 (2026-04-17)

- ✅ 初始版本发布
- ✅ 支持 Stash 覆写配置
- ✅ 支持参数配置界面
- ✅ 完整通知策略（首次捕获、更新、失败）
- ✅ Cookie 有效性验证
- ✅ 本地缓存避免重复同步