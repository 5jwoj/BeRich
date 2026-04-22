/*
 * JD Cookie Sync to Qinglong - Loon Version (BoxJS Support)
 * 
 * 行为：
 * 1) 抓到 pt_key + pt_pin 后检查是否需要同步（冷却时间机制）
 * 2) Cookie 有效且未变化且在冷却期内则静默跳过
 * 3) Cookie 失效或变化或超过冷却时间时才同步青龙
 * Version: v2.3.0
 * Author: z.W.
 * 
 * 支持三种配置方式（优先级递减）：
 * 1. 脚本内置 MANUAL_CONFIG
 * 2. 插件 Argument 参数配置
 * 3. BoxJS 面板配置 (需订阅 JD_Cookie_Sync_BoxJS.json)
 *
 * @script
 * api.m.jd.com, me-api.jd.com, plogin.m.jd.com, wq.jd.com
 * 
 * @args
 * ql_url: Qinglong Panel URL (e.g., http://192.168.1.1:5700)
 * ql_client_id: Qinglong Client ID
 * ql_client_secret: Qinglong Client Secret
 */

const $ = new API("jd_cookie_sync");

// ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
// 本地配置区域 - 如果不使用 BoxJS 或 插件参数，请在这里填写青龙面板信息
const MANUAL_CONFIG = {
    url: "",        // 必填，例如 "http://192.168.1.1:5700"
    id: "",         // 必填，Client ID
    secret: "",     // 必填，Client Secret
    cooldown: 5,    // 可选，冷却时间（分钟），默认5分钟
    debug: false    // 调试模式，设置为 true 可以看到更多日志
};
// ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

(async () => {
    try {
        const requestUrl = $request.url || "Unknown URL";
        if (MANUAL_CONFIG.debug) {
            $.log(`[DEBUG] Request URL: ${requestUrl}`);
        }

        let ql_url = MANUAL_CONFIG.url || $.read("ql_url") || $.getData("jd_ql_url");
        const ql_client_id = MANUAL_CONFIG.id || $.read("ql_client_id") || $.getData("jd_ql_client_id");
        const ql_client_secret = MANUAL_CONFIG.secret || $.read("ql_client_secret") || $.getData("jd_ql_client_secret");
        const cooldown_minutes = MANUAL_CONFIG.cooldown || parseInt($.getData("jd_cooldown_minutes")) || 5;

        $.log(`Config: URL=${ql_url}, ID=${ql_client_id ? '***' : 'Missing'}, Secret=${ql_client_secret ? '***' : 'Missing'}, Cooldown=${cooldown_minutes}min`);

        if (!ql_url || !ql_client_id || !ql_client_secret || ql_url.includes("{ql_url}")) {
            $.notify("配置未生效", "参数未正确填写", "请在 BoxJS / 插件参数 / MANUAL_CONFIG 中填写青龙信息");
            $.done();
            return;
        }

        if (!ql_url.startsWith("http://") && !ql_url.startsWith("https://")) {
            ql_url = "http://" + ql_url;
            $.log(`Added http prefix to URL: ${ql_url}`);
        }

        if (ql_url.endsWith("/")) {
            ql_url = ql_url.slice(0, -1);
        }

        const cookie = $request.headers["Cookie"] || $request.headers["cookie"];
        if (!cookie) {
            $.done();
            return;
        }

        const pt_key = getCookieValue(cookie, "pt_key");
        const pt_pin_raw = getCookieValue(cookie, "pt_pin");

        if (!pt_key || !pt_pin_raw) {
            $.done();
            return;
        }

        const pt_pin = safeDecodeURIComponent(pt_pin_raw);
        const jd_cookie = `pt_key=${pt_key};pt_pin=${pt_pin};`;

        $.log(`Captured Cookie for pt_pin=${pt_pin}`);

        const cacheKey = `JD_COOKIE_CACHE_${pt_pin}`;
        const timestampKey = `JD_COOKIE_TIMESTAMP_${pt_pin}`;
        const cachedCookie = $.getData(cacheKey);
        const lastSyncTime = parseInt($.getData(timestampKey)) || 0;
        const currentTime = Date.now();
        const cooldownMs = cooldown_minutes * 60 * 1000;
        const timeSinceLastSync = currentTime - lastSyncTime;

        if (cachedCookie === jd_cookie && timeSinceLastSync < cooldownMs) {
            const remainingMinutes = Math.ceil((cooldownMs - timeSinceLastSync) / 60000);
            $.log(`Cookie unchanged for ${pt_pin}, within cooldown period (${remainingMinutes}min remaining). Skip all checks.`);
            $.done();
            return;
        }

        if (cachedCookie === jd_cookie) {
            $.log(`Cookie unchanged for ${pt_pin}, but cooldown expired. Validating...`);
        } else {
            $.log(`Cookie changed for ${pt_pin}. Need to validate and sync.`);
        }

        const validation = await validateJDCookie(jd_cookie);

        if (!validation.valid) {
            $.log(`Cookie invalid for ${pt_pin}. Need to re-sync.`);
        } else if (cachedCookie === jd_cookie) {
            $.log(`Cookie valid for ${pt_pin} (${validation.nickname || 'unknown'}). Update timestamp and skip sync.`);
            $.setData(timestampKey, String(currentTime));
            $.done();
            return;
        } else {
            $.log(`Cookie valid and changed for ${pt_pin} (${validation.nickname || 'unknown'}). Need to sync.`);
        }

        const token = await getQLToken(ql_url, ql_client_id, ql_client_secret);
        if (!token) {
            $.notify("同步失败", "获取青龙Token失败", "请检查配置信息是否正确");
            $.done();
            return;
        }

        const result = await syncCookieToQL(ql_url, token, pt_pin, jd_cookie);

        if (!result.ok) {
            $.notify("同步失败", "青龙接口返回异常", result.message || "Unknown error");
            $.done();
            return;
        }

        if (result.changed) {
            $.setData(cacheKey, jd_cookie);
            $.setData(timestampKey, String(currentTime));
            $.notify(result.title, result.subtitle, result.body);
        } else {
            $.setData(timestampKey, String(currentTime));
            $.log(`No change for ${pt_pin}. No notification.`);
        }

    } catch (e) {
        $.log(`Error: ${e && e.message ? e.message : e}`);
        $.notify("同步错误", "发生未预期的错误", String(e && e.message ? e.message : e));
    } finally {
        $.done();
    }
})();

