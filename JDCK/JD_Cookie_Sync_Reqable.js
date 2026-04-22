/*
 * JD Cookie Sync to Qinglong - Reqable (Android) Version
 *
 * 适配工具：Reqable (Android)
 * 官网：https://reqable.com
 * 支持系统：Android 7.0+
 *
 * 功能：
 * 1) 通过 Reqable MITM 拦截京东 App 请求
 * 2) 自动提取 pt_key + pt_pin
 * 3) 带冷却时间机制，避免频繁同步
 * 4) 将 Cookie 同步至指定青龙面板
 *
 * Version: v1.0.0
 * Author: z.W.
 *
 * ── 使用步骤 ──
 * 1. 安装 Reqable：https://reqable.com/zh-CN/android/
 * 2. 导入并信任 CA 证书（设置 -> SSL证书）
 * 3. 在 Reqable「脚本」中新建脚本，URL 填：
 *      api.m.jd.com
 * 4. 将本脚本内容粘贴并保存
 * 5. 修改下方 MANUAL_CONFIG 配置项
 * 6. 打开京东 App，触发任意请求即可
 */

// =====================================================
// 📝 配置区域 - 请修改下面的内容
// =====================================================
const MANUAL_CONFIG = {
    url: "",      // 必填，例如 "http://192.168.1.1:5700"
    id: "",       // 必填，青龙应用 Client ID
    secret: "",   // 必填，青龙应用 Client Secret
    cooldown: 5   // 可选，冷却时间（分钟），默认 5 分钟
};
// =====================================================

// Reqable 脚本入口（onRequest / onResponse 模式）
// 京东 Cookie 在请求头中，使用 onRequest 拦截
async function onRequest(context, request) {
    try {
        const cookie = request.headers.get("Cookie") || request.headers.get("cookie");
        if (!cookie) return request;

        const pt_key = getCookieValue(cookie, "pt_key");
        const pt_pin_raw = getCookieValue(cookie, "pt_pin");

        if (!pt_key || !pt_pin_raw) return request;

        const pt_pin = safeDecodeURIComponent(pt_pin_raw);
        const jd_cookie = `pt_key=${pt_key};pt_pin=${pt_pin};`;

        // 读取配置
        let ql_url = MANUAL_CONFIG.url;
        const ql_client_id = MANUAL_CONFIG.id;
        const ql_client_secret = MANUAL_CONFIG.secret;
        const cooldown_minutes = MANUAL_CONFIG.cooldown || 5;

        if (!ql_url || !ql_client_id || !ql_client_secret) {
            console.log("[JD Cookie Sync] ⚠️ 配置未填写，请编辑脚本中的 MANUAL_CONFIG");
            return request;
        }

        // URL 格式修正
        if (!ql_url.startsWith("http://") && !ql_url.startsWith("https://")) {
            ql_url = "http://" + ql_url;
        }
        if (ql_url.endsWith("/")) {
            ql_url = ql_url.slice(0, -1);
        }

        // 冷却检查（使用 Reqable 持久化存储）
        const cacheKey = `JD_COOKIE_CACHE_${pt_pin}`;
        const timestampKey = `JD_COOKIE_TS_${pt_pin}`;
        const cachedCookie = context.store.get(cacheKey);
        const lastTs = parseInt(context.store.get(timestampKey) || "0");
        const now = Date.now();
        const cooldownMs = cooldown_minutes * 60 * 1000;

        if (cachedCookie === jd_cookie && (now - lastTs) < cooldownMs) {
            const remainMin = Math.ceil((cooldownMs - (now - lastTs)) / 60000);
            console.log(`[JD Cookie Sync] Cookie 未变化，冷却中（剩余 ${remainMin} 分钟）`);
            return request;
        }

        console.log(`[JD Cookie Sync] 检测到 pt_pin=${pt_pin}，开始同步...`);

        // 获取青龙 Token
        const token = await getQLToken(ql_url, ql_client_id, ql_client_secret);
        if (!token) {
            console.log("[JD Cookie Sync] ❌ 获取青龙 Token 失败，请检查配置");
            return request;
        }

        // 同步到青龙
        const result = await syncCookieToQL(ql_url, token, pt_pin, jd_cookie);

        if (result.ok && result.changed) {
            context.store.set(cacheKey, jd_cookie);
            context.store.set(timestampKey, String(now));
            console.log(`[JD Cookie Sync] ✅ ${result.title}: ${result.subtitle}`);
            // Reqable 通知
            context.notify(result.title, result.subtitle);
        } else if (result.ok) {
            context.store.set(timestampKey, String(now));
            console.log(`[JD Cookie Sync] ✅ Cookie 已是最新，无需更新`);
        } else {
            console.log(`[JD Cookie Sync] ❌ 同步失败: ${result.message}`);
        }

    } catch (e) {
        console.log(`[JD Cookie Sync] ❌ 异常: ${e.message || e}`);
    }

    return request;
}

// ========================== 工具函数 ==========================

function getCookieValue(cookieStr, key) {
    const match = cookieStr.match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
    return match ? match[1] : null;
}

function safeDecodeURIComponent(s) {
    try { return decodeURIComponent(s); } catch (_) { return s; }
}

async function getQLToken(url, clientId, clientSecret) {
    try {
        const resp = await fetch(
            `${url}/open/auth/token?client_id=${clientId}&client_secret=${clientSecret}`
        );
        const body = await resp.json();
        if (body.code === 200 && body.data && body.data.token) {
            return body.data.token;
        }
        console.log(`[JD Cookie Sync] Auth Failed: ${JSON.stringify(body)}`);
        return null;
    } catch (e) {
        console.log(`[JD Cookie Sync] Auth Error: ${e.message || e}`);
        return null;
    }
}

async function syncCookieToQL(url, token, pt_pin, newValue) {
    const headers = {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
    };

    try {
        const resp = await fetch(
            `${url}/open/envs?searchValue=${encodeURIComponent(pt_pin)}`,
            { headers }
        );
        const body = await resp.json();

        if (body.code !== 200 || !Array.isArray(body.data)) {
            return { ok: false, message: "青龙接口返回异常" };
        }

        const targetEnv = body.data.find(e =>
            e && e.name === "JD_COOKIE" &&
            typeof e.value === "string" &&
            e.value.includes(`pt_pin=${pt_pin}`)
        );

        let changed = false;

        if (targetEnv) {
            // 存在：检查是否需要启用或更新
            if (targetEnv.status !== 0) {
                await fetch(`${url}/open/envs/enable`, {
                    method: "PUT",
                    headers,
                    body: JSON.stringify([targetEnv.id])
                });
                changed = true;
            }

            if (targetEnv.value !== newValue) {
                await fetch(`${url}/open/envs`, {
                    method: "PUT",
                    headers,
                    body: JSON.stringify({ id: targetEnv.id, name: "JD_COOKIE", value: newValue, remarks: targetEnv.remarks })
                });
                changed = true;
                return { ok: true, changed: true, title: "✅ Cookie 已更新", subtitle: pt_pin };
            }

            return changed
                ? { ok: true, changed: true, title: "✅ Cookie 已启用", subtitle: pt_pin }
                : { ok: true, changed: false };
        }

        // 不存在：创建
        await fetch(`${url}/open/envs`, {
            method: "POST",
            headers,
            body: JSON.stringify([{ name: "JD_COOKIE", value: newValue, remarks: `Android Reqable - ${pt_pin}` }])
        });
        return { ok: true, changed: true, title: "✅ Cookie 已创建", subtitle: pt_pin };

    } catch (e) {
        return { ok: false, message: e.message || String(e) };
    }
}
