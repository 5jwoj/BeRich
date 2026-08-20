/*
 * 百度网盘 · 会员成长值每日签到 + 每日答题 - Surge 专属版
 * 
 * 行为：
 * 1) 抓取：打开百度网盘 APP → 进入「我的」或「签到/会员」等任意页面，自动抓取 Cookie 并存入 BoxJS
 * 2) 签到：cron 定时自动签到 + 每日答题（均增加会员成长值），并查询 SVIP 等级与升级进度推送通知
 * 
 * Version: v1.1.0
 * Author: @5jwoj (基于 @MaYIHEI 原版重构优化)
 * 
 * BoxJS 订阅地址：
 * https://raw.githubusercontent.com/5jwoj/BeRich/main/boxjs/BeRich_Surge.boxjs.json
 * 
 * @配置方式
 * 安装 Surge 模块：
 * https://raw.githubusercontent.com/5jwoj/BeRich/main/baidunetdisk/baidunetdisk_surge.sgmodule
 * 
 * 在 BoxJS「BeRich Surge 合集」→「百度网盘成长值签到 (Surge)」中配置：
 *   - baidunetdisk_data   百度网盘 Cookie（打开 APP 自动捕获，亦可手动填入）
 *   - baidunetdisk_debug  调试日志输出（true/false，默认 false）
 *   - baidunetdisk_clear  一键清除 Cookie 标记（true/false，默认 false）
 */

const SCRIPT_NAME    = "百度网盘";
const SCRIPT_VERSION = "v1.1.0";

const CK_KEY    = "baidunetdisk_data";
const TRACK_KEY = "baidunetdisk_track";   // 成长值基线 {value, ts}
const API       = "https://pan.baidu.com";
const COMMON    = "app_id=250528&web=5";  // 会员成长值(WAP)系统通用参数
const REFERER   = "https://pan.baidu.com/wap/svip/growth/task";
const UA        = "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

// 会员成长值 → SVIP 等级阈值
const LEVEL_THRESHOLDS = {
    2: 1000, 3: 3000, 4: 7000, 5: 15000, 6: 27000,
    7: 43000, 8: 56000, 9: 68000, 10: 100000,
};

// 每日会员成长值基准
const DAILY_GROWTH = {
    vip2_1m: 20, vip2_1m_auto: 20, vip2_1y: 30, vip2_1y_auto: 30,
    vip2_3m: 20, vip2_3m_auto: 20, vip2_7d_1m_auto: 20, vip2_vipv2_upgrade_svip: 20,
    vip1_1m: 5, vip1_1y: 12, vip1_3m: 10,
};

// ─── 入口分流 ─────────────────────────────────────────────────────────────
if (typeof $request !== "undefined") {
    captureCookie();
} else {
    main().catch((e) => {
        console.log(`[${SCRIPT_NAME}] 运行异常: ${e && e.message ? e.message : e}`);
        $notification.post(SCRIPT_NAME, "❌ 运行异常", String(e && e.message ? e.message : e));
    }).finally(() => {
        $done({});
    });
}

// ─── ① 抓 Cookie 模式 ────────────────────────────────────────────────────
function captureCookie() {
    try {
        const cookie = normalizeCookie(headerVal("cookie"));
        // 如果当前请求头不含 BDUSS，静默退出
        if (!cookie || !/BDUSS=/.test(cookie)) {
            $done({});
            return;
        }

        const oldCookie = $persistentStore.read(CK_KEY) || "";
        if (oldCookie.trim() === cookie.trim()) {
            console.log(`[${SCRIPT_NAME}] 捕获到相同 Cookie，跳过保存与弹窗`);
            $done({});
            return;
        }

        $persistentStore.write(cookie, CK_KEY);
        const uidMatch = cookie.match(/BDUSS=([^;]{0,8})/);
        const uid = uidMatch ? uidMatch[1] : "";
        console.log(`[${SCRIPT_NAME}] Cookie 抓取/更新成功，BDUSS: ${uid}…`);
        $notification.post(
            SCRIPT_NAME,
            "✅ 百度网盘 Cookie 获取成功",
            `BDUSS: ${uid}… 已自动保存到 BoxJS / persistentStore`
        );
    } catch (e) {
        console.log(`[${SCRIPT_NAME}] 抓取 Cookie 异常: ${e}`);
    } finally {
        $done({});
    }
}

