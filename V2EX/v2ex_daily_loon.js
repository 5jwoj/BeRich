/*
 * V2EX 每日签到 & Cookie 自动捕获 - Loon 专用版 v1.0.10
 *
 * 仓库: https://github.com/5jwoj/BeRich/tree/main/V2EX
 *
 * ===== v1.0.10 修复清单 =====
 *  1. $httpClient 的 timeout 单位是「毫秒」(Loon 官方文档, 默认 5000)，
 *     旧版按「秒」传 30 = 30ms，签到请求必然超时。现改为 10000ms。
 *  2. 指定代理策略的参数是 node，不是 policy。旧版 options["policy"] 被 Loon 忽略，
 *     BoxJS 里填的策略名从未生效。现改为 options.node。
 *  3. 显式关闭 auto-redirect / auto-cookie，自己判断 302 与 Set-Cookie，
 *     避免 Loon 用匿名会话的 PB3_SESSION 改写手工传入的登录 Cookie。
 *  4. 脚本自身发出的请求带 X-V2EX-Script: 1 标记，捕获脚本见到即跳过，
 *     避免「自己抓自己」把签到请求误当浏览器请求处理。
 *  5. http-response 只在 Set-Cookie 含 A2/A 时才写入。V2EX 每个响应都会下发
 *     PB3_SESSION / V2EX_LANG，旧版无条件合并会污染已保存的登录 Cookie。
 *  6. 区分「网络错误」与「Cookie 失效」：网络异常不再被吞掉后误报
 *     「请检查 Cookie 是否有效」，通知里直接显示真实错误。
 *  7. 多账号 Cookie 按 A2 值定位行更新，不再被响应合并逻辑打乱换行分隔。
 *  8. 移除默认开启的 www 域名回退（www 在 MitM 列表内，会把 v1.0.7 修掉的
 *     127.0.0.1 自劫持问题带回来）；需要时把 ENABLE_DOMAIN_FALLBACK 改成 true。
 *
 * BoxJS 可配置项:
 *   v2ex_daily.cookie  Cookie（自动捕获，也可手动填，多账号用换行分隔）
 *   v2ex_daily.ua      自定义 UA（建议留空，留空时用自动捕获的浏览器 UA；
 *                      填错会导致 cf_clearance 与 UA 不匹配而被 Cloudflare 拦）
 *   v2ex_daily.policy  出口节点 / 策略组名 / DIRECT（对应 Loon 的 node 参数）
 */

// ====================================================
// 键名与常量
// ====================================================
const BOXJS_KEY_COOKIE      = "v2ex_daily.cookie";
const BOXJS_KEY_UA          = "v2ex_daily.ua";
const BOXJS_KEY_UA_CAPTURED = "v2ex_daily.ua_captured";
const BOXJS_KEY_POLICY      = "v2ex_daily.policy";

const SCRIPT_NAME = "V2EX签到";
const SCRIPT_TAG  = "[V2EX-Loon v1.0.10]";

// 出站用不带 www 的域名：www.v2ex.com 在 [Mitm] 列表内，
// 脚本的 $httpClient 请求走该域会被 Loon 本地 MitM 处理器拦截。
const BASE_URL    = "https://v2ex.com";
const DAILY_URL   = BASE_URL + "/mission/daily";
const BALANCE_URL = BASE_URL + "/balance";

// 自身请求标记，供捕获逻辑识别并跳过
const SELF_HEADER = "X-V2EX-Script";
const SELF_VALUE  = "1";

const DEFAULT_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const HTTP_TIMEOUT_MS       = 10000; // 毫秒！Loon $httpClient 的单位
const MAX_RETRIES           = 3;
const RETRY_DELAY_MS        = 2000;
const ENABLE_DOMAIN_FALLBACK = false; // 见修复清单第 8 条

const SESSION_KEYS  = ["A2", "A"];
const COOKIE_ATTRS  = ["path", "domain", "expires", "max-age", "secure", "httponly", "samesite"];

// ====================================================
// 通用工具
// ====================================================
function log(msg) {
  try { console.log(SCRIPT_TAG + " " + msg); } catch (e) {}
}

