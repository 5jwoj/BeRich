# JD Cookie Sync Surge 模块

这是一个 Surge 模块,用于自动提取京东 App 或小程序中的 Cookie (`pt_key`, `pt_pin`) 并同步到青龙面板环境变量 (`JD_COOKIE`)。

## 功能特性

- **自动捕获**: 打开京东 App 或小程序时自动捕获 Cookie。
- **自动同步**: 将捕获的 Cookie 同步到配置的青龙面板。
- **自动更新**: 如果 Cookie 已存在,将更新其值;如果不存在,则自动创建。
- **状态检查**: 如果环境变量被禁用,模块会尝试启用它。

## 安装说明

### 方法一:从 URL 安装(推荐)

1. 打开 Surge App。
2. 进入 **首页** -> **模块** -> **安装新模块**。
3. 输入模块 URL:
   ```
   https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/JD_Cookie_Sync.sgmodule
   ```
4. 点击安装。

### 方法二:本地安装

1. 下载 `JD_Cookie_Sync_Local.sgmodule` 和 `jd_cookie_sync_surge.js` 文件。
2. 将文件放置到 Surge 配置目录(例如 iCloud Drive/Surge/)。
3. 在 `jd_cookie_sync_surge.js` 文件中修改 `MANUAL_CONFIG` 部分:
   ```javascript
   const MANUAL_CONFIG = {
       url: "http://192.168.1.1:5700",  // 您的青龙面板地址
       id: "your_client_id",             // 您的 Client ID
       secret: "your_client_secret"      // 您的 Client Secret
   };
   ```
4. 在 Surge App 中安装 `JD_Cookie_Sync_Local.sgmodule` 模块。

## 配置指南

### 获取 Client ID 和 Secret:

1. 登录青龙面板。
2. 进入 **系统设置** -> **应用设置**。
3. 点击 **新建应用**。
4. 权限选择 **环境变量**(或者给予所有权限)。
5. 复制生成的 Client ID 和 Client Secret。

### 配置模块参数:

如果使用方法一安装,需要编辑模块配置:

1. 在 Surge 模块列表中找到 **JD Cookie Sync**。
2. 点击编辑模块。
3. 修改 `argument` 参数中的值:
   - `ql_url`: 青龙面板的访问地址(包含端口),例如 `http://192.168.1.1:5700`
   - `ql_client_id`: 青龙面板 Open API 的 Client ID
   - `ql_client_secret`: 青龙面板 Open API 的 Client Secret

示例:
```
argument=ql_url=http://192.168.1.1:5700&ql_client_id=xYzAbCdE&ql_client_secret=123456abcdef
```

## 使用方法

1. 确保 Surge 处于开启状态,且模块已启用。
2. 确保 MITM 功能已开启并信任证书。
3. 打开 **京东 App** 或 **微信小程序 -> 京东购物**。
4. 浏览任意页面,稍微刷新一下。
5. 查看 Surge 的通知中心,如果成功,您将收到 "Cookie Updated" 或 "Cookie Created" 的通知。
6. 登录青龙面板,检查环境变量 `JD_COOKIE` 是否已更新。

## 注意事项

- **MITM 解密**: 此模块需要开启 Surge 的 MITM 功能才能拦截 HTTPS 请求。请确保已安装并信任 Surge 的 CA 证书。
- **隐私安全**: Client ID 和 Secret 包含敏感信息,请妥善保管,不要分享给他人。
- **网络访问**: 确保您的设备可以访问青龙面板的地址(同一局域网或者通过公网访问)。

## 文件说明

| 文件名 | 说明 |
| :--- | :--- |
| `JD_Cookie_Sync.sgmodule` | Surge 模块配置文件(远程脚本版本) |
| `JD_Cookie_Sync_Local.sgmodule` | Surge 模块配置文件(本地脚本版本) |
| `jd_cookie_sync_surge.js` | Surge 脚本文件 |

## 故障排除

### Cookie 没有同步

1. 检查模块是否已启用。
2. 检查 Surge 日志,查看是否有错误信息。
3. 确认青龙面板地址、Client ID 和 Secret 是否正确。
4. 确认青龙面板可以正常访问。

### 打开京东但无通知

如果您打开京东 App（或小程序）后没有收到任何通知，建议按下列步骤排查：

1. 确认 Surge 的 MITM 已启用并且已信任 Surge CA 证书。
2. 在模块设置或本地脚本中，确保已将需要的 JD 主机加入到 MITM 列表（例如 `api.m.jd.com`、`plogin.m.jd.com`、`wq.jd.com`），模块默认已包含常见域名，但某些请求可能来自其他子域。
3. 在模块中临时开启调试：
   - 在 `jd_cookie_sync_surge.js` 的 `MANUAL_CONFIG` 中将 `debug` 设置为 `true`，或在模块 `argument` 中添加 `&debug=true`。
   - 开启后，脚本在拦截到没有 Cookie 的请求时会发出一次调试通知，帮助确认脚本是否被触发。
4. 刷新或多浏览几页以触发 API 请求（有时仅打开首页并不会立即触发包含 Cookie 的接口）。
5. 查看 Surge 日志（或日志中心），检查是否有类似 `Intercepted request` 的记录。如果有记录但没有 Cookie，说明请求被拦截但该请求不携带 Cookie，需要尝试触发其他页面或登录操作。

### 收到 "配置未生效" 通知

说明模块的参数没有正确配置,请检查:
- 如果使用远程安装,确保修改了 `argument` 参数。
- 如果使用本地安装,确保修改了 `jd_cookie_sync_surge.js` 中的 `MANUAL_CONFIG`。

## 许可证

MIT License
