/*
 * 小阅阅全自动阅读 - Quantumult X 适配版
 * 
 * @version v1.0.2
 * @author @5jwoj
 * 
 * ==================== Quantumult X 配置说明 ====================
 * 
 * 1. 自动抓包获取 Cookie / UnionID 重写规则 (rewrite):
 * [rewrite_local]
 * ^https?:\/\/.*\/xiaoxinxin\/ url script-request-header https://raw.githubusercontent.com/5jwoj/BeRich/main/xyy/xyy_qx.js
 * 
 * [mitm]
 * hostname = *.info, *.asia, *.9d0hl2.info, *.ohqnjl.asia
 * 
 * 2. 定时任务配置 (task):
 * [task_local]
 * 15 6,8,10,12,14,16 * * * https://raw.githubusercontent.com/5jwoj/BeRich/main/xyy/xyy_qx.js, tag=小阅阅全自动阅读, img-url=https://raw.githubusercontent.com/Orz-3/mini/master/Color/wechat.png, enabled=true
 * 
 * 3. 环境变量支持 (可在持久化存储中或直接在下方配置):
 * key: xyy_cookie (格式: ysmuid=xxx)
 * key: xyy_unionid (格式: oZdBp0y-xxx)
 * key: xyy_entry_url (最新抓包入口/接口域名，可选)
 * key: xyy_max_read (单次运行最大阅读篇数，默认 180)
 * 
 * 多账号配置：支持使用 "&" 或 "@" 或 "换行" 分隔。
 * ==============================================================
 */

const $ = Env("小阅阅全自动阅读");

// 默认配置参数
const DEFAULT_HOST_DOMAIN = "http://k8b57qs.9d0hl2.info/xiaoxinxin/wode2/c1835c58fb62f21e20d3638774e8a860";
const DEFAULT_MAX_READ = 180;
const READ_DURATION_MIN = 7;
const READ_DURATION_MAX = 12;
const MAX_CONTINUOUS_ERRORS = 5;

// 提现配置
const WITHDRAW_THRESHOLD = 3000; // 满 3000 金币自动提现
const WITHDRAW_STEP = 100;

const USER_AGENT = "Mozilla/5.0 (Linux; Android 16; V2405A Build/BP2A.250605.031.A3_V000L1; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.178 Mobile Safari/537.36 XWEB/1460217 MMWEBSDK/20260502 MMWEBID/8073 REV/580c5b91ffa4b88fe7e562d440e82104b327a000 MicroMessenger/8.0.76.3140(0x28004C31) WeChat/arm64 Weixin NetType/5G Language/zh_CN ABI/arm64";

(async () => {
    // 1. 判断是否为重写(抓包)模式
    if (typeof $request !== "undefined") {
        GetCookie();
        return;
    }

    // 2. 否则为定时任务模式
    console.log("==================================================");
    console.log("   小阅阅全自动阅读脚本 v1.0.2 (Quantumult X 版)  ");
    console.log("==================================================");

    const accounts = getAccounts();
    if (accounts.length === 0) {
        $.notify("小阅阅", "运行失败 ❌", "未检测到有效的 xyy_cookie 或 xyy_unionid，请先通过微信重写抓包或配置环境变量！");
        $done();
        return;
    }

    const maxReadStr = $.getValue("xyy_max_read") || `${DEFAULT_MAX_READ}`;
    const maxRead = parseInt(maxReadStr, 10) || DEFAULT_MAX_READ;
    const defaultEntryUrl = ($.getValue("xyy_entry_url") || $.getValue("xyy_domain") || DEFAULT_HOST_DOMAIN).trim();

    console.log(`ℹ️ 检测到 ${accounts.length} 个账号配置 | 目标篇数: ${maxRead} 篇 | 阅读时长: ${READ_DURATION_MIN}-${READ_DURATION_MAX} 秒\n`);

    let results = [];
    for (let account of accounts) {
        const summary = await runAccount(account, defaultEntryUrl, maxRead);
        results.push(summary);
        await sleep(2000);
    }

    const finalSummary = results.join("\n");
    console.log("\n==================================================");
    console.log("🎉 所有账号处理完毕！");
    console.log("==================================================");
    console.log(finalSummary);

    $.notify("小阅阅全自动阅读任务报告", "", finalSummary);
    $done();
})().catch((e) => {
    console.log(`❌ 运行异常: ${e}`);
    $done();
});

