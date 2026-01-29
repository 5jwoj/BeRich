/*
 * JD Cookie Sync to Qinglong - Loon Local Version
 * 
 * 行为：
 * 1) 抓到 pt_key + pt_pin 后先验证 Cookie 有效性
 * 2) Cookie 有效且未变化则静默跳过，无需同步青龙
 * 3) Cookie 失效或变化时才同步青龙
 * 4) 首次捕获或同步成功时发送通知
 * Version: v2.1.1
 * Author: z.W.
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
// 本地配置区域 - 请在这里填写您的青龙面板信息
const MANUAL_CONFIG = {
    url: "",        // 必填，例如 "http://192.168.1.1:5700"
    id: "",         // 必填，Client ID
    secret: "",     // 必填，Client Secret
    debug: false    // 调试模式，设置为 true 可以看到更多日志
};
// ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

(async () => {
    try {
        // 记录请求 URL，方便调试
        const requestUrl = $request.url || "Unknown URL";
        if (MANUAL_CONFIG.debug) {
            $.log(`[DEBUG] Request URL: ${requestUrl}`);
        }

        let ql_url = MANUAL_CONFIG.url || $.read("ql_url");
        const ql_client_id = MANUAL_CONFIG.id || $.read("ql_client_id");
        const ql_client_secret = MANUAL_CONFIG.secret || $.read("ql_client_secret");

        $.log(`Config: URL=${ql_url}, ID=${ql_client_id ? '***' : 'Missing'}, Secret=${ql_client_secret ? '***' : 'Missing'}`);

        if (!ql_url || !ql_client_id || !ql_client_secret || ql_url.includes("{ql_url}")) {
            $.notify("配置未生效", "参数未正确填写", "请在脚本的 MANUAL_CONFIG 中填写青龙信息");
            $.done();
            return;
        }

        // Auto-fix URL if missing http prefix
        if (!ql_url.startsWith("http://") && !ql_url.startsWith("https://")) {
            ql_url = "http://" + ql_url;
            $.log(`Added http prefix to URL: ${ql_url}`);
        }

        // Remove trailing slash if present
        if (ql_url.endsWith("/")) {
            ql_url = ql_url.slice(0, -1);
        }

        // 1. Capture Cookie
        const cookie = $request.headers["Cookie"] || $request.headers["cookie"];
        if (!cookie) {
            if (MANUAL_CONFIG.debug) {
                $.log(`[DEBUG] No cookie found in request`);
            }
            $.done();
            return;
        }

        const pt_key = getCookieValue(cookie, "pt_key");
        const pt_pin = getCookieValue(cookie, "pt_pin");

        if (!pt_key || !pt_pin) {
            if (MANUAL_CONFIG.debug) {
                $.log(`[DEBUG] No pt_key or pt_pin found. pt_key=${pt_key ? 'exists' : 'missing'}, pt_pin=${pt_pin ? 'exists' : 'missing'}`);
            }
            $.done();
            return;
        }

        const jd_cookie = `pt_key=${pt_key};pt_pin=${pt_pin};`;
        $.log(`✅ Captured Cookie for ${pt_pin}`);

        // 1.5 Check Local Cache (Deduplication)
        const cacheKey = `JD_COOKIE_${pt_pin}`;
        const cachedCookie = $.getData(cacheKey);
        const isFirstCapture = !cachedCookie;

        if (cachedCookie === jd_cookie) {
            $.log(`Cookie for ${pt_pin} is unchanged. Skipping sync.`);
            $.done();
            return;
        }

        if (isFirstCapture) {
            $.log(`🎉 First time capturing cookie for ${pt_pin}`);
        } else {
            $.log(`🔄 Cookie changed for ${pt_pin}`);
        }

        // 2. Authenticate with Qinglong
        $.log(`Authenticating with Qinglong...`);
        const token = await getQLToken(ql_url, ql_client_id, ql_client_secret);
        if (!token) {
            $.notify("同步失败", "无法获取青龙 Token", "请检查 Client ID/Secret 和 URL 是否正确");
            $.done();
            return;
        }
        $.log(`✅ Authentication successful`);

        // 3. Sync Cookie
        $.log(`Syncing cookie to Qinglong...`);
        const result = await syncCookieToQL(ql_url, token, pt_pin, jd_cookie);

        if (result.success) {
            $.setData(cacheKey, jd_cookie);
            $.log(`✅ Sync successful: ${result.message}`);

            // 发送成功通知
            if (isFirstCapture) {
                $.notify("🎉 Cookie 已创建", `账号: ${pt_pin}`, "首次捕获并同步到青龙成功");
            } else {
                $.notify("🔄 Cookie 已更新", `账号: ${pt_pin}`, result.message);
            }
        } else {
            $.notify("同步失败", `账号: ${pt_pin}`, result.message || "未知错误");
        }

    } catch (e) {
        $.log(`❌ Error: ${e.message}`);
        $.notify("同步错误", "发生异常", e.message);
    } finally {
        $.done();
    }
})();

function getCookieValue(cookieStr, key) {
    const match = cookieStr.match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
    return match ? match[1] : null;
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
        }, reason => {
            $.log(`Cookie validation network error: ${reason.error}`);
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
                if (body.code === 200) {
                    resolve(body.data.token);
                } else {
                    $.log(`Auth Failed: ${JSON.stringify(body)}`);
                    resolve(null);
                }
            } catch (e) {
                $.log(`Auth Parse Error: ${e.message}`);
                resolve(null);
            }
        }, reason => {
            $.log(`Auth Network Error: ${reason.error}`);
            resolve(null);
        });
    });
}

async function syncCookieToQL(url, token, pt_pin, newValue) {
    const searchValue = pt_pin;
    const headers = {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
    };

    const getOptions = {
        url: `${url}/open/envs?searchValue=${encodeURIComponent(searchValue)}`,
        method: "GET",
        headers: headers
    };

    return new Promise((resolve) => {
        $.http.get(getOptions).then(async response => {
            try {
                const body = JSON.parse(response.body);
                if (body.code === 200) {
                    const envs = body.data;
                    const targetEnv = envs.find(e => {
                        return e.name === "JD_COOKIE" && e.value.includes(`pt_pin=${pt_pin}`);
                    });

                    if (targetEnv) {
                        // Update existing
                        if (targetEnv.value !== newValue) {
                            if (targetEnv.status !== 0) {
                                await enableEnv(url, token, targetEnv.id);
                            }
                            await updateEnv(url, token, targetEnv.id, "JD_COOKIE", newValue, targetEnv.remarks);
                            resolve({
                                success: true,
                                message: "已更新并同步到青龙"
                            });
                        } else {
                            if (targetEnv.status !== 0) {
                                await enableEnv(url, token, targetEnv.id);
                                resolve({
                                    success: true,
                                    message: "已启用（值未变化）"
                                });
                            } else {
                                $.log(`Cookie for ${pt_pin} is already up to date.`);
                                resolve({
                                    success: true,
                                    message: "Cookie 已是最新"
                                });
                            }
                        }
                    } else {
                        // Create new
                        await createEnv(url, token, "JD_COOKIE", newValue, `Created by Loon for ${pt_pin}`);
                        resolve({
                            success: true,
                            message: "已创建并同步到青龙"
                        });
                    }
                } else {
                    resolve({
                        success: false,
                        message: `青龙返回错误: ${body.message || 'Unknown'}`
                    });
                }
            } catch (e) {
                $.log(`Sync Parse Error: ${e.message}`);
                resolve({
                    success: false,
                    message: `解析错误: ${e.message}`
                });
            }
        }, reason => {
            $.log(`Sync Network Error: ${reason.error}`);
            resolve({
                success: false,
                message: `网络错误: ${reason.error}`
            });
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
        body: JSON.stringify({
            id, name, value, remarks
        })
    };
    return new Promise(resolve => {
        $.http.put(options).then(() => resolve(), () => resolve());
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
        body: JSON.stringify([{
            name, value, remarks
        }])
    };
    return new Promise(resolve => {
        $.http.post(options).then(() => resolve(), () => resolve());
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
        $.http.put(options).then(() => resolve(), () => resolve());
    });
}

// Simple API Wrapper for Loon
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
                            resolve({
                                status: response.status,
                                headers: response.headers,
                                body: data
                            });
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
                            resolve({
                                status: response.status,
                                headers: response.headers,
                                body: data
                            });
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
                            resolve({
                                status: response.status,
                                headers: response.headers,
                                body: data
                            });
                        }
                    });
                } else {
                    reject({ error: "Not in Loon environment" });
                }
            });
        }
    }
}
