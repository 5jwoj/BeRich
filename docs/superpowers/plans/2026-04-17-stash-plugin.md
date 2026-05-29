# Stash Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a Stash plugin that captures JD cookies and syncs them to Qinglong panel with full notification support.

**Architecture:** Three files - `.stoverride` (config), `.js` (script), and `README_Stash.md` (docs). Script uses Stash-compatible APIs for cookie capture, validation, caching, and Qinglong sync.

**Tech Stack:** JavaScript (Surge/Stash API compatible), Qinglong Panel API

---

## File Structure

```
JDCK/
├── JD_Cookie_Sync_Stash.stoverride  # NEW: Stash override config
├── JD_Cookie_Sync_Stash.js          # NEW: Stash script
└── README_Stash.md                   # NEW: Documentation
```

---

### Task 1: Create Stash Override Configuration File

**Files:**
- Create: `JDCK/JD_Cookie_Sync_Stash.stoverride`

- [ ] **Step 1: Write the .stoverride file**

```yaml
#!name=JD Cookie Sync
#!desc=自动捕获京东 Cookie 并同步到青龙面板。支持多个京东域名，首次捕获、更新和失败时发送通知。
#!author=z.W.
#!icon=https://raw.githubusercontent.com/Orz-3/mini/master/jd.png
#!homepage=https://github.com/5jwoj/BeRich
#!date=2026-04-17

#!arguments=QL_URL:http://127.0.0.1:5700,QL_CLIENT_ID:your_client_id,QL_CLIENT_SECRET:your_client_secret
#!arguments-desc=QL_URL: 青龙面板地址 (例如 http://192.168.1.1:5700)\nQL_CLIENT_ID: 青龙面板 Client ID\nQL_CLIENT_SECRET: 青龙面板 Client Secret

[Script]
# 覆盖常见京东域名，提高命中率
JD Cookie Sync = type=http-request,pattern=^https?:\/\/(api\.m|me-api|plogin\.m|wq|home\.m)\.jd\.com,requires-body=0,max-size=0,script-path=https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/JD_Cookie_Sync_Stash.js,timeout=20

[MITM]
hostname = %APPEND% api.m.jd.com, me-api.jd.com, plogin.m.jd.com, wq.jd.com, home.m.jd.com
```

- [ ] **Step 2: Verify file was created**

Run: `ls -la ~/BeRich/JDCK/JD_Cookie_Sync_Stash.stoverride`
Expected: File exists with content above

---

### Task 2: Create Stash JavaScript Script

**Files:**
- Create: `JDCK/JD_Cookie_Sync_Stash.js`

- [ ] **Step 1: Write the complete Stash script**

