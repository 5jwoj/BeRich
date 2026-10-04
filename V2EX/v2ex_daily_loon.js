/*
 * V2EX 每日签到 & Cookie 自动捕获 - Loon 专用版
 *
 * 行为特性：
 * 1) [http-request]  访问 www.v2ex.com 时从「请求头」捕获现有 Cookie（已登录状态）
 * 2) [http-response] 登录 v2ex.com 时从「响应头 Set-Cookie」捕获新 Cookie（首次/重新登录）
 * 3) 定时任务每天 08:00 自动签到、推送余额通知（支持指定代理策略，解决超时问题）
 * 4) Cookie 失效后重新用手机浏览器登录 V2EX 即可自动更新
 *
 * Version: v1.0.6
 * Author: @5jwoj (修复版 by Antigravity)
 *
 * Loon 插件地址：
 * https://raw.githubusercontent.com/5jwoj/BeRich/main/V2EX/v2ex_daily_loon.plugin
 */

// ====================================================
// BoxJS / persistentStore 键名定义
// ====================================================
const BOXJS_KEY_COOKIE = "v2ex_daily.cookie";
const BOXJS_KEY_UA     = "v2ex_daily.ua";
const BOXJS_KEY_POLICY = "v2ex_daily.policy"; // Loon 代理策略名，留空则使用系统默认策略

// ====================================================
// 常量与配置
// ====================================================
const SCRIPT_NAME  = "V2EX签到";
const SCRIPT_TAG   = "[V2EX-Loon v1.0.6]";
const BASE_URL     = "https://www.v2ex.com";
const DAILY_URL    = `${BASE_URL}/mission/daily`;
const BALANCE_URL  = `${BASE_URL}/balance`;
const DEFAULT_UA   = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1";
const HTTP_TIMEOUT = 30;   // 单次请求超时（秒）
const MAX_RETRIES  = 3;    // 最大重试次数
const RETRY_DELAY  = 3000; // 重试间隔（毫秒）

// ====================================================
// 运行入口分发
// ① http-request  → 从请求头捕获 Cookie（已登录场景）
// ② http-response → 从响应头 Set-Cookie 捕获新 Cookie（登录场景）
// ③ 无 $request   → cron 定时任务签到
// ====================================================
if (typeof $request !== "undefined" && typeof $response === "undefined") {
  captureRequestCookie();
} else if (typeof $response !== "undefined") {
  captureResponseCookie();
} else {
  main().catch((e) => {
    console.log(`${SCRIPT_TAG} 签到任务异常: ${e}`);
    notify(`${SCRIPT_NAME} ❌`, "脚本执行出错", String(e));
    $done({});
  });
}

// ====================================================
// ① 从请求头捕获 Cookie（已登录时访问任意页面触发）
// ====================================================
function captureRequestCookie() {
  try {
    const headers = $request.headers || {};
    const cookie  = headers["Cookie"] || headers["cookie"] || headers["COOKIE"] || "";
    const reqUrl  = $request.url || "";

    console.log(`${SCRIPT_TAG} [请求捕获] URL: ${reqUrl}`);
    console.log(`${SCRIPT_TAG} [请求捕获] Cookie 长度: ${cookie.length}`);

    if (!cookie || cookie.trim().length < 10) {
      console.log(`${SCRIPT_TAG} [请求捕获] Cookie 过短或为空，跳过`);
      $done({});
      return;
    }

    // 必须包含 V2EX 的 Session 关键字段 A=
    if (!cookie.includes("A=")) {
      console.log(`${SCRIPT_TAG} [请求捕获] 未检测到 Session (A=)，可能未登录，跳过`);
      $done({});
      return;
    }

    const currentCookie = ($persistentStore.read(BOXJS_KEY_COOKIE) || "").trim();
    const newCookie = cookie.trim();

    if (currentCookie !== newCookie) {
      const ok = $persistentStore.write(newCookie, BOXJS_KEY_COOKIE);
      if (ok) {
        console.log(`${SCRIPT_TAG} [请求捕获] ✅ Cookie 已保存，长度: ${newCookie.length}`);
        notify(`${SCRIPT_NAME} ✅`, "Cookie 已自动保存（请求头）", "已捕获 V2EX Session，08:00 将自动签到");
      } else {
        console.log(`${SCRIPT_TAG} [请求捕获] ❌ persistentStore.write 返回 false`);
      }
    } else {
      console.log(`${SCRIPT_TAG} [请求捕获] Cookie 未变更，无需写入`);
    }
  } catch (err) {
    console.log(`${SCRIPT_TAG} [请求捕获异常] ${err}`);
  }
  $done({});
}