function notify(title, subtitle, body) {
  const s = String(subtitle || "");
  const b = String(body || "");
  log("[通知] " + title + " | " + s + " | " + b);
  try { $notification.post(title, s, b); } catch (e) { log("通知发送失败: " + e); }
}

function read(key) {
  try { return $persistentStore.read(key) || ""; } catch (e) { return ""; }
}

function write(key, val) {
  try { return $persistentStore.write(String(val), key); }
  catch (e) { log("写入 " + key + " 失败: " + e); return false; }
}

function shorten(s, n) {
  const lim = n || 200;
  const str = String(s == null ? "" : s).replace(/\s+/g, " ");
  return str.length > lim ? str.slice(0, lim) + "…" : str;
}

function stripTags(s) {
  return String(s || "").replace(/<script[\s\S]*?<\/script>/gi, " ")
                         .replace(/<[^>]+>/g, " ")
                         .replace(/\s+/g, " ")
                         .trim();
}

// 响应头 key 大小写不敏感
function header(obj, name) {
  if (!obj) return "";
  const target = name.toLowerCase();
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === target) return obj[k] == null ? "" : String(obj[k]);
  }
  return "";
}

function getRawHeader(obj, name) {
  if (!obj) return "";
  const target = name.toLowerCase();
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === target) return obj[k];
  }
  return "";
}

