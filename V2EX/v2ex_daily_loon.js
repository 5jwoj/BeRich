/*
 * V2EX 每日签到 & Cookie 自动捕获 - Loon 专用版
 *
 * 行为特性：
 * 1) 访问 www.v2ex.com 时自动拦截 HTTP 请求头，捕获 Cookie 并保存至 persistentStore / BoxJS
 * 2) 定时任务每天 08:00 自动执行签到、领取每日登录奖励并推送余额通知
 * 3) Cookie 失效后重新使用浏览器访问 V2EX 即可自动更新
 * 4) 支持多账号（多段 Cookie 换行分隔）
 *
 * Version: v1.0.4
 * Author: @5jwoj
 *
 * Loon 插件地址：
 * https://raw.githubusercontent.com/5jwoj/BeRich/main/V2EX/v2ex_daily_loon.plugin
 *
 * BoxJS 订阅地址 (Loon 专用)：
 * https://raw.githubusercontent.com/5jwoj/BeRich/main/boxjs/BeRich_Loon.boxjs.json
 */

// ====================================================
// BoxJS / persistentStore 键名定义
// ====================================================
const BOXJS_KEY_COOKIE = "v2ex_daily.cookie";
const BOXJS_KEY_UA     = "v2ex_daily.ua";

// ====================================================
// 常量与配置
// ====================================================
const SCRIPT_NAME = "V2EX签到";
const SCRIPT_TAG  = "[V2EX-Loon v1.0.4]";
const BASE_URL    = "https://www.v2ex.com";
const DAILY_URL   = `${BASE_URL}/mission/daily`;
const BALANCE_URL = `${BASE_URL}/balance`;
const DEFAULT_UA  = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ====================================================
// 运行入口分发
// 有 $request → http-request 拦截模式（捕获 Cookie）
// 无 $request → cron 定时任务模式（执行签到）
// ====================================================
if (typeof $request !== "undefined") {
  captureCookie();
} else {
  main().catch((e) => {
    console.log(`${SCRIPT_TAG} 签到任务异常: ${e}`);
    notify(`${SCRIPT_NAME} ❌`, "脚本执行出错", String(e));
    $done({});
  });
}

// ====================================================
// ① Cookie 自动捕获
// ====================================================
function captureCookie() {
  try {
    const headers = $request.headers || {};
    // 兼容各大小写 headers（Loon 通常用小写 key）
    const cookie = headers["Cookie"] || headers["cookie"] || headers["COOKIE"] || "";
    const reqUrl = $request.url || "";

    console.log(`${SCRIPT_TAG} [捕获触发] URL: ${reqUrl}`);
    console.log(`${SCRIPT_TAG} [捕获调试] Headers Keys: ${Object.keys(headers).join(", ")}`);
    console.log(`${SCRIPT_TAG} [捕获调试] Cookie 长度: ${cookie.length}`);

    // ⚠️ 注意：若 MitM 证书未安装/信任，Loon 无法解密 HTTPS 流量，此处 cookie 将永远为空
    // 请确认: Loon → 设置 → HTTPS 解密 → 已安装并信任证书
    if (!cookie || cookie.trim().length < 5) {
      console.log(`${SCRIPT_TAG} [捕获跳过] 未检测到有效 Cookie。`);
      console.log(`${SCRIPT_TAG} [捕获提示] 如 Cookie 始终为空，请检查 Loon MitM 证书是否已安装并在系统设置中信任。`);
      $done({});
      return;
    }

    const currentCookie = ($persistentStore.read(BOXJS_KEY_COOKIE) || "").trim();
    const newCookie = cookie.trim();

    if (currentCookie !== newCookie) {
      const isSaved = $persistentStore.write(newCookie, BOXJS_KEY_COOKIE);
      if (isSaved) {
        console.log(`${SCRIPT_TAG} [捕获成功] Cookie 已保存，总长度: ${newCookie.length}`);
        notify(
          `${SCRIPT_NAME} ✅`,
          "Cookie 已自动保存 (Loon)",
          "已成功更新 V2EX Cookie，每日 08:00 将自动执行签到"
        );
      } else {
        console.log(`${SCRIPT_TAG} [捕获失败] $persistentStore.write 写入返回 false`);
        notify(
          `${SCRIPT_NAME} ❌`,
          "Cookie 写入失败",
          "$persistentStore.write 返回 false，请检查 Loon 权限"
        );
      }
    } else {
      console.log(`${SCRIPT_TAG} [捕获忽略] Cookie 与当前已存内容一致，无需重复写入`);
    }
  } catch (err) {
    console.log(`${SCRIPT_TAG} [捕获异常] ${err}`);
  }
  $done({});
}

// ====================================================
// ② 网络请求与通知封装
// ====================================================

function getStoredCookie() {
  const val = $persistentStore.read(BOXJS_KEY_COOKIE);
  return val ? val.trim() : null;
}

