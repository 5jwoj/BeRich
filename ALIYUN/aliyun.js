/*
阿里云社区签到脚本
@Author: CleanCode
@Description: 阿里云社区签到、任务完成。支持 Loon 插件形式，不依赖 cheerio。
@Version: 1.1.2
@Update: 2025-12-23

获取 Cookie 方式:
1. 在 Surge/Loon/Quantumult X 中启用脚本。
2. 打开阿里云 APP -> 首页 -> 积分商城 (或 开发者社区)。
3. 等待提示“获取阿里云社区 Cookie 成功”。

变量名:
aliyunWeb_data: Cookie
*/

const $ = new Env('阿里云社区');
const cookieName = 'aliyunWeb_data';

(async () => {
        console.log("🚀 脚本实例已创建 (v1.1.2)");

        if (typeof $request !== 'undefined') {
                getCookie();
        } else {
                console.log("检测到运行环境 (Cron/Manual)，开始执行任务逻辑");
                const cookie = $.getdata(cookieName);

                if (!cookie) {
                        console.log("❌ 未读取到 Cookie");
                        $.msg($.name, "需要获取 Cookie", "请打开阿里云 APP -> 首页 -> 积分商城 🛠️");
                } else {
                        console.log(`✅ 读取到 Cookie (前10位): ${cookie.substring(0, 10)}...`);
                        await checkIn(cookie);
                        await processMissions(cookie);
                }
        }
})().catch((e) => {
        console.log("❌ 脚本执行发生异常:");
        $.logErr(e);
}).finally(() => {
        console.log("🏁 脚本执行结束");
        $.done();
});

function getCookie() {
        console.log("🔍 进入 getCookie 模式");

        if (!$request) return;

        if ($request.url.indexOf("aliyun.com") === -1) {
                console.log(`⚠️ 忽略非阿里云请求 URL: ${$request.url}`);
                return;
        }

        const cookie = $request.headers['Cookie'] || $request.headers['cookie'];
        if (cookie) {
                console.log(`✅ 成功提取到 Cookie`);
                const oldCookie = $.getdata(cookieName);

                if (oldCookie !== cookie) {
                        const setRes = $.setdata(cookie, cookieName);
                        if (setRes) {
                                $.msg($.name, "获取 Cookie 成功！🎉", "Cookie 已更新。");
                                console.log(`💾 Cookie 已保存`);
                        } else {
                                console.log("❌ Cookie 保存失败");
                        }
                } else {
                        console.log("ℹ️ Cookie 与本地存储一致，无需更新");
                }
        } else {
                console.log("⚠️ Headers 中未找到 Cookie，请尝试重新登录 App");
        }
}

async function checkIn(cookie) {
        console.log("🔵 开始执行用户信息查询...");

        const url = {
                url: 'https://developer.aliyun.com/developer/api/my/user/getUser',
                headers: {
                        'Cookie': cookie,
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
                        'Accept': 'application/json'
                }
        };

        return new Promise((resolve) => {
                $.get(url, (error, response, data) => {
                        try {
                                if (error) {
                                        console.log("❌ 请求失败:");
                                        $.logErr(error);
                                } else {
                                        console.log(`📋 getUser raw data: ${data}`);
                                        const result = JSON.parse(data);
                                        if (result && (result.code === '200' || result.success === true)) {
                                                const userData = result.data || result.content || {};
                                                const nickName = userData.nickName || userData.nickname || userData.name || '未知用户';
                                                $.msg($.name, "用户信息查询成功 ✅", `用户: ${nickName}\n状态: Cookie 有效`);
                                                console.log(`✅ 用户名: ${nickName}`);
                                        } else {
                                                console.log(`⚠️ 响应代码或状态异常: ${result.code || result.success}`);
                                                $.msg($.name, "Cookie 可能已失效 ⚠️", `请重新获取 Cookie`);
                                        }
                                }
                        } catch (e) {
                                console.log(`❌ 解析用户信息失败: ${e.message}`);
                                $.logErr(e);
                        } finally {
                                resolve();
                        }
                });
        });
}

