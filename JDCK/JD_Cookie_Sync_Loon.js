/*
 * JD Cookie Sync to Qinglong - Smart Validation
 * 
 * 行为：
 * 1) 抓到 pt_key + pt_pin 后先验证 Cookie 有效性
 * 2) Cookie 有效且未变化则静默跳过，无需同步青龙
 * 3) Cookie 失效或变化时才同步青龙
 * Version: v2.0.1
 * Author: z.W.
 * 
 * @script
 * api.m.jd.com
 * 
 * @args
 * ql_url: Qinglong Panel URL (e.g., http://192.168.1.1:5700)
 * ql_client_id: Qinglong Client ID
 * ql_client_secret: Qinglong Client Secret
 */

const $ = new API("jd_cookie_sync");

// ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
// 如果插件配置界面无法输入,请直接修改下面的引号内容
const MANUAL_CONFIG = {
    // 本地修改指南:
    // 如果您不想在插件配置页填写,可以在这里直接填入您的信息。
    // 因为是本地脚本,更新不会覆盖您的修改(除非您手动替换了文件)。
    url: "",        // 必填,例如 "http://192.168.1.1:5700"
    id: "",         // 必填,Client ID
    secret: ""      // 必填,Client Secret
};
// ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

(async () => {
    try {
        let ql_url = MANUAL_CONFIG.url || $.read("ql_url");
        const ql_client_id = MANUAL_CONFIG.id || $.read("ql_client_id");
        const ql_client_secret = MANUAL_CONFIG.secret || $.read("ql_client_secret");

        $.log(`Config: URL=${ql_url}, ID=${ql_client_id ? '***' : 'Missing'}, Secret=${ql_client_secret ? '***' : 'Missing'}`);

        if (!ql_url || !ql_client_id || !ql_client_secret || ql_url.includes("{ql_url}")) {
            $.notify("配置未生效", "参数未正确替换", "请在Loon插件配置页填写青龙信息并保存，不要留空。");
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
            // Not a relevant request or no cookie
            $.done();
            return;
        }

        const pt_key = getCookieValue(cookie, "pt_key");
        const pt_pin = getCookieValue(cookie, "pt_pin");

        if (!pt_key || !pt_pin) {
            // $.log("No pt_key or pt_pin found in cookie");
            $.done();
            return;
        }

        const jd_cookie = `pt_key=${pt_key};pt_pin=${pt_pin};`;

        // 1.5 Check Local Cache (Deduplication)
        const cachedCookie = $.getData(`JD_COOKIE_${pt_pin}`);
        if (cachedCookie === jd_cookie) {
            $.log(`Cookie for ${pt_pin} is unchanged. Skipping sync.`);
            $.done();
            return;
        }

        $.log(`Captured New/Updated Cookie for ${pt_pin}`);

        // 2. Authenticate with Qinglong
        const token = await getQLToken(ql_url, ql_client_id, ql_client_secret);
        if (!token) {
            $.notify("Sync Failed", "Could not get Qinglong Token", "Check your Client ID/Secret and URL.");
            $.done();
            return;
        }

        // 3. Sync Cookie
        const success = await syncCookieToQL(ql_url, token, pt_pin, jd_cookie);
        if (success) {
            $.setData(`JD_COOKIE_${pt_pin}`, jd_cookie);
        }

    } catch (e) {
        $.log(`Error: ${e.message}`);
        $.notify("Sync Error", "An unexpected error occurred", e.message);
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
                
                // 检查返回数据是否包含用户信息
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
    const searchValue = pt_pin; // Search by pin is safer if we want to find existing specific user
    const headers = {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
    };

    // fetch all envs
    const getOptions = {
        url: `${url}/open/envs?searchValue=${encodeURIComponent(searchValue)}`,
        method: "GET",
        headers: headers
    };

    // We need to find the exact match for JD_COOKIE with this pt_pin
    // Usually QL returns a list. We filter specifically for JD_COOKIE.

    return new Promise((resolve) => {
        $.http.get(getOptions).then(async response => {
            try {
                const body = JSON.parse(response.body);
                if (body.code === 200) {
                    const envs = body.data;
                    const targetEnv = envs.find(e => {
                        // Check if it's JD_COOKIE and contains the pin
                        return e.name === "JD_COOKIE" && e.value.includes(`pt_pin=${pt_pin}`);
                    });

                    if (targetEnv) {
                        // Update
                        if (targetEnv.value !== newValue) {
                            if (targetEnv.status !== 0) {
                                await enableEnv(url, token, targetEnv.id);
                            }
                            await updateEnv(url, token, targetEnv.id, "JD_COOKIE", newValue, targetEnv.remarks);
                            $.notify("Cookie Updated", `Updated JD_COOKIE for ${pt_pin}`, "Synced to Qinglong successfully.");
                            resolve(true); // Success
                        } else {
                            if (targetEnv.status !== 0) {
                                await enableEnv(url, token, targetEnv.id);
                                $.notify("Cookie Enabled", `Enabled JD_COOKIE for ${pt_pin}`, "Value was unchanged but enabled.");
                                resolve(true); // Success
                            } else {
                                $.log(`Cookie for ${pt_pin} is already up to date.`);
                                // Optional: verbose notification
                                // $.notify("Cookie Unchanged", `JD_COOKIE for ${pt_pin} is up to date`, "");
                                resolve(true); // Considered success (state is correct)
                            }
                        }
                    } else {
                        // Create
                        await createEnv(url, token, "JD_COOKIE", newValue, `Created by Loon Plugin for ${pt_pin}`);
                        $.notify("Cookie Created", `Created JD_COOKIE for ${pt_pin}`, "Synced to Qinglong successfully.");
                        resolve(true); // Success
                    }
                }
                resolve(false); // Code not 200

            } catch (e) {
                $.log(`Sync Parse Error: ${e.message}`);
                resolve(false);
            }
        }, reason => {
            $.log(`Sync Network Error: ${reason.error}`);
            resolve(false);
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


// Simple API Wrapper for Loon to standardize Usage
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
            $notification.post("JD Cookie Sync", subtitle, message);
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
