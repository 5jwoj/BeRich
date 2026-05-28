/*
 * V2EX 每日签到 & Cookie 自动捕获 - Quantumult X 版
 *
 * 行为：
 * 1) 访问 v2ex.com 时自动拦截请求头，捕获 Cookie 并保存到 BoxJS
 * 2) 定时任务运行时自动执行每日签到并推送余额通知
 * 3) Cookie 过期后只需重新打开 V2EX 网站即可自动更新，无需手动操作
 *
 * Version: v1.2.0
 * Author: @5jwoj
 *
 * BoxJS 订阅:
 * https://raw.githubusercontent.com/5jwoj/BeRich/main/boxjs/BeRich.boxjs.json
 *
 * @script
 * www.v2ex.com
 *
 * @config
 * 在 Quantumult X 配置文件中加入以下内容（或直接导入 v2ex_daily.conf）：
 *
 * [rewrite_local]
 * ^https?://www\.v2ex\.com url script-request-header https://raw.githubusercontent.com/5jwoj/BeRich/main/V2EX/v2ex_daily.js
 *
 * [task_local]
 * 0 8 * * * https://raw.githubusercontent.com/5jwoj/BeRich/main/V2EX/v2ex_daily.js, tag=V2EX每日签到, img-url=https://www.v2ex.com/favicon.ico, enabled=true
 *
 * [mitm]
 * hostname = www.v2ex.com
 */

// ====================================================
// BoxJS Key（与 BeRich.boxjs.json 保持一致）
// ====================================================
const BOXJS_KEY_COOKIE = "v2ex_daily.cookie";
const BOXJS_KEY_UA     = "v2ex_daily.ua";

// ====================================================
// 常量配置
// ====================================================
const SCRIPT_TAG  = "[V2EX]";
const BASE_URL    = "https://www.v2ex.com";
const DAILY_URL   = `${BASE_URL}/mission/daily`;
const BALANCE_URL = `${BASE_URL}/balance`;
const DEFAULT_UA  = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ====================================================
// 模式判断入口
// 有 $request → 重写拦截模式（Cookie 捕获）
// 无 $request → 定时任务模式（每日签到）
// ====================================================
if (typeof $request !== "undefined") {
  captureCookie();
} else {
  main().catch((e) => {
    console.log(`${SCRIPT_TAG} 脚本执行出错: ${e}`);
    $notify("V2EX签到", "脚本执行出错", String(e));
    $done({});
  });
}

// ====================================================
// ① Cookie 捕获模式（由 rewrite_local 触发）
// ====================================================
function captureCookie() {
  try {
    const headers = $request.headers || {};
    const cookie  = headers["Cookie"] || headers["cookie"] || "";

    if (!cookie || !cookie.includes("A2=")) {
      // 未登录或无关请求，静默跳过
      $done({});
      return;
    }

    const old = $persistentStore.read(BOXJS_KEY_COOKIE) || "";

    if (old.trim() !== cookie.trim()) {
      $persistentStore.write(cookie, BOXJS_KEY_COOKIE);
      console.log(`${SCRIPT_TAG} Cookie 已捕获并更新到 BoxJS`);
      $notify(
        "V2EX Cookie ✅",
        "Cookie 已自动保存",
        "下次定时签到将使用新 Cookie，无需手动操作"
      );
    }
  } catch (e) {
    console.log(`${SCRIPT_TAG} Cookie 捕获出错: ${e}`);
  }
  $done({});
}

// ====================================================
// 工具函数
// ====================================================

function getCookie() {
  const val = $persistentStore.read(BOXJS_KEY_COOKIE);
  return val ? val.trim() : null;
}

function getUA() {
  const val = $persistentStore.read(BOXJS_KEY_UA);
  return (val && val.trim()) ? val.trim() : DEFAULT_UA;
}

function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    $task.fetch({ url, method: "GET", headers }).then(
      (res)    => resolve(res),
      (reason) => reject(reason)
    );
  });
}

function buildHeaders(cookie) {
  return {
    "User-Agent":      getUA(),
    "Cookie":          cookie,
    "Referer":         DAILY_URL,
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  };
}

