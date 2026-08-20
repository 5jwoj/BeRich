# JD Cookie Sync - Loon 使用指南

> **作者**: z.W.  
> **版本**: v1.0.0

自动捕获京东 App 中的 Cookie (`pt_key`, `pt_pin`) 并同步到青龙面板环境变量 (`JD_COOKIE`)。  
本插件遵循 **Quantumult X** 相同的高效规则：**已存在且一致时静默同步，无变动不打扰；状态变更、新建或重新启用时发送通知**。

---

## 🚀 安装步骤

### 步骤 1：在 Loon 中添加插件

1. 打开 **Loon App**
2. 进入 **配置** → **插件**
3. 点击右上角 **➕**
4. 填入插件链接：
   ```
   https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/JD_Cookie_Sync_Loon.plugin
   ```
5. 点击 **确定** 并保存启用插件

---

## ⚙️ 参数配置（推荐使用 BoxJS）

### 方法一：通过 BoxJS 配置（推荐 ✅）

1. 在 **BoxJS** 中添加 Loon 专用订阅：
   ```
   https://raw.githubusercontent.com/5jwoj/BeRich/main/boxjs/BeRich_Loon.boxjs.json
   ```
2. 进入「**BeRich Loon 合集**」→「**京东Cookie同步 (Loon)**」应用
3. 填写以下青龙面板参数：
   - **青龙面板地址**：如 `http://192.168.1.1:5700`
   - **Client ID**：在青龙面板「系统设置 → 应用设置」中创建应用获取
   - **Client Secret**：在青龙面板「系统设置 → 应用设置」中创建应用获取（权限需勾选环境变量）
4. 点击保存配置。

### 方法二：脚本内手动配置（MANUAL_CONFIG）

如果未安装 BoxJS，可直接在本地脚本 `JD_Cookie_Sync_Loon.js` 的 `MANUAL_CONFIG` 中填写参数：

```javascript
const MANUAL_CONFIG = {
    url: "http://192.168.1.1:5700",  // 青龙面板地址
    id: "your_client_id",             // Client ID
    secret: "your_client_secret"      // Client Secret
};
```

---

## 📖 使用方法

1. 确保 Loon 处于开启状态，且已开启 **MitM** 并已信任证书。
2. 打开「京东」App 浏览任意商品或进入个人中心。
3. 脚本拦截到 Cookie 后将自动同步至青龙：
   - 若首次添加或 Cookie 发生变化/被启用，Loon 将弹出系统通知提示。
   - 若 Cookie 未发生变化，则在后台静默同步，不弹出任何打扰通知。
4. 登录青龙面板，确认环境变量 `JD_COOKIE` 已成功创建或更新。

---

## ❓ 常见问题排查

- **提示“配置未生效”**：请检查 BoxJS 或脚本 MANUAL_CONFIG 中的青龙地址、Client ID 与 Secret 是否填写完整。
- **提示“获取青龙Token失败”**：请确认青龙面板地址可访问（包含端口），Client ID 与 Secret 匹配且拥有环境变量权限。
- **无法捕获 Cookie**：请检查 Loon 的 MitM 主机名列表中是否包含 `api.m.jd.com`，并确认证书处于信任状态。