function isSelf(headers) {
  return header(headers, SELF_HEADER) === SELF_VALUE;
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

function netError(msg) {
  const e = new Error(msg);
  e.isNetwork = true;
  return e;
}

// ====================================================
// Cookie 解析与多账号存储
// ====================================================
function hasSession(cookieStr) {
  return String(cookieStr || "")
    .split(";")
    .map(function (p) { return p.trim().split("=")[0]; })
    .some(function (k) { return SESSION_KEYS.indexOf(k) >= 0; });
}

function sessionKey(cookieStr) {
  for (const k of SESSION_KEYS) {
    const m = String(cookieStr || "").match(new RegExp("(?:^|;\\s*)" + k + "=([^;]+)"));
    if (m) return k + ":" + m[1];
  }
  return "";
}

function parseCookieLine(line) {
  const pairs = {};
  for (const part of String(line || "").split(";")) {
    const p = part.trim();
    const i = p.indexOf("=");
    if (i > 0) pairs[p.slice(0, i).trim()] = p;
  }
  return pairs;
}

function pairsToString(pairs) {
  return Object.keys(pairs).map(function (k) { return pairs[k]; }).join("; ");
}

// 按 A2 定位账号行：同账号覆盖，新账号追加，不破坏换行分隔
function mergeCookieIntoStore(newLine) {
  newLine = String(newLine || "").trim();
  const raw = read(BOXJS_KEY_COOKIE).trim();
  if (!raw) {
    write(BOXJS_KEY_COOKIE, newLine);
    return { changed: true, count: 1 };
  }
  const lines = raw.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
  const key = sessionKey(newLine);
  let idx = -1;
  if (key) idx = lines.findIndex(function (l) { return sessionKey(l) === key; });
  if (idx < 0 && lines.length === 1) idx = 0; // 单账号模式直接替换
  if (idx >= 0) {
    if (lines[idx] === newLine) return { changed: false, count: lines.length };
    lines[idx] = newLine;
  } else {
    lines.push(newLine);
  }
  write(BOXJS_KEY_COOKIE, lines.join("\n"));
  return { changed: true, count: lines.length };
}

// Set-Cookie 可能是数组，也可能是逗号拼接的字符串
function parseSetCookie(raw) {
  const pairs = {};
  const list = Array.isArray(raw)
    ? raw
    : String(raw || "").split(/,\s*(?=[A-Za-z_][A-Za-z0-9_-]*=)/);
  for (const item of list) {
    const first = String(item).split(";")[0].trim();
    const i = first.indexOf("=");
    if (i <= 0) continue;
    const k = first.slice(0, i).trim();
    if (COOKIE_ATTRS.indexOf(k.toLowerCase()) >= 0) continue;
    pairs[k] = first;
  }
  return pairs;
}

// ====================================================
// ① 请求头捕获（浏览器已登录访问任意页面时）
// ====================================================
function captureRequestCookie() {
  const headers = ($request && $request.headers) || {};
  const cookie  = header(headers, "Cookie").trim();
  const ua      = header(headers, "User-Agent").trim();

  log("[请求捕获] URL=" + ($request.url || "") + " Cookie长度=" + cookie.length);

  if (cookie.length < 10) {
    log("[请求捕获] Cookie 为空或过短，跳过");
    return;
  }
  if (!hasSession(cookie)) {
    log("[请求捕获] 未检测到 A2/A 登录凭据，跳过（避免写入匿名会话）");
    return;
  }
  // cf_clearance 与 UA 绑定，签到时必须复用浏览器 UA
  if (ua) write(BOXJS_KEY_UA_CAPTURED, ua);

  const r = mergeCookieIntoStore(cookie);
  if (r.changed) {
    notify(SCRIPT_NAME + " ✅", "Cookie 已自动保存（请求头）",
           "当前账号数 " + r.count + "，每日 08:00 自动签到");
  } else {
    log("[请求捕获] Cookie 未变化，无需写入");
  }
}

// ====================================================
// ② 响应头捕获（浏览器提交登录表单时）
// ====================================================
function captureResponseCookie() {
  const reqHeaders = ($request && $request.headers) || {};
  const respHeaders = ($response && $response.headers) || {};
  const rawSetCookie = getRawHeader(respHeaders, "Set-Cookie");

  if (!rawSetCookie) {
    log("[响应捕获] 无 Set-Cookie 响应头");
    return;
  }

  const pairs = parseSetCookie(rawSetCookie);
  const keys = Object.keys(pairs);
  log("[响应捕获] Set-Cookie 字段: " + (keys.join(", ") || "(无)"));

  // 关键修复：V2EX 每个响应都会下发 PB3_SESSION / V2EX_LANG。
  // 只有真正下发登录凭据 A2/A 时才允许写入，否则会把保存的会话覆盖成匿名会话。
  const hasNewSession = SESSION_KEYS.some(function (k) { return k in pairs; });
  if (!hasNewSession) {
    log("[响应捕获] 未下发 A2/A，跳过写入（防止 PB3_SESSION 覆盖登录 Cookie）");
    return;
  }

  const storeRaw = read(BOXJS_KEY_COOKIE).trim();
  const lines = storeRaw
    ? storeRaw.split("\n").map(function (s) { return s.trim(); }).filter(Boolean)
    : [];
  // 单账号时以现有行为基础合并字段；多账号且无法定位时新建一行
  const baseLine = lines.length === 1 ? lines[0] : "";
  const mergedLine = pairsToString(Object.assign(parseCookieLine(baseLine), pairs));
  const r = mergeCookieIntoStore(mergedLine);

  const ua = header(reqHeaders, "User-Agent").trim();
  if (ua) write(BOXJS_KEY_UA_CAPTURED, ua);

  if (r.changed) {
    notify(SCRIPT_NAME + " ✅", "登录成功：Cookie 已自动保存",
           "当前账号数 " + r.count + "，每日 08:00 自动签到");
  }
}

// ====================================================
// ③ 网络请求封装
// ====================================================
function getStoredCookie() {
  return read(BOXJS_KEY_COOKIE).trim();
}

function getStoredUA() {
  const custom = read(BOXJS_KEY_UA).trim();
  if (custom) return custom;
  const captured = read(BOXJS_KEY_UA_CAPTURED).trim();
  return captured || DEFAULT_UA;
}

function getStoredPolicy() {
  return read(BOXJS_KEY_POLICY).trim();
}

function buildHeaders(cookie) {
  const h = {
    "User-Agent":      getStoredUA(),
    "Cookie":          cookie,
    "Referer":         "https://www.v2ex.com/mission/daily",
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
  };
  h[SELF_HEADER] = SELF_VALUE;
  return h;
}

function httpGet(url, headers) {
  return new Promise(function (resolve, reject) {
    const options = {
      url: url,
      headers: headers,
      timeout: HTTP_TIMEOUT_MS,
      "auto-redirect": false,
      "auto-cookie": false,
      insecure: true
    };
    const policy = getStoredPolicy();
    if (policy) {
      options.node = policy; // Loon 用 node，不是 policy
      log("[请求] 指定 node: " + policy);
    }
    log("[请求] GET " + url + " timeout=" + HTTP_TIMEOUT_MS + "ms");

    $httpClient.get(options, function (err, resp, body) {
      if (err) {
        reject(netError("请求失败: " + shorten(String(err), 160)));
        return;
      }
      const status = resp ? (resp.status || resp.statusCode || 0) : 0;
      const respHeaders = (resp && resp.headers) || {};
      log("[响应] HTTP " + status +
          " body=" + (body ? String(body).length : 0) + "B" +
          " location=" + shorten(header(respHeaders, "location"), 80));
      resolve({
        statusCode: status,
        headers: respHeaders,
        body: typeof body === "string" ? body : (body ? String(body) : "")
      });
    });
  });
}

async function httpGetWithRetry(url, headers) {
  let lastErr = null;
  for (let i = 1; i <= MAX_RETRIES; i++) {
    try {
      return await httpGet(url, headers);
    } catch (e) {
      lastErr = e;
      log("[重试 " + i + "/" + MAX_RETRIES + "] " + shorten(e && e.message ? e.message : e, 160));
      if (i < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
    }
  }

  if (ENABLE_DOMAIN_FALLBACK) {
    const alt = url.indexOf("//www.v2ex.com") >= 0
      ? url.replace("//www.v2ex.com", "//v2ex.com")
      : url.replace("//v2ex.com", "//www.v2ex.com");
    if (alt !== url) {
      log("[域名回退] " + alt + "（注意：www 域在 MitM 列表内，可能被本地处理器拦截）");
      try { return await httpGet(alt, headers); }
      catch (e) { lastErr = e; }
    }
  }
  throw lastErr || netError("未知网络错误");
}

// 手动跟随重定向：兑换成功后 V2EX 会 302 回 /mission/daily，
// 不能把这种 302 当成 Cookie 失效；遇到 /signin 则停下交给上层判断。
async function httpGetFollow(url, headers, maxHop) {
  let res = await httpGetWithRetry(url, headers);
  let hops = 0;
  const limit = maxHop || 2;
  while (res.statusCode >= 300 && res.statusCode < 400 && hops < limit) {
    const loc = header(res.headers, "location");
    if (!loc || loc.indexOf("/signin") >= 0) break;
    const next = loc.indexOf("http") === 0
      ? loc
      : BASE_URL + (loc.indexOf("/") === 0 ? loc : "/" + loc);
    log("[跟随重定向] " + next);
    res = await httpGetWithRetry(next, headers);
    hops++;
  }
  return res;
}

// ====================================================
// ④ 页面解析
// ====================================================
function extractOnceCode(html) {
  const m = String(html || "").match(/\/mission\/daily\/redeem\?once=(\d+)/);
  return m ? m[1] : null;
}

function isSigninResponse(res) {
  const loc = header(res.headers, "location");
  if (loc.indexOf("/signin") >= 0) return true;
  const b = res.body || "";
  if (b.indexOf("请登录") >= 0 || b.indexOf("Sign In") >= 0) return true;
  if (b.indexOf("/signin") >= 0 && b.indexOf("/signout") < 0 &&
      b.indexOf("/mission/daily/redeem?once=") < 0) return true;
  return false;
}

// 用 exec 循环代替 matchAll，兼容较旧的 JavaScriptCore
function eachMatch(str, re, fn) {
  const r = new RegExp(re.source, "g");
  let m;
  while ((m = r.exec(str)) !== null) {
    fn(m);
    if (m[0] === "") r.lastIndex++;
  }
}

function parseBalance(html) {
  const result = { copper: null, silver: null, gold: null };
  const areaMatch = String(html || "").match(/<a href="\/balance" class="balance_area"[^>]*>([\s\S]*?)<\/a>/);
  if (areaMatch) {
    const content = areaMatch[1];
    eachMatch(content, /(\d+)\s*<img[^>]+alt="([^"]+)"/g, function (m) {
      const amount = m[1], key = m[2].trim().toUpperCase();
      if (["B", "BRONZE", "铜币"].indexOf(key) >= 0) result.copper = parseInt(amount, 10);
      else if (["S", "SILVER", "银币"].indexOf(key) >= 0) result.silver = parseInt(amount, 10);
      else if (["G", "GOLD", "金币"].indexOf(key) >= 0) result.gold = parseInt(amount, 10);
    });
    if (result.copper === null && result.silver === null && result.gold === null) {
      eachMatch(content, /(\d+)\s*(铜币|银币|金币)/g, function (m) {
        if (m[2] === "铜币") result.copper = parseInt(m[1], 10);
        else if (m[2] === "银币") result.silver = parseInt(m[1], 10);
        else result.gold = parseInt(m[1], 10);
      });
    }
  }
  if (result.copper === null && result.silver === null && result.gold === null) {
    eachMatch(String(html || ""), /<span class="balance_l">\s*(\d+)\s*<\/span>[\s\S]*?(铜币|银币|金币)/g, function (m) {
      if (m[2] === "铜币") result.copper = parseInt(m[1], 10);
      else if (m[2] === "银币") result.silver = parseInt(m[1], 10);
      else result.gold = parseInt(m[1], 10);
    });
  }
  return result;
}

