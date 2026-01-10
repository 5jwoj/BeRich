/**
 * 农夫山泉 - 自动抽奖脚本
 * 
 * 功能:
 * 1. 自动完成每日任务
 * 2. 双通道混合抽奖
 * 3. 自动领取奖品
 * 4. 中一等奖时推送通知
 * 
 * 配置:
 * - Cookie 由 nfsq_cookie.js 自动抓取
 * - PUSH_PLUS_TOKEN: 可选，用于中奖推送
 */

const $ = new Env("农夫山泉");

// ============= 配置区域 =============
const MAX_TOTAL_TRY = 8;           // 每日最大尝试次数
const DELAY_MIN = 2000;            // 最小延迟(毫秒)
const DELAY_MAX = 4000;            // 最大延迟(毫秒)
const KEY_DATA = "nfsq_data";

const BASE_URL = "https://sxs-consumer.nfsq.com.cn";
const SCENE_LIST = ["SCENE-2510301509021", "SCENE-2510301508361"];

const BASE_LOCATION = {
    provice_name: "广东省",
    city_name: "广州市",
    area_name: "天河区",
    address: "广东省广州市天河区珠江新城123号",
    longitude: 113.3245,
    dimension: 23.1356
};
// ====================================

let notifyContent = [];
let shouldNotify = false;

