/*
 * 📦 日志检测与PIN通知脚本 (Quantumult X / Loon / Surge / Stash / 青龙面板)
 * Version: v1.0.7
 * Author: 5jwoj
 * 
 * 功能说明:
 *   1. 支持在 Quantumult X 等 iOS / 软路由代理工具及青龙面板 Node.js 环境中双模运行。
 *   2. 支持通过 BoxJS 或 MANUAL_CONFIG 配置青龙面板地址、密钥、目标脚本名、指定 PIN 列表及检测阈值。
 *   3. 完美兼容各种青龙日志格式 (包含 [Run] 运行账户: xxx / [Msg xxx] / [Log xxx] / pt_pin=xxx 等)。
 *   4. 实时提取并显示指定 PIN 账号的最新数值，达到阈值(如 > 11)提示兑换话费！
 * 
 * --------------------------------------------------------------------------------
 * QX 任务配置 (task_local):
 * 0 0-23/1 * * * https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/jd_log_monitor.js, tag=日志数值检测通知, img-url=https://raw.githubusercontent.com/Orz-3/mini/master/Color/jd.png, enabled=true
 * --------------------------------------------------------------------------------
 */

// ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
// 手动配置区 (若在 BoxJS 中设置，保留留空即可优先读取 BoxJS 中的配置)
const MANUAL_CONFIG = {
    url: "",                      // 青龙面板地址，例如 "http://192.168.1.1:5700"
    id: "",                       // 青龙 Client ID
    secret: "",                   // 青龙 Client Secret
    script_name: "",              // 检测的目标脚本名称 (留空优先读取 BoxJS 中的配置)
    pins: "",                     // 指定需要通知的账号 PIN (多个用逗号隔开，留空匹配所有账号)
    threshold: "",                // 触发通知的数值阈值 (默认: 11)
    keyword: ""                   // 提取数值的正则表达式
};
// ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

const $ = new Env("日志检测通知");
let notify;
try {
    notify = require("./sendNotify");
} catch (e) {
    notify = null;
}