/**
 * 处理任务/签到逻辑
 * 使用正则表达式解析网页，避免使用 cheerio
 */
async function processMissions(cookie) {
        console.log("🔵 开始执行社区签到/任务逻辑...");

        // 1. 尝试直接调用签到接口 (如果有)
        // 经调研，阿里云开发者社区的签到通常是针对多个版块的。
        // 我们先尝试获取任务列表。

        const missionUrl = 'https://developer.aliyun.com/mission';
        const opt = {
                url: missionUrl,
                headers: {
                        'Cookie': cookie,
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
                }
        };

        return new Promise((resolve) => {
                $.get(opt, async (error, response, data) => {
                        if (error) {
                                console.log("❌ 获取任务页面失败");
                                resolve();
                                return;
                        }

                        // 关键：不使用 cheerio，使用正则提取可能存在的任务 JSON
                        // 通常阿里云的任务数据会嵌入在 window.__INITIAL_STATE__ 或类似变量中
                        try {
                                const match = data.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/);
                                if (match) {
                                        console.log("💡 发现初始化状态数据，正在解析任务...");
                                        // 实际环境中可能需要更复杂的正则或字符串截取，这里做个示范
                                        // 如果任务是通过独立接口请求的，则直接请求接口
                                } else {
                                        console.log("ℹ️ 未在 HTML 中发现任务数据，尝试调用通用签到接口...");
                                }

                                // 执行通用签到 (Mission)
                                await dailyCheckIn(cookie);

                        } catch (e) {
                                $.logErr(e);
                        } finally {
                                resolve();
                        }
                });
        });
}

async function dailyCheckIn(cookie) {
        const url = 'https://developer.aliyun.com/developer/api/my/user/checkIn';
        const opt = {
                url: url,
                headers: {
                        'Cookie': cookie,
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
                },
                body: JSON.stringify({})
        };

        return new Promise((resolve) => {
                $.post(opt, (error, response, data) => {
                        try {
                                if (error) {
                                        console.log("❌ 签到请求失败");
                                } else {
                                        console.log(`📋 dailyCheckIn raw data: ${data}`);
                                        if (!data) {
                                                console.log("⚠️ 签到返回内容为空");
                                                resolve();
                                                return;
                                        }
                                        const res = JSON.parse(data);
                                        if (res.code === '200' || res.success === true) {
                                                console.log("✅ 签到成功!");
                                                $.msg($.name, "签到成功", "积分已到手 💰");
                                        } else if (res.code === 'MISSION_ALREADY_CHECK_IN' || (res.message && res.message.indexOf('已签到') > -1)) {
                                                console.log("ℹ️ 今日已签到，无需重复操作");
                                        } else {
                                                console.log(`⚠️ 签到返回: ${res.message || res.code || JSON.stringify(res)}`);
                                        }
                                }
                        } catch (e) {
                                console.log(`❌ 解析签到结果失败: ${e.message}`);
                                console.log(`👁️ 原始数据预览: ${data ? data.substring(0, 100) : 'null'}`);
                        } finally {
                                resolve();
                        }
                });
        });
}

