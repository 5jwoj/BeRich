/*
 * 📦 日志检测与PIN通知脚本 (Quantumult X / Loon / Surge / Stash / 青龙面板)
 * Version: v1.0.2
 * Author: 5jwoj
 * 
 * 功能说明:
 *   1. 支持在 Quantumult X 等 iOS / 软路由代理工具及青龙面板 Node.js 环境中运行。
 *   2. 支持通过 BoxJS 或 MANUAL_CONFIG 配置青龙面板地址、密钥、目标脚本名、指定 PIN 列表及检测阈值。
 *   3. 自动读取目标脚本最近一次运行日志，提取 "现有: XX.XX" 数值。
 *   4. 当数值大于设定阈值 (如 > 11) 且匹配指定 PIN 时，第一时间发送系统弹窗与日志警报！
 * 
 * --------------------------------------------------------------------------------
 * QX 任务配置 (task_local):
 * 0 7 * * * https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/jd_log_monitor.js, tag=日志数值检测通知, img-url=https://raw.githubusercontent.com/Orz-3/mini/master/Color/jd.png, enabled=true
 * 
 * Loon 脚本配置:
 * cron "0 0-23/1 * * *" script-path=https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/jd_log_monitor.js, tag=日志数值检测通知
 * 
 * Surge 脚本配置:
 * 日志数值检测通知 = type=cron, cronexp="0 0-23/1 * * *", script-path=https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/jd_log_monitor.js
 * --------------------------------------------------------------------------------
 */

// ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
// 手动配置区 (若在 BoxJS 中设置，则无需修改此处)
const MANUAL_CONFIG = {
    url: "",                      // 青龙面板地址，例如 "http://192.168.1.1:5700"
    id: "",                       // 青龙 Client ID
    secret: "",                   // 青龙 Client Secret
    script_name: "jd_test.js",    // 检测的目标脚本名称 (例如: jd_test.js)
    pins: "",                     // 指定需要通知的账号 PIN (多个用逗号隔开，留空则匹配所有账号)
    threshold: "11",              // 触发通知的数值阈值 (例如: 11)
    keyword: "现有:\\s*([0-9]+(?:\\.[0-9]+)?)" // 提取数值的正则表达式
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
    $.log(`\n================== [日志检测通知 v1.0.2] ==================`);

    // 1. 加载配置
    const config = await loadAllConfig();
    $.log(`[配置信息] 青龙地址: ${config.ql_url || "未配置(尝试本地扫描)"}`);
    $.log(`[配置信息] 目标脚本: ${config.script_name}`);
    $.log(`[配置信息] 判定阈值: > ${config.threshold}`);
    $.log(`[配置信息] 目标 PIN : ${config.target_pins ? config.target_pins.join(', ') : "所有账号 (未单独指定)"}`);

    if (!config.script_name) {
        $.msg("⚠️ 【日志检测】未配置目标脚本", "", "请在 BoxJS 或 MANUAL_CONFIG 中配置需要检测的脚本名称");
        $.done();
        return;
    }

    let logContent = "";

    // 2. 获取日志内容 (优先通过青龙 API，若为青龙本地 Node.js 且未填 API 则直接读文件)
    if (config.ql_url && config.ql_client_id && config.ql_client_secret) {
        let qlUrl = config.ql_url;
        if (!qlUrl.startsWith("http://") && !qlUrl.startsWith("https://")) qlUrl = "http://" + qlUrl;
        qlUrl = qlUrl.replace(/\/$/, "");

        $.log(`🌐 正在请求青龙 Open API [${qlUrl}] 读取日志...`);
        try {
            const token = await getQlToken(qlUrl, config.ql_client_id, config.ql_client_secret);
            if (token) {
                logContent = await getQlCronLog(qlUrl, token, config.script_name);
            } else {
                $.log(`❌ 从青龙 API 获取 Token 失败，请检查 Client ID / Secret`);
            }
        } catch (e) {
            $.log(`❌ 请求青龙 API 失败: ${e.message || e}`);
        }
    }

    // 若通过 API 未拿到日志，且处在 Node.js 环境，尝试从本地文件系统检索
    if (!logContent && $.isNode()) {
        $.log(`📂 尝试从本地青龙日志目录检索日志...`);
        const localLogFile = findLatestLogFiles(config.script_name);
        if (localLogFile) {
            $.log(`🔍 找到本地日志: ${localLogFile}`);
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

    // 3. 解析与分析日志
    const alertList = analyzeLogContent(logContent, config);

    // 4. 结果预警与通知推送
    if (alertList && alertList.length > 0) {
        let msgTitle = `🚨 日志检测预警 [${config.script_name}]`;
        let msgContent = alertList.map(item => {
            return `👤 账号 PIN: ${item.pin}\n📊 检测数值: ${item.value} (阈值: > ${config.threshold})\n⏰ 匹配行: ${item.lineText.trim()}`;
        }).join("\n----------------------------------------\n");

        $.log(`\n================ [发现符合条件的记录，准备发送通知] ================`);
        $.log(msgContent);

        // 发送 App 系统弹窗/推送通知
        $.msg(msgTitle, "", msgContent);

        // 如果在青龙 Node.js 且有 sendNotify
        if (notify && notify.sendNotify) {
            await notify.sendNotify(msgTitle, msgContent);
        }
    } else {
        $.log(`✅ 日志检测完毕，未发现数值大于 ${config.threshold} 且匹配指定 PIN 的记录。`);
    }

})()
.catch((e) => $.logErr(e))
.finally(() => $.done());

/**
 * 聚合读取 BoxJS、MANUAL_CONFIG 和环境变量中的配置
 */
async function loadAllConfig() {
    let cfg = {
        ql_url: MANUAL_CONFIG.url || $.getdata("jd_ql_url") || $.getdata("ql_url") || "",
        ql_client_id: MANUAL_CONFIG.id || $.getdata("jd_ql_client_id") || $.getdata("ql_client_id") || "",
        ql_client_secret: MANUAL_CONFIG.secret || $.getdata("jd_ql_client_secret") || $.getdata("ql_client_secret") || "",
        script_name: MANUAL_CONFIG.script_name || $.getdata("log_monitor_script_name") || $.getdata("LOG_MONITOR_SCRIPT_NAME") || "jd_test.js",
        pins_str: MANUAL_CONFIG.pins || $.getdata("log_monitor_pins") || $.getdata("LOG_MONITOR_PINS") || "",
        threshold: parseFloat(MANUAL_CONFIG.threshold || $.getdata("log_monitor_threshold") || $.getdata("LOG_MONITOR_THRESHOLD") || "11"),
        keyword_regex: MANUAL_CONFIG.keyword || $.getdata("log_monitor_keyword") || $.getdata("LOG_MONITOR_KEYWORD") || "现有:\\s*([0-9]+(?:\\.[0-9]+)?)"
    };

    // 如果运行在 Node.js 且无法通过 persistentStore 拿到 BoxJS，尝试调 HTTP API
    if ($.isNode() && (!cfg.script_name || cfg.script_name === "jd_test.js")) {
        try {
            const boxData = await fetchBoxJsHttp();
            if (boxData) {
                if (boxData.log_monitor_script_name) cfg.script_name = boxData.log_monitor_script_name;
                if (boxData.log_monitor_pins) cfg.pins_str = boxData.log_monitor_pins;
                if (boxData.log_monitor_threshold) cfg.threshold = parseFloat(boxData.log_monitor_threshold);
                if (boxData.log_monitor_keyword) cfg.keyword_regex = boxData.log_monitor_keyword;
                if (boxData.jd_ql_url) cfg.ql_url = boxData.jd_ql_url;
                if (boxData.jd_ql_client_id) cfg.ql_client_id = boxData.jd_ql_client_id;
                if (boxData.jd_ql_client_secret) cfg.ql_client_secret = boxData.jd_ql_client_secret;
            }
        } catch (e) {}
    }

    if (isNaN(cfg.threshold)) cfg.threshold = 11.0;
    cfg.script_name = cfg.script_name ? cfg.script_name.trim() : "";

    // 解析 target_pins
    if (cfg.pins_str && typeof cfg.pins_str === "string") {
        cfg.target_pins = cfg.pins_str
            .split(/[,;\n\r，]+/)
            .map(p => p.trim())
            .filter(Boolean);
    } else {
        cfg.target_pins = null;
    }

    return cfg;
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
        $.log(`⚠️ 青龙面板定时任务列表中未匹配到脚本名包含 [${baseName}] 的任务`);
        return null;
    }

    const cronId = targetCron.id || targetCron._id;
    $.log(`🎯 匹配到定时任务: [${targetCron.name || targetCron.command}] (ID: ${cronId})`);

    // 获取日志
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
    let results = [];
    let currentPin = "未匹配到PIN";

    let regex;
    try {
        regex = new RegExp(config.keyword_regex, "i");
    } catch (e) {
        regex = new RegExp("现有:\\s*([0-9]+(?:\\.[0-9]+)?)", "i");
    }

    const pinRegexPatterns = [
        /pt_pin=([^; \n\r\t]+)/i,
        /pin[:：]\s*([^\s;,\n\r]+)/i,
        /【账号\d*】\s*([^\s\n\r;]+)/i,
        /账号[：:]\s*([^\s\n\r;]+)/i
    ];

    for (let line of lines) {
        for (let pRegex of pinRegexPatterns) {
            let pinMatch = line.match(pRegex);
            if (pinMatch && pinMatch[1]) {
                currentPin = pinMatch[1].trim();
                break;
            }
        }

        let match = line.match(regex);
        if (match) {
            let valStr = match[1] || match[0];
            let numVal = parseFloat(valStr);

            if (!isNaN(numVal)) {
                if (numVal > config.threshold) {
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
                        results.push({
                            pin: currentPin,
                            value: numVal,
                            lineText: line
                        });
                    } else {
                        $.log(`[跳过通知] PIN [${currentPin}] 数值 ${numVal} > ${config.threshold}，但不在指定的 PIN 列表中`);
                    }
                }
            }
        }
    }

    return results;
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
