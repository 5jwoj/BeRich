// [rule: ^短剧ck检测$|^短剧CK检测$]
// [version: 1.5.0]
// [admin: false]
// [priority: 1000]
// [disable: false]

// ─── 青龙面板配置（与 xingyue_ck.js 共用同一套参数）────────────────────────────────
// [param: {"required": false, "key": "xingyue_ck.ql_host", "bool": false, "placeholder": "http://localhost:5700", "name": "青龙地址", "desc": "青龙面板地址"}]
// [param: {"required": false, "key": "xingyue_ck.ql_client_id", "bool": false, "placeholder": "", "name": "青龙ClientID", "desc": "青龙OpenAPI ClientID"}]
// [param: {"required": false, "key": "xingyue_ck.ql_client_secret", "bool": false, "placeholder": "", "name": "青龙ClientSecret", "desc": "青龙OpenAPI ClientSecret"}]
// [param: {"required": false, "key": "xingyue_ck.ql_env_name", "bool": false, "placeholder": "S_XYDJ", "name": "青龙变量名", "desc": "存储星芽Cookie的青龙环境变量名称，默认 S_XYDJ"}]

// ─── 管理员配置 ─────────────────────────────────────────────────────────────────
// [param: {"required": false, "key": "xingyue_ck.admin_ids", "bool": false, "placeholder": "", "name": "管理员ID列表", "desc": "允许使用CK检测功能的管理员用户ID，多个用英文逗号分隔"}]

// ─── 代理配置 ────────────────────────────────────────────────────────────────────
// [param: {"required": false, "key": "xingyue_ck.proxy_api", "bool": false, "placeholder": "", "name": "代理池API地址", "desc": "每次检测前从此URL获取代理IP，留空则不使用代理。返回格式：IP:PORT（每行一个）"}]

/**
 * 配置说明:
 * // [xingyue_ck.ql_host: http://localhost:5700]
 * // [xingyue_ck.ql_client_id: xxxxxxxx]
 * // [xingyue_ck.ql_client_secret: xxxxxxxx]
 * // [xingyue_ck.ql_env_name: S_XYDJ]
 * // [xingyue_ck.admin_ids: userId1,userId2]
 * // [xingyue_ck.proxy_api: http://api.xiequ.cn/VAD/GetIp.aspx?act=get&uid=xxx&vkey=xxx&num=1&time=30&plat=1&re=0&type=0&so=1&ow=1&spl=3&addr=&db=1]
 *
 * 触发关键词：短剧ck检测 / 短剧CK检测（仅管理员可用）
 *
 * Cookie 格式（青龙环境变量 value）：JWT_TOKEN#device_id
 *   例: eyJhbGci...xxx#32ebf7cce730731ba2ded1aec3ae8588
 *
 * 检测接口（内置，无需配置）：
 *   URL:  https://u.shytkjgs.com/user/v1/account/info
 *   方法: GET，token 放在请求头 token 字段
 *   有效: 响应 code == "ok" 且包含 user_id
 *   双重验证: 先检查 JWT exp 是否过期，再调用服务端接口
 *
 * 代理说明：
 *   每条 CK 检测前自动从代理池取一个新IP，避免同IP频繁请求被限制
 *   代理池API需返回 IP:PORT 格式（支持单行或多行，自动取第一个）
 *   若获取代理失败，自动降级为直连
 *
 * 用户渠道通知存储格式（bucket: s_xydj_channel, key: 手机号）：
 *   {"channel": "tg", "uid": "123456789"}
 *   {"channel": "wx", "uid": "openid_xxx"}
 */

