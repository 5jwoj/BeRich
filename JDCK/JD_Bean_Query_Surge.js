/*
 * 📦 JD 京豆查询 - 青龙面板专属版 (Surge)
 * Version: v1.0.0
 * Author: z.W.
 *
 * 功能说明:
 *   1. 从 BoxJS 读取青龙面板信息 (地址/Client ID/Secret)
 *   2. 读取 BoxJS 中指定的京东账号 Pin (jd_local_pin)，精准过滤并展示该账号在青龙资产日志中的京豆情况
 *   3. 自动匹配最近一次运行的目标任务与最新历史日志
 *
 * @配置方式
 * 通过 BoxJS 订阅「BeRich Surge 合集」，在「京豆资产查询 (Surge)」App 中填写：
 *   - jd_ql_url             青龙面板地址
 *   - jd_ql_client_id       青龙 Client ID
 *   - jd_ql_client_secret   青龙 Client Secret
 *   - jd_asset_script_name  资产脚本名称（默认 jd_task_assets）
 *   - jd_local_pin          指定查询的京东 Pin（留空展示全部）
 *
 * BoxJS 订阅地址：https://raw.githubusercontent.com/5jwoj/BeRich/main/boxjs/BeRich_Surge.boxjs.json
 *
 * Surge 定时任务配置示例（每天 23:15 执行）：
 * 15 23 * * * script-path=https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/JD_Bean_Query_Surge.js,script-update-interval=86400,timeout=60,tag=京豆资产查询
 */

(async () => {
    // ─── 1. 从 BoxJS 读取配置 ───
    let ql_url = getBoxJSSetting("jd_ql_url");
    const ql_client_id = getBoxJSSetting("jd_ql_client_id");
    const ql_client_secret = getBoxJSSetting("jd_ql_client_secret");
    const scriptName = getBoxJSSetting("jd_asset_script_name") || "jd_task_assets";
    const userPinStr = getBoxJSSetting("jd_local_pin") || "";

    console.log(`[京豆查询 v1.0.0] 目标脚本: ${scriptName} | 过滤Pin: ${userPinStr || "未指定(展示全部)"}`);

    if (!ql_url || !ql_client_id || !ql_client_secret) {
        $notification.post(
            "⚠️ 【京豆查询】配置未填写",
            "BoxJS 青龙信息未设置",
            "请在 BoxJS 订阅「BeRich Surge 合集」→「京豆资产查询」中填写青龙面板地址、Client ID 和 Client Secret。"
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
            $notification.post("❌ 【京豆查询】获取青龙 Token 失败", "", "无法登录青龙面板，请检查 Client ID / Secret");
            $done({});
            return;
        }

        // ─── 3. 读取资产脚本最近一次运行日志 ───
        const logContent = await getQlCronLog(qlBase, token, scriptName);
        if (!logContent) {
            $notification.post("⚠️ 【京豆查询】读取青龙日志失败", "", `未能找到匹配 ${scriptName} 的最近运行日志`);
            $done({});
            return;
        }

        // ─── 4. 解析日志数据 ───
        const allRuns = parseQlLog(logContent);
        const logTimeMatch = logContent.match(/(\d{4}[-\/]\d{2}[-\/]\d{2}\s+\d{2}:\d{2}:\d{2})/);
        const logTimestamp = logTimeMatch ? logTimeMatch[1] : "最近一次运行";

        if (allRuns.length === 0) {
            $notification.post("⚠️ 【京豆查询】日志中未找到账户数据", "", `日志时间: ${logTimestamp}`);
            $done({});
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
                $notification.post("⚠️ 【京豆查询】未在日志中匹配到指定 Pin", "", `配置的 Pin: ${userPinStr}\n日志时间: ${logTimestamp}`);
                $done({});
                return;
            }
        }

        console.log(`[京豆查询] 匹配成功，输出账号数: ${targetRuns.length} (${logTimestamp})`);

        // ─── 6. 转换格式并发送通知 ───
        const qlResults = targetRuns.map(run => {
            const { block, logPin } = run;
            return {
                pin: logPin,
                todayIncome: extractField(block, ['今日收入', '今日增加', '今日获得', '今天收入']),
                currentBeans: extractField(block, ['当前京豆', '京豆余额', '当前余额', '总京豆', '余额']),
                expiringSoon: extractField(block, ['即将过期', '即将到期', '即将失效', '过期京豆'])
            };
        });

        const sourceLabel = isFiltered ? `指定 Pin 查询 (${logTimestamp})` : `全量日志查询 (${logTimestamp})`;
        sendNotification(qlResults, sourceLabel);

    } catch (e) {
        console.log(`[京豆查询] 发生异常: ${e.message || e}`);
        $notification.post("❌ 【京豆查询】脚本执行错误", "", String(e.message || e));
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
        }, async (err, resp, body) => {
            if (err) { resolve(null); return; }
            try {
                const d = JSON.parse(body);
                let list = [];
                if (d && d.data) {
                    list = Array.isArray(d.data.data) ? d.data.data : (Array.isArray(d.data) ? d.data : []);
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

                // 获取最新运行日志
                const content = await fetchCronLog(qlBase, token, targetId);
                resolve(content);
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

                // 备用：读取历史日志列表
                if (!content || content.trim().length === 0) {
                    $httpClient.get({
                        url: `${qlBase}/open/crons/${targetId}/logs`,
                        method: "GET",
                        headers: { "Authorization": `Bearer ${token}` }
                    }, (err2, resp2, body2) => {
                        if (err2) { resolve(null); return; }
                        try {
                            const hd = JSON.parse(body2);
                            if (hd && hd.data && Array.isArray(hd.data) && hd.data.length > 0) {
                                const lastLog = hd.data[hd.data.length - 1];
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

// ─── 日志解析 ───
function parseQlLog(logContent) {
    const allRuns = [];
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
        return actual.length <= 4
            ? "jd_" + actual[0] + "***" + actual[actual.length - 1]
            : "jd_" + actual.substring(0, 2) + "***" + actual.substring(actual.length - 2);
    }
    if (s.length <= 6) return s[0] + "***" + s[s.length - 1];
    return s.substring(0, 3) + "***" + s.substring(s.length - 3);
}

function sendNotification(results, sourceName) {
    const title = `💰 京豆资产汇总 (${results.length}账号)`;
    const subtitle = `📌 数据来源: ${sourceName}`;
    const body = results.map((item, idx) =>
        `👤 账号 ${idx + 1}: ${maskPin(item.pin)}\n` +
        `📊 今日收入: ${item.todayIncome}\n` +
        `💎 当前余额: ${item.currentBeans}\n` +
        `⏳ 即将过期: ${item.expiringSoon}`
    ).join("\n──────────────────\n");

    $notification.post(title, subtitle, body);
}
