/*
 * 📦 JD Cookie 过期检测 - 青龙面板专属版 (Loon)
 * Version: v1.0.0
 * Author: z.W.
 * 
 * 功能说明:
 *   1. 从 BoxJS 读取青龙面板信息 (地址/Client ID/Secret)
 *   2. 读取 BoxJS 中指定的京东账号 Pin (jd_check_pin / jd_local_pin)，精准过滤并检测指定账号
 *   3. 智能扫描青龙最近一次运行的日志，判断账号是否出现 "Cookie失效"、"账号已过期"、"未登录" 等提示
 *   4. 一旦检测到目标账号过期或失效，第一时间通过本地通知推送预警
 * 
 * @配置方式
 * 通过 BoxJS 订阅「BeRich Loon 合集」，在「JD账号过期检测 (Loon)」App 中填写：
 *   - jd_ql_url                 青龙面板地址
 *   - jd_ql_client_id           青龙 Client ID
 *   - jd_ql_client_secret       青龙 Client Secret
 *   - jd_cookie_check_script    检测目标脚本名称（默认 jd_task_assets）
 *   - jd_check_pin              指定检测的京东 Pin（留空检测全部）
 * 
 * BoxJS 订阅地址：https://raw.githubusercontent.com/5jwoj/BeRich/main/boxjs/BeRich_Loon.boxjs.json
 */

// ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
// 可选：如果不使用 BoxJS，可在下方手动填写配置
const MANUAL_CONFIG = {
    url: "",                 // 青龙面板地址，例如 "http://192.168.1.1:5700"
    id: "",                  // Client ID
    secret: "",              // Client Secret
    script_name: "",         // 检测的目标脚本名称（留空优先从 BoxJS 中读取 jd_cookie_check_script，默认 jd_task_assets）
    pin: ""                  // 指定京东账号 Pin (例如 "jd_123456" 或多个逗号分隔 "jd_12,jd_34"，留空则检测日志内全部账号)
};
// ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

(async () => {
    // ─── 1. 从 BoxJS 读取配置 ───
    let ql_url = MANUAL_CONFIG.url || getBoxJSSetting("jd_ql_url") || getBoxJSSetting("ql_url");
    const ql_client_id = MANUAL_CONFIG.id || getBoxJSSetting("jd_ql_client_id") || getBoxJSSetting("ql_client_id");
    const ql_client_secret = MANUAL_CONFIG.secret || getBoxJSSetting("jd_ql_client_secret") || getBoxJSSetting("ql_client_secret");
    const scriptName = MANUAL_CONFIG.script_name || getBoxJSSetting("jd_cookie_check_script") || getBoxJSSetting("jd_asset_script_name") || "jd_task_assets";
    const userPinStr = MANUAL_CONFIG.pin || getBoxJSSetting("jd_check_pin") || getBoxJSSetting("jd_local_pin") || "";

    console.log(`[账号过期检测 v1.0.0] 目标脚本: ${scriptName} | 指定Pin: ${userPinStr || "未指定(检测全部)"}`);

    if (!ql_url || !ql_client_id || !ql_client_secret) {
        $notification.post(
            "⚠️ 【账号过期检测】配置未填写",
            "BoxJS 青龙信息未设置",
            "请在 BoxJS 订阅「BeRich Loon 合集」→「JD账号过期检测」中填写青龙面板地址、Client ID 和 Client Secret。"
        );
        $done({});
        return;
    }

    if (!ql_url.startsWith("http://") && !ql_url.startsWith("https://")) ql_url = "http://" + ql_url;
    const qlBase = ql_url.replace(/\/$/, '');

    try {
        // ─── 2. 获取青龙 Token ───
        const token = await getQlToken(qlBase, ql_client_id, ql_client_secret);
        if (!token) {
            $notification.post("❌ 【账号过期检测】获取青龙 Token 失败", "", "无法登录青龙面板，请检查 Client ID / Secret");
            $done({});
            return;
        }

        // ─── 3. 读取目标脚本最近一次运行日志 ───
        const logContent = await getQlCronLog(qlBase, token, scriptName);
        if (!logContent) {
            $notification.post("⚠️ 【账号过期检测】读取青龙日志失败", "", `未能找到匹配 ${scriptName} 的最近运行日志`);
            $done({});
            return;
        }

        // ─── 4. 解析日志数据与失效关键词 ───
        const logTimeMatch = logContent.match(/(\d{4}[-\/]\d{2}[-\/]\d{2}\s+\d{2}:\d{2}:\d{2})/);
        const logTimestamp = logTimeMatch ? logTimeMatch[1] : "最近一次运行";

        const allRuns = parseQlLog(logContent);
        const expiredRuns = analyzeExpiredAccounts(allRuns, logContent);

        if (allRuns.length === 0 && expiredRuns.length === 0) {
            $notification.post("⚠️ 【账号过期检测】日志中未解析到账号数据", "", `日志时间: ${logTimestamp}\n脚本: ${scriptName}`);
            $done({});
            return;
        }

        // ─── 5. 根据 BoxJS 配置的 Pin 进行精准检测与过滤 ───
        let targetExpired = [];
        let isFiltered = false;

        if (userPinStr.trim()) {
            isFiltered = true;
            const userPins = userPinStr.split(/[,，\s]+/).filter(Boolean);
            
            // 筛选属于指定 Pin 且失效的账号
            targetExpired = expiredRuns.filter(item => {
                return userPins.some(pin => 
                    item.pin.toLowerCase().includes(pin.toLowerCase()) || 
                    pin.toLowerCase().includes(item.pin.toLowerCase())
                );
            });

            console.log(`[账号过期检测] 指定Pin: [${userPins.join(", ")}] | 匹配检测到过期账号数: ${targetExpired.length}`);

            if (targetExpired.length === 0) {
                console.log(`[账号过期检测] 校验通过：指定Pin账号在日志中状态正常，未发现Cookie失效。`);
                $done({});
                return;
            }
        } else {
            // 未指定 Pin，全量判断
            targetExpired = expiredRuns;
            console.log(`[账号过期检测] 全量检测 | 发现过期账号数: ${targetExpired.length}`);
        }

        // ─── 6. 发送异常报警通知 ───
        if (targetExpired.length > 0) {
            sendExpiredNotification(targetExpired, isFiltered, logTimestamp, userPinStr);
        } else {
            console.log(`[账号过期检测] 日志中未检测到账号过期问题。`);
        }

    } catch (e) {
        console.log(`[账号过期检测] 发生异常: ${e.message || e}`);
        $notification.post("❌ 【账号过期检测】脚本执行错误", "", String(e.message || e));
    } finally {
        $done({});
    }
})();