// 重写捕获 Cookie 及 UnionID
function GetCookie() {
    try {
        const url = $request.url;
        const headers = $request.headers;
        
        let cookieVal = headers["Cookie"] || headers["cookie"] || "";
        let ysmuid = "";
        if (cookieVal.includes("ysmuid=")) {
            const match = cookieVal.match(/ysmuid=([^;]+)/);
            if (match) ysmuid = `ysmuid=${match[1]}`;
        }

        let unionid = "";
        if (url.includes("unionid=")) {
            const match = url.match(/unionid=([^&]+)/);
            if (match) unionid = match[1];
        }

        let isUpdated = false;
        if (ysmuid) {
            const oldCookie = $.getValue("xyy_cookie") || "";
            if (!oldCookie.includes(ysmuid)) {
                $.setValue(ysmuid, "xyy_cookie");
                console.log(`[抓包] 成功获取/更新 Cookie: ${ysmuid}`);
                isUpdated = true;
            }
        }

        if (unionid) {
            const oldUnionid = $.getValue("xyy_unionid") || "";
            if (!oldUnionid.includes(unionid)) {
                $.setValue(unionid, "xyy_unionid");
                console.log(`[抓包] 成功获取/更新 UnionID: ${unionid}`);
                isUpdated = true;
            }
        }

        if (url.includes("/xiaoxinxin/")) {
            const originMatch = url.match(/^(https?:\/\/[^\/]+)/);
            if (originMatch) {
                const entryUrl = originMatch[1];
                $.setValue(entryUrl, "xyy_entry_url");
                console.log(`[抓包] 成功保存入口域名: ${entryUrl}`);
            }
        }

        if (isUpdated) {
            $.notify("小阅阅", "抓包成功 🎉", "已自动捕获并保存 Cookie 和 UnionID！");
        }
    } catch (e) {
        console.log(`❌ 抓包报错: ${e}`);
    }
    $done({});
}

// 解析环境变量
function parseEnvList(valStr) {
    if (!valStr) return [];
    let clean = valStr.trim();
    for (let sep of ["\n", "&", "@", ";"]) {
        clean = clean.split(sep).join(",");
    }
    return clean.split(",").map(s => s.trim()).filter(Boolean);
}

function getAccounts() {
    const cookieStr = $.getValue("xyy_cookie") || "";
    const unionidStr = $.getValue("xyy_unionid") || "";
    const entryUrlStr = $.getValue("xyy_entry_url") || $.getValue("xyy_domain") || "";

    const cookies = parseEnvList(cookieStr);
    const unionids = parseEnvList(unionidStr);
    const entryUrls = parseEnvList(entryUrlStr);

    if (cookies.length === 0 || unionids.length === 0) {
        return [];
    }

    const minLen = Math.min(cookies.length, unionids.length);
    let accounts = [];
    for (let i = 0; i < minLen; i++) {
        accounts.push({
            index: i + 1,
            cookie: cookies[i],
            unionid: unionids[i],
            entry_url: i < entryUrls.length ? entryUrls[i] : ""
        });
    }
    return accounts;
}

function getHeaders(cookieStr) {
    return {
        "User-Agent": USER_AGENT,
        "X-Requested-With": "com.tencent.mm",
        "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cookie": cookieStr.includes("ysmuid=") ? cookieStr : `ysmuid=${cookieStr}`
    };
}

function parseUrl(urlStr) {
    let target = (urlStr || "").trim();
    if (!target.startsWith("http://") && !target.startsWith("https://")) {
        target = "http://" + target;
    }
    const match = target.match(/^(https?:\/\/([^\/:]+)(?::(\d+))?)(.*)/);
    if (!match) return { origin: DEFAULT_HOST_DOMAIN, host: "", path: "" };
    return {
        origin: match[1],
        host: match[2],
        path: match[4] || ""
    };
}

function parseQueryParams(urlStr) {
    const params = {};
    const queryIndex = urlStr.indexOf("?");
    if (queryIndex === -1) return params;
    const queryString = urlStr.substring(queryIndex + 1);
    const pairs = queryString.split("&");
    for (let pair of pairs) {
        const [k, v] = pair.split("=");
        if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || "");
    }
    return params;
}

