/*
 * 脚本名称: 日志检测与PIN通知脚本 (jd_log_monitor.js)
 * 脚本功能: 监测指定脚本的日志，提取 "现有: XX.XX" 数值，超过设定阈值(如>11)且匹配指定PIN时发送通知
 * 配置方式: 支持通过 BoxJS 配置 (或青龙环境变量)
 * 脚本版本: v1.0.1
 * 
 * Cron 示例: 0 0-23/1 * * * jd_log_monitor.js
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// 引入青龙 / Surge / QX Env 兼容类
const $ = new Env('日志检测通知');
let notify;
try {
    notify = require('./sendNotify');
} catch (e) {
    notify = {
        sendNotify: async (title, content) => {
            console.log(`[通知] ${title}\n${content}`);
        }
    };
}

// 默认配置
const DEFAULT_CONFIG = {
    script_name: 'jd_test.js',                  // 默认要检测的脚本名
    target_pins: '',                           // 默认PIN列表（为空时检测所有匹配到的PIN，多个用逗号隔开）
    threshold: 11.0,                            // 默认数值阈值
    keyword_regex: '现有:\\s*([0-9]+(?:\\.[0-9]+)?)', // 匹配 "现有: 17.28" 的正则
    boxjs_url: 'http://127.0.0.1:5624/api/getdata'  // BoxJS 默认 API 地址
};

// 当前生效的配置
let sysConfig = { ...DEFAULT_CONFIG };

(async () => {
    $.log(`\n================== [日志检测通知 v1.0.1] ==================`);
    
    // 1. 获取 BoxJS / 环境变量配置
    await loadConfig();

    $.log(`[配置信息] 检测脚本: ${sysConfig.script_name}`);
    $.log(`[配置信息] 判定阈值: > ${sysConfig.threshold}`);
    $.log(`[配置信息] 目标 PIN : ${sysConfig.target_pins ? sysConfig.target_pins.join(', ') : '所有账号 (未单独指定)'}`);
    $.log(`[配置信息] 匹配正则: ${sysConfig.keyword_regex}`);

    if (!sysConfig.script_name) {
        $.log(`❌ 未配置要检测的脚本名称！请在 BoxJS 或环境变量中配置。`);
        return;
    }

    // 2. 查找最新的日志文件
    const logFiles = findLatestLogFiles(sysConfig.script_name);
    if (!logFiles || logFiles.length === 0) {
        $.log(`⚠️ 未在青龙日志目录找到脚本 [${sysConfig.script_name}] 的执行日志。`);
        return;
    }

    $.log(`🔍 找到最新日志文件: ${logFiles[0]}`);

    // 3. 读取并分析日志
    const alertList = analyzeLogFile(logFiles[0]);

    // 4. 发送通知
    if (alertList && alertList.length > 0) {
        let msgTitle = `🚨 日志检测异常预警 [${sysConfig.script_name}]`;
        let msgContent = alertList.map(item => {
            return `👤 账号 PIN: ${item.pin}\n📊 检测数值: ${item.value} (阈值: > ${sysConfig.threshold})\n⏰ 匹配位置: ${item.lineText.trim()}`;
        }).join('\n----------------------------------------\n');

        $.log(`\n================ [发现符合条件的记录，准备通知] ================`);
        $.log(msgContent);

        await notify.sendNotify(msgTitle, msgContent);
    } else {
        $.log(`✅ 日志检测完毕，未发现大于 ${sysConfig.threshold} 且匹配指定 PIN 的记录。`);
    }

})()
.catch((e) => $.logErr(e))
.finally(() => $.done());

/**
 * 加载 BoxJS 配置或环境变量配置
 */
async function loadConfig() {
    let boxjsData = null;

    // 尝试从 BoxJS HTTP API 获取配置
    try {
        boxjsData = await fetchBoxJsData(DEFAULT_CONFIG.boxjs_url);
    } catch (e) {
        $.log(`[提示] 从 BoxJS API 读取配置失败 (BoxJS 可能未运行或无法连接)，将尝试读取环境变量与本地存储。`);
    }

    let rawScriptName = getVal('log_monitor_script_name', 'LOG_MONITOR_SCRIPT_NAME', boxjsData) || DEFAULT_CONFIG.script_name;
    let rawPins = getVal('log_monitor_pins', 'LOG_MONITOR_PINS', boxjsData) || DEFAULT_CONFIG.target_pins;
    let rawThreshold = getVal('log_monitor_threshold', 'LOG_MONITOR_THRESHOLD', boxjsData) || DEFAULT_CONFIG.threshold;
    let rawKeyword = getVal('log_monitor_keyword', 'LOG_MONITOR_KEYWORD', boxjsData) || DEFAULT_CONFIG.keyword_regex;

    sysConfig.script_name = rawScriptName.trim();
    
    // 解析 PIN 列表
    if (rawPins && typeof rawPins === 'string') {
        sysConfig.target_pins = rawPins
            .split(/[,;\n\r]+/)
            .map(p => p.trim())
            .filter(p => p.length > 0);
    } else if (Array.isArray(rawPins)) {
        sysConfig.target_pins = rawPins.map(p => String(p).trim()).filter(Boolean);
    } else {
        sysConfig.target_pins = null;
    }

    // 解析 阈值
    if (rawThreshold !== undefined && rawThreshold !== null && rawThreshold !== '') {
        let num = parseFloat(rawThreshold);
        if (!isNaN(num)) {
            sysConfig.threshold = num;
        }
    }

    // 解析 关键字正则
    if (rawKeyword && typeof rawKeyword === 'string' && rawKeyword.trim()) {
        sysConfig.keyword_regex = rawKeyword.trim();
    }
}