// ─── ② 定时签到主逻辑 ────────────────────────────────────────────────────
async function main() {
    console.log(`[${SCRIPT_NAME}] 开始执行签到任务 (${SCRIPT_VERSION})`);

    // 检查清除数据开关
    const clearFlag = $persistentStore.read("baidunetdisk_clear");
    if (clearFlag === "true") {
        $persistentStore.write("", CK_KEY);
        $persistentStore.write("", TRACK_KEY);
        $persistentStore.write("false", "baidunetdisk_clear");
        $notification.post(SCRIPT_NAME, "", "✅ Cookie 已清除，请重新打开 APP 抓取");
        return;
    }

    const cookie = $persistentStore.read(CK_KEY);
    if (!cookie) {
        $notification.post(
            SCRIPT_NAME,
            "🚫 缺少 Cookie",
            "请先在 BoxJS 中填入 Cookie，或开启模块打开网盘「我的 → 签到 / 会员」页自动抓取"
        );
        return;
    }

    // 1. 成长值签到
    const signRes = await api(`/rest/2.0/membership/level?${COMMON}&method=signin`, cookie);
    debug(`[signin] ${signRes.slice(0, 200)}`);
    if (!signRes) {
        $notification.post(SCRIPT_NAME, "❌ 签到失败", "无响应 (若 Cookie 失效，请重新打开网盘签到页抓取)");
        return;
    }
    if (/("errno"|"error_code")\s*:\s*-?(6|2|110)\b/.test(signRes) || /not login|登录/.test(signRes)) {
        $notification.post(SCRIPT_NAME, "🚫 登录失效", "请重新打开网盘「我的 → 签到 / 会员」页抓取 Cookie");
        return;
    }

    const signPts = num(signRes, /"points"\s*:\s*(\d+)/); // 签到加的成长值
    const signTip = signPts ? `签到 +${signPts}` : "签到已完成";

    // 2. 每日答题
    let answerTip = "";
    let answerPts = 0;
    try {
        const q = await api(`/act/v2/membergrowv2/getdailyquestion?${COMMON}`, cookie);
        const askId  = num(q, /"ask_id"\s*:\s*(\d+)/);
        const answer = num(q, /"answer"\s*:\s*(\d+)/);
        if (askId && answer != null) {
            const a = await api(`/act/v2/membergrowv2/answerquestion?${COMMON}&ask_id=${askId}&answer=${answer}`, cookie);
            debug(`[answer] ${a.slice(0, 200)}`);
            answerPts = num(a, /"score"\s*:\s*(\d+)/) || 0;
            answerTip = answerPts ? ` · 答题 +${answerPts}` : " · 答题已完成";
        } else {
            answerTip = " · 答题已完成"; // 今日无题 / 已答
        }
    } catch (e) {
        debug(`答题阶段异常, 忽略: ${e}`);
    }

    // 3. 查会员成长值 / 等级 → 距 SVIP 升级进度
    const tail = await growthTail(cookie, (signPts || 0) + answerPts);

    $notification.post(SCRIPT_NAME, "✅ 百度网盘成长值签到", `${signTip}${answerTip}${tail}`);
}

// ─── 拼装「会员成长值 / 等级 / 距下一级 + 估算天数」尾巴 ─────────────────────
async function growthTail(cookie, todayGain) {
    try {
        const u = await api(`/rest/2.0/membership/user?${COMMON}&method=query`, cookie);
        const L = num(u, /"current_level"\s*:\s*(\d+)/);
        const V = num(u, /"current_value"\s*:\s*(\d+)/);
        if (L == null || V == null) return "";

        let t = ` · SVIP${L} 成长值 ${V}`;
        const next = LEVEL_THRESHOLDS[L + 1];
        if (next != null) {
            const gap = next - V;
            t += ` · 距 SVIP${L + 1} 还差 ${gap}`;
            const perDay = dailyRate(V, str(u, /"product_type"\s*:\s*"(.*?)"/), todayGain);
            if (perDay > 0 && gap > 0) {
                t += `(约 ${Math.ceil(gap / perDay)} 天)`;
            }
        } else {
            t += " · 已满级";
        }
        return t;
    } catch (e) {
        debug(`查成长值异常, 忽略: ${e}`);
        return "";
    }
}

// ─── 每日成长速率计算 ────────────────────────────────────────────────────────
function dailyRate(V, ptype, todayGain) {
    const now = Date.now();
    try {
        const tkRaw = $persistentStore.read(TRACK_KEY);
        const tk = tkRaw ? JSON.parse(tkRaw) : null;
        if (tk && tk.value != null && tk.ts) {
            const days = (now - tk.ts) / 86400000;
            if (days >= 0.8 && V > tk.value) {
                return (V - tk.value) / days; // 实测日均
            }
        } else {
            $persistentStore.write(JSON.stringify({ value: V, ts: now }), TRACK_KEY); // 建立基线
        }
    } catch (e) {
        debug(`成长值基线读写异常: ${e}`);
    }
    return (DAILY_GROWTH[ptype] || 0) + (todayGain || 0); // 兜底估算
}

// ─── 网络请求封装 ────────────────────────────────────────────────────────────
function api(path, cookie) {
    return new Promise((resolve) => {
        const opts = {
            url: `${API}${path}`,
            headers: {
                "Host":             "pan.baidu.com",
                "Accept":           "application/json, text/plain, */*",
                "Accept-Language":  "zh-CN,zh-Hans;q=0.9",
                "X-Requested-With": "XMLHttpRequest",
                "Referer":          REFERER,
                "User-Agent":       UA,
                "Cookie":           cookie,
            },
            timeout: 10
        };
        $httpClient.get(opts, (err, _resp, data) => {
            if (err) {
                debug(`[api ${path}] 错误: ${JSON.stringify(err)}`);
                resolve("");
                return;
            }
            resolve(String(data || ""));
        });
    });
}

// ─── 辅助工具函数 ────────────────────────────────────────────────────────────
function num(s, re) { const m = re.exec(s); return m ? parseInt(m[1], 10) : null; }
function str(s, re) { const m = re.exec(s); return m ? m[1] : ""; }

function headerVal(name) {
    const h = $request.headers || {};
    const low = name.toLowerCase();
    for (const k in h) {
        if (k.toLowerCase() === low) return h[k];
    }
    return "";
}

function normalizeCookie(s) {
    return String(s || "")
        .replace(/\r?\n\s*cookie:\s*/gi, "; ")
        .replace(/\s+/g, " ")
        .trim();
}

function debug(content) {
    if (($persistentStore.read("baidunetdisk_debug") || "false") !== "true") return;
    console.log(`[DEBUG] ${typeof content === "string" ? content : JSON.stringify(content)}`);
}
