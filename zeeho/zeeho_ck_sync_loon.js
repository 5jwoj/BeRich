/*
 * 极核 ZEEHO App CK 同步至青龙面板 - Loon 版
 *
 * 行为：
 * 1) 拦截极核 App 签到请求，提取 Authorization / Cookie / user_id
 * 2) 调用青龙 Open API，将上述字段写入环境变量（自动判断新建/更新）
 * 3) 同一 user_id 5 秒内防抖，避免重复同步
 * 4) 仅在环境变量发生实际变化时发出 Loon 通知
 *
 * Version: v1.0.0
 * Author: z.W.
 *
 * @config
 * BoxJS 配置项（订阅 BeRich_Loon.boxjs.json）：
 * - zeeho_ql_url          : 青龙面板地址（例如 https://ql.example.com）
 * - zeeho_ql_client_id    : 青龙 Open API Client ID
 * - zeeho_ql_client_secret: 青龙 Open API Client Secret
 */

// ↓↓↓↓↓↓ 如果不使用 BoxJS，直接修改下面引号内容 ↓↓↓↓↓↓
const MANUAL_CONFIG = {
    url: "",      // 例如 "https://ql.example.com"
    id: "",       // Client ID
    secret: ""    // Client Secret
};
// ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

(async () => {
    try {
        // 1. 读取配置（优先 MANUAL_CONFIG，其次 BoxJS）
        let ql_url           = MANUAL_CONFIG.url    || getBoxJS("zeeho_ql_url");
        const ql_client_id   = MANUAL_CONFIG.id     || getBoxJS("zeeho_ql_client_id");
        const ql_client_secret = MANUAL_CONFIG.secret || getBoxJS("zeeho_ql_client_secret");

        if (!ql_url || !ql_client_id || !ql_client_secret) {
            $notification.post(
                "⚠️ 极核 CK 同步配置缺失",
                "请在 BoxJS 订阅「BeRich Loon 合集」填写青龙信息",
                "zeeho_ql_url / zeeho_ql_client_id / zeeho_ql_client_secret"
            );
            $done({});
            return;
        }

        // 自动修正 URL 格式
        if (!ql_url.startsWith("http://") && !ql_url.startsWith("https://")) {
            ql_url = "http://" + ql_url;
        }
        if (ql_url.endsWith("/")) ql_url = ql_url.slice(0, -1);

        // 2. 提取请求头
        const headers       = $request.headers || {};
        const getH          = (k) => { for (const key of Object.keys(headers)) { if (key.toLowerCase() === k.toLowerCase()) return headers[key]; } return ""; };
        const authorization = getH("Authorization");
        const cookie        = getH("Cookie");
        const userId        = getH("user_id");
        const userAgent     = getH("User-Agent");

        if (!authorization || !cookie || !userId) {
            const missing = [!authorization && "Authorization", !cookie && "Cookie", !userId && "user_id"].filter(Boolean).join(", ");
            console.log(`[Zeeho CK] 字段缺失: ${missing}，跳过`);
            $done({});
            return;
        }

        console.log(`[Zeeho CK] 捕获成功 user_id=${userId}`);

        // 3. 防抖：同一 user_id 5 秒内不重复同步
        const DEBOUNCE_MS = 5000;
        const debounceKey = `ZEEHO_LAST_SYNC_${userId}`;
        const lastTs = parseInt($persistentStore.read(debounceKey) || "0");
        const nowTs  = Date.now();
        if (nowTs - lastTs < DEBOUNCE_MS) {
            console.log(`[Zeeho CK] 防抖跳过（${nowTs - lastTs}ms 前已同步）`);
            $done({});
            return;
        }
        $persistentStore.write(String(nowTs), debounceKey);

        // 4. 获取青龙 Token（失败重试 1 次）
        let token = await getQLToken(ql_url, ql_client_id, ql_client_secret);
        if (!token) {
            await delay(1000);
            token = await getQLToken(ql_url, ql_client_id, ql_client_secret);
        }
        if (!token) {
            const lastOk = parseInt($persistentStore.read("ZEEHO_SYNC_LAST_OK") || "0");
            if (nowTs - lastOk < 60000) {
                console.log("[Zeeho CK] Token 失败但近 60s 有成功记录，静默跳过");
            } else {
                $notification.post("❌ 极核 CK 同步失败", "获取青龙 Token 失败", "请检查青龙地址与 Client ID/Secret 配置");
            }
            $done({});
            return;
        }

        // 5. 同步环境变量
        const envMap = {
            "ZEEHO_AUTHORIZATION": authorization,
            "ZEEHO_COOKIE":        cookie,
            "ZEEHO_USER_ID":       userId,
        };
        if (userAgent) envMap["ZEEHO_USER_AGENT"] = userAgent;

        const results = await syncEnvs(ql_url, token, envMap);
        $persistentStore.write(String(Date.now()), "ZEEHO_SYNC_LAST_OK");

        const changed  = results.filter(r => r.changed);
        const failed   = results.filter(r => !r.ok);

        if (failed.length > 0) {
            console.log(`[Zeeho CK] 部分失败: ${failed.map(r => r.name).join(", ")}`);
        }

        if (changed.length > 0) {
            const lines = results.map(r => `${r.ok ? (r.changed ? "🔄" : "✅") : "❌"} ${r.name}`).join("\n");
            $notification.post(
                "✅ 极核 CK 已同步",
                `更新 ${changed.length} 个变量 · user_id: ${userId}`,
                lines
            );
            console.log(`[Zeeho CK] 同步完成，${changed.length} 个变量已更新`);
        } else {
            console.log(`[Zeeho CK] 同步完成（值无变化，静默跳过通知）`);
        }

    } catch (e) {
        console.log(`[Zeeho CK] 脚本异常: ${e && e.message ? e.message : e}`);
        $notification.post("❌ 极核 CK 脚本异常", e && e.message ? e.message : String(e), "请查看 Loon 日志");
    } finally {
        $done({});
    }
})();