/**
 * 优先从 BoxJS 数据、青龙环境变量、持久化存储读取值
 */
function getVal(boxjsKey, envKey, boxjsData) {
    if (boxjsData && boxjsData[boxjsKey] !== undefined && boxjsData[boxjsKey] !== '') {
        return boxjsData[boxjsKey];
    }
    if (process.env[envKey] !== undefined && process.env[envKey] !== '') {
        return process.env[envKey];
    }
    if (process.env[boxjsKey] !== undefined && process.env[boxjsKey] !== '') {
        return process.env[boxjsKey];
    }
    if ($.getdata && $.getdata(boxjsKey)) {
        return $.getdata(boxjsKey);
    }
    return null;
}

/**
 * 通过 HTTP GET 从 BoxJS 获取数据
 */
function fetchBoxJsData(urlStr) {
    return new Promise((resolve, reject) => {
        try {
            const req = http.get(urlStr, { timeout: 3000 }, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        let json = JSON.parse(data);
                        resolve(json.datas || json.data || json);
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            req.on('error', (err) => reject(err));
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Timeout'));
            });
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * 寻找青龙面板下指定脚本的最新日志文件
 */
function findLatestLogFiles(scriptName) {
    const cleanName = scriptName.replace(/\.js$/i, '').replace(/\./g, '_');
    
    // 青龙常见的日志根目录
    const possibleLogRoots = [
        process.env.QL_DATA_DIR ? path.join(process.env.QL_DATA_DIR, 'log') : null,
        '/ql/data/log',
        '/ql/log',
        path.join(__dirname, 'logs')
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

    if (candidateDirs.length === 0) {
        return null;
    }

    let allLogFiles = [];
    for (let dir of candidateDirs) {
        try {
            const files = fs.readdirSync(dir);
            for (let file of files) {
                if (file.endsWith('.log')) {
                    const filePath = path.join(dir, file);
                    const stat = fs.statSync(filePath);
                    allLogFiles.push({
                        path: filePath,
                        mtime: stat.mtimeMs
                    });
                }
            }
        } catch (e) {}
    }

    allLogFiles.sort((a, b) => b.mtime - a.mtime);
    return allLogFiles.map(f => f.path);
}

/**
 * 分析日志文件
 */
function analyzeLogFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let lines = content.split('\n');

    let results = [];
    let currentPin = '未匹配到PIN';

    let regex;
    try {
        regex = new RegExp(sysConfig.keyword_regex, 'i');
    } catch (e) {
        $.log(`⚠️ 配置的正则表达式无效 [${sysConfig.keyword_regex}]，将使用默认正则`);
        regex = new RegExp('现有:\\s*([0-9]+(?:\\.[0-9]+)?)', 'i');
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
                if (numVal > sysConfig.threshold) {
                    let isTargetPin = false;
                    if (!sysConfig.target_pins || sysConfig.target_pins.length === 0) {
                        isTargetPin = true;
                    } else {
                        isTargetPin = sysConfig.target_pins.some(p => 
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
                        $.log(`[跳过通知] PIN [${currentPin}] 数值 ${numVal} > ${sysConfig.threshold}，但不在设定的指定 PIN 列表中`);
                    }
                }
            }
        }
    }

    return results;
}

// Env 封装函数 (兼容 QX, Surge, Loon, QL, Node.js)
function Env(name, opts) {
    return new (class {
        constructor(name, opts) {
            this.name = name;
            this.logs = [];
            this.isNode = () => "undefined" !== typeof module && !!module.exports;
            this.log = (...t) => console.log(...t);
            this.logErr = (t, e) => console.log(`❌ ${this.name} 错误:`, t);
            this.getdata = (t) => this.isNode() ? process.env[t] : null;
            this.done = (t = {}) => {
                if (this.isNode()) {
                    process.exit(0);
                }
            };
        }
    })(name, opts);
}