function isAccountRestricted(msg) {
    if (!msg) return false;
    const keywords = ["限制", "明天再来", "分钟后再来", "上限", "黑名单", "次数已满", "受限", "禁止", "封禁", "阅读暂时无效", "请稍后再试", "稍候再试"];
    return keywords.some(k => msg.includes(k));
}

async function resolveHostDomain(rawUrlOrDomain, unionid, cookieStr) {
    const { origin: baseOrigin } = parseUrl(rawUrlOrDomain || DEFAULT_HOST_DOMAIN);
    console.log(`🔍 [域名解析] 正在动态检验目标主接口域名: ${baseOrigin}`);
    
    const headers = getHeaders(cookieStr);
    const checkUrl = `${baseOrigin}/xiaoxinxin/gold?unionid=${unionid}&time=${Date.now()}`;

    try {
        const res = await $.fetch({ url: checkUrl, method: "GET", headers: headers, timeout: 6000 });
        if (res.status === 200) {
            const data = JSON.parse(res.body || "{}");
            if (data.errcode === 0) {
                console.log(`  └─ 🎯 动态域名校验通过！当前使用接口地址: ${baseOrigin}`);
                return baseOrigin;
            }
        }
    } catch (e) {
        console.log(`  │  ⚠️ 尝试直接连通 ${baseOrigin} 异常: ${e}`);
    }

    console.log(`  └─ 📌 自动选择基准域名: ${baseOrigin}`);
    return baseOrigin;
}

async function getUserStatus(hostDomain, headers, unionid) {
    const url = `${hostDomain}/xiaoxinxin/gold?unionid=${unionid}&time=${Date.now()}`;
    try {
        const res = await $.fetch({ url: url, method: "GET", headers: headers, timeout: 10000 });
        if (res.status === 200) {
            return JSON.parse(res.body || "{}");
        }
    } catch (e) {
        console.log(`❌ 查询账号状态异常: ${e}`);
    }
    return null;
}

// 自动提现逻辑
async function autoWithdraw(hostDomain, headers, unionid) {
    console.log("\n==================== 自动提现校验开始 ====================");
    const balanceUrl = `${hostDomain}/xiaoxinxin/mincode_gold?unionid=${unionid}&time=${Date.now()}`;
    const ajaxHeaders = Object.assign({}, headers, {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": `${hostDomain}/xiaoxinxin/home.html?ysi=0`
    });

    let gold = 0;
    try {
        const resp = await $.fetch({ url: balanceUrl, method: "GET", headers: ajaxHeaders, timeout: 10000 });
        const resData = JSON.parse(resp.body || "{}");
        if (resData.errcode === 0) {
            gold = parseInt(resData.data?.gold || 0, 10);
        }
    } catch (e) {
        console.log(`⚠️ 余额查询失败: ${e}`);
    }

    console.log(`💰 当前账户可提现金币：${gold}`);

    if (gold < WITHDRAW_THRESHOLD) {
        console.log(`ℹ️ 金币不足 ${WITHDRAW_THRESHOLD}，跳过本次提现。`);
        console.log("==================== 自动提现校验结束 ====================\n");
        return;
    }

    const withdrawAmount = Math.floor(gold / WITHDRAW_STEP) * WITHDRAW_STEP;
    const reqId = 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
        let r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    const qrNum = Math.floor(Math.random() * 100000000000000) + 17800000000000000;
    const addtime = Math.floor(Date.now() / 1000);

    const withdrawUrl = `${hostDomain}/xiaoxinxin/exchange?unionid=${unionid}&request_id=${reqId}&qr_code_number=${qrNum}&addtime=${addtime}`;
    try {
        const resp = await $.fetch({ url: withdrawUrl, method: "GET", headers: ajaxHeaders, timeout: 10000 });
        const resData = JSON.parse(resp.body || "{}");
        if (resData.errcode === 0) {
            console.log(`✅ 提现成功！本次兑换 ${withdrawAmount} 金币，平台提示：${resData.msg || '成功'}`);
        } else {
            console.log(`❌ 提现失败，平台返回：${resData.msg || '未知错误'}`);
        }
    } catch (e) {
        console.log(`❌ 提现请求异常：${e}`);
    }
    console.log("==================== 自动提现校验结束 ====================\n");
}

