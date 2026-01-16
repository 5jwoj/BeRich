# 京东 Cookie 同步 (JDCK)

自动捕获京东 App 或小程序中的 Cookie (`pt_key`, `pt_pin`) 并同步到青龙面板环境变量 (`JD_COOKIE`)。

## ✨ 功能特点

- 🎣 **自动捕获**: 打开京东 App 或小程序时自动捕获 Cookie。
- 🔄 **自动同步**: 捕获后立即同步到配置的青龙面板。
- 🛠️ **自动更新**: 自动识别并更新已有环境变量的值。
- ⚡ **状态检查**: 自动确保环境变量处于启用状态。

## 📦 安装说明

### Loon (推荐)

在 Loon 的「配置」->「插件」中安装：

| 类型 | 链接 |
| :--- | :--- |
| **插件地址** | `https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/JD_Cookie_Sync_Loon.plugin` |

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

安装后需在插件或模块设置中配置以下变量：

| 参数 | 说明 | 示例 |
| :--- | :--- | :--- |
| **Qinglong URL** | 青龙面板地址 (带端口) | `http://192.168.1.1:5700` |
| **Client ID** | 青龙面板 API Client ID | `xYzAbCdE...` |
| **Client Secret** | 青龙面板 API Client Secret | `123456...` |

> [!TIP]
> **获取 Client ID 和 Secret**: 登录青龙面板 -> 系统设置 -> 应用设置 -> 新建应用 (权限勾选 "环境变量")。

## 📖 使用指南

1.  **启动插件**: 确保 Loon/Surge 处于开启状态。
2.  **触发捕获**: 打开「京东」App 或微信「京东购物」小程序。
3.  **刷新页面**: 随便逛逛，直到收到 "Capture Cookie Success" 或 "Cookie Updated" 通知。
4.  **核对结果**: 登录青龙面板，确认 `JD_COOKIE` 已成功创建 or 更新。

## ⚠️ 注意事项

-   请确保青龙面板的外网访问权限或在同一内网环境。
-   本插件需要 MITM 功能支持，请确保已正确配置证书。
