# 极核 ZEEHO CK 同步 - Loon 版

自动拦截极核 ZEEHO App 签到请求，提取登录态并同步至青龙面板，彻底告别手动抓包。

## 功能特性

- 📱 打开极核 App 即自动抓取，Loon 后台常驻拦截
- 🔄 自动判断创建/更新环境变量，支持重新启用被禁用的变量
- 🔕 值无变化时静默同步，仅在实际变更时发出通知
- ⚡ 5 秒内防抖，避免同一账号并发重复同步
- 🔁 青龙 Token 失败时自动重试 1 次

## 写入青龙的环境变量

| 变量名 | 说明 |
|---|---|
| `ZEEHO_AUTHORIZATION` | 登录令牌（含 `Bearer ` 前缀） |
| `ZEEHO_COOKIE` | 会话 Cookie |
| `ZEEHO_USER_ID` | 用户 ID |
| `ZEEHO_USER_AGENT` | 设备 UA（可选）|

## 安装步骤

### 第一步：青龙开放 API

1. 登录青龙面板 → **系统设置 → 开放API**
2. 创建应用，勾选**环境变量**读写权限
3. 记录 **ClientID** 和 **ClientSecret**

### 第二步：BoxJS 配置

1. 在 BoxJS 中订阅 BeRich Loon 合集：
   ```
   https://raw.githubusercontent.com/5jwoj/BeRich/main/boxjs/BeRich_Loon.boxjs.json
   ```
2. 找到「极核ZEEHO CK同步」→ 填写：
   - 青龙面板地址（如 `https://ql.example.com`）
   - Client ID
   - Client Secret

### 第三步：安装 Loon 插件

在 Loon 中导入以下插件地址：

```
https://raw.githubusercontent.com/5jwoj/BeRich/main/zeeho/zeeho_ck_sync_loon.plugin
```

确保 Loon **已开启 MitM** 并已信任证书。

### 第四步：触发抓包

打开**极核 App** → 进入签到页 → 点击「签到」

Loon 收到通知 `✅ 极核 CK 已同步` 即成功。

---

## 签到脚本部署（青龙面板）

搭配 [jixiaotong1999/zeeho-signin](https://github.com/jixiaotong1999/zeeho-signin) 签到脚本使用：

1. 将 `zeeho_signin.py` 和 `zeeho_data.json`（仅填 `app_secret`）上传至青龙 `scripts/zeeho/` 目录
2. 新建定时任务：`task zeeho/zeeho_signin.py`，定时规则 `10 8 * * *`
3. 签到脚本会自动读取 `ZEEHO_AUTHORIZATION` / `ZEEHO_COOKIE` / `ZEEHO_USER_ID` 环境变量

---

## 常见问题

**Q: 打开 App 没有收到通知？**  
A: 检查 ①插件已启用 ②MitM 证书已安装并信任 ③`h5.zeehoev.com` 在 MitM hostname 中 ④BoxJS 配置已保存

**Q: 通知显示「Token 失败」？**  
A: 检查青龙地址是否带端口、ClientID/Secret 是否正确，以及青龙开放 API 权限是否勾选了环境变量

**Q: 签到脚本返回 code=40000？**  
A: 登录态过期，重新打开极核 App 点一次签到，Loon 会自动更新 CK
