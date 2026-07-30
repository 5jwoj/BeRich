/*
 * 📦 JD 京豆查询 - 本地账号专属版 (Quantumult X 版本)
 * Version: v1.2.0
 * Author: z.W.
 * 
 * 功能说明:
 *   1. 【只查本手机账号】：仅提取并展示当前手机 Quan X 捕获/登录过的京东账号的京豆数据，过滤青龙面板上的其他无关账号。
 *   2. 【双模自动支持】：
 *      - 模式 A（推荐）：通过 Quan X 本地抓到的 Cookie 直接请求京东官方接口，查当前登录账号的实时京豆、今日收益、即将过期；
 *      - 模式 B（青龙日志）：若需要通过青龙日志查询，脚本会自动用本手机登录的 Pin 去匹配青龙日志，仅展示本手机账号。
 * 
 * QX 任务配置 (task_local):
 * 0 9,20 * * * https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/JD_Bean_Query_QX.js, tag=京豆资产查询, img-url=https://raw.githubusercontent.com/Orz-3/mini/master/Color/jd.png, enabled=true
 */

// ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
// 可选：如果不使用 BoxJS 且想通过青龙日志查询，可在下方手动填写
const MANUAL_CONFIG = {
    url: "",                 // 青龙面板地址，例如 "http://192.168.1.1:5700"
    id: "",                  // Client ID
    secret: "",              // Client Secret
    script_name: "jd_task_assets", // 资产脚本名称
    only_local: true         // 是否仅查询本手机登录的账号（默认 true）
};
// ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

(async () => {
    // ─── 0. 获取本手机 Quan X 捕获到的所有 Cookie 与 Pin ───
    const localCookiesMap = getLocalJdCookies();
    const localPins = Object.keys(localCookiesMap);

    console.log(`[京豆查询 v1.2.0] 本设备已捕获到的京东账号数量: ${localPins.length} (${localPins.join(", ") || "暂无"})`);

    if (localPins.length === 0) {
        $notify("⚠️ 【京豆查询】未找到本设备登录账号", "", "请先在手机打开京东App/小程序完成Cookie捕获，或检查 Cookie 同步脚本是否运行。");
        $done();
        return;
    }

    // ─── 尝试模式 A: 直接使用本地 Cookie 查询京东官方接口 ───
    let directResults = [];
    for (const pin of localPins) {
        const cookieStr = localCookiesMap[pin];
        try {
            const beanData = await queryJdBeanDirect(cookieStr, pin);
            if (beanData && beanData.success) {
                directResults.push(beanData);
            }
        } catch (e) {
            console.log(`[京豆查询] 直连查询账号 ${pin} 异常: ${e.message || e}`);
        }
    }

    if (directResults.length > 0) {
        // 成功通过官方接口查到了本手机账号的最新京豆
        sendLocalNotification(directResults, "官方接口直连");
        $done();
        return;
    }

    // ─── 模式 B: 回退使用青龙日志，并基于本手机 localPins 强行过滤 ───
    let ql_url = MANUAL_CONFIG.url || $prefs.valueForKey("jd_ql_url");
    const ql_client_id = MANUAL_CONFIG.id || $prefs.valueForKey("jd_ql_client_id");
    const ql_client_secret = MANUAL_CONFIG.secret || $prefs.valueForKey("jd_ql_client_secret");
    const scriptName = MANUAL_CONFIG.script_name || $prefs.valueForKey("jd_asset_script_name") || "jd_task_assets";

    if (!ql_url || !ql_client_id || !ql_client_secret) {
        $notify("⚠️ 【京豆查询】直连失败且青龙配置不完整", "", "无法查询本手机账号的京豆数据，请检查京东 Cookie 是否有效。");
        $done();
        return;
    }

    if (!ql_url.startsWith("http://") && !ql_url.startsWith("https://")) ql_url = "http://" + ql_url;
    const qlBase = ql_url.replace(/\/$/, '');

    try {
        const token = await getQlToken(qlBase, ql_client_id, ql_client_secret);
        if (!token) {
            $notify("❌ 【京豆查询】获取青龙 Token 失败", "", "无法从青龙获取日志数据");
            $done();
            return;
        }

        const logContent = await getQlCronLog(qlBase, token, scriptName);
        if (!logContent) {
            $notify("⚠️ 【京豆查询】读取青龙日志失败", "", "未能在青龙找到资产脚本日志");
            $done();
            return;
        }

        // 解析青龙日志
        const allRuns = parseQlLog(logContent);
        const logTimeMatch = logContent.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
        const logTimestamp = logTimeMatch ? logTimeMatch[1] : "未知时间";

        // 🎯 核心过滤逻辑：仅保留属于本手机 localPins 的运行块
        const matchedRuns = allRuns.filter(run => {
            return localPins.some(pin => 
                run.logPin.toLowerCase().includes(pin.toLowerCase()) || 
                pin.toLowerCase().includes(run.logPin.toLowerCase())
            );
        });

        if (matchedRuns.length === 0) {
            $notify("⚠️ 【京豆查询】青龙日志未包含本手机账号", "", `本设备账号 [${localPins.join(', ')}] 未在青龙最新日志中找到记录`);
            $done();
            return;
        }

        // 解析并推送属于本手机的账号数据
        let qlResults = matchedRuns.map(run => {
            const { block, logPin } = run;
            return {
                pin: logPin,
                todayIncome: extractField(block, ['今日收入', '今日增加', '今日获得', '今天收入']),
                currentBeans: extractField(block, ['当前京豆', '京豆余额', '当前余额', '总京豆', '余额']),
                expiringSoon: extractField(block, ['即将过期', '即将到期', '即将失效', '过期京豆'])
            };
        });

        sendLocalNotification(qlResults, `青龙日志 (${logTimestamp})`);

    } catch (e) {
        $notify("❌ 【京豆查询】脚本执行错误", "", String(e.message || e));
    } finally {
        $done();
    }
})();

