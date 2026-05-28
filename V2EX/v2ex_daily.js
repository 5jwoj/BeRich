/**
 * V2EX 每日登录签到
 * =====================================================
 * 版本: 1.1.0
 * 功能: 自动领取 V2EX 每日登录奖励，并推送余额信息
 * BoxJS 订阅: 见同目录 v2ex_daily.boxjs.json
 * =====================================================
 *
 * 【Quantumult X 配置】
 * -------------------------------------------------------
 * [task_local]
 * # 每天早上 8 点签到
 * 0 8 * * * v2ex_daily.js, tag=V2EX签到, img-url=https://www.v2ex.com/favicon.ico, enabled=true
 *
 * =====================================================
 * Cookie 配置方式（BoxJS）：
 *   安装 BoxJS → 添加订阅 v2ex_daily.boxjs.json
 *   → 在 BoxJS 面板中填写 V2EX Cookie 即可
 *   多账号：多个 Cookie 用「英文换行符 \n」分隔填写
 * =====================================================
 */

// ====================================================
// BoxJS Key 定义（与 v2ex_daily.boxjs.json 中保持一致）
// ====================================================
const BOXJS_KEY_COOKIE = "v2ex_daily.cookie";
const BOXJS_KEY_UA     = "v2ex_daily.ua";

// ====================================================
// 脚本常量配置
// ====================================================
const SCRIPT_TAG  = "[V2EX签到]";
const BASE_URL    = "https://www.v2ex.com";
const DAILY_URL   = `${BASE_URL}/mission/daily`;
const BALANCE_URL = `${BASE_URL}/balance`;
const DEFAULT_UA  = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ====================================================
// BoxJS 持久化读取
// ====================================================

/**
 * 读取 BoxJS 中配置的 Cookie
 * key: v2ex_daily.cookie
 */
function getCookie() {
  const val = $persistentStore.read(BOXJS_KEY_COOKIE);
  return val ? val.trim() : null;
}

/**
 * 读取 BoxJS 中配置的 UserAgent（可选，未配置则使用默认值）
 * key: v2ex_daily.ua
 */
function getUA() {
  const val = $persistentStore.read(BOXJS_KEY_UA);
  return (val && val.trim()) ? val.trim() : DEFAULT_UA;
}

// ====================================================
// 工具函数
// ====================================================

/**
 * 封装 $task.fetch 为 Promise
 */
function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    $task.fetch({
      url: url,
      method: "GET",
      headers: headers,
    }).then(
      (response) => resolve(response),
      (reason)   => reject(reason)
    );
  });
}

/**
 * 构建请求头
 */
function buildHeaders(cookie) {
  return {
    "User-Agent":      getUA(),
    "Cookie":          cookie,
    "Referer":         DAILY_URL,
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  };
}

/**
 * 发送系统通知
 */
function notify(title, subtitle, body) {
  console.log(`${SCRIPT_TAG} ${title} | ${subtitle} | ${body}`);
  $notify(title, subtitle, body);
}

/**
 * 从 HTML 中提取 once code
 */
function extractOnceCode(html) {
  const match = html.match(/\/mission\/daily\/redeem\?once=(\d+)/);
  return match ? match[1] : null;
}

/**
 * 解析账户余额信息
 * 兼容 balance_area 图片/文本格式 及旧版 span.balance_l 格式
 */
function parseBalance(html) {
  const result = { copper: null, silver: null, gold: null };

  // 策略 1：balance_area 区域
  const areaMatch = html.match(/<a href="\/balance" class="balance_area"[^>]*>([\s\S]*?)<\/a>/);
  if (areaMatch) {
    const content = areaMatch[1];

    // 图片格式：数字 + <img alt="S/B/G">
    const imgItems = [...content.matchAll(/(\d+)\s*<img[^>]+alt="([^"]+)"/g)];
    for (const [, amount, alt] of imgItems) {
      const key = alt.trim().toUpperCase();
      if (["B", "BRONZE", "铜币"].includes(key)) result.copper = parseInt(amount);
      else if (["S", "SILVER", "银币"].includes(key)) result.silver = parseInt(amount);
      else if (["G", "GOLD",   "金币"].includes(key)) result.gold   = parseInt(amount);
    }

    // 文本格式：数字 + 铜币/银币/金币
    if (result.copper === null && result.silver === null && result.gold === null) {
      const textItems = [...content.matchAll(/(\d+)\s*(铜币|银币|金币)/g)];
      for (const [, amount, name] of textItems) {
        if (name === "铜币") result.copper = parseInt(amount);
        else if (name === "银币") result.silver = parseInt(amount);
        else if (name === "金币") result.gold   = parseInt(amount);
      }
    }
  }

  // 策略 2：旧版 span.balance_l
  if (result.copper === null && result.silver === null && result.gold === null) {
    const spanItems = [...html.matchAll(/<span class="balance_l">\s*(\d+)\s*<\/span>[\s\S]*?(铜币|银币|金币)/g)];
    for (const [, amount, name] of spanItems) {
      if (name === "铜币") result.copper = parseInt(amount);
      else if (name === "银币") result.silver = parseInt(amount);
      else if (name === "金币") result.gold   = parseInt(amount);
    }
  }

  return result;
}