// ─── 从 BoxJS 读取配置 ───
function getBoxJSSetting(key) {
    try {
        const val = $persistentStore.read(key);
        return val && val.trim() !== '' ? val.trim() : null;
    } catch (_) {
        return null;
    }
}

// ─── 青龙 API: 获取 Token ───
function getQlToken(qlBase, client_id, client_secret) {
    return new Promise((resolve) => {
        $httpClient.get({
            url: `${qlBase}/open/auth/token?client_id=${client_id}&client_secret=${client_secret}`,
            method: "GET"
        }, (err, resp, body) => {
            if (err) { resolve(null); return; }
            try {
                const d = JSON.parse(body);
                resolve((d && d.code === 200 && d.data) ? d.data.token : null);
            } catch (_) { resolve(null); }
        });
    });
}

// ─── 青龙 API: 获取任务列表并读取最新日志 ───
function getQlCronLog(qlBase, token, scriptName) {
    return new Promise((resolve) => {
        $httpClient.get({
            url: `${qlBase}/open/crons`,
            method: "GET",
            headers: { "Authorization": `Bearer ${token}` }
        }, (err, resp, body) => {
            if (err) { resolve(null); return; }
            try {
                const d = JSON.parse(body);
                let list = [];
                if (d && d.data) {
                    // 兼容青龙新旧 API: 旧版 data=[], 新版 data={list:[], total:N} 或嵌套 data.data=[]
                    if (Array.isArray(d.data)) {
                        list = d.data;
                    } else if (Array.isArray(d.data.list)) {
                        list = d.data.list;
                    } else if (Array.isArray(d.data.data)) {
                        list = d.data.data;
                    }
                }

                const baseName = scriptName.split('/').pop().replace(/\.js$/i, '').toLowerCase();
                const targets = list.filter(c => {
                    const cmd = (c.command || '').toLowerCase();
                    const name = (c.name || '').toLowerCase();
                    const val = (c.value || '').toLowerCase();
                    return cmd.includes(baseName) || name.includes(baseName) || val.includes(baseName);
                });

                if (targets.length === 0) { resolve(null); return; }

                targets.sort((a, b) => {
                    const tA = new Date(a.last_execution_time || a.updatedAt || a.createdAt || 0).getTime();
                    const tB = new Date(b.last_execution_time || b.updatedAt || b.createdAt || 0).getTime();
                    return tB - tA;
                });

                const target = targets[0];
                const targetId = target.id || target._id;

                fetchCronLog(qlBase, token, targetId).then(resolve);
            } catch (_) { resolve(null); }
        });
    });
}

function fetchCronLog(qlBase, token, targetId) {
    return new Promise((resolve) => {
        $httpClient.get({
            url: `${qlBase}/open/crons/${targetId}/log`,
            method: "GET",
            headers: { "Authorization": `Bearer ${token}` }
        }, (err, resp, body) => {
            if (err) { resolve(null); return; }
            try {
                const ld = JSON.parse(body);
                let content = ld && ld.data ? (typeof ld.data === 'string' ? ld.data : ld.data.log || ld.data.content) : null;

                if (!content || content.trim().length === 0) {
                    // 备用：读取历史日志列表
                    $httpClient.get({
                        url: `${qlBase}/open/crons/${targetId}/logs`,
                        method: "GET",
                        headers: { "Authorization": `Bearer ${token}` }
                    }, (err2, resp2, body2) => {
                        if (err2) { resolve(null); return; }
                        try {
                            const hd = JSON.parse(body2);
                            // 兼容青龙新旧 API: logs 接口返回的 data 可为数组或含 list 字段的对象
                            let logList = null;
                            if (hd && hd.data) {
                                if (Array.isArray(hd.data)) logList = hd.data;
                                else if (Array.isArray(hd.data.list)) logList = hd.data.list;
                            }
                            if (logList && logList.length > 0) {
                                const lastLog = logList[logList.length - 1];
                                content = typeof lastLog === 'string' ? lastLog : (lastLog.content || lastLog.log);
                            }
                        } catch (_) {}
                        resolve(content || null);
                    });
                } else {
                    resolve(content);
                }
            } catch (_) { resolve(null); }
        });
    });
}

