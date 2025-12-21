# JD Cookie Sync Loon Plugin

这是一个 Loon 插件，用于自动提取京东 App 或小程序中的 Cookie (`pt_key`, `pt_pin`) 并同步到青龙面板环境变量 (`JD_COOKIE`)。

## 功能特性

- **自动捕获**: 打开京东 App 或小程序时自动捕获 Cookie。
- **自动同步**: 将捕获的 Cookie 同步到配置的青龙面板。
- **自动更新**: 如果 Cookie 已存在，将更新其值；如果不存在，则自动创建。
- **状态检查**: 如果环境变量被禁用，插件会尝试启用它。

## 安装说明

1. 打开 Loon App。
2. 进入 **配置** -> **插件** -> **添加**。
3. 选择 **本地安装** 或 **从 URL 安装** (如果您已将此仓库发布)。
4. 导入 `JD_Cookie_Sync.plugin` 文件。

## 配置指南

在插件安装或配置界面，您需要填写以下信息：

| 参数 | 说明 | 示例 |
| :--- | :--- | :--- |
| **Qinglong URL** | 青龙面板的访问地址 (包含端口) | `http://192.168.1.1:5700` |
| **Client ID** | 青龙面板 Open API 的 Client ID | `xYzAbCdE` |
| **Client Secret** | 青龙面板 Open API 的 Client Secret | `123456abcdef` |

###获取 Client ID 和 Secret:
1. 登录青龙面板。
2. 进入 **系统设置** -> **应用设置**。
3. 点击 **新建应用**。
4. 权限选择 **环境变量** (或者给予所有权限)。
5. 复制生成的 Client ID 和 Client Secret。

## 使用方法

1. 确保 Loon 处于开启状态，且插件已启用。
2. 打开 **京东 App** 或 **微信小程序 -> 京东购物**。
3. 浏览任意页面，稍微刷新一下。
4. 查看 Loon 的通知中心，如果成功，您将收到 "Capture Cookie Success" 或 "Cookie Updated" 的通知。
5. 登录青龙面板，检查环境变量 `JD_COOKIE` 是否已更新。
