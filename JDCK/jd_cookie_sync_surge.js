/*
 * JD Cookie Sync to Qinglong - Surge Version
 * 
 * @script
 * api.m.jd.com
 * 
 * @args
 * ql_url: Qinglong Panel URL (e.g., http://192.168.1.1:5700)
 * ql_client_id: Qinglong Client ID
 * ql_client_secret: Qinglong Client Secret
 */

// ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
// 如果模块配置界面无法输入,请直接修改下面的引号内容
const MANUAL_CONFIG = {
    // 本地修改指南:
    // 如果您不想在模块配置页填写,可以在这里直接填入您的信息。
    // 因为是本地脚本,更新不会覆盖您的修改(除非您手动替换了文件)。
    url: "",        // 必填,例如 "http://192.168.1.1:5700"
    id: "",         // 必填,Client ID
    secret: "",     // 必填,Client Secret
    // 调试选项(默认关闭):
    // - 设置 debug=true 可以在拦截到请求但没有 Cookie 时发送一次调试通知，便于确认脚本是否被触发
    // - 仅在确认为调试排查时打开，避免造成通知骚扰
    debug: false
};
// ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

(async () => {
    try {
        let ql_url = MANUAL_CONFIG.url || getArg("ql_url");
        const ql_client_id = MANUAL_CONFIG.id || getArg("ql_client_id");
        const ql_client_secret = MANUAL_CONFIG.secret || getArg("ql_client_secret");

        console.log(`Config: URL=${ql_url}, ID=${ql_client_id ? '***' : 'Missing'}, Secret=${ql_client_secret ? '***' : 'Missing'}`);

        if (!ql_url || !ql_client_id || !ql_client_secret || ql_url.includes("{ql_url}")) {
            $notification.post("配置未生效", "参数未正确替换", "请在Surge模块配置页填写青龙信息并保存,不要留空。");
            $done({});
            return;
        }

        // Auto-fix URL if missing http prefix
        if (!ql_url.startsWith("http://") && !ql_url.startsWith("https://")) {
            ql_url = "http://" + ql_url;
            console.log(`Added http prefix to URL: ${ql_url}`);
        }

        // Remove trailing slash if present
        if (ql_url.endsWith("/")) {
            ql_url = ql_url.slice(0, -1);
        }

        // 1. Capture Cookie
        console.log(`Intercepted request: ${$request.method || 'GET'} ${$request.url || ''}`);
        try {
            console.log(`Request header keys: ${Object.keys($request.headers || {}).join(', ')}`);
        } catch (e) {
            console.log('Could not enumerate request headers');
        }

        const cookie = $request.headers["Cookie"] || $request.headers["cookie"];
        if (!cookie) {
            // 如果在 MANUAL_CONFIG 或 argument 中启用了 debug 模式, 则发送一次调试通知来帮助定位
            const debugEnabled = MANUAL_CONFIG.debug || getArg('debug') === 'true';
            if (debugEnabled) {
                const notified = $persistentStore.read('JD_DEBUG_NO_COOKIE_NOTIFIED');
                if (!notified) {
                    $notification.post("JD Request (No Cookie)", "Found request but no Cookie header", $request.url || "URL unknown");
                    $persistentStore.write('1', 'JD_DEBUG_NO_COOKIE_NOTIFIED');
                } else {
                    console.log("JD request intercepted but no Cookie header present (notification suppressed).");
                }
            } else {
                console.log("JD request intercepted but no Cookie header present.");
            }
            $done({});
            return;
        }

        const pt_key = getCookieValue(cookie, "pt_key");
        const pt_pin = getCookieValue(cookie, "pt_pin");

        if (!pt_key || !pt_pin) {
            $done({});
            return;
        }

        const jd_cookie = `pt_key=${pt_key};pt_pin=${pt_pin};`;

        // 1.5 Check Local Cache (Deduplication)
        const cachedCookie = $persistentStore.read(`JD_COOKIE_${pt_pin}`);
        if (cachedCookie === jd_cookie) {
            console.log(`Cookie for ${pt_pin} is unchanged. Skipping sync.`);
            $done({});
            return;
        }

        console.log(`Captured New/Updated Cookie for ${pt_pin}`);

        // 2. Authenticate with Qinglong
        const token = await getQLToken(ql_url, ql_client_id, ql_client_secret);
        if (!token) {
            $notification.post("Sync Failed", "Could not get Qinglong Token", "Check your Client ID/Secret and URL.");
            $done({});
            return;
        }

        // 3. Sync Cookie
        const success = await syncCookieToQL(ql_url, token, pt_pin, jd_cookie);
        if (success) {
            $persistentStore.write(jd_cookie, `JD_COOKIE_${pt_pin}`);
        }

    } catch (e) {
        console.log(`Error: ${e.message}`);
        $notification.post("Sync Error", "An unexpected error occurred", e.message);
    } finally {
        $done({});
    }
})();