// ─── 辅助函数: 获取本设备 Quan X 捕获过的所有 JD Cookie ───
function getLocalJdCookies() {
    let cookiesMap = {};
    
    // 1. 尝试直接获取当前标准的 CookieJD
    const mainCookie = $prefs.valueForKey("CookieJD") || $prefs.valueForKey("jd_cookie");
    if (mainCookie) {
        const pin = getPinFromCookie(mainCookie);
        if (pin) cookiesMap[pin] = mainCookie;
    }

    // 2. 扫描所有由 JD_Cookie_Sync_QX.js 缓存的账号 Cookie (JD_COOKIE_CACHE_*)
    const currentPin = $prefs.valueForKey("JD_CURRENT_PIN") || $prefs.valueForKey("jd_pin");
    if (currentPin) {
        const cached = $prefs.valueForKey(`JD_COOKIE_CACHE_${currentPin}`);
        if (cached) cookiesMap[currentPin] = cached;
    }

    const localPinsStr = $prefs.valueForKey("QX_LOCAL_JD_PINS");
    if (localPinsStr) {
        try {
            const pinsArr = JSON.parse(localPinsStr);
            pinsArr.forEach(p => {
                const c = $prefs.valueForKey(`JD_COOKIE_CACHE_${p}`);
                if (c) cookiesMap[p] = c;
            });
        } catch (e) {}
    }

    return cookiesMap;
}

function getPinFromCookie(cookieStr) {
    if (!cookieStr) return null;
    const m = cookieStr.match(/pt_pin=([^;]+)/);
    if (m) {
        try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
    }
    return null;
}

