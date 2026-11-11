/*
 * V2EX 每日签到 & Cookie 自动捕获 - Loon 专用版 v1.0.12
 *
 * 仓库: https://github.com/5jwoj/BeRich/tree/main/V2EX
 *
 * ===== v1.0.12 修复：捕获链路不再「静默失败」 =====
 *  1. 请求头捕获不再死认 A2：SESSION_KEYS 增加 A20；PB3_SESSION 作为弱会话
 *     凭据也可保存（浏览器请求头里的那份就是当前会话）。仅当新请求缺 A2/A20
 *     且本地已存带 A2 的 Cookie 时才拒绝覆盖，防匿名会话污染。
 *  2. 所有捕获分支都会发通知：读不到 Cookie 头 / 无会话字段 / 疑似匿名 /
 *     Cookie 未变化，各有明确提示并带节流，不再只写 console.log。
 *     读不到请求头时直接提示「必须用 www.v2ex.com 且开启 MitM」。
 *  3. 签到不再因缺少 A2 直接跳过，改由服务端 302 /signin 判定真失效。
 *  4. 失效通知列出排查点：重新登录、固定 policy（PB3_SESSION 内含客户端 IP，
 *     换出口会被判会话无效）、UA 留空；日志打印脱敏后的 Cookie 字段名。
 *  5. cron 上下文若注入空 $request，不再被误判成捕获任务。
 *
 * ===== v1.0.11 修复 =====
 *  9. 余额解析重构：旧正则要求 <a href="/balance" class="balance_area"> 属性顺序
 *     完全一致且图标必须有 alt，V2EX 现多用 class="silver" / src 标识币种。
 *     现支持中英文单位、图标 alt/class/src/title、数字在图标前后、千分位、
 *     balance_l、无容器全页兜底；/balance 解析不出时回退解析签到页顶部余额区。
 * 10. 解析仍失败会打印 [余额诊断] 页面真实片段，并把前 4000 字符写入
 *     v2ex_daily.debug_balance，便于一次定位页面结构。
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
const SCRIPT_TAG  = "[V2EX-Loon v1.0.12]";

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

// 强登录凭据：V2EX 历来用 A2，部分版本用 A20 / A
const SESSION_KEYS      = ["A2", "A20", "A"];
// 弱会话凭据：PB3_SESSION 每次响应都会下发（含匿名），不能用来判断"已登录"；
// 但浏览器请求头里携带的那份就是当前会话，可作为捕获兜底保存。
const WEAK_SESSION_KEYS = ["PB3_SESSION"];
const COOKIE_ATTRS      = ["path", "domain", "expires", "max-age", "secure", "httponly", "samesite"];

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

// 同类提示在 seconds 秒内只弹一次，避免每次打开页面都刷屏
function notifyOnce(key, seconds, title, subtitle, body) {
  const storeKey = "v2ex_daily.notify." + key;
  const now = Date.now();
  const last = parseInt(read(storeKey), 10) || 0;
  if (now - last < seconds * 1000) {
    log("[通知抑制] " + key + "（" + seconds + "s 内已提示过）");
    return;
  }
  write(storeKey, String(now));
  notify(title, subtitle, body);
}

// 只列字段名不列值，方便日志排查又不泄露凭据
function cookieSummary(cookieStr) {
  const keys = String(cookieStr || "").split(";")
    .map(function (p) { return p.trim().split("=")[0]; })
    .filter(Boolean);
  return keys.join(",") || "(空)";
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

function hasWeakSession(cookieStr) {
  return String(cookieStr || "")
    .split(";")
    .map(function (p) { return p.trim().split("=")[0]; })
    .some(function (k) { return WEAK_SESSION_KEYS.indexOf(k) >= 0; });
}

function hasAnySession(cookieStr) {
  return hasSession(cookieStr) || hasWeakSession(cookieStr);
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
  const url     = ($request && $request.url) || "";

  log("[请求捕获] URL=" + url + " Cookie长度=" + cookie.length +
      " 字段=" + cookieSummary(cookie) + " 请求头数=" + Object.keys(headers).length);

  // ① 读不到 Cookie 头：多半是 MitM 没生效，或访问的是未解密的 v2ex.com（无 www）
  if (cookie.length < 10) {
    log("[请求捕获] 未读到 Cookie 请求头");
    notifyOnce("capture-no-header", 120, SCRIPT_NAME + " ⚠️", "未读取到 Cookie 请求头",
      "请用 https://www.v2ex.com/ （必须带 www）打开并登录；\n" +
      "确认 Loon 的 HTTPS 解密已开启、CA 证书已信任。\nURL: " + shorten(url, 90));
    return;
  }

  const strong = hasSession(cookie);
  const stored = read(BOXJS_KEY_COOKIE).trim();

  // ② 只有语言/偏好类字段，没有任何会话凭据
  if (!hasAnySession(cookie)) {
    log("[请求捕获] 无任何会话字段");
    notifyOnce("capture-no-session", 120, SCRIPT_NAME + " ⚠️", "浏览器未携带会话 Cookie",
      "当前字段: " + cookieSummary(cookie) + "。请先登录 V2EX 再刷新页面。");
    return;
  }

  // ③ 防污染：新请求没有 A2/A20，但本地已存有带 A2 的 Cookie → 保留原值
  if (!strong && stored && hasSession(stored)) {
    log("[请求捕获] 疑似匿名会话，保留原有 Cookie");
    notifyOnce("capture-anonymous", 120, SCRIPT_NAME + " ⚠️", "浏览器似乎已退出登录",
      "本次请求缺少 A2/A20（字段: " + cookieSummary(cookie) + "）。\n" +
      "为避免覆盖登录态，已保留原有 Cookie，请在浏览器重新登录 V2EX。");
    return;
  }

  // cf_clearance 与 UA 绑定，签到时必须复用浏览器 UA
  if (ua) write(BOXJS_KEY_UA_CAPTURED, ua);

  const r = mergeCookieIntoStore(cookie);
  if (r.changed) {
    notify(SCRIPT_NAME + (strong ? " ✅" : " ⚠️"),
           strong ? "Cookie 已自动保存" : "Cookie 已保存（未检测到 A2/A20）",
           "字段: " + cookieSummary(cookie) + "\n账号数 " + r.count +
           (strong ? "" : "\n若签到仍提示失效，请在浏览器确认已登录。"));
  } else {
    log("[请求捕获] Cookie 未变化，无需写入");
    notifyOnce("capture-same", 300, SCRIPT_NAME + " ✅", "Cookie 已确认（无变化）",
      "字段: " + cookieSummary(cookie) + "。无需重新抓包，可直接运行签到。");
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
    notifyOnce("resp-no-header", 300, SCRIPT_NAME + " ⚠️", "登录响应没有 Set-Cookie",
      "可能被 Cloudflare 拦截，或登录表单未真正提交。请求头捕获仍可正常工作。");
    return;
  }

  const pairs = parseSetCookie(rawSetCookie);
  const keys = Object.keys(pairs);
  log("[响应捕获] Set-Cookie 字段: " + (keys.join(", ") || "(无)"));

  // 关键修复：V2EX 每个响应都会下发 PB3_SESSION / V2EX_LANG。
  // 只有真正下发登录凭据 A2/A20/A 时才允许写入，否则会把保存的会话覆盖成匿名会话。
  const hasNewSession = SESSION_KEYS.some(function (k) { return k in pairs; });
  if (!hasNewSession) {
    log("[响应捕获] 未下发 A2/A20/A，跳过写入（防止 PB3_SESSION 覆盖登录 Cookie）");
    notifyOnce("resp-no-session", 300, SCRIPT_NAME + " ⚠️", "登录响应未下发登录凭据",
      "本次 Set-Cookie 字段: " + (keys.join(", ") || "(无)") +
      "。常见原因：验证码/二次验证未通过、密码错误、被 Cloudflare 拦截。\n" +
      "只要浏览器已登录，直接刷新任意页面即可由请求头捕获补上 Cookie。");
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
  const flags = "g" + (re.ignoreCase ? "i" : "") + (re.multiline ? "m" : "");
  const r = new RegExp(re.source, flags);
  let m;
  while ((m = r.exec(str)) !== null) {
    fn(m);
    if (m[0] === "") r.lastIndex++;
  }
}

// 取标签上的某个属性，兼容单双引号与任意属性顺序
function attrOf(tag, name) {
  const m = String(tag).match(new RegExp(name + "\\s*=\\s*([\"'])(.*?)\\1", "i"));
  return m ? m[2] : "";
}

// 从 alt / class / src / title / 文本里判断币种
function currencyOf(s) {
  const t = String(s || "").toLowerCase();
  if (t.indexOf("金币") >= 0 || t.indexOf("gold") >= 0) return "gold";
  if (t.indexOf("银币") >= 0 || t.indexOf("silver") >= 0) return "silver";
  if (t.indexOf("铜币") >= 0 || t.indexOf("bronze") >= 0 || t.indexOf("copper") >= 0) return "copper";
  if (/(^|[^a-z0-9])g([^a-z0-9]|$)/.test(t)) return "gold";
  if (/(^|[^a-z0-9])s([^a-z0-9]|$)/.test(t)) return "silver";
  if (/(^|[^a-z0-9])b([^a-z0-9]|$)/.test(t)) return "copper";
  return null;
}

// 把货币图标替换成 {{copper}}/{{silver}}/{{gold}} 标记，再去掉其余标签，
// 这样数字在图标前 / 图标后、属性顺序、单双引号都能统一处理
function normalizeBalanceText(html) {
  let s = String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<img\b[^>]*>/gi, function (tag) {
    const kind = currencyOf(attrOf(tag, "alt")) ||
                 currencyOf(attrOf(tag, "class")) ||
                 currencyOf(attrOf(tag, "src")) ||
                 currencyOf(attrOf(tag, "title"));
    return kind ? " {{" + kind + "}} " : " ";
  });
  s = s.replace(/<[^>]*>/g, " ")
       .replace(/&nbsp;|&#160;/gi, " ")
       .replace(/&[a-z]+;/gi, " ")
       .replace(/\s+/g, " ");
  return s;
}

function allBalanceNull(p) {
  return !p || (p.copper === null && p.silver === null && p.gold === null);
}

// v1.0.11：不再依赖固定属性顺序与 alt，支持中英文、图标 class/src、
// 数字在图标前后、千分位逗号、balance_l、以及全页兜底
function parseBalance(html) {
  const raw = String(html || "");
  const result = { copper: null, silver: null, gold: null };

  function set(kind, val) {
    if (!kind || result[kind] !== null) return;
    const n = parseInt(String(val).replace(/[,\s]/g, ""), 10);
    if (!isNaN(n) && n >= 0) result[kind] = n;
  }

  // 把币种标记 / 数字 / 单位切成 token 后按「数字在标记前还是后」配对，
  // 避免跨图标误配（如 12 {{silver}} 345 {{bronze}} 把 12 配给 bronze）
  function scan(normalized, labelRequired) {
    let text = normalized;
    if (labelRequired) {
      const idx = text.search(/余额|balance/i);
      if (idx < 0) return; // 没有余额标签就不猜，防止把奖励明细当余额
      text = text.slice(Math.max(0, idx - 200), idx + 500);
    }

    const tokens = [];
    eachMatch(text, /\{\{(copper|silver|gold)\}\}|([\d,]+)|(铜币|银币|金币|copper|silver|gold|bronze)/gi,
      function (m) {
        if (m[1]) tokens.push({ t: "mark", v: m[1] });
        else if (m[2]) tokens.push({ t: "num", v: m[2] });
        else if (currencyOf(m[3])) tokens.push({ t: "mark", v: currencyOf(m[3]) });
      });
    if (!tokens.length) return;

    // 用第一个币种标记左右是否有数字判断整段的方向
    let numFirst = tokens[0].t === "num";
    let firstMark = -1;
    for (let k = 0; k < tokens.length; k++) {
      if (tokens[k].t === "mark") { firstMark = k; break; }
    }
    if (firstMark >= 0) {
      const leftIsNum  = firstMark > 0 && tokens[firstMark - 1].t === "num";
      const rightIsNum = firstMark + 1 < tokens.length && tokens[firstMark + 1].t === "num";
      if (leftIsNum && !rightIsNum) numFirst = true;
      else if (rightIsNum && !leftIsNum) numFirst = false;
    }

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].t !== "mark") continue;
      const left = tokens[i - 1], right = tokens[i + 1];
      let val = null;
      if (numFirst) {
        if (left && left.t === "num") val = left.v;
        else if (right && right.t === "num") val = right.v;
      } else {
        if (right && right.t === "num") val = right.v;
        else if (left && left.t === "num") val = left.v;
      }
      if (val !== null) set(tokens[i].v, val);
    }
  }

  // 优先在余额容器内解析（class 可能在 href 前、也可能带额外值）
  let scope = null;
  const area = raw.match(/<[^>]*class=["'][^"']*balance_area[^"']*["'][^>]*>([\s\S]*?)<\/a>/i) ||
               raw.match(/<[^>]*class=["'][^"']*balance_area[^"']*["'][^>]*>([\s\S]{0,800})/i);
  if (area) scope = area[1];

  // 容器本身就代表余额区，可直接扫；没有容器则要求附近有「余额 / balance」标签
  if (scope !== null) scan(normalizeBalanceText(scope), false);
  else scan(normalizeBalanceText(raw.slice(0, 8000)), true);

  // 旧版 span.balance_l 结构
  if (allBalanceNull(result)) {
    eachMatch(raw, /<span[^>]*class=["'][^"']*balance_l[^"']*["'][^>]*>\s*([\d,]+)\s*<\/span>[\s\S]{0,160}?(铜币|银币|金币|copper|silver|gold|bronze)/gi,
      function (m) { set(currencyOf(m[2]), m[1]); });
  }

  // 容器解析失败 → 顶部区域兜底；再失败则只在「余额」关键字附近找
  if (allBalanceNull(result) && scope !== null) scan(normalizeBalanceText(raw.slice(0, 8000)), true);
  if (allBalanceNull(result)) {
    const p = raw.search(/账户余额|当前余额|总余额|余额|balance/i);
    if (p >= 0) scan(normalizeBalanceText(raw.slice(Math.max(0, p - 200), p + 1500)), true);
  }

  return result;
}

function formatBalance(balance) {
  if (allBalanceNull(balance)) return "余额解析失败（签到已完成，详见脚本日志 [余额诊断]）";
  const copper = balance.copper, silver = balance.silver, gold = balance.gold;
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

// 解析失败时打印真实页面片段，一次运行即可定位结构
function dumpBalanceDebug(html) {
  const text = String(html || "");
  log("[余额诊断] 页面长度 " + text.length + "B，关键片段：");
  const marks = ["balance_area", "balance_l", "铜币", "银币", "金币", "copper", "silver", "gold", "bronze", "余额", "balance"];
  const shown = [];
  for (let i = 0; i < marks.length && shown.length < 5; i++) {
    const p = text.toLowerCase().indexOf(marks[i].toLowerCase());
    if (p < 0) continue;
    let near = false;
    for (let j = 0; j < shown.length; j++) if (Math.abs(shown[j] - p) < 180) near = true;
    if (near) continue;
    shown.push(p);
    log("[余额诊断] …" + shorten(text.slice(Math.max(0, p - 140), p + 260), 400) + "…");
  }
  if (!shown.length) log("[余额诊断] 未找到任何余额关键字，可能返回了登录页 / Cloudflare 挑战页");
  try {
    write("v2ex_daily.debug_balance", text.slice(0, 4000));
    log("[余额诊断] 余额页前 4000 字符已存入 persistentStore: v2ex_daily.debug_balance");
  } catch (e) {}
}

async function getBalance(cookie, fallbackHtml) {
  let balanceHtml = "";
  try {
    const res = await httpGetFollow(BALANCE_URL, buildHeaders(cookie));
    balanceHtml = res.body || "";
    if (res.statusCode < 400 && !isSigninResponse(res)) {
      const p = parseBalance(balanceHtml);
      if (!allBalanceNull(p)) return p;
    }
    log("[余额] /balance 页未解析出数值，body=" + balanceHtml.length + "B，尝试签到页顶部余额区");
  } catch (e) {
    log("[余额] 查询失败: " + shorten(e && e.message ? e.message : e, 120));
  }
  // 签到成功页 / 今日已签到页的顶部导航同样带余额区
  if (fallbackHtml) {
    const p2 = parseBalance(fallbackHtml);
    if (!allBalanceNull(p2)) {
      log("[余额] 已从签到页顶部余额区解析成功");
      return p2;
    }
  }
  dumpBalanceDebug(balanceHtml || fallbackHtml || "");
  return null;
}

// ====================================================
// ⑤ 签到主流程
// ====================================================
async function signInAccount(cookie, idx, total) {
  const prefix = total > 1 ? "账号" + (idx + 1) + " " : "";

  try {
    const res = await httpGetFollow(DAILY_URL, buildHeaders(cookie));

    if (isSigninResponse(res)) {
      log("[诊断] 签到页要求登录: status=" + res.statusCode +
          " location=" + header(res.headers, "location") +
          " Cookie字段=" + cookieSummary(cookie));
      notify(SCRIPT_NAME + " " + prefix + "❌", "服务端要求登录（会话未被接受）",
             "HTTP " + res.statusCode + "，Cookie 字段: " + cookieSummary(cookie) +
             "\n① 用 www.v2ex.com 重新登录并刷新，等「Cookie 已自动保存」；" +
             "\n② BoxJS 的 v2ex_daily.policy 填与抓包时相同的节点/策略组" +
             "（PB3_SESSION 与出口 IP 绑定，换 IP 会被判会话无效）；" +
             "\n③ v2ex_daily.ua 留空，避免 cf_clearance 与 UA 不匹配。");
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
      const balance = await getBalance(cookie, res.body);
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
      notify(SCRIPT_NAME + " " + prefix + "❌", "兑换时会话失效",
             "HTTP " + rr.statusCode + "。签到页已通过但兑换被拒，多为出口 IP 中途变化；" +
             "请在 BoxJS 固定 v2ex_daily.policy，并重新抓一次 Cookie。");
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
    const balance = await getBalance(cookie, rr.body);

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
  const policy = read(BOXJS_KEY_POLICY).trim();
  log("[诊断] " + SCRIPT_TAG + " 账号数=" +
      (raw ? raw.split("\n").filter(function (s) { return s.trim(); }).length : 0) +
      " UA=" + shorten(getStoredUA(), 70) +
      " 出口策略=" + (policy || "(未设置，跟随 Loon 默认)"));

  if (!raw) {
    notify(SCRIPT_NAME + " ⚠️", "尚未获取到 Cookie",
           "请用手机浏览器打开 https://www.v2ex.com/ （必须带 www）并登录。\n" +
           "登录后刷新任意页面，会弹出「Cookie 已自动保存」。");
    return;
  }

  const cookies = raw.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
  log("检测到 " + cookies.length + " 个账号");

  for (let i = 0; i < cookies.length; i++) {
    log("[诊断] 账号" + (i + 1) + " Cookie 字段: " + cookieSummary(cookies[i]));
    // 不再因缺少 A2 直接跳过：PB3_SESSION 等会话同样可能有效，
    // 由服务端 302 /signin 来判定真失效，避免误报「Cookie 失效」。
    if (!hasSession(cookies[i])) {
      log("[诊断] 账号" + (i + 1) + " 未检测到 A2/A20，仍尝试签到，以服务端结果为准");
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
    // cron 上下文偶尔会注入空的 $request，必须确认真的带 URL 或请求头，
    // 否则签到任务会被误判成捕获任务而根本不执行。
    const hasReq  = typeof $request !== "undefined" && $request !== null &&
                    !!($request.url || ($request.headers && Object.keys($request.headers).length));
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