function formatBalance(balance) {
  if (!balance) return "余额查询失败（不影响签到结果）";
  const copper = balance.copper, silver = balance.silver, gold = balance.gold;
  if (copper === null && silver === null && gold === null) return "⚠️ 无法解析账户余额";
  const parts = [];
  if (gold !== null) parts.push(gold + " 金币");
  if (silver !== null) parts.push(silver + " 银币");
  if (copper !== null) parts.push(copper + " 铜币");
  let total = 0;
  if (gold !== null) total += gold * 10000;
  if (silver !== null) total += silver * 100;
  if (copper !== null) total += copper;
  let str = "账户余额: " + parts.join(" | ");
  if (total > 0) str += "\n总额(铜币当量): " + total;
  return str;
}

async function getBalance(cookie) {
  try {
    const res = await httpGetFollow(BALANCE_URL, buildHeaders(cookie));
    if (res.statusCode >= 400 || isSigninResponse(res)) return null;
    return parseBalance(res.body);
  } catch (e) {
    log("[余额] 查询失败: " + shorten(e && e.message ? e.message : e, 120));
    return null;
  }
}

// ====================================================
// ⑤ 签到主流程
// ====================================================
async function signInAccount(cookie, idx, total) {
  const prefix = total > 1 ? "账号" + (idx + 1) + " " : "";

  try {
    const res = await httpGetFollow(DAILY_URL, buildHeaders(cookie));

    if (isSigninResponse(res)) {
      notify(SCRIPT_NAME + " " + prefix + "❌", "Cookie 已失效（服务端要求登录）",
             "HTTP " + res.statusCode + "，请用手机浏览器重新登录 V2EX，Cookie 会自动更新");
      return;
    }
    if (res.statusCode >= 400) {
      notify(SCRIPT_NAME + " " + prefix + "❌", "站点返回 HTTP " + res.statusCode,
             "可能被 Cloudflare 拦截，请确认签到出口节点与抓包时一致。摘要: " + shorten(stripTags(res.body), 120));
      return;
    }
    if (!res.body) {
      notify(SCRIPT_NAME + " " + prefix + "❌", "签到页返回空内容",
             "HTTP " + res.statusCode + "，请查看脚本日志中的请求与响应记录");
      return;
    }
    if (res.body.indexOf("每日登录奖励已领取") >= 0) {
      const balance = await getBalance(cookie);
      notify(SCRIPT_NAME + " " + prefix, "今日已签到", formatBalance(balance));
      return;
    }

    const once = extractOnceCode(res.body);
    if (!once) {
      notify(SCRIPT_NAME + " " + prefix + "❌", "未获取到 Once Code",
             "HTTP " + res.statusCode + "，页面摘要: " + shorten(stripTags(res.body), 160));
      return;
    }
    log("[签到] once=" + once);

    const redeemUrl = BASE_URL + "/mission/daily/redeem?once=" + once;
    const rr = await httpGetFollow(redeemUrl, buildHeaders(cookie));

    if (isSigninResponse(rr)) {
      notify(SCRIPT_NAME + " " + prefix + "❌", "兑换时 Cookie 已失效",
             "HTTP " + rr.statusCode + "，请重新登录 V2EX");
      return;
    }
    if (rr.statusCode >= 400) {
      notify(SCRIPT_NAME + " " + prefix + "❌", "兑换失败 HTTP " + rr.statusCode,
             shorten(stripTags(rr.body), 160));
      return;
    }

    const body = rr.body || "";
    const ok = body.indexOf("每日登录奖励已领取") >= 0 ||
               body.indexOf("已成功领取每日登录奖励") >= 0 ||
               /<div class="box">\s*<div class="message">/.test(body);
    const balance = await getBalance(cookie);

    if (ok) {
      notify(SCRIPT_NAME + " " + prefix + "✅", "每日登录奖励领取成功", formatBalance(balance));
    } else {
      notify(SCRIPT_NAME + " " + prefix + "❌", "签到结果未确认",
             "HTTP " + rr.statusCode + "，请登录 V2EX 手动确认。摘要: " + shorten(stripTags(body), 160));
    }
  } catch (e) {
    const isNet = !!(e && e.isNetwork);
    notify(SCRIPT_NAME + " " + prefix + "❌",
           isNet ? "网络请求失败（与 Cookie 无关）" : "脚本执行出错",
           shorten(e && e.message ? e.message : e, 200) +
           (isNet ? " ｜ 请检查 Loon 节点/策略、DNS、MitM 设置，并查看脚本日志" : ""));
  }
}