(async () => {
    $.log(`\n================== [日志检测通知 v1.0.7] ==================`);

    // 1. 加载配置
    const config = await loadAllConfig();
    $.log(`[配置信息] 目标脚本: ${config.script_name} | 判定阈值: > ${config.threshold} | 目标 PIN: ${config.target_pins ? config.target_pins.map(p => maskPin(p)).join(', ') : "全部账号"}`);

    if (!config.script_name) {
        $.msg("⚠️ 【日志检测】未配置目标脚本", "", "请在 BoxJS 或 MANUAL_CONFIG 中配置需要检测的脚本名称");
        $.done();
        return;
    }

    let logContent = "";

    // 2. 获取日志内容 (优先通过青龙 Open API，次选青龙本地文件)
    if (config.ql_url && config.ql_client_id && config.ql_client_secret) {
        let qlUrl = config.ql_url;
        if (!qlUrl.startsWith("http://") && !qlUrl.startsWith("https://")) qlUrl = "http://" + qlUrl;
        qlUrl = qlUrl.replace(/\/$/, "");

        try {
            const token = await getQlToken(qlUrl, config.ql_client_id, config.ql_client_secret);
            if (token) {
                logContent = await getQlCronLog(qlUrl, token, config.script_name);
            } else {
                $.log(`❌ 青龙 Token 获取失败，请检查 Client ID / Secret`);
            }
        } catch (e) {
            $.log(`❌ 请求青龙 API 失败: ${e.message || e}`);
        }
    }

    // 若通过 API 未拿到日志，且处在 Node.js 本地环境，尝试从本地文件系统检索
    if (!logContent && $.isNode()) {
        const localLogFile = findLatestLogFiles(config.script_name);
        if (localLogFile) {
            const fs = require("fs");
            logContent = fs.readFileSync(localLogFile, "utf8");
        }
    }

    if (!logContent) {
        $.log(`⚠️ 未能获取到脚本 [${config.script_name}] 的最新运行日志`);
        if (!$.isNode() && (!config.ql_url || !config.ql_client_id)) {
            $.msg("⚠️ 【日志检测】需配置青龙面板 API", "", "在 Quantumult X 中运行需在 BoxJS 配置青龙地址及 Client ID/Secret");
        }
        $.done();
        return;
    }

    // 3. 解析与分析日志中的所有 PIN 数值
    const parseResult = analyzeLogContent(logContent, config);
    const { allMatchedRecords, alertList } = parseResult;

    // 4. 无论是否达到阈值，均在日志中清晰打印指定 PIN 当前提取到的数值
    if (allMatchedRecords && allMatchedRecords.length > 0) {
        $.log(`\n📊 ---------------- [目标 PIN 数值明细] ----------------`);
        allMatchedRecords.forEach(item => {
            const isExceeded = item.value > config.threshold;
            const statusStr = isExceeded ? `🔥 高于 ${config.threshold} (满足可兑换话费条件!)` : `未达到阈值 ${config.threshold}`;
            $.log(`👤 账号: ${maskPin(item.pin)} | 当前数值: ${item.value} [${statusStr}]`);
        });
    } else {
        $.log(`⚠️ 日志中未匹配到指定 PIN 的有效数值记录`);
    }

    // 5. 满足兑换条件 (> 11) 的触发通知
    if (alertList && alertList.length > 0) {
        let msgTitle = `🎁 话费可兑换提醒 [${config.script_name}]`;
        
        let msgContentList = alertList.map(item => {
            return `👤 账号 PIN: ${maskPin(item.pin)}\n💰 当前数值: ${item.value}\n🎉 消息提示: 当前数值大于 ${config.threshold}，可以去兑换话费啦！`;
        });

        let msgContent = msgContentList.join("\n----------------------------------------\n");
        let subTitle = `账号: ${maskPin(alertList[0].pin)} (数值: ${alertList[0].value})`;

        $.log(`\n🎉 [检测结果] 当前数值已达 ${alertList[0].value} (高于 ${config.threshold})，可以前往兑换话费！`);

        // 发送 App 系统弹窗/推送通知
        $.msg(msgTitle, subTitle, `当前数值已达到 ${alertList[0].value}，高于 ${config.threshold}，可以去兑换话费啦！`);

        // 如果在青龙 Node.js 且有 sendNotify
        if (notify && notify.sendNotify) {
            await notify.sendNotify(msgTitle, msgContent);
        }
    }

})()
.catch((e) => $.logErr(e))
.finally(() => $.done());

/**
 * 通用获取 BoxJS / 环境变量 / MANUAL_CONFIG 配置值
 */
function getVal(key, envKey) {
    if (MANUAL_CONFIG[key] && String(MANUAL_CONFIG[key]).trim()) {
        return String(MANUAL_CONFIG[key]).trim();
    }
    const val = $.getdata(key) || 
                $.getdata(`@log_monitor.${key}`) || 
                $.getdata(`jd.log.monitor.${key}`) || 
                $.getdata(`log_monitor_app.${key}`) ||
                ($.isNode() ? process.env[envKey || key.toUpperCase()] : null);

    if (val !== null && val !== undefined && String(val).trim() !== "") {
        return String(val).trim();
    }
    return null;
}

/**
 * 聚合读取 BoxJS、MANUAL_CONFIG 和环境变量中的配置
 */
