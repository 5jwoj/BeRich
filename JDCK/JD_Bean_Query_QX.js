/*
 * 📦 JD 京豆查询 - 青龙面板专属版 (Quantumult X / Loon / Surge / Stash)
 * Version: v1.3.4
 * Author: z.W.
 * 
 * 功能说明:
 *   1. 读取 BoxJS 或 MANUAL_CONFIG 中配置的青龙面板信息 (地址/Client ID/Secret)。
 *   2. 读取 BoxJS 中指定的京东账号 Pin (jd_local_pin)，精准过滤并展示该账号在青龙资产日志中的京豆情况。
 *   3. 自动匹配最近一次运行的目标任务与最新历史日志。
 *   4. 增加全流程详细排查日志与多格式账号解析支持。
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
    script_name: "",         // 资产脚本名称（留空优先从 BoxJS 中读取 jd_asset_script_name，默认 jd_task_assets）
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

    console.log(`\n================== [京豆查询 v1.3.4 启动调试] ==================`);
    console.log(`[配置检查] 目标脚本名称: "${scriptName}"`);
    console.log(`[配置检查] 过滤 Pin 配置: "${userPinStr || "未指定(展示全部)"}"`);
    console.log(`[配置检查] 青龙 URL: "${ql_url || "未配置"}"`);

    if (!ql_url || !ql_client_id || !ql_client_secret) {
        console.log(`[错误] 青龙参数配置不完整 (ql_url/client_id/client_secret)`);
        $notify("⚠️ 【京豆查询】请设置青龙面板参数", "", "请在 BoxJS 或脚本中配置青龙面板地址(ql_url)、Client ID 及 Secret");
        $done();
        return;
    }

    if (!ql_url.startsWith("http://") && !ql_url.startsWith("https://")) ql_url = "http://" + ql_url;
    const qlBase = ql_url.replace(/\/$/, '');

    try {
        // ─── 2. 获取青龙 Token ───
        console.log(`[步骤 1] 正在请求青龙 Token...`);
        const token = await getQlToken(qlBase, ql_client_id, ql_client_secret);
        if (!token) {
            console.log(`[错误] 获取青龙 Token 失败！请检查 ID 与 Secret`);
            $notify("❌ 【京豆查询】获取青龙 Token 失败", "", "无法登录青龙面板，请检查 Client ID / Secret");
            $done();
            return;
        }
        console.log(`[步骤 1] 成功获取 Token: ${token.substring(0, 10)}...`);

        // ─── 3. 读取资产脚本最近一次运行日志 ───
        console.log(`[步骤 2] 正在检索青龙任务列表，匹配名称: "${scriptName}"...`);
        const logContent = await getQlCronLog(qlBase, token, scriptName);
        if (!logContent) {
            console.log(`[错误] 未能找到匹配 "${scriptName}" 的任务或日志内容为空！`);
            $notify("⚠️ 【京豆查询】读取青龙日志失败", "", `未能找到匹配 ${scriptName} 的最近运行日志`);
            $done();
            return;
        }

        console.log(`[步骤 2] 日志获取成功！总字符数: ${logContent.length}`);
        console.log(`[日志片段预览 (前400字)]:\n----------------------------------------\n${logContent.substring(0, 400)}\n----------------------------------------`);

        // ─── 4. 解析日志数据 ───
        console.log(`[步骤 3] 开始解析日志中的账号数据...`);
        const allRuns = parseQlLog(logContent);
        const logTimeMatch = logContent.match(/(\d{4}[-\/]\d{2}[-\/]\d{2}\s+\d{2}:\d{2}:\d{2})/);
        const logTimestamp = logTimeMatch ? logTimeMatch[1] : "最近一次运行";

        console.log(`[步骤 3] 日志识别到运行时间: "${logTimestamp}"，已解析账号数量: ${allRuns.length}`);
        if (allRuns.length > 0) {
            console.log(`[步骤 3] 解析出的账号列表: [${allRuns.map(r => r.logPin).join(", ")}]`);
        }

        if (allRuns.length === 0) {
            console.log(`[警告] 日志中未成功正则匹配到账号字段！`);
            $notify("⚠️ 【京豆查询】日志中未找到账户数据", "", `日志时间: ${logTimestamp}`);
            $done();
            return;
        }

        // ─── 5. 根据 BoxJS 配置的 Pin 进行精准过滤 ───
        let targetRuns = allRuns;
        let isFiltered = false;

        if (userPinStr.trim()) {
            const userPins = userPinStr.split(/[,，\s]+/).filter(Boolean);
            console.log(`[步骤 4] 正在按指定 Pin [${userPins.join(", ")}] 过滤结果...`);
            const matched = allRuns.filter(run => {
                return userPins.some(pin => 
                    run.logPin.toLowerCase().includes(pin.toLowerCase()) || 
                    pin.toLowerCase().includes(run.logPin.toLowerCase())
                );
            });
            if (matched.length > 0) {
                targetRuns = matched;
                isFiltered = true;
                console.log(`[步骤 4] 匹配成功！保留 ${targetRuns.length} 个目标账号`);
            } else {
                console.log(`[警告] 用户指定的 Pin [${userPins.join(", ")}] 未能匹配到日志中的任何账号`);
                $notify("⚠️ 【京豆查询】未在日志中匹配到指定 Pin", "", `配置的 Pin: ${userPinStr}\n日志时间: ${logTimestamp}`);
                $done();
                return;
            }
        }

        // ─── 6. 转换格式并发送本地通知 ───
        let qlResults = targetRuns.map(run => {
            const { block, logPin } = run;
            const todayIncome = extractField(block, ['今日收入', '今日增加', '今日获得', '今天收入']);
            const currentBeans = extractField(block, ['当前京豆', '京豆余额', '当前余额', '总京豆', '余额']);
            const expiringSoon = extractField(block, ['即将过期', '即将到期', '即将失效', '过期京豆']);
            console.log(`[账号结果] Pin: ${logPin} | 余额: ${currentBeans} | 今日: ${todayIncome} | 过期: ${expiringSoon}`);
            return {
                pin: logPin,
                todayIncome,
                currentBeans,
                expiringSoon
            };
        });

        const sourceLabel = isFiltered ? `指定 Pin 查询 (${logTimestamp})` : `全量日志查询 (${logTimestamp})`;
        sendLocalNotification(qlResults, sourceLabel);
        console.log(`================== [京豆查询 v1.3.4 执行完毕] ==================\n`);

    } catch (e) {
        console.log(`[异常] 脚本运行抛出错误: ${e.stack || e.message || e}`);
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
    
    console.log(`[调试-Task列表] 青龙获取到的任务总数: ${list.length}`);
    const baseName = scriptName.split('/').pop().replace(/\.js$/i, '').toLowerCase();
    
    // 查找包含目标脚本名称的所有任务
    const targets = list.filter(c => {
        const cmd = (c.command || '').toLowerCase();
        const name = (c.name || '').toLowerCase();
        const val = (c.value || '').toLowerCase();
        return cmd.includes(baseName) || name.includes(baseName) || val.includes(baseName);
    });

    console.log(`[调试-Task列表] 包含关键词 "${baseName}" 的任务数量: ${targets.length}`);
    targets.forEach((t, idx) => {
        console.log(`  └─ [${idx + 1}] ID: ${t.id || t._id} | Name: "${t.name}" | Command: "${t.command}" | LastRun: ${t.last_execution_time || '未记'}`);
    });

    if (targets.length === 0) return null;

    // 按最后一次运行时间倒序排列
    targets.sort((a, b) => {
        const timeA = new Date(a.last_execution_time || a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.last_execution_time || b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
    });

    const target = targets[0];
    const targetId = target.id || target._id;
    console.log(`[调试-Task选中] 锁定最新目标任务: "${target.name}" (ID: ${targetId})`);

    // 1. 获取该任务当前最新运行日志
    const logRes = await $task.fetch({
        url: `${qlBase}/open/crons/${targetId}/log`,
        method: "GET",
        headers: { "Authorization": `Bearer ${token}` }
    });
    const ld = typeof logRes.body === "string" ? JSON.parse(logRes.body) : logRes.body;
    let content = ld && ld.data ? (typeof ld.data === 'string' ? ld.data : ld.data.log || ld.data.content) : null;

    // 2. 备用逻辑：如果主日志为空，尝试获取任务的历史日志列表
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
        console.log(`[调试-Log] 主日志为空，尝试调用 /logs 接口获取历史日志列表...`);
        try {
            const historyRes = await $task.fetch({
                url: `${qlBase}/open/crons/${targetId}/logs`,
                method: "GET",
                headers: { "Authorization": `Bearer ${token}` }
            });
            const hd = typeof historyRes.body === "string" ? JSON.parse(historyRes.body) : historyRes.body;
            if (hd && hd.data && Array.isArray(hd.data) && hd.data.length > 0) {
                const lastLog = hd.data[hd.data.length - 1];
                content = typeof lastLog === 'string' ? lastLog : (lastLog.content || lastLog.log);
                console.log(`[调试-Log] 从历史日志列表中获取成功`);
            }
        } catch (e) {
            console.log(`[调试-Log] 历史日志获取异常: ${e.message || e}`);
        }
    }

    return content;
}

function parseQlLog(logContent) {
    const allRuns = [];
    
    // 多模式匹配账号 header
    // 模式1: [Run] 运行账户: xxx
    // 模式2: 【京东账号1】xxx 或 【账号1】xxx
    // 模式3: 账号1：xxx 或 账号 1: xxx
    const runPatterns = [
        /\[Run\]\s*运行账户:\s*(\S+)/g,
        /【(?:京东)?账号\s*\d*】\s*(\S+)/g,
        /账号\s*\d+[：:]\s*(\S+)/g
    ];

    let matches = [];
    for (const pattern of runPatterns) {
        let rm;
        pattern.lastIndex = 0; // 重置正则游标
        while ((rm = pattern.exec(logContent)) !== null) {
            matches.push({ logPin: rm[1].trim(), index: rm.index });
        }
        if (matches.length > 0) break; // 如果某种模式匹配成功，则采用该模式
    }

    // 按在文本中的出现顺序排序
    matches.sort((a, b) => a.index - b.index);

    // 去重相邻或相同索引的匹配
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