```javascript
/*
 * JD Cookie Sync to Qinglong - Stash Version
 *
 * Version: 1.0.0
 * Author: z.W.
 * 
 * 行为：
 * 1) 抓到 pt_key + pt_pin 就尝试同步青龙
 * 2) 首次捕获、更新、失败时发送通知
 * 3) 使用本地缓存避免重复同步
 * 4) 验证 Cookie 有效性，无效时才同步
 *
 * @script
 * api.m.jd.com, me-api.jd.com, plogin.m.jd.com, wq.jd.com, home.m.jd.com
 *
 * @arguments
 * ql_url: Qinglong Panel URL (e.g., http://192.168.1.1:5700)
 * ql_client_id: Qinglong Client ID
 * ql_client_secret: Qinglong Client Secret
 */

// ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
// 如果模块配置界面无法输入,请直接修改下面的引号内容
const MANUAL_CONFIG = {
  url: "",        // 必填,例如 "http://192.168.1.1:5700"
  id: "",         // 必填,Client ID
  secret: ""      // 必填,Client Secret
};
// ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

(async () => {
  try {
    let ql_url = MANUAL_CONFIG.url || getArg("ql_url");
    const ql_client_id = MANUAL_CONFIG.id || getArg("ql_client_id");
    const ql_client_secret = MANUAL_CONFIG.secret || getArg("ql_client_secret");

    console.log(`[jd_cookie_sync] Config: URL=${ql_url}, ID=${ql_client_id ? '***' : 'Missing'}, Secret=${ql_client_secret ? '***' : 'Missing'}`);

    if (!ql_url || !ql_client_id || !ql_client_secret || ql_url.includes("{ql_url}")) {
      $notification.post("配置未生效", "参数未正确替换", "请在 Stash 覆写配置页填写青龙信息并保存,不要留空。");
      $done({});
      return;
    }

    // Auto-fix URL if missing http prefix
    if (!ql_url.startsWith("http://") && !ql_url.startsWith("https://")) {
      ql_url = "http://" + ql_url;
      console.log(`[jd_cookie_sync] Added http prefix to URL: ${ql_url}`);
    }

    // Remove trailing slash if present
    if (ql_url.endsWith("/")) {
      ql_url = ql_url.slice(0, -1);
    }

    // 1) Capture Cookie from request header
    const cookie = $request.headers["Cookie"] || $request.headers["cookie"];
    if (!cookie) {
      $done({});
      return;
    }

    const pt_key = getCookieValue(cookie, "pt_key");
    const pt_pin_raw = getCookieValue(cookie, "pt_pin");
    if (!pt_key || !pt_pin_raw) {
      $done({});
      return;
    }

    // 兼容 URL 编码 pt_pin（如 abc%40qq.com）
    const pt_pin = safeDecodeURIComponent(pt_pin_raw);
    const jd_cookie = `pt_key=${pt_key};pt_pin=${pt_pin};`;

    console.log(`[jd_cookie_sync] Captured Cookie for pt_pin=${pt_pin}`);

    // 2) 检查本地缓存，避免重复处理
    const cacheKey = `JD_COOKIE_CACHE_${pt_pin}`;
    const cachedCookie = $persistentStore.read(cacheKey);

    if (cachedCookie === jd_cookie) {
      console.log(`[jd_cookie_sync] Cookie unchanged for ${pt_pin}, validating...`);

      // 2.1) 验证 Cookie 有效性
      const validation = await validateJDCookie(jd_cookie);

      if (validation.valid) {
        console.log(`[jd_cookie_sync] Cookie valid for ${pt_pin} (${validation.nickname || 'unknown'}). Skip sync.`);
        $done({});
        return;
      } else {
        console.log(`[jd_cookie_sync] Cookie invalid for ${pt_pin}. Need to re-sync.`);
        // 继续执行同步逻辑
      }
    }

    // 3) Authenticate with Qinglong
    const token = await getQLToken(ql_url, ql_client_id, ql_client_secret);
    if (!token) {
      $notification.post("同步失败", "获取青龙 Token 失败", "请检查 ql_url / client_id / client_secret 是否正确。");
      $done({});
      return;
    }

    // 4) Sync Cookie
    const result = await syncCookieToQL(ql_url, token, pt_pin, jd_cookie);

    if (!result.ok) {
      $notification.post("同步失败", "青龙接口返回异常", result.message || "Unknown error");
      $done({});
      return;
    }

    // 5) 同步成功后更新缓存并发送通知
    if (result.changed) {
      $persistentStore.write(jd_cookie, cacheKey);
      $notification.post(result.title, result.subtitle, result.body);
      console.log(`[jd_cookie_sync] ${result.title}: ${result.subtitle}`);
    } else {
      console.log(`[jd_cookie_sync] No change for ${pt_pin}. No notification.`);
    }

  } catch (e) {
    console.log(`[jd_cookie_sync] Error: ${e && e.message ? e.message : e}`);
    $notification.post("Sync Error", "An unexpected error occurred", String(e && e.message ? e.message : e));
  } finally {
    $done({});
  }
})();

function getArg(key) {
  const args = {};
  if (typeof $argument !== 'undefined' && $argument) {
    $argument.split("&").forEach(pair => {
      const idx = pair.indexOf("=");
      if (idx > -1) {
        const k = pair.substring(0, idx);
        const v = pair.substring(idx + 1);
        if (k && v) args[k] = decodeURIComponent(v);
      }
    });
  }
  return args[key];
}

function getCookieValue(cookieStr, key) {
  const match = cookieStr.match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
  return match ? match[1] : null;
}

function safeDecodeURIComponent(s) {
  try { return decodeURIComponent(s); } catch (_) { return s; }
}

async function getQLToken(url, clientId, clientSecret) {
  const options = {
    url: `${url}/open/auth/token?client_id=${clientId}&client_secret=${clientSecret}`,
    method: "GET"
  };

  return new Promise((resolve) => {
    $httpClient.get(options, (error, response, data) => {
      if (error) {
        console.log(`[jd_cookie_sync] Auth Network Error: ${error}`);
        resolve(null);
        return;
      }
      try {
        const body = JSON.parse(data);
        if (body.code === 200 && body.data && body.data.token) {
          resolve(body.data.token);
        } else {
          console.log(`[jd_cookie_sync] Auth Failed: ${JSON.stringify(body)}`);
          resolve(null);
        }
      } catch (e) {
        console.log(`[jd_cookie_sync] Auth Parse Error: ${e.message}`);
        resolve(null);
      }
    });
  });
}

/**
 * 验证京东 Cookie 是否有效
 * @param {string} jd_cookie - 京东Cookie字符串
 * @returns {Promise<{valid: boolean, nickname?: string}>}
 */
async function validateJDCookie(jd_cookie) {
  const options = {
    url: "https://me-api.jd.com/user_new/info/GetJDUserInfoUnion",
    method: "GET",
    headers: {
      "Cookie": jd_cookie,
      "User-Agent": "jdapp;iPhone;10.0.0;14.0;network/wifi;Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)",
      "Referer": "https://home.m.jd.com/"
    },
    timeout: 10
  };

  return new Promise((resolve) => {
    $httpClient.get(options, (error, response, data) => {
      if (error) {
        console.log(`[jd_cookie_sync] Cookie validation network error: ${error}`);
        resolve({ valid: false });
        return;
      }

      try {
        const body = JSON.parse(data);

        // 检查返回数据是否包含用户信息
        if (body && body.retcode === "0" && body.data && body.data.userInfo) {
          const nickname = body.data.userInfo.baseInfo?.nickname || "";
          console.log(`[jd_cookie_sync] Cookie validation success: ${nickname}`);
          resolve({ valid: true, nickname });
        } else {
          console.log(`[jd_cookie_sync] Cookie validation failed: ${JSON.stringify(body).substring(0, 100)}`);
          resolve({ valid: false });
        }
      } catch (e) {
        console.log(`[jd_cookie_sync] Cookie validation parse error: ${e.message}`);
        resolve({ valid: false });
      }
    });
  });
}

/**
 * 同步 Cookie 到青龙面板
 * 仅当"青龙端状态发生变化"才标记 changed=true：
 * - 未找到则创建
 * - 找到但 value 不同则更新
 * - 找到但被禁用则启用
 * 若 value 相同且已启用，则 changed=false（不通知）
 */
async function syncCookieToQL(url, token, pt_pin, newValue) {
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  const getOptions = {
    url: `${url}/open/envs?searchValue=${encodeURIComponent(pt_pin)}`,
    method: "GET",
    headers
  };

  return new Promise((resolve) => {
    $httpClient.get(getOptions, async (error, response, data) => {
      if (error) {
        console.log(`[jd_cookie_sync] Sync Network Error: ${error}`);
        resolve({ ok: false, message: String(error) });
        return;
      }

      try {
        const body = JSON.parse(data);
        if (body.code !== 200 || !Array.isArray(body.data)) {
          console.log(`[jd_cookie_sync] Sync Unexpected Response: ${data}`);
          resolve({ ok: false, message: "Unexpected Qinglong response" });
          return;
        }

        const envs = body.data;
        const targetEnv = envs.find(e =>
          e && e.name === "JD_COOKIE" &&
          typeof e.value === "string" &&
          e.value.includes(`pt_pin=${pt_pin}`)
        );

        // 变化标记
        let changed = false;

        if (targetEnv) {
          // 如果被禁用，先启用（算变化）
          if (targetEnv.status !== 0) {
            await enableEnv(url, token, targetEnv.id);
            changed = true;
          }

          // 如果值不同，更新（算变化）
          if (targetEnv.value !== newValue) {
            await updateEnv(url, token, targetEnv.id, "JD_COOKIE", newValue, targetEnv.remarks);
            changed = true;

            resolve({
              ok: true,
              changed,
              title: "Cookie 已更新",
              subtitle: `已更新并同步：${pt_pin}`,
              body: "青龙中的 JD_COOKIE 已更新成功。"
            });
            return;
          }

          // 值相同：如果刚启用过也算变化；否则不算变化
          if (changed) {
            resolve({
              ok: true,
              changed,
              title: "Cookie 已启用",
              subtitle: `已启用并同步：${pt_pin}`,
              body: "值未变化，但已从禁用状态启用。"
            });
          } else {
            resolve({ ok: true, changed: false });
          }
          return;
        }

        // 未找到：创建（算变化）
        await createEnv(url, token, "JD_COOKIE", newValue, `Created by Stash Module for ${pt_pin}`);
        resolve({
          ok: true,
          changed: true,
          title: "Cookie 已创建",
          subtitle: `已创建并同步：${pt_pin}`,
          body: "青龙中新增 JD_COOKIE 变量成功。"
        });

      } catch (e) {
        console.log(`[jd_cookie_sync] Sync Parse Error: ${e.message}`);
        resolve({ ok: false, message: e.message });
      }
    });
  });
}

async function updateEnv(url, token, id, name, value, remarks) {
  const options = {
    url: `${url}/open/envs`,
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ id, name, value, remarks })
  };
  return new Promise(resolve => {
    $httpClient.put(options, () => resolve());
  });
}

async function createEnv(url, token, name, value, remarks) {
  const options = {
    url: `${url}/open/envs`,
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([{ name, value, remarks }])
  };
  return new Promise(resolve => {
    $httpClient.post(options, () => resolve());
  });
}

async function enableEnv(url, token, id) {
  const options = {
    url: `${url}/open/envs/enable`,
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([id])
  };
  return new Promise(resolve => {
    $httpClient.put(options, () => resolve());
  });
}
```