function log(msg, icon = "") {
    const text = icon ? `${icon} ${msg}` : msg;
    console.log(text);
    notifyContent.push(text);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay() {
    const delay = Math.floor(Math.random() * (DELAY_MAX - DELAY_MIN + 1)) + DELAY_MIN;
    return sleep(delay);
}

function formatTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// HTTP 请求封装
function httpRequest(options) {
    return new Promise((resolve, reject) => {
        const isLoon = typeof $loon !== "undefined";
        const isSurge = typeof $httpClient !== "undefined" && !isLoon;
        const isQX = typeof $task !== "undefined";

        const method = (options.method || "GET").toUpperCase();

        if (isQX) {
            const opts = {
                url: options.url,
                method: method,
                headers: options.headers,
                body: options.body
            };

            $task.fetch(opts).then(
                response => {
                    resolve({
                        status: response.statusCode,
                        headers: response.headers,
                        body: response.body
                    });
                },
                reason => reject(reason.error)
            );
        } else if (isLoon || isSurge) {
            const opts = {
                url: options.url,
                headers: options.headers,
                body: options.body
            };

            const callback = (error, response, body) => {
                if (error) {
                    reject(error);
                } else {
                    resolve({
                        status: response.status,
                        headers: response.headers,
                        body: body
                    });
                }
            };

            if (method === "POST") {
                $httpClient.post(opts, callback);
            } else {
                $httpClient.get(opts, callback);
            }
        } else {
            reject("不支持的环境");
        }
    });
}

class NongFu {
    constructor(dataStr, index) {
        this.index = index;
        this.valid = false;
        dataStr = (dataStr || "").trim();

        if (!dataStr) return;

        try {
            if (dataStr.includes("&")) {
                const parts = dataStr.split("&");
                this.apitoken = parts[0];
                this.uniqueId = parts[1];
                this.valid = true;
            } else {
                log(`账号 ${index} 格式错误`, "❌");
            }
        } catch (e) {
            log(`账号 ${index} 解析错误`, "❌");
        }

        this.headers = {
            "authority": "sxs-consumer.nfsq.com.cn",
            "apitoken": this.apitoken,
            "content-type": "application/json",
            "unique_identity": this.uniqueId,
            "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.43(0x18002b2d) NetType/WIFI Language/zh_CN",
            "xweb_xhr": "1"
        };
    }

    async getUserInfo() {
        const url = `${BASE_URL}/geement.usercenter/api/v1/user/seniority?sencodes=SEN2510301505321`;

        try {
            const response = await httpRequest({
                url: url,
                method: "GET",
                headers: this.headers
            });

            const res = JSON.parse(response.body);

            if (res.code === 200) {
                log(`账号 ${this.index} 登录成功`, "✅");
                return true;
            } else {
                log(`账号 ${this.index} Token已失效，请重新抓包!`, "🚫");
                return false;
            }
        } catch (e) {
            log(`账号 ${this.index} 连接异常: ${e}`, "💥");
            return false;
        }
    }

    async joinTask(taskId, taskName) {
        const actionTime = formatTime();
        const url = `${BASE_URL}/geement.marketingplay/api/v1/task/join?action_time=${encodeURIComponent(actionTime)}&task_id=${taskId}`;

        try {
            const headers = Object.assign({}, this.headers);
            headers["content-type"] = "application/x-www-form-urlencoded";

            const response = await httpRequest({
                url: url,
                method: "GET",
                headers: headers
            });

            const res = JSON.parse(response.body);

            if (res.success) {
                log(`完成任务: ${taskName}`, "✅");
            }
        } catch (e) {
            console.log(`任务异常: ${e}`);
        }
    }

    async processTasks() {
        const url = `${BASE_URL}/geement.marketingplay/api/v1/task?pageNum=1&pageSize=10&task_status=2&status=1&group_id=2510301511011&is_db=1`;

        try {
            const headers = Object.assign({}, this.headers);
            headers["content-type"] = "application/x-www-form-urlencoded";

            const response = await httpRequest({
                url: url,
                method: "GET",
                headers: headers
            });

            const res = JSON.parse(response.body);

            if (res.code === 200) {
                const tasks = res.data || [];
                log("扫描任务状态...", "📋");

                let doneCount = 0;
                for (const t of tasks) {
                    if (t.complete_status === 0) {
                        await this.joinTask(t.id, t.name);
                        doneCount++;
                        await sleep(1000);
                    }
                }

                if (doneCount === 0) {
                    log("任务已全部完成", "👌");
                }
            }
        } catch (e) {
            console.log(`任务列表异常: ${e}`);
        }
    }

    async receivePrize(logId, goodsType) {
        let url = `${BASE_URL}/geement.actjextra/api/v1/act/win/goods/youzan/receive`;

        if (goodsType === 160) {
            url = `${BASE_URL}/geement.actjextra/api/v1/act/win/goods/160goods/receive`;
        }

        try {
            const headers = Object.assign({}, this.headers);
            headers["content-type"] = "application/x-www-form-urlencoded";

            const response = await httpRequest({
                url: url,
                method: "POST",
                headers: headers,
                body: `log_ids=${logId}`
            });

            const res = JSON.parse(response.body);

            if (res.code === 200) {
                log("🎁 奖品自动核销成功!", "✅");
            } else {
                if (!url.includes("160goods")) {
                    const url2 = `${BASE_URL}/geement.actjextra/api/v1/act/win/goods/160goods/receive`;
                    await httpRequest({
                        url: url2,
                        method: "POST",
                        headers: headers,
                        body: `log_ids=${logId}`
                    });
                }
            }
        } catch (e) {
            console.log(`领奖异常: ${e}`);
        }
    }

    async lotteryOnce(sceneCode, round) {
        const url = `${BASE_URL}/geement.marketinglottery/api/v1/marketinglottery`;

        try {
            const payloadData = Object.assign({}, BASE_LOCATION);
            payloadData.code = sceneCode;

            const response = await httpRequest({
                url: url,
                method: "POST",
                headers: this.headers,
                body: JSON.stringify(payloadData)
            });

            const res = JSON.parse(response.body);

            if (res.success) {
                const data = res.data || {};
                const prize = data.prizedto;

                if (prize) {
                    const name = prize.prize_name || "未知";
                    const level = prize.prize_level || "";

                    if (String(level).includes("一等奖")) {
                        shouldNotify = true;
                        log(`🚨 欧皇! [场景${sceneCode.slice(-5)}] 第${round}次: [${level}] ${name}`, "💎");
                    } else {
                        log(`🎉 中奖! [场景${sceneCode.slice(-5)}] 第${round}次: [${level}] ${name}`, "🎁");
                    }

                    const goods = prize.goods || [];
                    if (goods.length > 0) {
                        const logId = goods[0].log_id;
                        const goodsType = goods[0].goods_type;
                        if (logId) {
                            await this.receivePrize(logId, goodsType);
                        }
                    }
                } else {
                    log(`💨 未中奖 [场景${sceneCode.slice(-5)}] 第${round}次`, "⭕");
                }
                return true;

            } else {
                const msg = res.msg || "未知";

                // Token 失效检测
                if (String(msg).includes("请登录") || String(msg).toLowerCase().includes("token") || res.code === 401) {
                    log(`🚫 Token失效/异常，停止运行 (${msg})`, "❌");
                    return "INVALID_TOKEN";
                }

                // 资格不足
                if (String(msg).includes("不足") || String(msg).includes("资格")) {
                    return false;
                }

                // 达到上限
                if (String(msg).includes("达到最大") || String(msg).includes("上限")) {
                    log(`🛑 [场景${sceneCode.slice(-5)}] 每日额度已满 (${msg})`, "🛡️");
                    return "STOP_ALL";
                }

                log(`⭕ [场景${sceneCode.slice(-5)}] 异常: ${msg}`, "⚠️");
                return true;
            }
        } catch (e) {
            console.log(`抽奖异常: ${e}`);
            return true;
        }
    }

    async run() {
        if (!this.valid) return;

        // 1. 严格校验登录
        const loginOk = await this.getUserInfo();
        if (!loginOk) {
            log("-".repeat(30));
            return;
        }

        // 2. 处理任务
        await this.processTasks();
        await sleep(1000);

        // 3. 开始抽奖
        log(`开始双通道混合抽奖 (上限 ${MAX_TOTAL_TRY} 次)...`, "🚀");

        let currentTry = 0;
        while (currentTry < MAX_TOTAL_TRY) {
            currentTry++;
            let sceneActive = false;

            for (const scene of SCENE_LIST) {
                const result = await this.lotteryOnce(scene, currentTry);

                if (result === "INVALID_TOKEN") {
                    return; // 结束该账号
                }

                if (result === "STOP_ALL") {
                    log("触发每日硬性上限，停止运行", "🛑");
                    log("-".repeat(30));
                    return;
                }

                if (result === true) {
                    sceneActive = true;
                    break;
                }
            }

            if (!sceneActive) {
                log("所有场景均提示资格不足，脚本结束", "💤");
                break;
            }

            await randomDelay();
        }

        log(`账号 ${this.index} 结束`, "🏁");
        log("-".repeat(30));
    }
}

async function sendNotify() {
    if (!shouldNotify) {
        console.log("ℹ️ 本次运行未获得一等奖，不发送通知");
        return;
    }

    // 1. Telegram 通知
    let tgToken = "";
    let tgChatId = "";

    // 尝试获取 Loon 插件注入的变量
    try {
        if (typeof TG_BOT_TOKEN !== "undefined") tgToken = TG_BOT_TOKEN;
        if (typeof TG_CHAT_ID !== "undefined") tgChatId = TG_CHAT_ID;
    } catch (e) { }

    if (tgToken && tgChatId) {
        const url = `https://api.telegram.org/bot${tgToken}/sendMessage`;
        // TG 使用换行符，支持部分 HTML
        const content = notifyContent.join("\n").replace(/<br>/g, "\n");

        const data = {
            chat_id: tgChatId,
            text: "🚨 农夫山泉-中大奖啦\n\n" + content,
            parse_mode: "HTML"
        };

        try {
            await httpRequest({
                url: url,
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(data)
            });
            console.log("✅ Telegram 推送成功");
        } catch (e) {
            console.log("Telegram 推送失败: " + e);
        }
    }

    // 2. PushPlus 通知
    let ppToken = "";
    try {
        if (typeof PUSH_PLUS_TOKEN !== "undefined") ppToken = PUSH_PLUS_TOKEN;
    } catch (e) { }

    // 兼容旧方式 $argument
    if (!ppToken && typeof $argument !== "undefined" && $argument && !$argument.includes("=")) {
        ppToken = $argument;
    }

    if (ppToken) {
        const url = "http://www.pushplus.plus/send";
        const data = {
            token: ppToken,
            title: "🚨 农夫山泉-中大奖啦",
            content: notifyContent.join("<br>"),
            template: "html"
        };

        try {
            await httpRequest({
                url: url,
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(data)
            });
            console.log("✅ Push Plus 推送成功");
        } catch (e) {
            console.log("Push Plus 推送失败: " + e);
        }
    }

    if (!tgToken && !ppToken) {
        console.log("未配置任何通知方式 (TG/PushPlus)，跳过推送");
    }
}

async function main() {
    const header = "🌿 农夫山泉 🌿";
    console.log(header);
    notifyContent.push(`<b>${header}</b>`);

    // 从持久化存储读取数据
    const cookieData = $.getdata(KEY_DATA);

    if (!cookieData) {
        $.msg("农夫山泉", "❌ 未找到Cookie", "请先打开小程序抓取Cookie");
        $done();
        return;
    }

    // 解析多账号
    const accounts = cookieData.split("\n").filter(x => x.trim());

    console.log(`共找到 ${accounts.length} 个账号`);

    for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        if (acc) {
            const nf = new NongFu(acc, i + 1);
            await nf.run();
        }
    }

    // 发送通知
    await sendNotify();

    // 结果通知
    const summary = notifyContent.slice(0, 10).join("\n");
    $.msg("农夫山泉", `✅ 运行完成 (${accounts.length}个账号)`, summary);

    $done();
}

// 启动
main();


// ============= Loon/Surge/QX 兼容环境 =============
function Env(name) {
    const isLoon = typeof $loon !== "undefined";
    const isSurge = typeof $httpClient !== "undefined" && !isLoon;
    const isQX = typeof $task !== "undefined";

    const getdata = (key) => {
        if (isLoon || isSurge) return $persistentStore.read(key);
        if (isQX) return $prefs.valueForKey(key);
        return null;
    };

    const setdata = (val, key) => {
        if (isLoon || isSurge) return $persistentStore.write(val, key);
        if (isQX) return $prefs.setValueForKey(val, key);
        return false;
    };

    const msg = (title, subtitle, body) => {
        if (isLoon) $notification.post(title, subtitle, body);
        else if (isSurge) $notification.post(title, subtitle, body);
        else if (isQX) $notify(title, subtitle, body);
    };

    return {
        name,
        getdata,
        setdata,
        msg,
        log: console.log
    };
}