// ─────────────────────────────────────────────────────────────────────────────
// 星芽 API 常量（来自抓包，勿修改）
// ─────────────────────────────────────────────────────────────────────────────
var XYDJ_API_BASE   = "https://u.shytkjgs.com";
var XYDJ_CHECK_PATH = "/user/v1/account/detail";
var XYDJ_HEADERS    = {
    "X-Jiuzhou-Service":             "SpeciesBackAdmin",
    "X-App-Id":                      "7",
    "User-Agent":                    "XingYaVideo/4.0.0 (iPhone; iOS 18.0; Scale/3.00)",
    "user_agent":                    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    "app_version":                   "4.0.0",
    "version_name":                  "4.0.0",
    "Agg_version":                   "4.0.0",
    "platform":                      "2",
    "device_platform":               "ios",
    "device_brand":                  "iPhone16,2",
    "manufacturer":                  "apple",
    "ad_sdk_app_id":                 "10106",
    "channel":                       "APP Store",
    "build_number":                  "3",
    "personalized_recommend_status": "1",
    "Accept":                        "*/*",
    "Accept-Language":               "zh-Hans-CN;q=1",
    "Accept-Encoding":               "gzip, deflate, br"
};

// ─────────────────────────────────────────────────────────────────────────────
// 基础 HTTP 请求（不带代理，用于青龙操作、获取代理IP等内部请求）
// ─────────────────────────────────────────────────────────────────────────────
var req = async function(opts, retries) {
    if (retries === undefined) retries = 3;
    for (var i = 0; i <= retries; i++) {
        try {
            return await new Promise(function(resolve, reject) {
                if (!opts.timeout) opts.timeout = 60000;
                // 内部请求强制不走代理
                opts.proxy   = "";
                opts.proxies = { "http": null, "https": null };
                request(opts, function(err, resp, header, body) {
                    if (err) return reject(err);
                    if (typeof body === "string") {
                        try { body = JSON.parse(body); } catch (e) {}
                    }
                    resolve({ data: body, status: resp ? resp.statusCode : 200, headers: header });
                });
            });
        } catch (err) {
            if (i < retries) {
                console.log("Request retry " + (i + 1) + ": " + (err.message || err));
                sleep(1000);
            } else {
                throw err;
            }
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 带代理的 HTTP 请求（用于 CK 检测，走外部代理 IP）
// proxyUrl 格式: "http://ip:port" 或 "" 表示直连
// ─────────────────────────────────────────────────────────────────────────────
var reqWithProxy = async function(opts, proxyUrl) {
    return await new Promise(function(resolve, reject) {
        if (!opts.timeout) opts.timeout = 20000;
        if (proxyUrl && proxyUrl.trim()) {
            opts.proxy   = proxyUrl.trim();
            opts.proxies = { "http": proxyUrl.trim(), "https": proxyUrl.trim() };
        } else {
            opts.proxy   = "";
            opts.proxies = { "http": null, "https": null };
        }
        request(opts, function(err, resp, header, body) {
            if (err) return reject(err);
            if (typeof body === "string") {
                try { body = JSON.parse(body); } catch (e) {}
            }
            resolve({ data: body, status: resp ? resp.statusCode : 200, headers: header });
        });
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// 从代理池 API 获取一个代理 IP
// 返回 "http://ip:port" 或 null（失败时降级直连）
// 蟹取代理 spl=3 时返回格式: ip:port\r\n  或  ip:port
// ─────────────────────────────────────────────────────────────────────────────
async function fetchProxy(proxyApiUrl) {
    if (!proxyApiUrl || proxyApiUrl.trim() === "") return null;
    try {
        var res = await new Promise(function(resolve, reject) {
            request({
                url:     proxyApiUrl.trim(),
                method:  "get",
                timeout: 10000,
                proxy:   "",
                proxies: { "http": null, "https": null }
            }, function(err, resp, header, body) {
                if (err) return reject(err);
                resolve({ data: body, status: resp ? resp.statusCode : 200 });
            });
        });

        if (res.status !== 200 || !res.data) {
            console.log("代理API返回异常: status=" + res.status);
            return null;
        }

        // 响应可能是 JSON 或纯文本 IP:PORT
        var raw = typeof res.data === "string" ? res.data : JSON.stringify(res.data);

        // 提取第一个有效的 IP:PORT（支持 \r\n / \n 分隔，以及带协议前缀）
        var lines = raw.replace(/\r/g, "").split("\n");
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            // 匹配 ip:port 格式（可能带 http:// 前缀）
            var match = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+)/);
            if (match) {
                var proxyUrl = "http://" + match[1];
                console.log("获取代理成功: " + proxyUrl);
                return proxyUrl;
            }
        }

        console.log("代理API响应中未找到有效IP: " + raw.substring(0, 80));
        return null;
    } catch (e) {
        console.log("获取代理失败: " + (e.message || e) + "，将使用直连");
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 解析 CK：格式为 JWT_TOKEN#device_id
// ─────────────────────────────────────────────────────────────────────────────
function parseCK(ck) {
    if (!ck || typeof ck !== "string") return null;
    var parts    = ck.split("#");
    var token    = parts[0].trim();
    var deviceId = parts.length > 1 ? parts.slice(1).join("#").trim() : "";
    return { token: token, deviceId: deviceId };
}

// ─────────────────────────────────────────────────────────────────────────────
// 手动 Base64 解码（不依赖 atob，兼容无浏览器 API 的 JS 运行环境）
// ─────────────────────────────────────────────────────────────────────────────
function base64Decode(input) {
    var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var output = "";
    // base64url → base64
    input = input.replace(/-/g, "+").replace(/_/g, "/");
    while (input.length % 4 !== 0) input += "=";
    input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
    var i = 0;
    while (i < input.length) {
        var e1 = keyStr.indexOf(input.charAt(i++));
        var e2 = keyStr.indexOf(input.charAt(i++));
        var e3 = keyStr.indexOf(input.charAt(i++));
        var e4 = keyStr.indexOf(input.charAt(i++));
        var c1 = (e1 << 2) | (e2 >> 4);
        var c2 = ((e2 & 15) << 4) | (e3 >> 2);
        var c3 = ((e3 & 3) << 6) | e4;
        output += String.fromCharCode(c1);
        if (e3 !== 64) output += String.fromCharCode(c2);
        if (e4 !== 64) output += String.fromCharCode(c3);
    }
    return output;
}

// ─────────────────────────────────────────────────────────────────────────────
// 解码 JWT Payload（仅读取字段，不验证签名）
// ─────────────────────────────────────────────────────────────────────────────
function decodeJwtPayload(token) {
    try {
        var parts = token.split(".");
        if (parts.length < 2) return null;
        var decoded = base64Decode(parts[1]);
        if (!decoded) return null;
        return JSON.parse(decoded);
    } catch (e) {
        console.log("JWT解析异常: " + (e.message || e));
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 第一步：本地检查 JWT 是否过期（无需网络，速度快）
// ─────────────────────────────────────────────────────────────────────────────
function checkJwtExpiry(token) {
    var payload = decodeJwtPayload(token);
    if (!payload) return { expired: true, reason: "无法解析JWT" };
    if (!payload.exp) return { expired: false };
    var now = Math.floor(Date.now() / 1000);
    if (now >= payload.exp) {
        var expDate = new Date(payload.exp * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
        return { expired: true, reason: "JWT已过期，过期时间: " + expDate };
    }
    return { expired: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// 第二步：请求星芽服务端验证 Token（支持代理）
// ─────────────────────────────────────────────────────────────────────────────
async function checkCookieOnline(token, deviceId, proxyUrl) {
    var headers = {};
    for (var k in XYDJ_HEADERS) headers[k] = XYDJ_HEADERS[k];
    headers["token"] = token;
    if (deviceId) {
        headers["device_id"] = deviceId;
        headers["oaid"]      = deviceId;
        headers["uuid"]      = deviceId;
    }

    // 此处不捕获网络请求层面的异常（例如超时、代理被拒等），直接向上抛出，以便重试机制捕获
    var res  = await reqWithProxy(
        { url: XYDJ_API_BASE + XYDJ_CHECK_PATH, method: "get", headers: headers, dataType: "json" },
        proxyUrl
    );
    var body = res.data;

    if (body && body.code === "ok" && body.data && body.data.user_id) {
        return { valid: true, mobile: body.data.mobile || "" };
    }
    if (body && body.code === "ok") {
        return { valid: true, mobile: "" };
    }
    var msg = (body && body.msg) ? body.msg : JSON.stringify(body).substring(0, 60);
    return { valid: false, reason: "服务端返回: " + msg };
}

// ─────────────────────────────────────────────────────────────────────────────
// 代理为主路的 CK 检测：代理失败则换新代理重试，最多重试 MAX_PROXY_RETRIES 次
// 全部代理失败则直连兜底
// ─────────────────────────────────────────────────────────────────────────────
var MAX_PROXY_RETRIES = 3; // 代理最大重试次数

async function checkCookieWithRetry(ck, proxyApiUrl) {
    var parsed = parseCK(ck);
    if (!parsed) return { valid: false, reason: "CK格式错误", usedProxy: false };

    // 第一步：本地 JWT 过期判断（无需代理，快速跳过）
    var expiryResult = checkJwtExpiry(parsed.token);
    if (expiryResult.expired) {
        return { valid: false, reason: expiryResult.reason, usedProxy: false };
    }

    var useProxy = proxyApiUrl && proxyApiUrl.trim() !== "";

    // 第二步：服务端在线验证（代理为主路，失败则换新代理重试）
    if (useProxy) {
        for (var attempt = 1; attempt <= MAX_PROXY_RETRIES; attempt++) {
            var proxyUrl = await fetchProxy(proxyApiUrl);
            if (!proxyUrl) {
                console.log("代理获取失败 (第" + attempt + "次重试)，等待2秒后继续…");
                sleep(2000);
                continue;
            }
            try {
                // 如果代理网络不通或超时，checkCookieOnline 会抛出异常，进入 catch 块
                var result = await checkCookieOnline(parsed.token, parsed.deviceId, proxyUrl);
                // 只要请求成功完成（无论服务端返回 valid 是 true 还是 false），都视为有效的结果，停止重试
                result.usedProxy = true;
                result.proxyUrl  = proxyUrl;
                return result;
            } catch (e) {
                // 代理请求本身失败（如超时、拒绝连接等）
                console.log("代理 " + proxyUrl + " 请求失败 (第" + attempt + "次): " + (e.message || e));
                if (attempt < MAX_PROXY_RETRIES) {
                    sleep(1500);
                }
            }
        }
        // 所有代理全部失败，直连兜底
        console.log("代理全部失败，改用直连…");
        try {
            var fallbackResult = await checkCookieOnline(parsed.token, parsed.deviceId, null);
            fallbackResult.usedProxy = false;
            return fallbackResult;
        } catch (e) {
            return { valid: false, reason: "直连请求异常: " + (e.message || e), usedProxy: false };
        }
    }

    // 未配置代理，直连模式
    try {
        var directResult = await checkCookieOnline(parsed.token, parsed.deviceId, null);
        directResult.usedProxy = false;
        return directResult;
    } catch (e) {
        return { valid: false, reason: "直连请求异常: " + (e.message || e), usedProxy: false };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 获取青龙 Token
// ─────────────────────────────────────────────────────────────────────────────
async function getQlToken(qlHost, qlClientId, qlClientSecret) {
    var tokenRes = await req({
        url: qlHost + "/open/auth/token?client_id=" + qlClientId + "&client_secret=" + qlClientSecret,
        method: "get",
        dataType: "json"
    });
    if (tokenRes.data && tokenRes.data.data && tokenRes.data.data.token) {
        return tokenRes.data.data.token;
    }
    throw new Error("获取青龙Token失败: " + JSON.stringify(tokenRes.data));
}

// ─────────────────────────────────────────────────────────────────────────────
// 拉取青龙指定环境变量列表
// ─────────────────────────────────────────────────────────────────────────────
async function getQlEnvs(qlHost, token, qlEnvName) {
    var envsRes = await req({
        url:     qlHost + "/open/envs?searchValue=" + encodeURIComponent(qlEnvName),
        method:  "get",
        headers: { "Authorization": "Bearer " + token },
        dataType: "json"
    });
    if (!envsRes.data || !envsRes.data.data) {
        throw new Error("获取青龙环境变量失败: " + JSON.stringify(envsRes.data));
    }
    var result = [];
    var all    = envsRes.data.data;
    for (var j = 0; j < all.length; j++) {
        if (all[j].name === qlEnvName && all[j].value) result.push(all[j]);
    }
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 判断当前用户是否为管理员
// ─────────────────────────────────────────────────────────────────────────────
function isAdmin(userId, adminIds) {
    if (!adminIds || adminIds.trim() === "") return false;
    var ids = adminIds.split(",").map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
    return ids.indexOf(String(userId)) !== -1;
}

// ─────────────────────────────────────────────────────────────────────────────
// 根据用户渠道发送通知
// 渠道信息: bucketGet("s_xydj_channel", phone) => {"channel":"tg","uid":"xxx"}
// ─────────────────────────────────────────────────────────────────────────────
function notifyUser(phone, message) {
    try {
        var raw  = bucketGet("s_xydj_channel", phone);
        if (!raw) { console.log("未找到手机号 " + phone + " 的渠道信息"); return false; }
        var info = null;
        try { info = JSON.parse(raw); } catch (e) {}
        if (!info || !info.channel || !info.uid) { console.log("渠道信息格式错误: " + raw); return false; }
        var channel = String(info.channel).toLowerCase();
        var uid     = info.uid;
        if (channel === "tg" || channel === "telegram") {
            sendTelegram(uid, message);
        } else if (channel === "wx" || channel === "wechat") {
            sendWechat(uid, message);
        } else {
            sendNotify(uid, message);
        }
        console.log("已通知用户 " + phone + " 渠道=" + channel + " uid=" + uid);
        return true;
    } catch (e) {
        console.error("通知用户 " + phone + " 失败: " + (e.message || e));
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 主入口：管理员批量检测 S_XYDJ Cookie 有效性
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
    var userId         = GetUserID();
    var qlHost         = bucketGet("xingyue_ck", "ql_host")          || "http://localhost:5700";
    var qlClientId     = bucketGet("xingyue_ck", "ql_client_id")     || "";
    var qlClientSecret = bucketGet("xingyue_ck", "ql_client_secret") || "";
    var qlEnvName      = bucketGet("xingyue_ck", "ql_env_name")      || "S_XYDJ";
    var adminIds       = bucketGet("xingyue_ck", "admin_ids")        || "";
    var proxyApiUrl    = bucketGet("xingyue_ck", "proxy_api")        || "";

    // 权限校验
    if (!isAdmin(userId, adminIds)) {
        sendText("⛔ 权限不足，该功能仅限管理员使用。");
        return;
    }

    var useProxy = proxyApiUrl && proxyApiUrl.trim() !== "";
    sendText("🔍 开始检测 " + qlEnvName + " 中的全部 Cookie…\n" +
             (useProxy ? "🌐 代理已启用，每条CK独立IP，失败最多重试 " + MAX_PROXY_RETRIES + " 次"
                       : "⚠️ 未配置代理，使用直连"));

    // 1. 获取青龙 Token
    var qlToken = "";
    try {
        qlToken = await getQlToken(qlHost, qlClientId, qlClientSecret);
    } catch (e) {
        sendText("❌ 连接青龙失败: " + (e.message || JSON.stringify(e)));
        return;
    }

    // 2. 拉取所有环境变量
    var qlEnvs = [];
    try {
        qlEnvs = await getQlEnvs(qlHost, qlToken, qlEnvName);
        console.log("青龙共找到 " + qlEnvs.length + " 条 " + qlEnvName);
    } catch (e) {
        sendText("❌ 拉取青龙变量失败: " + (e.message || JSON.stringify(e)));
        return;
    }

    if (qlEnvs.length === 0) {
        sendText("⚠️ 青龙中未找到任何 " + qlEnvName + " 环境变量。");
        return;
    }

    // 3. 逐条检测，发现失效立即通知用户（不等全部完成）
    var validList   = [];
    var invalidList = [];

    for (var i = 0; i < qlEnvs.length; i++) {
        var env    = qlEnvs[i];
        var ck     = env.value   || "";
        var remark = env.remarks || ("条目#" + (i + 1));

        console.log("[" + (i + 1) + "/" + qlEnvs.length + "] 检测: " + remark);

        // 代理为主路：内部自动换代理重试，全部失败才直连兜底
        var result = await checkCookieWithRetry(ck, proxyApiUrl);

        if (result.valid) {
            validList.push({ remark: remark, mobile: result.mobile || "" });
            console.log("✅ 有效: " + remark + (result.usedProxy ? " [代理]" : " [直连]"));
        } else {
            // ── 发现失效，立即通知用户 ──────────────────────────────────
            var phoneMatch = remark.match(/1[3-9]\d{9}/);
            var phone      = phoneMatch ? phoneMatch[0] : null;

            var userMsg  = "⚠️ 您的星芽账号 Cookie 已失效\n";
            userMsg += "━━━━━━━━━━━━━━━━━━\n";
            userMsg += "账号: " + (phone || remark) + "\n";
            userMsg += "原因: " + result.reason + "\n";
            userMsg += "━━━━━━━━━━━━━━━━━━\n";
            userMsg += "请重新登录以更新 Cookie，恢复正常使用。";

            var notified = false;
            if (phone) {
                notified = notifyUser(phone, userMsg);
            } else {
                console.log("备注 [" + remark + "] 未提取到手机号，跳过用户通知");
            }

            invalidList.push({ remark: remark, reason: result.reason, notified: notified });
            console.log("❌ 失效: " + remark + " | " + result.reason +
                        (notified ? " | 已通知" : " | 通知失败") +
                        (result.usedProxy ? " [代理]" : " [直连]"));
        }

        // 每条间隔 800ms，避免频繁请求
        if (i < qlEnvs.length - 1) sleep(800);
    }

    // 4. 汇总报告发给管理员（用户通知已逐条实时发送完毕）
    var header = "📊 星芽CK检测报告\n";
    header += "══════════════════════\n";
    header += "共检测: " + qlEnvs.length + " 条\n";
    header += "✅ 有效: " + validList.length + " 条\n";
    header += "❌ 失效: " + invalidList.length + " 条\n";
    header += "🌐 代理: " + (useProxy ? "已启用 (重试" + MAX_PROXY_RETRIES + "次)" : "未启用") + "\n";
    header += "══════════════════════\n";

    var bodyInvalid = "";
    if (invalidList.length > 0) {
        bodyInvalid += "\n❌ 失效账号:\n";
        for (var m = 0; m < invalidList.length; m++) {
            var inv          = invalidList[m];
            var notifyStatus = inv.notified ? "✉️已通知" : "⚠️通知失败";
            // 采用紧凑的单行格式，避免行数过多
            var cleanReason  = inv.reason ? inv.reason.replace(/\n/g, " ") : "未知";
            bodyInvalid += (m + 1) + ". " + inv.remark + " | " + cleanReason + " | " + notifyStatus + "\n";
        }
    }

    var bodyValid = "";
    if (validList.length > 0) {
        bodyValid += "\n✅ 有效账号:\n";
        for (var v = 0; v < validList.length; v++) {
            var val = validList[v];
            bodyValid += (v + 1) + ". " + val.remark;
            if (val.mobile) bodyValid += " (" + val.mobile + ")";
            bodyValid += "\n";
        }
    }

    var footer = "\n⏰ " + new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

    // Telegram 消息单条最大限制 4096 字符，在此进行安全长度截断以防发送失败
    var maxSafeLen = 3800;
    var summary    = header + bodyInvalid + bodyValid + footer;

    if (summary.length > maxSafeLen) {
        var overageMsg = "\n... (由于篇幅限制，已省略其余账号详情，请查看运行日志获取完整报告)";
        var allowedLen = maxSafeLen - header.length - footer.length - overageMsg.length;
        
        // 优先截断主体内容，保留完整的头部、尾部及截断说明
        var truncatedBody = (bodyInvalid + bodyValid).substring(0, allowedLen);
        summary = header + truncatedBody + overageMsg + footer;
    }

    sendText(summary);
}

main().catch(function(e) {
    console.error(e);
    sendText("插件执行出错: " + (e.message || JSON.stringify(e)));
});
null;