async function loadAllConfig() {
    let ql_url = getVal("url", "LOG_MONITOR_QL_URL") || $.getdata("jd_ql_url") || $.getdata("ql_url") || "";
    let ql_client_id = getVal("id", "LOG_MONITOR_QL_ID") || $.getdata("jd_ql_client_id") || $.getdata("ql_client_id") || "";
    let ql_client_secret = getVal("secret", "LOG_MONITOR_QL_SECRET") || $.getdata("jd_ql_client_secret") || $.getdata("ql_client_secret") || "";

    let script_name = getVal("log_monitor_script_name", "LOG_MONITOR_SCRIPT_NAME") || getVal("script_name") || "jd_test.js";
    let pins_str = getVal("log_monitor_pins", "LOG_MONITOR_PINS") || getVal("pins") || "";
    let threshold_raw = getVal("log_monitor_threshold", "LOG_MONITOR_THRESHOLD") || getVal("threshold") || "11";
    let keyword_regex = getVal("log_monitor_keyword", "LOG_MONITOR_KEYWORD") || getVal("keyword") || "现有:\\s*([0-9]+(?:\\.[0-9]+)?)";

    if ($.isNode()) {
        try {
            const boxData = await fetchBoxJsHttp();
            if (boxData) {
                if (boxData.log_monitor_script_name) script_name = boxData.log_monitor_script_name;
                if (boxData.log_monitor_pins) pins_str = boxData.log_monitor_pins;
                if (boxData.log_monitor_threshold) threshold_raw = boxData.log_monitor_threshold;
                if (boxData.log_monitor_keyword) keyword_regex = boxData.log_monitor_keyword;
                if (boxData.jd_ql_url) ql_url = boxData.jd_ql_url;
                if (boxData.jd_ql_client_id) ql_client_id = boxData.jd_ql_client_id;
                if (boxData.jd_ql_client_secret) ql_client_secret = boxData.jd_ql_client_secret;
            }
        } catch (e) {}
    }

    let threshold = parseFloat(threshold_raw);
    if (isNaN(threshold)) threshold = 11.0;

    let target_pins = null;
    if (pins_str) {
        target_pins = pins_str
            .split(/[,;\n\r，]+/)
            .map(p => p.trim())
            .filter(Boolean);
    }

    return {
        ql_url,
        ql_client_id,
        ql_client_secret,
        script_name: script_name.trim(),
        target_pins,
        threshold,
        keyword_regex: keyword_regex.trim()
    };
}

/**
 * 账号 PIN 掩码脱敏函数
 */
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

/**
 * 通过青龙 Open API 获取 Token
 */
async function getQlToken(qlBase, client_id, client_secret) {
    const res = await $.fetch({
        url: `${qlBase}/open/auth/token?client_id=${client_id}&client_secret=${client_secret}`,
        method: "GET"
    });
    const d = typeof res.body === "string" ? JSON.parse(res.body) : res.body;
    return (d && d.code === 200 && d.data) ? d.data.token : null;
}

/**
 * 通过青龙 Open API 获取指定脚本的最新日志
 */
async function getQlCronLog(qlBase, token, scriptName) {
    const cronsRes = await $.fetch({
        url: `${qlBase}/open/crons`,
        method: "GET",
        headers: { "Authorization": `Bearer ${token}` }
    });
    const d = typeof cronsRes.body === "string" ? JSON.parse(cronsRes.body) : cronsRes.body;
    let list = [];
    if (d && d.data) {
        list = Array.isArray(d.data.data) ? d.data.data : (Array.isArray(d.data) ? d.data : []);
    }

    const baseName = scriptName.split("/").pop().replace(/\.js$/i, "").toLowerCase();

    // 匹配包含 target 脚本的任务
    const targetCron = list.find(c => {
        const cmd = (c.command || "").toLowerCase();
        const name = (c.name || "").toLowerCase();
        return cmd.includes(baseName) || name.includes(baseName);
    });

    if (!targetCron) {
        $.log(`⚠️ 青龙任务列表中未找到匹配 [${baseName}] 的脚本`);
        return null;
    }

    const cronId = targetCron.id || targetCron._id;

    // 获取最新运行日志
    const logRes = await $.fetch({
        url: `${qlBase}/open/crons/${cronId}/log`,
        method: "GET",
        headers: { "Authorization": `Bearer ${token}` }
    });

    const logData = typeof logRes.body === "string" ? JSON.parse(logRes.body) : logRes.body;
    if (logData && logData.code === 200 && logData.data) {
        return typeof logData.data === "string" ? logData.data : (logData.data.log || "");
    }
    return null;
}

