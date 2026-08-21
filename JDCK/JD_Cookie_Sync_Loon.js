/*
 * JD Cookie Sync to Qinglong - Loon Version
 * 
 * 行为（完全对齐 Quantumult X 规则）：
 * 1) 抓到 pt_key + pt_pin 后直接同步至青龙面板（不进行多余的有效性校验）
 * 2) 青龙端 Cookie 已存在且一致则静默同步（不发弹窗通知），不同或被禁用时自动更新/启用并提示
 * 3) 支持 BoxJS 配置参数，亦支持脚本内 MANUAL_CONFIG 本地配置
 * 4) 兼容青龙新版 API：data 可为数组（旧版）或 {list, total} 对象（新版 2.17+）
 * 
 * Version: v1.0.1
 * Author: z.W.
 * 
 * @script
 * api.m.jd.com
 * 
 * @config
 * BoxJS 配置项（订阅 BeRich_Loon.boxjs.json）：
 * - jd_ql_url: 青龙面板地址 (例如: http://192.168.1.1:5700)
 * - jd_ql_client_id: 青龙面板 API Client ID
 * - jd_ql_client_secret: 青龙面板 API Client Secret
 */

// ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
// 如果不使用 BoxJS，请直接修改下面的引号内容
const MANUAL_CONFIG = {
    url: "",        // 必填，例如 "http://192.168.1.1:5700"
    id: "",         // 必填，Client ID
    secret: ""      // 必填，Client Secret
};
// ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

(async () => {
    try {
        // 读取配置（优先使用 MANUAL_CONFIG，其次使用 BoxJS 配置）
        let ql_url = MANUAL_CONFIG.url || getBoxJSSetting("jd_ql_url");
        const ql_client_id = MANUAL_CONFIG.id || getBoxJSSetting("jd_ql_client_id");
        const ql_client_secret = MANUAL_CONFIG.secret || getBoxJSSetting("jd_ql_client_secret");

        console.log(`[JD Cookie Sync] Config: URL=${ql_url || 'Missing'}, ID=${ql_client_id ? '***' : 'Missing'}, Secret=${ql_client_secret ? '***' : 'Missing'}`);

        // 检查配置是否完整
        if (!ql_url || !ql_client_id || !ql_client_secret || ql_url.includes("{ql_url}")) {
            $notification.post("⚠️ 配置未生效", "参数未正确设置", "请在 BoxJS 订阅「BeRich Loon 合集」或脚本 MANUAL_CONFIG 中配置青龙信息");
            $done({});
            return;
        }

        // 自动修正URL格式
        if (!ql_url.startsWith("http://") && !ql_url.startsWith("https://")) {
            ql_url = "http://" + ql_url;
            console.log(`[JD Cookie Sync] Added http prefix to URL: ${ql_url}`);
        }

        // 移除末尾斜杠
        if (ql_url.endsWith("/")) {
            ql_url = ql_url.slice(0, -1);
        }

        // 1. 捕获Cookie
        const cookie = $request.headers["Cookie"] || $request.headers["cookie"];
        if (!cookie) {
            $done({});
            return;
        }

        const pt_key = getCookieValue(cookie, "pt_key");
        const pt_pin_raw = getCookieValue(cookie, "pt_pin");

        if (!pt_key || !pt_pin_raw) {
            $done({});
            return;
        }

        // 兼容URL编码的pt_pin
        const pt_pin = safeDecodeURIComponent(pt_pin_raw);
        const jd_cookie = `pt_key=${pt_key};pt_pin=${pt_pin};`;

        console.log(`[JD Cookie Sync] Captured Cookie for pt_pin=${pt_pin}`);

        // 保存当前抓到的 Pin 及更新本地设备 Pin 列表
        $persistentStore.write(pt_pin, "JD_CURRENT_PIN");
        $persistentStore.write(jd_cookie, `JD_COOKIE_CACHE_${pt_pin}`);
        try {
            let pinsArr = JSON.parse($persistentStore.read("LOON_LOCAL_JD_PINS") || "[]");
            if (!pinsArr.includes(pt_pin)) {
                pinsArr.push(pt_pin);
                $persistentStore.write(JSON.stringify(pinsArr), "LOON_LOCAL_JD_PINS");
            }
        } catch (_) { }

        // 2. 获取青龙Token
        const token = await getQLToken(ql_url, ql_client_id, ql_client_secret);
        if (!token) {
            $notification.post("同步失败", "获取青龙Token失败", "请检查青龙地址与应用密钥配置是否正确");
            $done({});
            return;
        }

        // 3. 每次打开京东均同步Cookie到青龙
        const result = await syncCookieToQL(ql_url, token, pt_pin, jd_cookie);

        if (!result.ok) {
            // 静默记录，不弹窗打扰（偶发网络/青龙重启导致的临时异常无需通知）
            console.log(`[JD Cookie Sync] 同步失败: ${result.message || 'Unknown error'}`);
            $done({});
            return;
        }

        // 4. 青龙端数据变动或重新启用时通知
        if (result.changed) {
            $persistentStore.write(jd_cookie, `JD_COOKIE_CACHE_${pt_pin}`);
            $notification.post(result.title, result.subtitle, result.body);
            console.log(`[JD Cookie Sync] ${result.title}: ${result.subtitle}`);
        } else {
            console.log(`[JD Cookie Sync] Cookie synced for ${pt_pin} (no status/value change in QL). Skipping notification.`);
        }

    } catch (e) {
        console.log(`[JD Cookie Sync] Error: ${e && e.message ? e.message : e}`);
        $notification.post("同步错误", "发生未预期的错误", String(e && e.message ? e.message : e));
    } finally {
        $done({});
    }
})();