function getArg(key) {
    const args = {};
    if (typeof $argument !== 'undefined' && $argument) {
        $argument.split("&").forEach(pair => {
            const idx = pair.indexOf("=");
            if (idx > -1) {
                const k = pair.substring(0, idx);
                const v = pair.substring(idx + 1);
                if (k && v) args[k] = decodeURIComponent(v);
            }
        });
    }
    return args[key];
}

function getCookieValue(cookieStr, key) {
    const match = cookieStr.match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
    return match ? match[1] : null;
}

async function getQLToken(url, clientId, clientSecret) {
    const options = {
        url: `${url}/open/auth/token?client_id=${clientId}&client_secret=${clientSecret}`,
        method: "GET"
    };

    return new Promise((resolve) => {
        $httpClient.get(options, (error, response, data) => {
            if (error) {
                console.log(`Auth Network Error: ${error}`);
                resolve(null);
                return;
            }
            try {
                const body = JSON.parse(data);
                if (body.code === 200) {
                    resolve(body.data.token);
                } else {
                    console.log(`Auth Failed: ${JSON.stringify(body)}`);
                    resolve(null);
                }
            } catch (e) {
                console.log(`Auth Parse Error: ${e.message}`);
                resolve(null);
            }
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
        $httpClient.get(getOptions, async (error, response, data) => {
            if (error) {
                console.log(`Sync Network Error: ${error}`);
                resolve(false);
                return;
            }
            try {
                const body = JSON.parse(data);
                if (body.code === 200) {
                    const envs = body.data;
                    const targetEnv = envs.find(e => {
                        return e.name === "JD_COOKIE" && e.value.includes(`pt_pin=${pt_pin}`);
                    });

                    if (targetEnv) {
                        if (targetEnv.value !== newValue) {
                            if (targetEnv.status !== 0) {
                                await enableEnv(url, token, targetEnv.id);
                            }
                            await updateEnv(url, token, targetEnv.id, "JD_COOKIE", newValue, targetEnv.remarks);
                            $notification.post("Cookie Updated", `Updated JD_COOKIE for ${pt_pin}`, "Synced to Qinglong successfully.");
                            resolve(true);
                        } else {
                            if (targetEnv.status !== 0) {
                                await enableEnv(url, token, targetEnv.id);
                                $notification.post("Cookie Enabled", `Enabled JD_COOKIE for ${pt_pin}`, "Value was unchanged but enabled.");
                                resolve(true);
                            } else {
                                console.log(`Cookie for ${pt_pin} is already up to date.`);
                                resolve(true);
                            }
                        }
                    } else {
                        await createEnv(url, token, "JD_COOKIE", newValue, `Created by Surge Module for ${pt_pin}`);
                        $notification.post("Cookie Created", `Created JD_COOKIE for ${pt_pin}`, "Synced to Qinglong successfully.");
                        resolve(true);
                    }
                } else {
                    resolve(false);
                }
            } catch (e) {
                console.log(`Sync Parse Error: ${e.message}`);
                resolve(false);
            }
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
        $httpClient.put(options, () => resolve());
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
        $httpClient.post(options, () => resolve());
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
        $httpClient.put(options, () => resolve());
    });
}