function getStoredUA() {
  const val = $persistentStore.read(BOXJS_KEY_UA);
  return (val && val.trim()) ? val.trim() : DEFAULT_UA;
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

function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    $httpClient.get({ url, headers, timeout: 15 }, (err, resp, body) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({
        statusCode: resp ? (resp.status || resp.statusCode) : 0,
        headers: (resp && resp.headers) || {},
        body: body || ""
      });
    });
  });
}

function notify(title, subtitle, body) {
  console.log(`${SCRIPT_TAG} [通知] ${title} | ${subtitle} | ${body}`);
  $notification.post(title, subtitle, body);
}

// ====================================================
// ③ HTML 数据提取与解析
// ====================================================

function extractOnceCode(html) {
  const m = html.match(/\/mission\/daily\/redeem\?once=(\d+)/);
  return m ? m[1] : null;
}

function parseBalance(html) {
  const result = { copper: null, silver: null, gold: null };

  // 策略 1：balance_area 区域
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

  // 策略 2：旧版 span.balance_l
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
// ④ 签到核心业务逻辑
// ====================================================

async function checkCookieValid(cookie) {
  try {
    const res  = await httpGet(DAILY_URL, buildHeaders(cookie));
    const body = res.body || "";
    const loc  = (res.headers && (res.headers["location"] || res.headers["Location"])) || "";
    if (body.includes("/signin") || loc.includes("/signin")) return false;
    if (body.includes("登出") || body.includes("/signout"))  return true;
    return true;
  } catch (e) {
    console.log(`${SCRIPT_TAG} 检测 Cookie 异常: ${e}`);
    return true;
  }
}

async function getOnceCode(cookie) {
  try {
    const res  = await httpGet(DAILY_URL, buildHeaders(cookie));
    const body = res.body || "";
    if (body.includes("/signin"))           return { onceCode: null, alreadyClaimed: false, cookieExpired: true };
    if (body.includes("每日登录奖励已领取")) return { onceCode: null, alreadyClaimed: true,  cookieExpired: false };
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
    const res = await httpGet(BALANCE_URL, buildHeaders(cookie));
    return parseBalance(res.body || "");
  } catch (e) {
    return { copper: null, silver: null, gold: null };
  }
}

async function redeemReward(cookie, onceCode) {
  const redeemUrl = `${BASE_URL}/mission/daily/redeem?once=${onceCode}`;
  try {
    const res  = await httpGet(redeemUrl, buildHeaders(cookie));
    const body = res.body || "";
    if (body.includes("/signin") || body.includes("请重新登录"))                          return { success: false, reason: "cookie_expired" };
    if (body.includes("每日登录奖励已领取") || body.includes("已成功领取每日登录奖励")) return { success: true,  reason: "claimed" };
    const msgMatch = body.match(/<div class="box">\s*<div class="message">([\s\S]*?)<\/div>/);
    if (msgMatch) return { success: true, reason: "message", message: msgMatch[1].trim() };
    return { success: false, reason: "unknown", statusCode: res.statusCode };
  } catch (e) {
    return { success: false, reason: "network_error", error: String(e) };
  }
}

async function signInAccount(cookie, idx, total) {
  const prefix = total > 1 ? `账号${idx + 1} ` : "";

  const isValid = await checkCookieValid(cookie);
  if (!isValid) {
    notify(`${SCRIPT_NAME} ${prefix}❌`, "Cookie 已失效", "请用浏览器访问 v2ex.com 登录，Cookie 将自动更新");
    return;
  }

  const { onceCode, alreadyClaimed, cookieExpired } = await getOnceCode(cookie);

  if (cookieExpired) {
    notify(`${SCRIPT_NAME} ${prefix}❌`, "Cookie 已失效", "请用浏览器访问 v2ex.com 登录，Cookie 将自动更新");
    return;
  }
  if (alreadyClaimed) {
    const balance = await getBalance(cookie);
    notify(`${SCRIPT_NAME} ${prefix}`, "今日已签到", formatBalance(balance));
    return;
  }
  if (!onceCode) {
    notify(`${SCRIPT_NAME} ${prefix}❌`, "未获取到 Once Code", "请检查 Cookie 是否有效");
    return;
  }

  const result = await redeemReward(cookie, onceCode);

  if (result.success) {
    const balance  = await getBalance(cookie);
    const subtitle = result.message ? `提示: ${result.message}` : "每日奖励领取成功";
    notify(`${SCRIPT_NAME} ${prefix}✅`, subtitle, formatBalance(balance));
  } else {
    const msgs = {
      cookie_expired: ["Cookie 已失效", "请用浏览器访问 v2ex.com 登录，Cookie 将自动更新"],
      network_error:  ["网络请求失败",   result.error || "请检查网络连接"],
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
      "请先使用浏览器打开 v2ex.com 并登录，Cookie 将自动保存到 Loon / BoxJS"
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