function getCookieValue(cookieStr, key) {
    const match = cookieStr.match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
    return match ? match[1] : null;
}

function safeDecodeURIComponent(s) {
    try {
        return decodeURIComponent(s);
    } catch (_) {
        return s;
    }
}

async function validateJDCookie(jd_cookie) {
    const options = {
        url: "https://me-api.jd.com/user_new/info/GetJDUserInfoUnion",
        method: "GET",
        headers: {
            "Cookie": jd_cookie,
            "User-Agent": "jdapp;iPhone;10.0.0;14.0;network/wifi;Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)",
            "Referer": "https://home.m.jd.com/"
        }
    };

    return new Promise((resolve) => {
        $.http.get(options).then(response => {
            try {
                const body = JSON.parse(response.body);
                if (body && body.retcode === "0" && body.data && body.data.userInfo) {
                    const nickname = body.data.userInfo.baseInfo?.nickname || "";
                    $.log(`Cookie validation success: ${nickname}`);
                    resolve({ valid: true, nickname });
                } else {
                    $.log(`Cookie validation failed: ${JSON.stringify(body).substring(0, 100)}`);
                    resolve({ valid: false });
                }
            } catch (e) {
                $.log(`Cookie validation parse error: ${e.message}`);
                resolve({ valid: false });
            }
        }).catch(e => {
            $.log(`Cookie validation network error: ${e.error}`);
            resolve({ valid: false });
        });
    });
}

async function getQLToken(url, clientId, clientSecret) {
    const options = {
        url: `${url}/open/auth/token?client_id=${clientId}&client_secret=${clientSecret}`,
        method: "GET"
    };

    return new Promise((resolve) => {
        $.http.get(options).then(response => {
            try {
                const body = JSON.parse(response.body);
                if (body.code === 200 && body.data && body.data.token) {
                    resolve(body.data.token);
                } else {
                    $.log(`Auth Failed: ${JSON.stringify(body)}`);
                    resolve(null);
                }
            } catch (e) {
                $.log(`Auth Parse Error: ${e.message}`);
                resolve(null);
            }
        }).catch(e => {
            $.log(`Auth Network Error: ${e.error}`);
            resolve(null);
        });
    });
}