/**
 * 寻找青龙面板 Node.js 本地环境下最新的日志文件
 */
function findLatestLogFiles(scriptName) {
    const fs = require("fs");
    const path = require("path");
    const cleanName = scriptName.replace(/\.js$/i, "").replace(/\./g, "_");

    const possibleLogRoots = [
        process.env.QL_DATA_DIR ? path.join(process.env.QL_DATA_DIR, "log") : null,
        "/ql/data/log",
        "/ql/log",
        path.join(__dirname, "logs")
    ].filter(Boolean);

    let candidateDirs = [];
    for (let root of possibleLogRoots) {
        if (fs.existsSync(root)) {
            try {
                const subDirs = fs.readdirSync(root);
                for (let sub of subDirs) {
                    if (sub === scriptName || sub === cleanName || sub === `${cleanName}_js`) {
                        candidateDirs.push(path.join(root, sub));
                    }
                }
            } catch (e) {}
        }
    }

    if (candidateDirs.length === 0) return null;

    let allLogFiles = [];
    for (let dir of candidateDirs) {
        try {
            const files = fs.readdirSync(dir);
            for (let file of files) {
                if (file.endsWith(".log")) {
                    const filePath = path.join(dir, file);
                    const stat = fs.statSync(filePath);
                    allLogFiles.push({ path: filePath, mtime: stat.mtimeMs });
                }
            }
        } catch (e) {}
    }

    allLogFiles.sort((a, b) => b.mtime - a.mtime);
    return allLogFiles.length > 0 ? allLogFiles[0].path : null;
}

/**
 * 分析日志文本中的数值与对应 PIN
 */
function analyzeLogContent(content, config) {
    let lines = content.split("\n");
    let allMatchedRecords = [];
    let alertList = [];
    let currentPin = "未匹配到PIN";

    let regex;
    try {
        regex = new RegExp(config.keyword_regex, "i");
    } catch (e) {
        regex = new RegExp("现有:\\s*([0-9]+(?:\\.[0-9]+)?)", "i");
    }

    // 增强型 PIN 匹配模式 (全方位适配各种青龙脚本日志输出)
    const pinRegexPatterns = [
        /运行账户[：:\s]*([^\s;,\n\r]+)/i,
        /\[(?:Msg|Log|Temp|Run)\s+([^\]\s]+)\]/i,
        /\[(?:Msg|Log|Temp|Run)\]\s*([^\s\]]+)/i,
        /pt_pin=([^; \n\r\t]+)/i,
        /pin[：:\s]*([^\s;,\n\r]+)/i,
        /【(?:京东)?账号\s*\d*】\s*([^\s\n\r;]+)/i,
        /账号\s*\d*[：:\s]*([^\s\n\r;]+)/i
    ];

    for (let line of lines) {
        // 尝试从当前行更新当前 PIN
        for (let pRegex of pinRegexPatterns) {
            let pinMatch = line.match(pRegex);
            if (pinMatch && pinMatch[1]) {
                currentPin = pinMatch[1].trim();
                break;
            }
        }

        // 尝试从当前行匹配数值
        let match = line.match(regex);
        if (match) {
            let valStr = match[1] || match[0];
            let numVal = parseFloat(valStr);

            if (!isNaN(numVal)) {
                let isTargetPin = false;
                if (!config.target_pins || config.target_pins.length === 0) {
                    isTargetPin = true;
                } else {
                    isTargetPin = config.target_pins.some(p =>
                        currentPin.toLowerCase().includes(p.toLowerCase()) ||
                        p.toLowerCase().includes(currentPin.toLowerCase())
                    );
                }

                if (isTargetPin) {
                    const record = {
                        pin: currentPin,
                        value: numVal,
                        lineText: line
                    };
                    
                    // 仅对同一个 PIN 记录最新一次（覆盖之前旧行中的中间过程记录）
                    let existingIdx = allMatchedRecords.findIndex(r => r.pin === currentPin);
                    if (existingIdx !== -1) {
                        allMatchedRecords[existingIdx] = record;
                    } else {
                        allMatchedRecords.push(record);
                    }

                    if (numVal > config.threshold) {
                        let alertIdx = alertList.findIndex(r => r.pin === currentPin);
                        if (alertIdx !== -1) {
                            alertList[alertIdx] = record;
                        } else {
                            alertList.push(record);
                        }
                    }
                }
            }
        }
    }

    return { allMatchedRecords, alertList };
}

