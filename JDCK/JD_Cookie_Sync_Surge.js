/*
 * JD Cookie Sync to Qinglong - Surge Version (Notify on Failure Only)
 *
 * Version: 1.2.1
 * Author: z.W.
 * 行为：
 * 1) 每次打开京东APP都会尝试同步青龙（60秒防并发冷却）
 * 2) 同步成功或失败都会发送系统通知
 * 3) 修复了潜在的 $done() 重复调用导致无响应的问题
 *
 * @script
 * api.m.jd.com
 *
 * @args
 * ql_url: Qinglong Panel URL (e.g., http://192.168.1.1:5700)
 * ql_client_id: Qinglong Client ID
 * ql_client_secret: Qinglong Client Secret
 */

// ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
// 如果模块配置界面无法输入,请直接修改下面的引号内容
const MANUAL_CONFIG = {
  url: "",        // 必填,例如 "http://192.168.1.1:5700"
  id: "",         // 必填,Client ID
  secret: "",     // 必填,Client Secret
  debug: false    // 选填,设为 true 会输出更多日志
};
// ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

(async () => {
  try {
    let ql_url = MANUAL_CONFIG.url || getArg("ql_url");
    const ql_client_id = MANUAL_CONFIG.id || getArg("ql_client_id");
    const ql_client_secret = MANUAL_CONFIG.secret || getArg("ql_client_secret");

    console.log(`Config: URL=${ql_url}, ID=${ql_client_id ? '***' : 'Missing'}, Secret=${ql_client_secret ? '***' : 'Missing'}`);

    if (!ql_url || !ql_client_id || !ql_client_secret || ql_url.includes("{ql_url}")) {
      $notification.post("配置未生效", "参数未正确替换", "请在Surge模块配置页填写青龙信息并保存,不要留空。");
      return;
    }

    // Auto-fix URL if missing http prefix
    if (!ql_url.startsWith("http://") && !ql_url.startsWith("https://")) {
      ql_url = "http://" + ql_url;
      console.log(`Added http prefix to URL: ${ql_url}`);
    }

    // Remove trailing slash if present
    if (ql_url.endsWith("/")) {
      ql_url = ql_url.slice(0, -1);
    }

    // 1) Capture Cookie from request header
    const cookie = $request.headers["Cookie"] || $request.headers["cookie"];
    if (!cookie) {
      if (MANUAL_CONFIG.debug) console.log("No cookie found in request header.");
      return;
    }

    const pt_key = getCookieValue(cookie, "pt_key");
    const pt_pin_raw = getCookieValue(cookie, "pt_pin");
    if (!pt_key || !pt_pin_raw) {
      if (MANUAL_CONFIG.debug) console.log("No pt_key or pt_pin found in cookie.");
      return;
    }

    // 兼容 URL 编码 pt_pin（如 abc%40qq.com）
    const pt_pin = safeDecodeURIComponent(pt_pin_raw);
    const jd_cookie = `pt_key=${pt_key};pt_pin=${pt_pin};`;

    console.log(`Captured Cookie for pt_pin=${pt_pin}`);

    // 2) 检查冷却时间 (60秒内只同步一次)，避免打开APP时并发请求轰炸青龙
    const cacheKey = `JD_COOKIE_LAST_SYNC_${pt_pin}`;
    const lastSyncTime = $persistentStore.read(cacheKey);
    const now = Date.now();
    
    if (lastSyncTime && now - parseInt(lastSyncTime) < 60000) {
      console.log(`Cookie sync for ${pt_pin} is in cooldown (60s). Skip.`);
      return;
    }

    // 3) Authenticate with Qinglong
    const token = await getQLToken(ql_url, ql_client_id, ql_client_secret);
    if (!token) {
      $notification.post("同步失败", "获取青龙 Token 失败", "请检查 ql_url / client_id / client_secret 是否正确。");
      return;
    }

    // 4) Sync Cookie
    const result = await syncCookieToQL(ql_url, token, pt_pin, jd_cookie);

    if (!result.ok) {
      $notification.post("同步失败", "青龙接口返回异常", result.message || "Unknown error");
      return;
    }

    // 5) 更新冷却时间并发送通知
    $persistentStore.write(now.toString(), cacheKey);

    if (result.changed) {
      $notification.post(result.title, result.subtitle, result.body);
      console.log(`${result.title}: ${result.subtitle}`);
    } else {
      $notification.post("Cookie 同步成功", `账号：${pt_pin}`, "Cookie 值未发生变化，已成功检查并同步至青龙面板。");
      console.log(`Sync success but no change for ${pt_pin}. Notified.`);
    }

  } catch (e) {
    console.log(`Error: ${e && e.message ? e.message : e}`);
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
        console.log(`Auth Network Error: ${error}`);
        resolve(null);
        return;
      }
      try {
        const body = JSON.parse(data);
        if (body.code === 200 && body.data && body.data.token) {
          resolve(body.data.token);
        } else {
          console.log(`Auth Failed: ${JSON.stringify(body)}`);
          resolve(null);
        }
      } catch (e) {
        console.log(`Auth Parse Error: ${e.message}`);
        resolve(null);
      }
    });
  });
}

/**
 * 仅当“青龙端状态发生变化”才标记 changed=true：
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
        console.log(`Sync Network Error: ${error}`);
        resolve({ ok: false, message: String(error) });
        return;
      }

      try {
        const body = JSON.parse(data);
        if (body.code !== 200 || !Array.isArray(body.data)) {
          console.log(`Sync Unexpected Response: ${data}`);
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
        await createEnv(url, token, "JD_COOKIE", newValue, `Created by Surge Module for ${pt_pin}`);
        resolve({
          ok: true,
          changed: true,
          title: "Cookie 已创建",
          subtitle: `已创建并同步：${pt_pin}`,
          body: "青龙中新增 JD_COOKIE 变量成功。"
        });

      } catch (e) {
        console.log(`Sync Parse Error: ${e.message}`);
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