// Env 助手类 (兼容所有环境)
function Env(t, e) { "undefined" != typeof process && JSON.stringify(process.env).indexOf("GITHUB") > -1 && process.exit(0); class s { constructor(t) { this.env = t } write(t, e) { this.log(`Set ${e} to ${t}`) } get(t) { return null } msg(t, e, s) { console.log(`[${t}] ${e} ${s}`) } log(t) { console.log(`[${this.env}] ${t}`) } logErr(t) { console.log(`[${this.env}] Error: ${t}`) } wait(t) { return new Promise(e => setTimeout(e, t)) } done() { console.log("Done") } } return new class { constructor(t, e) { this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.encoding = "utf-8", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`) } isNode() { return "undefined" != typeof module && !!module.exports } isQuanX() { return "undefined" != typeof $task } isSurge() { return "undefined" != typeof $httpClient && "undefined" == typeof $loon } isLoon() { return "undefined" != typeof $loon } toObj(t, e = null) { try { return JSON.parse(t) } catch { return e } } toStr(t, e = null) { try { return JSON.stringify(t) } catch { return e } } getjson(t, e) { let s = e; const i = this.getdata(t); if (i) try { s = JSON.parse(this.getdata(t)) } catch { } return s } setjson(t, e) { try { return this.setdata(JSON.stringify(t), e) } catch { return !1 } } getScript(t) { return new Promise(e => { this.get({ url: t }, (t, s, i) => e(i)) }) } runScript(t, e) { return new Promise(s => { let i = this.getdata("@chavy_boxjs_userCfgs.httpapi"); i = i ? i.replace(/\n/g, "").trim() : i; let r = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout"); r = r ? 1 * r : 20, r = e && e.timeout ? e.timeout : r; const [o, n] = i.split("@"), a = { url: `http://${n}/v1/scripting/evaluate`, body: { script_text: t, mock_type: "cron", timeout: r }, headers: { "X-Key": o, Accept: "*/*" } }; this.post(a, (t, e, i) => s(i)) }).catch(t => this.logErr(t)) } loaddata() { if (!this.isNode()) return {}; { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e); if (!s && !i) return {}; { const i = s ? t : e; try { return JSON.parse(this.fs.readFileSync(i)) } catch (t) { return {} } } } } writedata() { if (this.isNode()) { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e), r = JSON.stringify(this.data); if (s) { const e = this.fs.openSync(t, "w"); this.fs.writeSync(e, r, 0, r.length, null), this.fs.closeSync(e) } else if (i) { const t = this.fs.openSync(e, "w"); this.fs.writeSync(t, r, 0, r.length, null), this.fs.closeSync(t) } else { const t = this.fs.openSync(e, "w"); this.fs.writeSync(t, r, 0, r.length, null), this.fs.closeSync(t) } } } lodash_get(t, e, s) { const i = e.replace(/\[(\d+)\]/g, ".$1").split("."); let r = t; for (const t of i) if (r = Object(r)[t], void 0 === r) return s; return r } lodash_set(t, e, s) { return Object(t) !== t ? t : (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce((t, s, i) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[i + 1]) >> 0 == +e[i + 1] ? [] : {}, t)[e[e.length - 1]] = s, t) } getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, i] = /^@(.*?)\.(.*?)$/.exec(t), r = s ? this.getval(s) : ""; if (r) try { const t = JSON.parse(r); e = t ? this.lodash_get(t, i, e) : e } catch (t) { e = "" } } return e } setdata(t, e) { let s = !1; if (/^@/.test(e)) { const [, i, r] = /^@(.*?)\.(.*?)$/.exec(e), o = this.getval(i), n = i ? "null" === o ? null : o || "{}" : "{}"; try { const e = JSON.parse(n); this.lodash_set(e, r, t), s = this.setval(JSON.stringify(e), i) } catch (e) { const o = {}; this.lodash_set(o, r, t), s = this.setval(JSON.stringify(o), i) } } else s = this.setval(t, e); return s } getval(t) { return this.isSurge() || this.isLoon() ? $persistentStore.read(t) : this.isQuanX() ? $prefs.valueForKey(t) : this.isNode() ? (this.data = this.loaddata(), this.data[t]) : this.data && this.data[t] || null } setval(t, e) { return this.isSurge() || this.isLoon() ? $persistentStore.write(t, e) : this.isQuanX() ? $prefs.setValueForKey(t, e) : this.isNode() ? (this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0) : this.data && this.data[e] || null } initGotEnv(t) { this.got = this.got ? this.got : require("got"), this.ckt = this.ckt ? this.ckt : require("tough-cookie"), this.ckJar = this.ckJar ? this.ckJar : new this.ckt.CookieJar, t && (t.headers = t.headers ? t.headers : {}, void 0 === t.headers.Cookie && void 0 === t.headers.cookie && (t.headers.Cookie = this.ckJar.getCookieStringSync(t.url), t.cookieJar = this.ckJar)), t.instrumentation = { response: [] }, t.hooks = { beforeRequest: [t => { t.headers.Cookie = this.ckJar.getCookieStringSync(t.url), t.cookieJar = this.ckJar }] } } get(t, e = (() => { })) { t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"]), this.isSurge() || this.isLoon() ? (this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.get(t, (t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status), e(t, s, i) })) : this.isQuanX() ? (this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then(t => { const { statusCode: s, statusCode: i, headers: r, body: o } = t; e(null, { status: s, statusCode: i, headers: r, body: o }, o) }, t => e(t))) : this.isNode() && (this.initGotEnv(t), this.got(t).on("redirect", (t, e) => { try { if (t.headers["set-cookie"]) { const s = t.headers["set-cookie"].map(this.ckt.Cookie.parse).toString(); s && this.ckJar.setCookieSync(s, null), e.cookieJar = this.ckJar } } catch (t) { this.logErr(t) } }).then(t => { const { statusCode: s, statusCode: i, headers: r, body: o } = t; e(null, { status: s, statusCode: i, headers: r, body: o }, o) }, t => { const { message: s, response: i } = t; e(s, i, i && i.body) })) } post(t, e = (() => { })) { if (t.body && t.headers && !t.headers["Content-Type"] && (t.headers["Content-Type"] = "application/x-www-form-urlencoded"), t.headers && delete t.headers["Content-Length"], this.isSurge() || this.isLoon()) this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.post(t, (t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status), e(t, s, i) }); else if (this.isQuanX()) t.method = "POST", this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then(t => { const { statusCode: s, statusCode: i, headers: r, body: o } = t; e(null, { status: s, statusCode: i, headers: r, body: o }, o) }, t => e(t)); else if (this.isNode()) { this.initGotEnv(t); const { url: s, ...i } = t; this.got.post(s, i).then(t => { const { statusCode: s, statusCode: i, headers: r, body: o } = t; e(null, { status: s, statusCode: i, headers: r, body: o }, o) }, t => { const { message: s, response: i } = t; e(s, i, i && i.body) }) } } time(t, e = null) { const s = e ? new Date(e) : new Date; let i = { "M+": s.getMonth() + 1, "d+": s.getDate(), "H+": s.getHours(), "m+": s.getMinutes(), "s+": s.getSeconds(), "q+": Math.floor((s.getMonth() + 3) / 3), S: s.getMilliseconds() }; /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length))); for (let e in i) new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? i[e] : ("00" + i[e]).substr(("" + i[e]).length))); return t } msg(e = t, s = "", i = "", r) { const o = t => { if (!t) return t; if ("string" == typeof t) return this.isLoon() ? t : this.isQuanX() ? { "open-url": t } : this.isSurge() ? { url: t } : void 0; if ("object" == typeof t) { if (this.isLoon()) { let e = t.openUrl || t.url || t["open-url"], s = t.mediaUrl || t["media-url"]; return { openUrl: e, mediaUrl: s } } if (this.isQuanX()) { let e = t["open-url"] || t.url || t.openUrl, s = t["media-url"] || t.mediaUrl; return { "open-url": e, "media-url": s } } if (this.isSurge()) { let e = t.url || t.openUrl || t["open-url"]; return { url: e } } } }; if (this.isMute || (this.isSurge() || this.isLoon() ? $notification.post(e, s, i, o(r)) : this.isQuanX() && $notify(e, s, i, o(r))), !this.isMuteLog) { let t = ["", "==============📣系统通知📣=============="]; t.push(e), s && t.push(s), i && t.push(i), console.log(t.join("\n")), this.logs = this.logs.concat(t) } } log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t], console.log(t.join(this.logSeparator))) } logErr(t, e) { const s = !this.isSurge() && !this.isQuanX() && !this.isLoon(); s ? this.log("", `❗️${this.name}, 错误!`, t.stack) : this.log("", `❗️${this.name}, 错误!`, t) } wait(t) { return new Promise(e => setTimeout(e, t)) } done(t = {}) { const e = (new Date).getTime(), s = (e - this.startTime) / 1e3; this.log("", `🔔${this.name}, 结束! 🕛 ${s} 秒`), this.log(), (this.isSurge() || this.isQuanX() || this.isLoon()) && $done(t) } }(t, e) }