/**
 * Node 环境下从 BoxJS HTTP 获取数据
 */
function fetchBoxJsHttp() {
    const http = require("http");
    return new Promise((resolve, reject) => {
        const req = http.get("http://127.0.0.1:5624/api/getdata", { timeout: 3000 }, (res) => {
            let data = "";
            res.on("data", (chunk) => data += chunk);
            res.on("end", () => {
                try {
                    let json = JSON.parse(data);
                    resolve(json.datas || json.data || json);
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on("error", (err) => reject(err));
        req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    });
}

// ─── 跨环境 Env 封装 (支持 Quantumult X, Loon, Surge, Stash, Node.js) ───
function Env(name, opts) {
    return new (class {
        constructor(name, opts) {
            this.name = name;
            this.isQX = () => "undefined" !== typeof $task;
            this.isLoon = () => "undefined" !== typeof $loon;
            this.isSurge = () => "undefined" !== typeof $httpClient && "undefined" === typeof $loon;
            this.isNode = () => "undefined" !== typeof module && !!module.exports;
            this.log = (...t) => console.log(...t);
            this.logErr = (t) => console.log(`❌ ${this.name} 错误:`, t);

            this.getdata = (key) => {
                if (this.isQX()) return $prefs.valueForKey(key);
                if (this.isSurge() || this.isLoon()) return $persistentStore.read(key);
                if (this.isNode()) return process.env[key];
                return null;
            };

            this.msg = (title = this.name, subtitle = "", json = "") => {
                if (this.isQX()) $notify(title, subtitle, json);
                else if (this.isSurge() || this.isLoon()) $notification.post(title, subtitle, json);
                else this.log(`[通知] ${title} | ${subtitle}\n${json}`);
            };

            this.fetch = async (options) => {
                if (this.isQX()) {
                    return new Promise((resolve) => {
                        $task.fetch(options).then(
                            (res) => resolve(res),
                            (err) => resolve({ error: err })
                        );
                    });
                }
                if (this.isSurge() || this.isLoon()) {
                    return new Promise((resolve) => {
                        const method = (options.method || "GET").toLowerCase();
                        $httpClient[method](options, (err, response, body) => {
                            resolve({ status: response ? response.status : 500, headers: response ? response.headers : {}, body, error: err });
                        });
                    });
                }
                if (this.isNode()) {
                    const https = options.url.startsWith("https") ? require("https") : require("http");
                    const url = new URL(options.url);
                    return new Promise((resolve, reject) => {
                        const reqOpts = {
                            method: options.method || "GET",
                            headers: options.headers || {}
                        };
                        const req = https.request(url, reqOpts, (res) => {
                            let body = "";
                            res.on("data", chunk => body += chunk);
                            res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
                        });
                        req.on("error", err => resolve({ error: err }));
                        if (options.body) req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
                        req.end();
                    });
                }
            };

            this.done = (t = {}) => {
                if (this.isQX() || this.isSurge() || this.isLoon()) $done(t);
                else if (this.isNode()) process.exit(0);
            };
        }
    })(name, opts);
}
