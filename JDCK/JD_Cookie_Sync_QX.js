/*
 * JD Cookie Sync to Qinglong - Quantumult X Version
 * 
 * 行为：
 * 1) 抓到 pt_key + pt_pin 后先验证 Cookie 有效性
 * 2) Cookie 有效且未变化则静默跳过，无需同步青龙
 * 3) Cookie 失效或变化时才同步青龙
 * Version: v1.0.1
 * Author: z.W.
 * 
 * @script
 * api.m.jd.com
 * 
 * @config
 * 需要在Quantumult X配置中设置以下参数（通过BoxJS或直接修改下方MANUAL_CONFIG）：
 * - ql_url: 青龙面板地址 (例如: http://192.168.1.1:5700)
 * - ql_client_id: 青龙面板 API Client ID
 * - ql_client_secret: 青龙面板 API Client Secret
 */

// ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
// 如果不使用BoxJS，请直接修改下面的引号内容
const MANUAL_CONFIG = {
    url: "",        // 必填，例如 "http://192.168.1.1:5700"
    id: "",         // 必填，Client ID
    secret: ""      // 必填，Client Secret
};
// ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

(async () => {
    try {
        // 读取配置（优先使用MANUAL_CONFIG，其次使用BoxJS配置）
        let ql_url = MANUAL_CONFIG.url || $prefs.valueForKey("jd_ql_url");
        const ql_client_id = MANUAL_CONFIG.id || $prefs.valueForKey("jd_ql_client_id");
        const ql_client_secret = MANUAL_CONFIG.secret || $prefs.valueForKey("jd_ql_client_secret");

        console.log(`[JD Cookie Sync] Config: URL=${ql_url}, ID=${ql_client_id ? '***' : 'Missing'}, Secret=${ql_client_secret ? '***' : 'Missing'}`);

        // 检查配置是否完整
        if (!ql_url || !ql_client_id || !ql_client_secret || ql_url.includes("{ql_url}")) {
            $notify("配置未生效", "参数未正确设置", "请在BoxJS或脚本中配置青龙信息");
            $done();
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
            $done();
            return;
        }

        const pt_key = getCookieValue(cookie, "pt_key");
        const pt_pin_raw = getCookieValue(cookie, "pt_pin");

        if (!pt_key || !pt_pin_raw) {
            $done();
            return;
        }

        // 兼容URL编码的pt_pin
        const pt_pin = safeDecodeURIComponent(pt_pin_raw);
        const jd_cookie = `pt_key=${pt_key};pt_pin=${pt_pin};`;

        console.log(`[JD Cookie Sync] Captured Cookie for pt_pin=${pt_pin}`);

        // 2. 检查本地缓存（去重）
        const cacheKey = `JD_COOKIE_CACHE_${pt_pin}`;
        const cachedCookie = $prefs.valueForKey(cacheKey);

        if (cachedCookie === jd_cookie) {
            console.log(`[JD Cookie Sync] Cookie unchanged for ${pt_pin}, validating...`);

            // 2.1 验证Cookie有效性
            const validation = await validateJDCookie(jd_cookie);

            if (validation.valid) {
                console.log(`[JD Cookie Sync] Cookie valid for ${pt_pin} (${validation.nickname || 'unknown'}). Skip sync.`);
                $done();
                return;
            } else {
                console.log(`[JD Cookie Sync] Cookie invalid for ${pt_pin}. Need to re-sync.`);
                // 继续执行同步逻辑
            }
        }

        // 3. 获取青龙Token
        const token = await getQLToken(ql_url, ql_client_id, ql_client_secret);
        if (!token) {
            $notify("同步失败", "获取青龙Token失败", "请检查配置信息是否正确");
            $done();
            return;
        }

        // 4. 同步Cookie到青龙
        const result = await syncCookieToQL(ql_url, token, pt_pin, jd_cookie);

        if (!result.ok) {
            $notify("同步失败", "青龙接口返回异常", result.message || "Unknown error");
            $done();
            return;
        }

        // 5. 同步成功后更新缓存
        if (result.changed) {
            $prefs.setValueForKey(jd_cookie, cacheKey);
            $notify(result.title, result.subtitle, result.body);
        } else {
            console.log(`[JD Cookie Sync] No change for ${pt_pin}. No notification.`);
        }

    } catch (e) {
        console.log(`[JD Cookie Sync] Error: ${e && e.message ? e.message : e}`);
        $notify("同步错误", "发生未预期的错误", String(e && e.message ? e.message : e));
    } finally {
        $done();
    }
})();