// 激活入口
async function activateEntry(headers, entryUrl, accName) {
    try {
        const parsed = parseUrl(entryUrl);
        const entryHost = parsed.origin;
        const pathParts = parsed.path.replace(/\/$/, '').split('/');
        const qrcode = pathParts.length > 0 ? pathParts[pathParts.length - 1] : "";
        if (!qrcode) return;

        console.log(`🔗 激活 [${accName}] 入口页面...`);
        const actUrl = `${entryHost}/xiaoxinxin/xxyzhantiao?qrcode=${qrcode}`;
        const ajaxHd = Object.assign({}, headers, {
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": entryUrl
        });

        const resp = await $.fetch({ url: actUrl, method: "GET", headers: ajaxHd, timeout: 10000 });
        const data = JSON.parse(resp.body || "{}");
        const tiaoUrl = data.data?.tiao || "";
        if (tiaoUrl && tiaoUrl.startsWith("http")) {
            console.log(`🔗 访问 tiao 链接完成激活...`);
            await $.fetch({ url: tiaoUrl, method: "GET", headers: headers, timeout: 10000 });
        }
    } catch (e) {
        console.log(`  │  ⚠️ 激活逻辑提示: ${e}`);
    }
}

async function processSingleRead(hostDomain, headers, unionid, readIdx, maxRead) {
    console.log(`\n📖 [文章 ${readIdx}/${maxRead}] 开始获取阅读任务...`);

    const duliksUrl = `${hostDomain}/xiaoxinxin/duliks`;
    const postHeaders = Object.assign({}, headers, {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Origin": hostDomain,
        "Referer": `${hostDomain}/xiaoxinxin/home.html?ysi=0`
    });

    let resDuliks;
    try {
        const resp = await $.fetch({
            url: duliksUrl,
            method: "POST",
            headers: postHeaders,
            body: `unionid=${encodeURIComponent(unionid)}`,
            timeout: 10000
        });
        resDuliks = JSON.parse(resp.body || "{}");
    } catch (e) {
        console.log(`❌ [步骤1] 获取任务网络异常: ${e}`);
        return { success: false, gold: 0, msg: `网络异常: ${e}`, isRestricted: false };
    }

    if (resDuliks.errcode !== 0 || !resDuliks.data || !resDuliks.data.domain) {
        const msg = resDuliks.msg || "未获取到任务域名";
        console.log(`⚠️ [步骤1] 任务响应提示: ${msg}`);
        return { success: false, gold: 0, msg: msg, isRestricted: isAccountRestricted(msg) };
    }

    const domainUrl = resDuliks.data.domain;
    const { origin: baseHost } = parseUrl(domainUrl);
    const queryParams = parseQueryParams(domainUrl);
    const rid = queryParams.rid || "";

    if (!rid) {
        console.log("❌ [步骤1] 未能提取到有效的 RID 参数");
        return { success: false, gold: 0, msg: "无效RID", isRestricted: false };
    }

    console.log(`  ├─ 任务基准域名: ${baseHost}`);
    console.log(`  ├─ 任务 RID: ${rid}`);

    const nowTs = Date.now();
    const duduUrl = `${baseHost}/xiaoxinxin/dudu?rid=${rid}&time=${nowTs}&psgn=168&vs=1003`;

    let resDudu;
    try {
        const resp = await $.fetch({ url: duduUrl, method: "GET", headers: headers, timeout: 10000 });
        resDudu = JSON.parse(resp.body || "{}");
    } catch (e) {
        console.log(`❌ [步骤2] 请求 dudu 接口异常: ${e}`);
        return { success: false, gold: 0, msg: `dudu网络异常: ${e}`, isRestricted: false };
    }

    if (resDudu.errcode !== 0) {
        const msg = resDudu.msg || "dudu验证失败";
        console.log(`⚠️ [步骤2] dudu 接口返回非0: ${msg}`);
        return { success: false, gold: 0, msg: msg, isRestricted: isAccountRestricted(msg) };
    }

    const articleLink = resDudu.data ? resDudu.data.link || "" : "";
    console.log(`  ├─ 成功获取文章链接: ${articleLink.substring(0, 60)}...`);

    const readSeconds = (Math.random() * (READ_DURATION_MAX - READ_DURATION_MIN) + READ_DURATION_MIN).toFixed(1);
    console.log(`  ├─ 开始模拟真实阅读 (预计停留 ${readSeconds} 秒)...`);

    if (articleLink) {
        try {
            await $.fetch({ url: articleLink, method: "GET", headers: headers, timeout: 10000 });
        } catch (e) {
            console.log(`  │  ⚠️ 访问文章链接网络波动 (继续计时): ${e}`);
        }
    }

    let elapsed = 0;
    const stepSleep = 3;
    const totalMs = parseFloat(readSeconds) * 1000;
    while (elapsed < totalMs) {
        const chunk = Math.min(stepSleep * 1000, totalMs - elapsed);
        await sleep(chunk);
        elapsed += chunk;
        console.log(`  │  ...已阅读模拟滑动中 [${(elapsed/1000).toFixed(0)}/${readSeconds} 秒]`);
    }

    const jinTs = Date.now();
    const readDurationInt = Math.floor(parseFloat(readSeconds));
    const jinrightUrl = `${baseHost}/xiaoxinxin/jinright?rid=${rid}&time=${readDurationInt}&timestamp=${jinTs}`;

    let resJinright;
    try {
        const resp = await $.fetch({ url: jinrightUrl, method: "GET", headers: headers, timeout: 10000 });
        resJinright = JSON.parse(resp.body || "{}");
    } catch (e) {
        console.log(`❌ [步骤4] 结算金币网络异常: ${e}`);
        return { success: false, gold: 0, msg: `结算网络异常: ${e}`, isRestricted: false };
    }

    if (resJinright.errcode === 0) {
        const data = resJinright.data || {};
        const earnedGold = parseInt(data.gold || 0, 10);
        const dayRead = data.day_read || 0;
        const dayGold = data.day_gold || 0;
        const lastGold = data.last_gold || 0;

        if (earnedGold > 0) {
            console.log(`  └─ ✅ [加币验证成功] 本篇获得: +${earnedGold} 金币！今日已读: ${dayRead} 篇, 今日累计金币: ${dayGold}, 余额账户: ${lastGold}`);
            return { success: true, gold: earnedGold, msg: "成功", isRestricted: false };
        } else {
            console.log(`  └─ ⚠️ [提示] 结算成功但增加金币为 0，响应: ${JSON.stringify(data)}`);
            return { success: true, gold: 0, msg: "金币为0", isRestricted: false };
        }
    } else {
        const msg = resJinright.msg || "结算错误";
        console.log(`  └─ ❌ [结算失败] 原因: ${msg}`);
        return { success: false, gold: 0, msg: msg, isRestricted: isAccountRestricted(msg) };
    }
}