function notify(title, subtitle, body) {
  console.log(`${SCRIPT_TAG} ${title} | ${subtitle} | ${body}`);
  $notify(title, subtitle, body);
}

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
    // 图片格式：数字 + <img alt="S/B/G">
    for (const [, amount, alt] of [...content.matchAll(/(\d+)\s*<img[^>]+alt="([^"]+)"/g)]) {
      const key = alt.trim().toUpperCase();
      if (["B", "BRONZE", "铜币"].includes(key)) result.copper = parseInt(amount);
      else if (["S", "SILVER", "银币"].includes(key)) result.silver = parseInt(amount);
      else if (["G", "GOLD",   "金币"].includes(key)) result.gold   = parseInt(amount);
    }
    // 文本格式：数字 + 铜币/银币/金币
    if (result.copper === null && result.silver === null && result.gold === null) {
      for (const [, amount, name] of [...content.matchAll(/(\d+)\s*(铜币|银币|金币)/g)]) {
        if (name === "铜币") result.copper = parseInt(amount);
        else if (name === "银币") result.silver = parseInt(amount);
        else if (name === "金币") result.gold   = parseInt(amount);
      }
    }
  }

  // 策略 2：旧版 span.balance_l
  if (result.copper === null && result.silver === null && result.gold === null) {
    for (const [, amount, name] of [...html.matchAll(/<span class="balance_l">\s*(\d+)\s*<\/span>[\s\S]*?(铜币|银币|金币)/g)]) {
      if (name === "铜币") result.copper = parseInt(amount);
      else if (name === "银币") result.silver = parseInt(amount);
      else if (name === "金币") result.gold   = parseInt(amount);
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
// ② 每日签到模式（由 task_local 定时触发）
// ====================================================

async function checkCookieValid(cookie) {
  try {
    const res  = await httpGet(DAILY_URL, buildHeaders(cookie));
    const body = res.body || "";
    const loc  = (res.headers && res.headers["location"]) || "";
    if (body.includes("/signin") || loc.includes("/signin")) return false;
    if (body.includes("登出") || body.includes("/signout"))  return true;
    return true;
  } catch (e) {
    console.log(`${SCRIPT_TAG} 检测 Cookie 出错: ${e}`);
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
    console.log(`${SCRIPT_TAG} 获取 Once Code 失败: ${e}`);
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

async function signInOnce(cookie, idx, total) {
  const prefix = total > 1 ? `账号${idx + 1} ` : "";

  const isValid = await checkCookieValid(cookie);
  if (!isValid) {
    notify(`V2EX签到 ${prefix}❌`, "Cookie 已失效", "请打开 v2ex.com 重新登录，Cookie 将自动更新");
    return;
  }

  const { onceCode, alreadyClaimed, cookieExpired } = await getOnceCode(cookie);

  if (cookieExpired) {
    notify(`V2EX签到 ${prefix}❌`, "Cookie 已失效", "请打开 v2ex.com 重新登录，Cookie 将自动更新");
    return;
  }
  if (alreadyClaimed) {
    const balance = await getBalance(cookie);
    notify(`V2EX签到 ${prefix}`, "今日已签到", formatBalance(balance));
    return;
  }
  if (!onceCode) {
    notify(`V2EX签到 ${prefix}❌`, "未获取到 Once Code", "请检查 Cookie 是否有效");
    return;
  }

  const result = await redeemReward(cookie, onceCode);

  if (result.success) {
    const balance  = await getBalance(cookie);
    const subtitle = result.message ? `提示: ${result.message}` : "每日奖励领取成功";
    notify(`V2EX签到 ${prefix}✅`, subtitle, formatBalance(balance));
  } else {
    const msgs = {
      cookie_expired: ["Cookie 已失效", "请打开 v2ex.com 重新登录，Cookie 将自动更新"],
      network_error:  ["网络请求失败",   result.error || "请检查网络连接"],
      unknown:        [`状态码: ${result.statusCode || "N/A"}`, "请登录 V2EX 手动确认"],
    };
    const [subtitle, body] = msgs[result.reason] || ["签到失败", "请登录 V2EX 手动确认"];
    notify(`V2EX签到 ${prefix}❌`, subtitle, body);
  }
}

async function main() {
  const rawCookie = getCookie();

  if (!rawCookie) {
    notify(
      "V2EX签到 ⚠️",
      "尚未获取到 Cookie",
      "请先用浏览器打开 v2ex.com 并登录，Cookie 将自动保存"
    );
    $done({});
    return;
  }

  const cookies = rawCookie.split("\n").map(c => c.trim()).filter(Boolean);
  console.log(`${SCRIPT_TAG} 共 ${cookies.length} 个账号`);

  for (let i = 0; i < cookies.length; i++) {
    await signInOnce(cookies[i], i, cookies.length);
    if (i < cookies.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  $done({});
}
