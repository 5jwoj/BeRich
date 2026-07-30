/*
 * 📦 JD 京豆查询 - 青龙面板专属版 (Quantumult X / Loon / Surge / Stash)
 * Version: v1.3.0
 * Author: z.W.
 * 
 * 功能说明:
 *   1. 读取 BoxJS 或 MANUAL_CONFIG 中配置的青龙面板信息 (地址/Client ID/Secret)。
 *   2. 读取 BoxJS 中指定的京东账号 Pin (jd_local_pin)，精准过滤并展示该账号在青龙资产日志中的京豆情况。
 *   3. 无需手机端捕获 Cookie 或抓包，完全基于青龙面板日志数据进行汇报。
 * 
 * QX 任务配置 (task_local):
 * 0 9,20 * * * https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/JD_Bean_Query_QX.js, tag=京豆资产查询, img-url=https://raw.githubusercontent.com/Orz-3/mini/master/Color/jd.png, enabled=true
 */

// ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
// 可选：如果不使用 BoxJS，可在下方手动填写配置
const MANUAL_CONFIG = {
    url: "",                 // 青龙面板地址，例如 "http://192.168.1.1:5700"
    id: "",                  // Client ID
    secret: "",              // Client Secret
    script_name: "jd_task_assets", // 资产脚本名称
    pin: ""                  // 指定京东账号 Pin (例如 "jd_123456" 或多个逗号分隔 "jd_12,jd_34"，留空则展示日志内全部账号)
};
// ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

(async () => {
    // ─── 1. 获取配置信息 ───
    let ql_url = MANUAL_CONFIG.url || $prefs.valueForKey("jd_ql_url");
    const ql_client_id = MANUAL_CONFIG.id || $prefs.valueForKey("jd_ql_client_id");
    const ql_client_secret = MANUAL_CONFIG.secret || $prefs.valueForKey("jd_ql_client_secret");
    const scriptName = MANUAL_CONFIG.script_name || $prefs.valueForKey("jd_asset_script_name") || "jd_task_assets";
    const userPinStr = MANUAL_CONFIG.pin || $prefs.valueForKey("jd_local_pin") || $prefs.valueForKey("jd_pin") || "";

    console.log(`[京豆查询 v1.3.0] 目标 Pin 配置: ${userPinStr || "未指定(展示全部)"}`);

    if (!ql_url || !ql_client_id || !ql_client_secret) {
        $notify("⚠️ 【京豆查询】请设置青龙面板参数", "", "请在 BoxJS 或脚本中配置青龙面板地址(ql_url)、Client ID 及 Secret");
        $done();
        return;
    }

    if (!ql_url.startsWith("http://") && !ql_url.startsWith("https://")) ql_url = "http://" + ql_url;
    const qlBase = ql_url.replace(/\/$/, '');

    try {
        // ─── 2. 获取青龙 Token ───
        const token = await getQlToken(qlBase, ql_client_id, ql_client_secret);
        if (!token) {
            $notify("❌ 【京豆查询】获取青龙 Token 失败", "", "无法登录青龙面板，请检查 Client ID / Secret");
            $done();
            return;
        }

        // ─── 3. 读取资产脚本运行日志 ───
        const logContent = await getQlCronLog(qlBase, token, scriptName);
        if (!logContent) {
            $notify("⚠️ 【京豆查询】读取青龙日志失败", "", `未能找到 ${scriptName} 的最新运行日志`);
            $done();
            return;
        }

        // ─── 4. 解析日志数据 ───
        const allRuns = parseQlLog(logContent);
        const logTimeMatch = logContent.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
        const logTimestamp = logTimeMatch ? logTimeMatch[1] : "未知时间";

        if (allRuns.length === 0) {
            $notify("⚠️ 【京豆查询】日志中未找到账户数据", "", `日志时间: ${logTimestamp}`);
            $done();
            return;
        }

        // ─── 5. 根据 BoxJS 配置的 Pin 进行精准过滤 ───
        let targetRuns = allRuns;
        let isFiltered = false;

        if (userPinStr.trim()) {
            const userPins = userPinStr.split(/[,，\s]+/).filter(Boolean);
            const matched = allRuns.filter(run => {
                return userPins.some(pin => 
                    run.logPin.toLowerCase().includes(pin.toLowerCase()) || 
                    pin.toLowerCase().includes(run.logPin.toLowerCase())
                );
            });
            if (matched.length > 0) {
                targetRuns = matched;
                isFiltered = true;
            } else {
                $notify("⚠️ 【京豆查询】未在日志中匹配到指定 Pin", "", `配置的 Pin: ${userPinStr}\n日志时间: ${logTimestamp}`);
                $done();
                return;
            }
        }

        // ─── 6. 转换格式并发送本地通知 ───
        let qlResults = targetRuns.map(run => {
            const { block, logPin } = run;
            return {
                pin: logPin,
                todayIncome: extractField(block, ['今日收入', '今日增加', '今日获得', '今天收入']),
                currentBeans: extractField(block, ['当前京豆', '京豆余额', '当前余额', '总京豆', '余额']),
                expiringSoon: extractField(block, ['即将过期', '即将到期', '即将失效', '过期京豆'])
            };
        });

        const sourceLabel = isFiltered ? `指定 Pin 查询 (${logTimestamp})` : `全量日志查询 (${logTimestamp})`;
        sendLocalNotification(qlResults, sourceLabel);

    } catch (e) {
        $notify("❌ 【京豆查询】脚本执行错误", "", String(e.message || e));
    } finally {
        $done();
    }
})();

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
    let notifyTitle = `💰 京豆资产汇总 (${results.length}账号)`;
    let notifySub = `📌 数据来源: ${sourceName}`;
    let notifyBodyArr = results.map((item, idx) => {
        return `👤 账号 ${idx + 1}: ${maskPin(item.pin)}\n` +
               `📊 今日收入: ${item.todayIncome}\n` +
               `💎 当前余额: ${item.currentBeans}\n` +
               `⏳ 即将过期: ${item.expiringSoon}`;
    });

    $notify(notifyTitle, notifySub, notifyBodyArr.join("\n──────────────────\n"));
}