async function runAccount(account, defaultEntryUrl, maxRead) {
    const idx = account.index;
    const unionid = account.unionid;
    const cookieStr = account.cookie;
    const entryUrl = account.entry_url || defaultEntryUrl;

    const maskedUnionid = unionid.length > 10 ? `${unionid.substring(0, 6)}***${unionid.substring(unionid.length - 4)}` : unionid;

    console.log(`\n==================================================`);
    console.log(`🚀 正在运行 [账号${idx}] (UnionID: ${maskedUnionid})`);
    console.log(`==================================================`);

    const hostDomain = await resolveHostDomain(entryUrl, unionid, cookieStr);
    const headers = getHeaders(cookieStr);

    // 激活入口
    await activateEntry(headers, entryUrl, `账号${idx}`);

    const statusBefore = await getUserStatus(hostDomain, headers, unionid);
    if (statusBefore && statusBefore.errcode === 0) {
        const bData = statusBefore.data || {};
        const dayReadB = parseInt(bData.day_read || 0, 10);
        if (dayReadB >= maxRead) {
            console.log(`⏭️ 今日已读 ${dayReadB} 篇，已达单日上限 ${maxRead} 篇，跳过本轮。`);
            return `账号 [${idx}] 今日已读 ${dayReadB} 篇，已达上限，跳过。`;
        }
        console.log(`📊 初始状态: 今日已读 ${dayReadB} 篇, 今日金币: ${bData.day_gold || 0}, 账户余额: ${bData.last_gold || bData.gold || 0}`);
    } else {
        console.log("📊 初始状态: 获取异常或数据为空");
    }

    let totalEarnedGold = 0;
    let successReads = 0;
    let continuousErrorCount = 0;
    let readIdx = 1;

    while (successReads < maxRead) {
        const res = await processSingleRead(hostDomain, headers, unionid, readIdx, maxRead);

        if (res.success) {
            successReads++;
            totalEarnedGold += res.gold;
            continuousErrorCount = 0;
            readIdx++;
        } else {
            if (res.isRestricted) {
                console.log(`\n⏹️ [阅读结束] 平台提示: "${res.msg}"。账号受限或达上限，优雅停止运行。`);
                break;
            }
            continuousErrorCount++;
            console.log(`⚠️ [容错机制] 当前连续报错/失败次数: [${continuousErrorCount}/${MAX_CONTINUOUS_ERRORS}]，原因: ${res.msg}`);

            if (continuousErrorCount >= MAX_CONTINUOUS_ERRORS) {
                console.log(`❌ [账号终止] 连续报错已达 ${MAX_CONTINUOUS_ERRORS} 次，停止运行当前账号。`);
                break;
            }

            const retryWait = 8;
            console.log(`⏳ 等待 ${retryWait} 秒后重试...`);
            await sleep(retryWait * 1000);
            continue;
        }

        if (successReads < maxRead) {
            const intervalSec = (Math.random() * (READ_DURATION_MAX - READ_DURATION_MIN) + READ_DURATION_MIN).toFixed(1);
            console.log(`⏳ 间隔等待 ${intervalSec} 秒后继续下一篇...`);
            await sleep(parseFloat(intervalSec) * 1000);
        }
    }

    // 阅读完成后自动提现
    await autoWithdraw(hostDomain, headers, unionid);

    const statusAfter = await getUserStatus(hostDomain, headers, unionid);
    let goldMsg = "";
    if (statusAfter && statusAfter.errcode === 0) {
        const aData = statusAfter.data || {};
        goldMsg = `今日已读 ${aData.day_read || 0} 篇, 今日金币: ${aData.day_gold || 0}, 账户余额: ${aData.last_gold || aData.gold || 0}`;
        console.log(`\n🎉 [账号${idx}] 运行总结:`);
        console.log(`  ├─ 本次完成阅读: ${successReads} 篇`);
        console.log(`  ├─ 本次新增金币: +${totalEarnedGold} 金币`);
        console.log(`  └─ 最新账号概览: ${goldMsg}`);
    }

    return `账号 [${idx}] 完成阅读 ${successReads} 篇，新增 +${totalEarnedGold} 金币。最新状态: ${goldMsg || '状态完成'}`;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function Env(name) {
    const isQuanX = typeof $task !== "undefined";
    const isSurge = typeof $httpClient !== "undefined" && typeof $rocket === "undefined";
    const isLoon = typeof $loon !== "undefined";
    const isShadowrocket = typeof $rocket !== "undefined";

    const getValue = (key) => {
        if (isQuanX) return $prefs.valueForKey(key);
        if (isSurge || isLoon || isShadowrocket) return $persistentStore.read(key);
        return null;
    };

    const setValue = (val, key) => {
        if (isQuanX) return $prefs.setValueForKey(val, key);
        if (isSurge || isLoon || isShadowrocket) return $persistentStore.write(val, key);
    };

    const notify = (title, subtitle, message) => {
        if (isQuanX) $notify(title, subtitle, message);
        else if (isSurge || isLoon || isShadowrocket) $notification.post(title, subtitle, message);
        console.log(`\n[${title}] ${subtitle}\n${message}`);
    };

    const fetch = (options) => {
        return new Promise((resolve, reject) => {
            if (isQuanX) {
                if (typeof options === "string") options = { url: options };
                options.method = options.method || "GET";
                $task.fetch(options).then(
                    (res) => {
                        resolve({
                            status: res.statusCode || res.status,
                            headers: res.headers,
                            body: res.body
                        });
                    },
                    (err) => reject(err)
                );
            } else if (isSurge || isLoon || isShadowrocket) {
                const method = (options.method || "GET").toLowerCase();
                $httpClient[method](options, (err, response, body) => {
                    if (err) reject(err);
                    else {
                        response.body = body;
                        response.status = response.status || response.statusCode;
                        resolve(response);
                    }
                });
            }
        });
    };

    return { isQuanX, getValue, setValue, notify, fetch };
}