// ========== 工具函数 ==========

/**
 * 从 BoxJS 持久化存储中读取指定 key 的值
 */
function getBoxJSSetting(key) {
    try {
        const val = $persistentStore.read(key);
        return val && val.trim() !== "" ? val.trim() : null;
    } catch (_) {
        return null;
    }
}

/**
 * 从Cookie字符串中提取指定键的值
 */
function getCookieValue(cookieStr, key) {
    const match = cookieStr.match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
    return match ? match[1] : null;
}

/**
 * 安全的URL解码
 */
function safeDecodeURIComponent(s) {
    try {
        return decodeURIComponent(s);
    } catch (_) {
        return s;
    }
}

/**
 * 获取青龙面板Token
 */
async function getQLToken(url, clientId, clientSecret) {
    const options = {
        url: `${url}/open/auth/token?client_id=${clientId}&client_secret=${clientSecret}`,
        headers: {
            "Content-Type": "application/json"
        }
    };

    return new Promise((resolve) => {
        $httpClient.get(options, (error, response, data) => {
            if (error) {
                console.log(`[JD Cookie Sync] Auth Network Error: ${error}`);
                resolve(null);
                return;
            }
            try {
                const body = JSON.parse(data);
                if (body.code === 200 && body.data && body.data.token) {
                    resolve(body.data.token);
                } else {
                    console.log(`[JD Cookie Sync] Auth Failed: ${JSON.stringify(body)}`);
                    resolve(null);
                }
            } catch (e) {
                console.log(`[JD Cookie Sync] Auth Parse Error: ${e.message || e}`);
                resolve(null);
            }
        });
    });
}

/**
 * 同步Cookie到青龙面板
 * 仅当"青龙端状态发生变化"才标记 changed=true：
 * - 未找到则创建
 * - 找到但 value 不同则更新
 * - 找到但被禁用则启用
 * 若 value 相同且已启用，则 changed=false（静默同步，不打扰用户）
 */
async function syncCookieToQL(url, token, pt_pin, newValue) {
    const headers = {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
    };

    const getOptions = {
        url: `${url}/open/envs?searchValue=${encodeURIComponent(pt_pin)}`,
        headers
    };

    return new Promise((resolve) => {
        $httpClient.get(getOptions, async (error, response, data) => {
            if (error) {
                console.log(`[JD Cookie Sync] Sync Query Error: ${error}`);
                resolve({ ok: false, message: error });
                return;
            }

            try {
                const body = JSON.parse(data);
                if (body.code !== 200) {
                    console.log(`[JD Cookie Sync] Sync Unexpected Response (code=${body.code}): ${data}`);
                    resolve({ ok: false, message: `Qinglong response code=${body.code}` });
                    return;
                }

                // 兼容青龙新旧两种 API 格式：
                // 旧版（<2.17）: body.data = []
                // 新版（>=2.17）: body.data = { list: [], total: N }
                let envs;
                if (Array.isArray(body.data)) {
                    envs = body.data;
                } else if (body.data && Array.isArray(body.data.list)) {
                    envs = body.data.list;
                } else {
                    console.log(`[JD Cookie Sync] Unknown data structure: ${JSON.stringify(body.data)}`);
                    resolve({ ok: false, message: "Unknown Qinglong data structure" });
                    return;
                }
                const targetEnv = envs.find(e =>
                    e && e.name === "JD_COOKIE" &&
                    typeof e.value === "string" &&
                    e.value.includes(`pt_pin=${pt_pin}`)
                );

                // 变化标记
                let changed = false;

                if (targetEnv) {
                    // 如果被禁用，先启用（算变化）
                    if (targetEnv.status !== 0) {
                        await enableEnv(url, token, targetEnv.id);
                        changed = true;
                    }

                    // 如果值不同，更新（算变化）
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

                    // 值相同：如果刚启用过也算变化；否则不算变化
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

                // 未找到：创建（算变化）
                await createEnv(url, token, "JD_COOKIE", newValue, `Created by Loon Script for ${pt_pin}`);
                resolve({
                    ok: true,
                    changed: true,
                    title: "Cookie已创建",
                    subtitle: `已创建并同步：${pt_pin}`,
                    body: "青龙中新增JD_COOKIE变量成功"
                });

            } catch (e) {
                console.log(`[JD Cookie Sync] Sync Error: ${e.message || e}`);
                resolve({ ok: false, message: e.message || String(e) });
            }
        });
    });
}

/**
 * 更新青龙环境变量
 */
function updateEnv(url, token, id, name, value, remarks) {
    const options = {
        url: `${url}/open/envs`,
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ id, name, value, remarks })
    };

    return new Promise((resolve) => {
        $httpClient.put(options, (error, response, data) => {
            if (error) {
                console.log(`[JD Cookie Sync] Update Env Error: ${error}`);
            }
            resolve();
        });
    });
}

/**
 * 创建青龙环境变量
 */
function createEnv(url, token, name, value, remarks) {
    const options = {
        url: `${url}/open/envs`,
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify([{ name, value, remarks }])
    };

    return new Promise((resolve) => {
        $httpClient.post(options, (error, response, data) => {
            if (error) {
                console.log(`[JD Cookie Sync] Create Env Error: ${error}`);
            }
            resolve();
        });
    });
}

/**
 * 启用青龙环境变量
 */
function enableEnv(url, token, id) {
    const options = {
        url: `${url}/open/envs/enable`,
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify([id])
    };

    return new Promise((resolve) => {
        $httpClient.put(options, (error, response, data) => {
            if (error) {
                console.log(`[JD Cookie Sync] Enable Env Error: ${error}`);
            }
            resolve();
        });
    });
}