- [ ] **Step 2: Verify file was created**

Run: `ls -la ~/BeRich/JDCK/JD_Cookie_Sync_Stash.js`
Expected: File exists with content above

---

### Task 3: Create README Documentation

**Files:**
- Create: `JDCK/README_Stash.md`

- [ ] **Step 1: Write the README documentation**

```markdown
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
```

- [ ] **Step 2: Verify file was created**

Run: `ls -la ~/BeRich/JDCK/README_Stash.md`
Expected: File exists with content above

---

### Task 4: Update Main README

**Files:**
- Modify: `JDCK/README.md`

- [ ] **Step 1: Read existing README.md**

Run: `cat ~/BeRich/JDCK/README.md`

- [ ] **Step 2: Add Stash section to installation instructions**

Find the section after Quantumult X and before "⚙️ 配置指南", add:

```markdown
### Stash

在 Stash 的「配置」→「覆写」中添加：

**覆写地址**

```
https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/JD_Cookie_Sync_Stash.stoverride
```

**详细说明**

详细的安装和配置说明请查看：[README_Stash.md](/5jwoj/BeRich/blob/main/JDCK/README_Stash.md)
```

- [ ] **Step 3: Commit changes**

```bash
git add JDCK/README.md
git commit -m "docs: add Stash installation section to main README"
```