// ========== 工具函数 ==========

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
 * 验证京东Cookie是否有效
 */
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

    try {
        const response = await $task.fetch(options);
        const body = JSON.parse(response.body);

        // 检查返回数据是否包含用户信息
        if (body && body.retcode === "0" && body.data && body.data.userInfo) {
            const nickname = body.data.userInfo.baseInfo?.nickname || "";
            console.log(`[JD Cookie Sync] Cookie validation success: ${nickname}`);
            return { valid: true, nickname };
        } else {
            console.log(`[JD Cookie Sync] Cookie validation failed: ${JSON.stringify(body).substring(0, 100)}`);
            return { valid: false };
        }
    } catch (e) {
        console.log(`[JD Cookie Sync] Cookie validation error: ${e.message || e}`);
        return { valid: false };
    }
}

/**
 * 获取青龙面板Token
 */
async function getQLToken(url, clientId, clientSecret) {
    const options = {
        url: `${url}/open/auth/token?client_id=${clientId}&client_secret=${clientSecret}`,
        method: "GET"
    };

    try {
        const response = await $task.fetch(options);
        const body = JSON.parse(response.body);

        if (body.code === 200 && body.data && body.data.token) {
            return body.data.token;
        } else {
            console.log(`[JD Cookie Sync] Auth Failed: ${JSON.stringify(body)}`);
            return null;
        }
    } catch (e) {
        console.log(`[JD Cookie Sync] Auth Error: ${e.message || e}`);
        return null;
    }
}

/**
 * 同步Cookie到青龙面板
 * 仅当"青龙端状态发生变化"才标记 changed=true：
 * - 未找到则创建
 * - 找到但 value 不同则更新
 * - 找到但被禁用则启用
 * 若 value 相同且已启用，则 changed=false（不通知）
 */
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

    try {
        const response = await $task.fetch(getOptions);
        const body = JSON.parse(response.body);

        if (body.code !== 200 || !Array.isArray(body.data)) {
            console.log(`[JD Cookie Sync] Sync Unexpected Response: ${response.body}`);
            return { ok: false, message: "Unexpected Qinglong response" };
        }

        const envs = body.data;
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

                return {
                    ok: true,
                    changed,
                    title: "Cookie已更新",
                    subtitle: `已更新并同步：${pt_pin}`,
                    body: "青龙中的JD_COOKIE已更新成功"
                };
            }

            // 值相同：如果刚启用过也算变化；否则不算变化
            if (changed) {
                return {
                    ok: true,
                    changed,
                    title: "Cookie已启用",
                    subtitle: `已启用并同步：${pt_pin}`,
                    body: "值未变化，但已从禁用状态启用"
                };
            } else {
                return { ok: true, changed: false };
            }
        }

        // 未找到：创建（算变化）
        await createEnv(url, token, "JD_COOKIE", newValue, `Created by QX Script for ${pt_pin}`);
        return {
            ok: true,
            changed: true,
            title: "Cookie已创建",
            subtitle: `已创建并同步：${pt_pin}`,
            body: "青龙中新增JD_COOKIE变量成功"
        };

    } catch (e) {
        console.log(`[JD Cookie Sync] Sync Error: ${e.message || e}`);
        return { ok: false, message: e.message || String(e) };
    }
}

/**
 * 更新青龙环境变量
 */
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

    try {
        await $task.fetch(options);
    } catch (e) {
        console.log(`[JD Cookie Sync] Update Env Error: ${e.message || e}`);
    }
}

/**
 * 创建青龙环境变量
 */
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

    try {
        await $task.fetch(options);
    } catch (e) {
        console.log(`[JD Cookie Sync] Create Env Error: ${e.message || e}`);
    }
}

/**
 * 启用青龙环境变量
 */
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

    try {
        await $task.fetch(options);
    } catch (e) {
        console.log(`[JD Cookie Sync] Enable Env Error: ${e.message || e}`);
    }
}