async function main() {
  const raw = getStoredCookie();
  if (!raw) {
    notify(SCRIPT_NAME + " ⚠️", "尚未获取到 Cookie",
           "请用手机浏览器打开 www.v2ex.com 并登录，Cookie 将自动保存");
    return;
  }

  const cookies = raw.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
  log("检测到 " + cookies.length + " 个账号，UA=" + shorten(getStoredUA(), 70));

  for (let i = 0; i < cookies.length; i++) {
    if (!hasSession(cookies[i])) {
      notify(SCRIPT_NAME + " ❌", "账号" + (i + 1) + " 缺少 A2 登录凭据",
             "请用手机浏览器重新登录 V2EX，再访问任意页面补全 Cookie");
      continue;
    }
    await signInAccount(cookies[i], i, cookies.length);
    if (i < cookies.length - 1) await sleep(3000);
  }
}

// ====================================================
// 入口分发
//   http-response → 登录响应捕获
//   http-request  → 请求头 Cookie 捕获
//   无上下文      → cron 签到
// ====================================================
(function () {
  try {
    const hasResp = typeof $response !== "undefined" && $response !== null;
    const hasReq  = typeof $request !== "undefined" && $request !== null;
    const ctxHeaders = hasReq ? (($request && $request.headers) || {}) : {};

    if (isSelf(ctxHeaders)) {
      log("脚本自身发出的请求，跳过捕获逻辑");
      $done({});
      return;
    }

    if (hasResp) {
      captureResponseCookie();
      $done({});
      return;
    }
    if (hasReq) {
      captureRequestCookie();
      $done({});
      return;
    }

    main()
      .catch(function (e) {
        log("签到任务异常: " + (e && e.stack ? e.stack : e));
        notify(SCRIPT_NAME + " ❌", "脚本执行出错", shorten(e && e.message ? e.message : e, 200));
      })
      .then(function () { $done({}); });
  } catch (e) {
    log("入口异常: " + (e && e.stack ? e.stack : e));
    notify(SCRIPT_NAME + " ❌", "脚本执行出错", shorten(e && e.message ? e.message : e, 200));
    $done({});
  }
})();