// ─── 日志分块解析 ───
function parseQlLog(logContent) {
    const runPatterns = [
        /\[Run\]\s*运行账户:\s*(\S+)/g,
        /【(?:京东)?账号\s*\d*】\s*(\S+)/g,
        /账号\s*\d+[：:]\s*(\S+)/g
    ];

    let matches = [];
    for (const pattern of runPatterns) {
        let rm;
        pattern.lastIndex = 0;
        while ((rm = pattern.exec(logContent)) !== null) {
            matches.push({ logPin: rm[1].trim(), index: rm.index });
        }
        if (matches.length > 0) break;
    }

    matches.sort((a, b) => a.index - b.index);

    const uniqueRuns = [];
    matches.forEach(m => {
        if (!uniqueRuns.some(u => u.index === m.index || u.logPin === m.logPin)) {
            uniqueRuns.push(m);
        }
    });

    for (let i = 0; i < uniqueRuns.length; i++) {
        const nextIdx = i + 1 < uniqueRuns.length ? uniqueRuns[i + 1].index : logContent.length;
        uniqueRuns[i].block = logContent.slice(uniqueRuns[i].index, nextIdx);
    }
    return uniqueRuns;
}

// ─── 分析提取已过期的账号列表 ───
function analyzeExpiredAccounts(allRuns, fullLog) {
    const expiredKeywords = [
        "cookie失效", "cookie已失效", "账号过期", "账号已过期",
        "cookie过期", "登录失效", "未登录", "请重新登录",
        "cookie无效", "验证失败", "token过期", "失效或已过期", "重新登录"
    ];

    const expiredList = [];

    // 方法 A: 基于分块精准检索
    if (allRuns && allRuns.length > 0) {
        for (const run of allRuns) {
            const { logPin, block } = run;
            const blockLower = block.toLowerCase();
            const hitKw = expiredKeywords.find(kw => blockLower.includes(kw));
            if (hitKw) {
                const lines = block.split('\n');
                const reasonLine = lines.find(l => expiredKeywords.some(kw => l.toLowerCase().includes(kw))) || `检测到关键词: ${hitKw}`;
                expiredList.push({ pin: logPin, reason: reasonLine.trim() });
            }
        }
    }

    // 方法 B: 全日志正则扫描兜底
    if (expiredList.length === 0) {
        const lineRegex = /(?:账号|pin|用户)?\s*[:：\[【]?\s*([a-zA-Z0-9_\-\u4e00-\u9fa5]+)[\]】]?\s*.*?(?:cookie|登录|授权).*?(?:失效|过期|无效|失败|重新登录)/gi;
        let lm;
        while ((lm = lineRegex.exec(fullLog)) !== null) {
            const foundPin = lm[1].trim();
            if (!expiredList.some(e => e.pin.toLowerCase() === foundPin.toLowerCase())) {
                expiredList.push({ pin: foundPin, reason: lm[0].trim() });
            }
        }
    }

    return expiredList;
}

// ─── 脱敏 Pin ───
function maskPin(str) {
    if (!str) return "";
    let s = String(str);
    try { s = decodeURIComponent(s); } catch (e) {}
    if (s.toLowerCase().indexOf("jd_") === 0) {
        const actual = s.substring(3);
        return actual.length <= 4
            ? "jd_" + actual[0] + "***" + actual[actual.length - 1]
            : "jd_" + actual.substring(0, 2) + "***" + actual.substring(actual.length - 2);
    }
    if (s.length <= 6) return s[0] + "***" + s[s.length - 1];
    return s.substring(0, 3) + "***" + s.substring(s.length - 3);
}

// ─── 发送过期预警通知 ───
function sendExpiredNotification(expiredItems, isFiltered, logTime, userPinStr) {
    const count = expiredItems.length;
    const title = `⚠️ 【JD账号过期提醒】(${count}个账号失效)`;
    const subtitle = isFiltered ? `📌 目标Pin过滤模式 (${logTime})` : `📌 青龙全量检测模式 (${logTime})`;

    const bodyArr = expiredItems.map((item, idx) =>
        `👤 账号 ${idx + 1}: ${maskPin(item.pin)}\n` +
        `❌ 状态: Cookie已失效/过期\n` +
        `💬 详情: ${item.reason}`
    );

    bodyArr.push(`\n👉 请及时打开京东抓包更新 Cookie 并同步至青龙！`);

    $notification.post(title, subtitle, bodyArr.join("\n──────────────────\n"));
}