// ─── 辅助函数: 直连京东官方接口查京豆 ───
function queryJdBeanDirect(cookieStr, pin) {
    return new Promise((resolve) => {
        const options = {
            url: `https://api.m.jd.com/client.action?functionId=getJingBeanBalanceDetail`,
            method: "POST",
            headers: {
                "Cookie": cookieStr,
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.38",
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: "body=%7B%22pageSize%22%3A%2220%22%2C%22page%22%3A%221%22%7D&appid=ld"
        };

        $task.fetch(options).then(
            resp => {
                try {
                    let res = typeof resp.body === "string" ? JSON.parse(resp.body) : resp.body;
                    if (res && (res.code === "0" || res.code === 0)) {
                        const data = res.data || res;
                        const totalBean = data.totalNum || data.jingBeanNum || "未知";
                        const todayIncome = data.todayIncomeBean || data.todayBean || "0京豆";
                        const expireBean = data.expireJingBeanNum || data.expireBean || "0京豆";

                        resolve({
                            success: true,
                            pin: pin,
                            todayIncome: String(todayIncome).includes("京豆") ? todayIncome : `${todayIncome}京豆`,
                            currentBeans: String(totalBean).includes("京豆") ? totalBean : `${totalBean}京豆`,
                            expiringSoon: String(expireBean).includes("京豆") ? expireBean : `${expireBean}京豆`
                        });
                        return;
                    }
                } catch (e) {}
                resolve({ success: false });
            },
            err => resolve({ success: false })
        );
    });
}

// ─── 辅助函数: 青龙 API 相关 ───
async function getQlToken(qlBase, client_id, client_secret) {
    const res = await $task.fetch({
        url: `${qlBase}/open/auth/token?client_id=${client_id}&client_secret=${client_secret}`,
        method: "GET"
    });
    const d = typeof res.body === "string" ? JSON.parse(res.body) : res.body;
    return (d && d.code === 200 && d.data) ? d.data.token : null;
}

async function getQlCronLog(qlBase, token, scriptName) {
    const cronsRes = await $task.fetch({
        url: `${qlBase}/open/crons`,
        method: "GET",
        headers: { "Authorization": `Bearer ${token}` }
    });
    const d = typeof cronsRes.body === "string" ? JSON.parse(cronsRes.body) : cronsRes.body;
    let list = [];
    if (d && d.data) {
        list = Array.isArray(d.data.data) ? d.data.data : (Array.isArray(d.data) ? d.data : []);
    }
    const baseName = scriptName.split('/').pop().replace(/\.js$/i, '');
    const target = list.find(c => (c.command || '').includes(baseName) || (c.name || '').includes(baseName));
    if (!target) return null;

    const logRes = await $task.fetch({
        url: `${qlBase}/open/crons/${target.id || target._id}/log`,
        method: "GET",
        headers: { "Authorization": `Bearer ${token}` }
    });
    const ld = typeof logRes.body === "string" ? JSON.parse(logRes.body) : logRes.body;
    return ld && ld.data ? (typeof ld.data === 'string' ? ld.data : ld.data.log || ld.data.content) : null;
}

function parseQlLog(logContent) {
    const allRuns = [];
    const runPattern = /\[Run\]\s*运行账户:\s*(\S+)/g;
    let rm;
    while ((rm = runPattern.exec(logContent)) !== null) {
        allRuns.push({ logPin: rm[1].trim(), index: rm.index });
    }
    for (let i = 0; i < allRuns.length; i++) {
        const nextIdx = i + 1 < allRuns.length ? allRuns[i + 1].index : logContent.length;
        allRuns[i].block = logContent.slice(allRuns[i].index, nextIdx);
    }
    return allRuns;
}

function extractField(block, keywords) {
    for (const kw of keywords) {
        const re = new RegExp(kw + '[：:\\s]*([\\+\\-]?[\\d,，]+(?:[.．]\\d+)?\\s*(?:京豆|JB|jb)?(?:[^\\n]{0,30})?)', 'i');
        const m = block.match(re);
        if (m) return m[1].trim();
    }
    return "暂无数据";
}

function maskPin(str) {
    if (!str) return "";
    let s = String(str);
    try { s = decodeURIComponent(s); } catch (e) {}
    if (s.toLowerCase().indexOf("jd_") === 0) {
        const actual = s.substring(3);
        return actual.length <= 4 ? "jd_" + actual[0] + "***" + actual[actual.length - 1] : "jd_" + actual.substring(0, 2) + "***" + actual.substring(actual.length - 2);
    }
    if (s.length <= 6) return s[0] + "***" + s[s.length - 1];
    return s.substring(0, 3) + "***" + s.substring(s.length - 3);
}

function sendLocalNotification(results, sourceName) {
    let notifyTitle = `💰 本机京豆资产汇总 (${results.length}账号)`;
    let notifySub = `📌 数据来源: ${sourceName}`;
    let notifyBodyArr = results.map((item, idx) => {
        return `👤 账号 ${idx + 1}: ${maskPin(item.pin)}\n` +
               `📊 今日收入: ${item.todayIncome}\n` +
               `💎 当前余额: ${item.currentBeans}\n` +
               `⏳ 即将过期: ${item.expiringSoon}`;
    });

    $notify(notifyTitle, notifySub, notifyBodyArr.join("\n──────────────────\n"));
}