async function syncCookieToQL(url, token, pt_pin, newValue) {
    const headers = {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
    };

    const getOptions = {
        url: `${url}/open/envs?searchValue=${encodeURIComponent(pt_pin)}`,
        method: "GET",
        headers
    };

    return new Promise((resolve) => {
        $.http.get(getOptions).then(async response => {
            try {
                const body = JSON.parse(response.body);
                if (body.code !== 200 || !Array.isArray(body.data)) {
                    $.log(`Sync Unexpected Response: ${response.body}`);
                    resolve({ ok: false, message: "Unexpected Qinglong response" });
                    return;
                }

                const envs = body.data;
                const targetEnv = envs.find(e =>
                    e && e.name === "JD_COOKIE" &&
                    typeof e.value === "string" &&
                    e.value.includes(`pt_pin=${pt_pin}`)
                );

                let changed = false;

                if (targetEnv) {
                    if (targetEnv.status !== 0) {
                        await enableEnv(url, token, targetEnv.id);
                        changed = true;
                    }

                    if (targetEnv.value !== newValue) {
                        await updateEnv(url, token, targetEnv.id, "JD_COOKIE", newValue, targetEnv.remarks);
                        changed = true;

                        resolve({
                            ok: true,
                            changed,
                            title: "Cookie已更新",
                            subtitle: `已更新并同步：${pt_pin}`,
                            body: "青龙中的JD_COOKIE已更新成功"
                        });
                        return;
                    }

                    if (changed) {
                        resolve({
                            ok: true,
                            changed,
                            title: "Cookie已启用",
                            subtitle: `已启用并同步：${pt_pin}`,
                            body: "值未变化，但已从禁用状态启用"
                        });
                    } else {
                        resolve({ ok: true, changed: false });
                    }
                    return;
                }

                await createEnv(url, token, "JD_COOKIE", newValue, `Created by Loon for ${pt_pin}`);
                resolve({
                    ok: true,
                    changed: true,
                    title: "Cookie已创建",
                    subtitle: `已创建并同步：${pt_pin}`,
                    body: "青龙中新增JD_COOKIE变量成功"
                });

            } catch (e) {
                $.log(`Sync Parse Error: ${e.message}`);
                resolve({ ok: false, message: e.message || String(e) });
            }
        }).catch(e => {
            $.log(`Sync Network Error: ${e.error}`);
            resolve({ ok: false, message: e.error || String(e) });
        });
    });
}

async function updateEnv(url, token, id, name, value, remarks) {
    const options = {
        url: `${url}/open/envs`,
        method: "PUT",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ id, name, value, remarks })
    };
    return new Promise(resolve => {
        $.http.put(options).then(() => resolve()).catch(() => resolve());
    });
}

async function createEnv(url, token, name, value, remarks) {
    const options = {
        url: `${url}/open/envs`,
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify([{ name, value, remarks }])
    };
    return new Promise(resolve => {
        $.http.post(options).then(() => resolve()).catch(() => resolve());
    });
}

async function enableEnv(url, token, id) {
    const options = {
        url: `${url}/open/envs/enable`,
        method: "PUT",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify([id])
    };
    return new Promise(resolve => {
        $.http.put(options).then(() => resolve()).catch(() => resolve());
    });
}

function API(name) {
    this.name = name;

    this.read = (key) => {
        if (typeof $argument !== 'undefined') {
            const args = {};
            $argument.split("&").forEach(pair => {
                const idx = pair.indexOf("=");
                if (idx > -1) {
                    const k = pair.substring(0, idx);
                    const v = pair.substring(idx + 1);
                    if (k && v) args[k] = decodeURIComponent(v);
                }
            });
            return args[key];
        }
        return null;
    };

    this.getData = (key) => {
        if (typeof $persistentStore !== 'undefined') {
            return $persistentStore.read(key);
        }
        return null;
    };

    this.setData = (key, value) => {
        if (typeof $persistentStore !== 'undefined') {
            return $persistentStore.write(value, key);
        }
    };

    this.notify = (title, subtitle, message) => {
        if (typeof $notification !== 'undefined') {
            $notification.post(title, subtitle, message);
        } else {
            console.log(`[Notify] ${title} - ${subtitle}: ${message}`);
        }
    };

    this.log = (msg) => {
        console.log(`[${this.name}] ${msg}`);
    };

    this.done = () => {
        if (typeof $done !== 'undefined') {
            $done({});
        }
    };

    this.http = {
        get: (options) => {
            return new Promise((resolve, reject) => {
                if (typeof $httpClient !== 'undefined') {
                    $httpClient.get(options, (error, response, data) => {
                        if (error) {
                            reject({ error });
                        } else {
                            resolve({ status: response.status, headers: response.headers, body: data });
                        }
                    });
                } else {
                    reject({ error: "Not in Loon environment" });
                }
            });
        },
        post: (options) => {
            return new Promise((resolve, reject) => {
                if (typeof $httpClient !== 'undefined') {
                    $httpClient.post(options, (error, response, data) => {
                        if (error) {
                            reject({ error });
                        } else {
                            resolve({ status: response.status, headers: response.headers, body: data });
                        }
                    });
                } else {
                    reject({ error: "Not in Loon environment" });
                }
            });
        },
        put: (options) => {
            return new Promise((resolve, reject) => {
                if (typeof $httpClient !== 'undefined') {
                    $httpClient.put(options, (error, response, data) => {
                        if (error) {
                            reject({ error });
                        } else {
                            resolve({ status: response.status, headers: response.headers, body: data });
                        }
                    });
                } else {
                    reject({ error: "Not in Loon environment" });
                }
            });
        }
    }
}