// ====================================================
// ② 从响应头 Set-Cookie 捕获新 Cookie（登录页核心）
//    这是首次登录 / 重新登录时的关键捕获路径
// ====================================================
function captureResponseCookie() {
  try {
    const respHeaders = $response.headers || {};
    // Loon 中 Set-Cookie 可能为字符串或数组
    const rawSetCookie =
      respHeaders["Set-Cookie"] ||
      respHeaders["set-cookie"]  ||
      respHeaders["SET-COOKIE"]  ||
      "";

    if (!rawSetCookie) {
      console.log(`${SCRIPT_TAG} [响应捕获] 无 Set-Cookie 响应头`);
      $done({});
      return;
    }

    console.log(`${SCRIPT_TAG} [响应捕获] 检测到 Set-Cookie`);

    // 解析所有 Set-Cookie 条目（可能是数组或逗号分隔字符串）
    const setCookieList = Array.isArray(rawSetCookie)
      ? rawSetCookie
      : String(rawSetCookie).split(/,\s*(?=[A-Za-z_-]+=)/); // 按新 cookie 起始分割

    // 过滤掉 Set-Cookie 属性字段，只保留 name=value
    const ATTR_KEYS = new Set(["path", "domain", "expires", "max-age", "secure", "httponly", "samesite"]);
    const newPairs  = {}; // { cookieName: "name=value" }

    for (const entry of setCookieList) {
      const parts    = entry.split(";");
      const firstPart = (parts[0] || "").trim();
      if (!firstPart.includes("=")) continue;

      const eqIdx = firstPart.indexOf("=");
      const key   = firstPart.substring(0, eqIdx).trim();
      const val   = firstPart.substring(eqIdx + 1).trim();

      if (ATTR_KEYS.has(key.toLowerCase())) continue; // 跳过属性字段
      newPairs[key] = `${key}=${val}`;
    }

    const capturedKeys = Object.keys(newPairs);
    console.log(`${SCRIPT_TAG} [响应捕获] 捕获到 Cookie 字段: ${capturedKeys.join(", ")}`);

    if (capturedKeys.length === 0) {
      $done({});
      return;
    }

    // 与现有 Cookie 合并（新值覆盖旧值，保留其他字段）
    const existingRaw    = ($persistentStore.read(BOXJS_KEY_COOKIE) || "").trim();
    const existingPairs  = {};
    if (existingRaw) {
      for (const pair of existingRaw.split(";").map(p => p.trim()).filter(Boolean)) {
        const eqIdx = pair.indexOf("=");
        if (eqIdx > 0) {
          const k = pair.substring(0, eqIdx).trim();
          existingPairs[k] = pair;
        }
      }
    }

    const merged       = { ...existingPairs, ...newPairs }; // 新值覆盖旧值
    const mergedCookie = Object.values(merged).join("; ");

    const hadSession    = existingRaw.includes("A=");
    const hasNewSession = "A" in newPairs;

    $persistentStore.write(mergedCookie, BOXJS_KEY_COOKIE);
    console.log(`${SCRIPT_TAG} [响应捕获] ✅ Cookie 已合并保存，总长度: ${mergedCookie.length}`);

    if (hasNewSession) {
      // 捕获到新的 Session，一定要通知
      notify(
        `${SCRIPT_NAME} ✅`,
        hadSession ? "Session Cookie 已更新" : "登录成功！Cookie 已自动保存",
        "每日 08:00 将自动签到并推送余额通知"
      );
    }
  } catch (err) {
    console.log(`${SCRIPT_TAG} [响应捕获异常] ${err}`);
  }
  $done({});
}

// ====================================================
// ③ 网络请求与通知封装
// ====================================================

function getStoredCookie() {
  const val = $persistentStore.read(BOXJS_KEY_COOKIE);
  return val ? val.trim() : null;
}

function getStoredUA() {
  const val = $persistentStore.read(BOXJS_KEY_UA);
  return (val && val.trim()) ? val.trim() : DEFAULT_UA;
}

function getStoredPolicy() {
  const val = $persistentStore.read(BOXJS_KEY_POLICY);
  return (val && val.trim()) ? val.trim() : null;
}

