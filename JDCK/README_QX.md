# 京东 Cookie 同步 - Quantumult X 版本

> **作者**: z.W.

自动捕获京东 App 或小程序中的 Cookie (`pt_key`, `pt_pin`) 并同步到青龙面板环境变量 (`JD_COOKIE`)。

## ✨ 功能特点

- 🎣 **自动捕获**: 打开京东 App 或小程序时自动捕获 Cookie
- ✅ **智能验证**: 自动验证 Cookie 有效性，避免无效同步
- 🔄 **自动同步**: Cookie 变化或失效时自动同步到青龙面板
- 🛠️ **自动更新**: 自动识别并更新已有环境变量的值
- ⚡ **状态检查**: 自动确保环境变量处于启用状态
- 💾 **本地缓存**: 避免重复同步相同的 Cookie

## 📦 安装说明

### 方法一：使用配置片段（推荐）

1. 在 Quantumult X 中，点击右下角图标进入配置页面
2. 找到 `[rewrite_local]` 部分，添加以下内容：

```
^https?://api\.m\.jd\.com/ url script-request-header https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/JD_Cookie_Sync_QX.js
```

3. 找到 `[mitm]` 部分，在 `hostname` 中添加：

```
hostname = api.m.jd.com
```

### 方法二：手动添加

1. 下载脚本文件 `JD_Cookie_Sync_QX.js` 到本地
2. 在 Quantumult X 配置中添加本地脚本引用
3. 配置 MITM hostname

## ⚙️ 配置指南

### 配置方式一：直接修改脚本（推荐）

编辑 `JD_Cookie_Sync_QX.js` 文件，找到以下部分并填入您的信息：

```javascript
const MANUAL_CONFIG = {
    url: "http://192.168.1.1:5700",        // 青龙面板地址
    id: "your_client_id",                   // Client ID
    secret: "your_client_secret"            // Client Secret
};
```

### 配置方式二：使用 BoxJS（推荐）

#### 1. 订阅 BoxJS 配置

在 BoxJS 中添加订阅：

**订阅链接**：
```
https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/JD_Cookie_Sync_QX.boxjs.json
```

**操作步骤**：
1. 打开 BoxJS（在浏览器中访问 `http://boxjs.com`）
2. 点击底部「订阅」按钮
3. 点击右上角「➕」添加订阅
4. 粘贴上面的订阅链接
5. 点击「保存」

#### 2. 配置参数

订阅成功后：
1. 在 BoxJS 首页找到「京东Cookie同步 (Quantumult X)」
2. 点击进入配置页面
3. 填写以下参数：

| 参数名 | 说明 | 示例 |
| :--- | :--- | :--- |
| **青龙面板地址** | 青龙面板的完整地址（带端口） | `http://192.168.1.1:5700` |
| **Client ID** | 青龙面板 API Client ID | `xYzAbCdE...` |
| **Client Secret** | 青龙面板 API Client Secret | `123456...` |

4. 填写完成后点击「保存」

> [!NOTE]
> 使用 BoxJS 配置后，脚本会自动读取这些参数，无需修改脚本文件

> [!TIP]
> **获取 Client ID 和 Secret**: 登录青龙面板 -> 系统设置 -> 应用设置 -> 新建应用 (权限勾选 "环境变量")

## 🔐 MITM 证书配置

1. 在 Quantumult X 中，进入 `设置` -> `MitM`
2. 点击 `生成证书`
3. 点击 `配置证书`，按照提示安装证书
4. 前往 `设置` -> `通用` -> `关于本机` -> `证书信任设置`
5. 启用刚才安装的 Quantumult X 证书

## 📖 使用指南

1. **启动脚本**: 确保 Quantumult X 处于开启状态，且已启用 Rewrite 和 MitM 功能
2. **触发捕获**: 打开「京东」App 或微信「京东购物」小程序
3. **刷新页面**: 随便浏览商品，直到收到通知（首次使用或 Cookie 变化时）
4. **核对结果**: 登录青龙面板，确认 `JD_COOKIE` 已成功创建或更新

## 📱 通知说明

脚本会在以下情况发送通知：

- ✅ **Cookie已创建**: 首次捕获到新账号的 Cookie
- 🔄 **Cookie已更新**: Cookie 值发生变化并已更新
- ⚡ **Cookie已启用**: Cookie 值未变但从禁用状态恢复
- ❌ **同步失败**: 配置错误或网络问题导致同步失败

> [!NOTE]
> 如果 Cookie 有效且未变化，脚本会静默跳过，不会发送通知，避免频繁打扰。

## ⚠️ 注意事项

- 请确保青龙面板的外网访问权限或在同一内网环境
- 本脚本需要 MITM 功能支持，请确保已正确配置证书
- 首次使用建议在 Quantumult X 日志中查看运行情况
- 如遇问题，请检查配置信息是否正确填写

## 🔍 故障排查

### 没有收到通知

1. 检查 Quantumult X 的 Rewrite 和 MitM 是否已启用
2. 查看 QX 日志，搜索 `[JD Cookie Sync]` 关键词
3. 确认是否访问了 `api.m.jd.com` 域名

### 提示"配置未生效"

1. 检查脚本中的 `MANUAL_CONFIG` 是否已正确填写
2. 或检查 BoxJS 中的配置是否已保存

### 提示"获取青龙Token失败"

1. 检查青龙面板地址是否正确（包括端口号）
2. 检查 Client ID 和 Secret 是否正确
3. 确认青龙面板网络可访问

### Cookie 同步失败

1. 检查青龙面板应用权限是否包含"环境变量"
2. 查看青龙面板日志是否有异常
3. 尝试手动在青龙面板创建 `JD_COOKIE` 变量测试

## 📝 版本历史

### v1.0.0 (2026-01-16)
- 🎉 初始版本发布
- ✅ 支持自动捕获和同步京东 Cookie
- ✅ 支持 Cookie 有效性验证
- ✅ 支持本地缓存去重
- ✅ 支持青龙面板 API 交互

## 📄 许可证

本项目遵循原项目许可证