/**
 * 格式化余额为可读字符串
 */
function formatBalance(balance) {
  const { copper, silver, gold } = balance;

  if (copper === null && silver === null && gold === null) {
    return "⚠️ 无法获取账户余额";
  }

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
// 核心业务逻辑
// ====================================================

/**
 * 检测 Cookie 是否有效
 */
async function checkCookieValid(cookie) {
  console.log(`${SCRIPT_TAG} 正在检测 Cookie 有效性...`);
  try {
    const response = await httpGet(DAILY_URL, buildHeaders(cookie));
    const body = response.body || "";
    const location = (response.headers && response.headers["location"]) || "";

    if (body.includes("/signin") || location.includes("/signin")) {
      console.log(`${SCRIPT_TAG} Cookie 已失效（检测到登录页跳转）`);
      return false;
    }
    if (body.includes("登出") || body.includes("/signout")) {
      console.log(`${SCRIPT_TAG} Cookie 有效`);
      return true;
    }
    console.log(`${SCRIPT_TAG} Cookie 状态不明确，尝试继续执行`);
    return true;
  } catch (e) {
    console.log(`${SCRIPT_TAG} 检测 Cookie 时出错: ${e}`);
    return true;
  }
}

/**
 * 获取签到页面 Once Code
 * 返回：{ onceCode, alreadyClaimed, cookieExpired }
 */
async function getOnceCode(cookie) {
  console.log(`${SCRIPT_TAG} 正在获取 Once Code...`);
  try {
    const response = await httpGet(DAILY_URL, buildHeaders(cookie));
    const body = response.body || "";

    if (body.includes("/signin")) {
      return { onceCode: null, alreadyClaimed: false, cookieExpired: true };
    }
    if (body.includes("每日登录奖励已领取")) {
      return { onceCode: null, alreadyClaimed: true, cookieExpired: false };
    }

    const onceCode = extractOnceCode(body);
    if (onceCode) {
      console.log(`${SCRIPT_TAG} 成功获取 Once Code: ${onceCode}`);
      return { onceCode, alreadyClaimed: false, cookieExpired: false };
    }

    console.log(`${SCRIPT_TAG} 未能找到 Once Code`);
    return { onceCode: null, alreadyClaimed: false, cookieExpired: false };
  } catch (e) {
    console.log(`${SCRIPT_TAG} 获取 Once Code 失败: ${e}`);
    return { onceCode: null, alreadyClaimed: false, cookieExpired: false };
  }
}

/**
 * 查询账户余额
 */
async function getBalance(cookie) {
  console.log(`${SCRIPT_TAG} 正在查询账户余额...`);
  try {
    const response = await httpGet(BALANCE_URL, buildHeaders(cookie));
    return parseBalance(response.body || "");
  } catch (e) {
    console.log(`${SCRIPT_TAG} 查询余额失败: ${e}`);
    return { copper: null, silver: null, gold: null };
  }
}

/**
 * 执行签到领取
 */
async function redeemReward(cookie, onceCode) {
  const redeemUrl = `${BASE_URL}/mission/daily/redeem?once=${onceCode}`;
  console.log(`${SCRIPT_TAG} 正在领取每日奖励，URL: ${redeemUrl}`);

  try {
    const response = await httpGet(redeemUrl, buildHeaders(cookie));
    const body = response.body || "";

    if (body.includes("/signin") || body.includes("请重新登录")) {
      return { success: false, reason: "cookie_expired" };
    }
    if (body.includes("每日登录奖励已领取") || body.includes("已成功领取每日登录奖励")) {
      return { success: true, reason: "claimed" };
    }

    const msgMatch = body.match(/<div class="box">\s*<div class="message">([\s\S]*?)<\/div>/);
    if (msgMatch) {
      return { success: true, reason: "message", message: msgMatch[1].trim() };
    }

    return { success: false, reason: "unknown", statusCode: response.statusCode };
  } catch (e) {
    console.log(`${SCRIPT_TAG} 领取请求失败: ${e}`);
    return { success: false, reason: "network_error", error: String(e) };
  }
}

/**
 * 单账号签到主流程
 */
async function signInOnce(cookie, accountIndex, totalAccounts) {
  const prefix = totalAccounts > 1 ? `账号${accountIndex + 1} ` : "";

  // 1. 检查 Cookie 有效性
  const isValid = await checkCookieValid(cookie);
  if (!isValid) {
    notify(
      `${SCRIPT_TAG} ${prefix}Cookie 失效`,
      "请在 BoxJS 中更新 Cookie",
      "V2EX Cookie 已失效，请重新登录并在 BoxJS 面板更新"
    );
    return;
  }

  // 2. 获取 Once Code
  const { onceCode, alreadyClaimed, cookieExpired } = await getOnceCode(cookie);

  if (cookieExpired) {
    notify(
      `${SCRIPT_TAG} ${prefix}Cookie 失效`,
      "请在 BoxJS 中更新 Cookie",
      "访问签到页面时 Cookie 已失效，请重新登录"
    );
    return;
  }

  if (alreadyClaimed) {
    const balance = await getBalance(cookie);
    notify(
      `${SCRIPT_TAG} ${prefix}今日已签到`,
      "无需重复操作",
      formatBalance(balance)
    );
    return;
  }

  if (!onceCode) {
    notify(
      `${SCRIPT_TAG} ${prefix}签到失败`,
      "未获取到 Once Code",
      "请检查 Cookie 是否有效，或登录 V2EX 手动确认"
    );
    return;
  }

  // 3. 执行领取
  const result = await redeemReward(cookie, onceCode);

  if (result.success) {
    // 4. 查询最新余额
    const balance = await getBalance(cookie);
    const subtitle = result.message ? `提示: ${result.message}` : "每日奖励领取成功";
    notify(
      `${SCRIPT_TAG} ${prefix}签到成功 ✅`,
      subtitle,
      formatBalance(balance)
    );
  } else {
    let subtitle = "签到失败";
    let body = "";
    switch (result.reason) {
      case "cookie_expired":
        subtitle = "Cookie 已失效";
        body = "请在 BoxJS 面板中重新填写 V2EX Cookie";
        break;
      case "network_error":
        subtitle = "网络请求失败";
        body = result.error || "请检查网络连接";
        break;
      case "unknown":
        subtitle = `结果不明确（状态码: ${result.statusCode || "N/A"}）`;
        body = "请登录 V2EX 手动确认签到状态";
        break;
      default:
        body = "请登录 V2EX 手动确认签到状态";
    }
    notify(`${SCRIPT_TAG} ${prefix}签到失败 ❌`, subtitle, body);
  }
}

// ====================================================
// 主入口
// ====================================================
async function main() {
  // 从 BoxJS 读取 Cookie
  const rawCookie = getCookie();

  if (!rawCookie) {
    notify(
      `${SCRIPT_TAG} 配置错误`,
      "未找到 Cookie",
      "请打开 BoxJS → V2EX 每日签到 → 填写你的 V2EX Cookie"
    );
    $done({});
    return;
  }

  // 支持多账号（换行分隔）
  const cookies = rawCookie.split("\n").map(c => c.trim()).filter(c => c.length > 0);
  console.log(`${SCRIPT_TAG} 共检测到 ${cookies.length} 个账号`);

  for (let i = 0; i < cookies.length; i++) {
    await signInOnce(cookies[i], i, cookies.length);

    // 多账号间隔 3 秒，避免请求过于频繁
    if (i < cookies.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  $done({});
}

main().catch((e) => {
  console.log(`${SCRIPT_TAG} 脚本执行出错: ${e}`);
  $notify("[V2EX签到] 脚本错误", "执行出错", String(e));
  $done({});
});