---

### Task 5: Final Verification and Commit

- [ ] **Step 1: List all created files**

Run: `ls -la ~/BeRich/JDCK/ | grep -E "(Stash|stash)"`
Expected: Shows three files: `.stoverride`, `.js`, `.md`

- [ ] **Step 2: Verify file contents are correct**

Run: `head -5 ~/BeRich/JDCK/JD_Cookie_Sync_Stash.stoverride`
Expected: Shows `#!name=JD Cookie Sync`

Run: `head -5 ~/BeRich/JDCK/JD_Cookie_Sync_Stash.js`
Expected: Shows comment header

Run: `head -5 ~/BeRich/JDCK/README_Stash.md`
Expected: Shows `# 京东 Cookie 同步 - Stash 版`

- [ ] **Step 3: Commit all new files**

```bash
cd ~/BeRich && git add JDCK/JD_Cookie_Sync_Stash.stoverride JDCK/JD_Cookie_Sync_Stash.js JDCK/README_Stash.md && git commit -m "feat: add Stash plugin for JD cookie sync

- Add JD_Cookie_Sync_Stash.stoverride with #!arguments support
- Add JD_Cookie_Sync_Stash.js with full notification support
- Add README_Stash.md with detailed installation guide
- Features: cookie capture, validation, caching, Qinglong sync"
```

- [ ] **Step 4: Verify commit**

Run: `cd ~/BeRich && git log -1 --oneline`
Expected: Shows commit with "feat: add Stash plugin"