function buildHeaders(cookie) {
  return {
    "User-Agent":      getStoredUA(),
    "Cookie":          cookie,
    "Referer":         DAILY_URL,
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  };
}

// 单次 HTTP GET，支持 Loon policy 指定代理策略
function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    const options = { url, headers, timeout: HTTP_TIMEOUT };
    const policy  = getStoredPolicy();
    if (policy) {
      options["policy"] = policy; // Loon 专属：指定出口代理策略，解决直连超时
      console.log(`${SCRIPT_TAG} [请求] 使用策略: ${policy}`);
    }
    $httpClient.get(options, (err, resp, body) => {
      if (err) { reject(err); return; }
      resolve({
        statusCode: resp ? (resp.status || resp.statusCode) : 0,
        headers:    (resp && resp.headers) || {},
        body:       body || ""
      });
    });
  });
}

// 带自动重试的 HTTP GET
async function httpGetWithRetry(url, headers) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await httpGet(url, headers);
    } catch (e) {
      lastErr = e;
      const isTimeout = String(e).includes("timeout") || String(e).includes("Timeout");
      const isConnErr = String(e).includes("connect") || String(e).includes("network");
      if (!isTimeout && !isConnErr) throw e; // 非网络错误不重试
      if (attempt < MAX_RETRIES) {
        console.log(`${SCRIPT_TAG} [重试 ${attempt}/${MAX_RETRIES}] ${e} — ${RETRY_DELAY / 1000}s 后重试...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY));
      }
    }
  }
  throw lastErr;
}

function notify(title, subtitle, body) {
  console.log(`${SCRIPT_TAG} [通知] ${title} | ${subtitle} | ${body}`);
  $notification.post(title, subtitle, body);
}

// ====================================================
// ④ HTML 数据提取与解析
// ====================================================

function extractOnceCode(html) {
  const m = html.match(/\/mission\/daily\/redeem\?once=(\d+)/);
  return m ? m[1] : null;
}

function parseBalance(html) {
  const result = { copper: null, silver: null, gold: null };

  const areaMatch = html.match(/<a href="\/balance" class="balance_area"[^>]*>([\s\S]*?)<\/a>/);
  if (areaMatch) {
    const content = areaMatch[1];
    for (const [, amount, alt] of [...content.matchAll(/(\d+)\s*<img[^>]+alt="([^"]+)"/g)]) {
      const key = alt.trim().toUpperCase();
      if (["B", "BRONZE", "铜币"].includes(key)) result.copper = parseInt(amount, 10);
      else if (["S", "SILVER", "银币"].includes(key)) result.silver = parseInt(amount, 10);
      else if (["G", "GOLD",   "金币"].includes(key)) result.gold   = parseInt(amount, 10);
    }
    if (result.copper === null && result.silver === null && result.gold === null) {
      for (const [, amount, name] of [...content.matchAll(/(\d+)\s*(铜币|银币|金币)/g)]) {
        if (name === "铜币") result.copper = parseInt(amount, 10);
        else if (name === "银币") result.silver = parseInt(amount, 10);
        else if (name === "金币") result.gold   = parseInt(amount, 10);
      }
    }
  }

  if (result.copper === null && result.silver === null && result.gold === null) {
    for (const [, amount, name] of [...html.matchAll(/<span class="balance_l">\s*(\d+)\s*<\/span>[\s\S]*?(铜币|银币|金币)/g)]) {
      if (name === "铜币") result.copper = parseInt(amount, 10);
      else if (name === "银币") result.silver = parseInt(amount, 10);
      else if (name === "金币") result.gold   = parseInt(amount, 10);
    }
  }

  return result;
}

function formatBalance(balance) {
  const { copper, silver, gold } = balance;
  if (copper === null && silver === null && gold === null) return "⚠️ 无法获取账户余额";

  const parts = [];
  if (gold   !== null) parts.push(`${gold} 金币`);
  if (silver !== null) parts.push(`${silver} 银币`);
  if (copper !== null) parts.push(`${copper} 铜币`);

  let total = 0;
  if (gold   !== null) total += gold   * 10000;
  if (silver !== null) total += silver * 100;
  if (copper !== null) total += copper;

  let str = `账户余额: ${parts.join(" | ")}`;
  if (total > 0) str += `\n总额(铜币当量): ${total}`;
  return str;
}

// ====================================================
// ⑤ 签到核心业务逻辑
// ====================================================

async function getOnceCode(cookie) {
  try {
    const res  = await httpGetWithRetry(DAILY_URL, buildHeaders(cookie));
    const body = res.body || "";
    if (body.includes("/signin") || body.includes("请登录"))
      return { onceCode: null, alreadyClaimed: false, cookieExpired: true };
    if (body.includes("每日登录奖励已领取"))
      return { onceCode: null, alreadyClaimed: true, cookieExpired: false };
    const onceCode = extractOnceCode(body);
    if (onceCode) return { onceCode, alreadyClaimed: false, cookieExpired: false };
    return { onceCode: null, alreadyClaimed: false, cookieExpired: false };
  } catch (e) {
    console.log(`${SCRIPT_TAG} 获取 Once Code 异常: ${e}`);
    return { onceCode: null, alreadyClaimed: false, cookieExpired: false };
  }
}

async function getBalance(cookie) {
  try {
    const res = await httpGetWithRetry(BALANCE_URL, buildHeaders(cookie));
    return parseBalance(res.body || "");
  } catch (e) {
    return { copper: null, silver: null, gold: null };
  }
}

async function redeemReward(cookie, onceCode) {
  const redeemUrl = `${BASE_URL}/mission/daily/redeem?once=${onceCode}`;
  try {
    const res  = await httpGetWithRetry(redeemUrl, buildHeaders(cookie));
    const body = res.body || "";
    if (body.includes("/signin") || body.includes("请重新登录"))
      return { success: false, reason: "cookie_expired" };
    if (body.includes("每日登录奖励已领取") || body.includes("已成功领取每日登录奖励"))
      return { success: true, reason: "claimed" };
    const msgMatch = body.match(/<div class="box">\s*<div class="message">([\s\S]*?)<\/div>/);
    if (msgMatch) return { success: true, reason: "message", message: msgMatch[1].trim() };
    return { success: false, reason: "unknown", statusCode: res.statusCode };
  } catch (e) {
    return { success: false, reason: "network_error", error: String(e) };
  }
}

async function signInAccount(cookie, idx, total) {
  const prefix = total > 1 ? `账号${idx + 1} ` : "";

  const { onceCode, alreadyClaimed, cookieExpired } = await getOnceCode(cookie);

  if (cookieExpired) {
    notify(`${SCRIPT_NAME} ${prefix}❌`, "Cookie 已失效", "请用手机浏览器打开 v2ex.com 重新登录，Cookie 将自动更新");
    return;
  }
  if (alreadyClaimed) {
    const balance = await getBalance(cookie);
    notify(`${SCRIPT_NAME} ${prefix}`, "今日已签到", formatBalance(balance));
    return;
  }
  if (!onceCode) {
    notify(`${SCRIPT_NAME} ${prefix}❌`, "未获取到 Once Code", "请检查 Cookie 是否有效或 V2EX 页面结构是否变更");
    return;
  }

  const result = await redeemReward(cookie, onceCode);

  if (result.success) {
    const balance  = await getBalance(cookie);
    const subtitle = result.message ? `提示: ${result.message}` : "每日奖励领取成功";
    notify(`${SCRIPT_NAME} ${prefix}✅`, subtitle, formatBalance(balance));
  } else {
    const msgs = {
      cookie_expired: ["Cookie 已失效",   "请用手机浏览器访问 v2ex.com 重新登录"],
      network_error:  ["网络请求失败",     result.error || "请检查网络连接"],
      unknown:        [`状态码: ${result.statusCode || "N/A"}`, "请登录 V2EX 手动确认"],
    };
    const [subtitle, body] = msgs[result.reason] || ["签到失败", "请登录 V2EX 手动确认"];
    notify(`${SCRIPT_NAME} ${prefix}❌`, subtitle, body);
  }
}

async function main() {
  const rawCookie = getStoredCookie();

  if (!rawCookie) {
    notify(
      `${SCRIPT_NAME} ⚠️`,
      "尚未获取到 Cookie",
      "请用手机浏览器打开 v2ex.com 并登录，Cookie 将自动保存"
    );
    $done({});
    return;
  }

  const cookies = rawCookie.split("\n").map(c => c.trim()).filter(Boolean);
  console.log(`${SCRIPT_TAG} 检测到 ${cookies.length} 个账户`);

  for (let i = 0; i < cookies.length; i++) {
    await signInAccount(cookies[i], i, cookies.length);
    if (i < cookies.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  $done({});
}