// ========== 工具函数 ==========

function getBoxJS(key) {
    try {
        const v = $persistentStore.read(key);
        return v && v.trim() !== "" ? v.trim() : null;
    } catch (_) { return null; }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getQLToken(url, clientId, clientSecret) {
    return new Promise((resolve) => {
        $httpClient.get(
            { url: `${url}/open/auth/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
              headers: { "Content-Type": "application/json" } },
            (err, res, data) => {
                if (err) { console.log(`[Zeeho CK] Token 请求失败: ${err}`); resolve(null); return; }
                try {
                    const j = JSON.parse(data);
                    (j.code === 200 && j.data && j.data.token) ? resolve(j.data.token) : (console.log(`[Zeeho CK] Token 响应异常: ${data.slice(0, 200)}`), resolve(null));
                } catch (e) { console.log(`[Zeeho CK] Token 解析失败: ${e.message}`); resolve(null); }
            }
        );
    });
}

function getQLEnvs(url, token, searchValue) {
    return new Promise((resolve, reject) => {
        $httpClient.get(
            { url: `${url}/open/envs?searchValue=${encodeURIComponent(searchValue)}&t=${Date.now()}`,
              headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" } },
            (err, res, data) => {
                if (err) { reject(new Error(`查询环境变量失败: ${err}`)); return; }
                try {
                    const j = JSON.parse(data);
                    // 兼容青龙旧版(data=[]) 和新版(data={list:[]})
                    const list = Array.isArray(j.data) ? j.data : (j.data && Array.isArray(j.data.list) ? j.data.list : []);
                    resolve(list);
                } catch (e) { reject(new Error(`解析环境变量失败: ${e.message}`)); }
            }
        );
    });
}

async function syncEnvs(url, token, envMap) {
    // 一次性拉取所有 ZEEHO_ 开头的变量，建立 name→env 映射
    const existing = await getQLEnvs(url, token, "ZEEHO_");
    const existMap = {};
    for (const e of existing) existMap[e.name] = e;

    const results = [];
    for (const [name, value] of Object.entries(envMap)) {
        try {
            const exist = existMap[name];
            if (exist) {
                const needUpdate = exist.value !== value;
                const needEnable = exist.status !== 0;
                if (needUpdate || needEnable) {
                    if (needEnable) await qlEnableEnv(url, token, exist.id);
                    if (needUpdate) await qlUpdateEnv(url, token, exist.id, name, value, exist.remarks);
                    results.push({ name, ok: true, changed: true });
                    console.log(`[Zeeho CK] 更新 ${name}${needEnable ? " (已启用)" : ""}`);
                } else {
                    results.push({ name, ok: true, changed: false });
                    console.log(`[Zeeho CK] ${name} 无变化`);
                }
            } else {
                await qlCreateEnv(url, token, name, value);
                results.push({ name, ok: true, changed: true });
                console.log(`[Zeeho CK] 创建 ${name}`);
            }
        } catch (e) {
            console.log(`[Zeeho CK] 同步 ${name} 异常: ${e.message}`);
            results.push({ name, ok: false, changed: false });
        }
    }
    return results;
}

function qlCreateEnv(url, token, name, value) {
    return new Promise((resolve) => {
        $httpClient.post(
            { url: `${url}/open/envs`, headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify([{ name, value, remarks: "由 Loon 极核插件自动创建" }]) },
            (err) => { if (err) console.log(`创建 ${name} 失败: ${err}`); resolve(); }
        );
    });
}

function qlUpdateEnv(url, token, id, name, value, remarks) {
    return new Promise((resolve) => {
        $httpClient.put(
            { url: `${url}/open/envs`, headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ id, name, value, remarks: remarks || "由 Loon 极核插件自动更新" }) },
            (err) => { if (err) console.log(`更新 ${name} 失败: ${err}`); resolve(); }
        );
    });
}

function qlEnableEnv(url, token, id) {
    return new Promise((resolve) => {
        $httpClient.put(
            { url: `${url}/open/envs/enable`, headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify([id]) },
            (err) => { if (err) console.log(`启用变量失败: ${err}`); resolve(); }
        );
    });
}
