// [rule: ^星芽ck$|^星芽CK$]
// [version: 2.7.0]
// [admin: false]
// [priority: 1000]
// [disable: false]

// ─── 青龙面板配置 ────────────────────────────────────────────────────────────────
// [param: {"required": false, "key": "xingyue_ck.ql_host", "bool": false, "placeholder": "http://localhost:5700", "name": "青龙地址", "desc": "青龙面板地址"}]
// [param: {"required": false, "key": "xingyue_ck.ql_client_id", "bool": false, "placeholder": "", "name": "青龙ClientID", "desc": "青龙OpenAPI ClientID"}]
// [param: {"required": false, "key": "xingyue_ck.ql_client_secret", "bool": false, "placeholder": "", "name": "青龙ClientSecret", "desc": "青龙OpenAPI ClientSecret"}]
// [param: {"required": false, "key": "xingyue_ck.ql_env_name", "bool": false, "placeholder": "S_XYDJ", "name": "青龙变量名", "desc": "存储星芽Cookie的青龙环境变量名称，默认 S_XYDJ"}]

/**
 * 配置说明:
 * // [xingyue_ck.ql_host: http://localhost:5700]
 * // [xingyue_ck.ql_client_id: xxxxxxxx]
 * // [xingyue_ck.ql_client_secret: xxxxxxxx]
 * // [xingyue_ck.ql_env_name: S_XYDJ]
 *
 * 触发关键词：星芽ck / 星芽CK
 * 管理员批量检测请使用独立插件：xingyue_ck_check.js（关键词：短剧ck检测）
 */

// ─────────────────────────────────────────────────────────────────────────────
// 公共工具：带重试的 HTTP 请求
// ─────────────────────────────────────────────────────────────────────────────
var req = async function(opts, retries) {
    if (retries === undefined) retries = 3;
    for (var i = 0; i <= retries; i++) {
        try {
            return await new Promise(function(resolve, reject) {
                if (!opts.timeout) opts.timeout = 60000;
                opts.proxy   = "";
                opts.proxies = { "http": null, "https": null };
                request(opts, function(err, resp, header, body) {
                    if (err) return reject(err);
                    if (typeof body === "string") {
                        try { body = JSON.parse(body); } catch (e) {}
                    }
                    resolve({ data: body, status: resp ? resp.statusCode : 200, headers: header });
                });
            });
        } catch (err) {
            if (i < retries) {
                console.log("Request retry " + (i + 1) + ": " + (err.message || err));
                sleep(1000);
            } else {
                throw err;
            }
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 读取用户手机号列表（只读）
// 兼容: 标准JSON 和 Python单引号数组
// ─────────────────────────────────────────────────────────────────────────────
function loadPhones(userId) {
    var raw = bucketGet("s_xydj_user", userId);
    if (!raw) return [];
    try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.map(function(s) { return String(s).trim(); }).filter(function(s) { return s.length > 0; });
        }
    } catch (e) {}
    try {
        var jsonStr = raw.replace(/'/g, '"').trim();
        var parsed2 = JSON.parse(jsonStr);
        if (Array.isArray(parsed2)) {
            var phones = parsed2.map(function(s) { return String(s).trim(); }).filter(function(s) { return s.length > 0; });
            console.log("解析到 " + phones.length + " 个手机号");
            return phones;
        }
    } catch (e) {
        console.error("解析手机号失败: " + e + " 原始值: " + raw);
    }
    return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// 获取青龙 Token
// ─────────────────────────────────────────────────────────────────────────────
async function getQlToken(qlHost, qlClientId, qlClientSecret) {
    var tokenRes = await req({
        url:      qlHost + "/open/auth/token?client_id=" + qlClientId + "&client_secret=" + qlClientSecret,
        method:   "get",
        dataType: "json"
    });
    if (tokenRes.data && tokenRes.data.data && tokenRes.data.data.token) {
        return tokenRes.data.data.token;
    }
    throw new Error("获取青龙Token失败: " + JSON.stringify(tokenRes.data));
}

// ─────────────────────────────────────────────────────────────────────────────
// 拉取青龙指定环境变量列表
// ─────────────────────────────────────────────────────────────────────────────
async function getQlEnvs(qlHost, token, qlEnvName) {
    var envsRes = await req({
        url:      qlHost + "/open/envs?searchValue=" + encodeURIComponent(qlEnvName),
        method:   "get",
        headers:  { "Authorization": "Bearer " + token },
        dataType: "json"
    });
    if (!envsRes.data || !envsRes.data.data) {
        throw new Error("获取青龙环境变量失败: " + JSON.stringify(envsRes.data));
    }
    var all    = envsRes.data.data;
    var result = [];
    for (var j = 0; j < all.length; j++) {
        if (all[j].name === qlEnvName && all[j].value) {
            result.push(all[j]);
        }
    }
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 从手机号在 QL 环境变量 remarks 中查找对应记录
// ─────────────────────────────────────────────────────────────────────────────
function findEnvByPhone(phone, qlEnvs) {
    for (var i = 0; i < qlEnvs.length; i++) {
        if (qlEnvs[i].remarks && qlEnvs[i].remarks.indexOf(phone) !== -1) {
            return qlEnvs[i];
        }
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 主入口：普通用户查询自己的 CK
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
    var userId         = GetUserID();
    var qlHost         = bucketGet("xingyue_ck", "ql_host")          || "http://localhost:5700";
    var qlClientId     = bucketGet("xingyue_ck", "ql_client_id")     || "";
    var qlClientSecret = bucketGet("xingyue_ck", "ql_client_secret") || "";
    var qlEnvName      = bucketGet("xingyue_ck", "ql_env_name")      || "S_XYDJ";

    // 1. 读取手机号列表
    var phones = loadPhones(userId);
    console.log("userId=" + userId + " phones=" + JSON.stringify(phones));

    if (phones.length === 0) {
        sendText("未找到您的星芽账号记录。\n请先通过登录渠道绑定账号。");
        return;
    }

    // 2. 获取青龙 Token
    var qlToken = "";
    try {
        qlToken = await getQlToken(qlHost, qlClientId, qlClientSecret);
    } catch (e) {
        sendText("连接青龙失败: " + (e.message || JSON.stringify(e)));
        return;
    }

    // 3. 拉取青龙 S_XYDJ 变量列表
    var qlEnvs = [];
    try {
        qlEnvs = await getQlEnvs(qlHost, qlToken, qlEnvName);
        console.log("青龙找到 " + qlEnvs.length + " 条 " + qlEnvName);
    } catch (e) {
        sendText("拉取青龙变量失败: " + (e.message || JSON.stringify(e)));
        return;
    }

    // 4. 逐个手机号匹配 remarks
    var results = [];
    for (var m = 0; m < phones.length; m++) {
        var phone   = phones[m];
        var matched = findEnvByPhone(phone, qlEnvs);
        results.push({ phone: phone, ck: matched ? matched.value : null });
    }

    // 5. 只有一个账号，直接发 CK
    if (results.length === 1) {
        var only = results[0];
        if (only.ck) {
            sendText(only.ck);
        } else {
            sendText("账号 " + only.phone + " 未在青龙备注中找到对应Cookie");
        }
        return;
    }

    // 6. 多账号：显示菜单
    var menuMsg = "星芽账号列表\n";
    menuMsg += "--------------------\n";
    for (var p = 0; p < results.length; p++) {
        var status = results[p].ck ? "[有效]" : "[未找到]";
        menuMsg += (p + 1) + ". " + results[p].phone + " " + status + "\n";
    }
    menuMsg += "--------------------\n";
    menuMsg += "回复编号查看对应CK\n";
    menuMsg += "回复 0 获取全部CK\n";
    menuMsg += "回复 q 退出";

    sendText(menuMsg);

    // 7. 等待用户输入
    var sel = input(60000);
    if (!sel || sel == "q" || sel == "Q") {
        sendText("已退出。");
        return;
    }

    // 回复 0：全部 CK
    if (sel == "0") {
        for (var q = 0; q < results.length; q++) {
            var r = results[q];
            if (r.ck) {
                sendText(r.ck);
            } else {
                sendText(r.phone + " 未找到Cookie");
            }
        }
        return;
    }

    // 回复编号：指定 CK
    var idx = parseInt(sel, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= results.length) {
        sendText("输入无效，操作已取消。");
        return;
    }

    var chosen = results[idx];
    if (chosen.ck) {
        sendText(chosen.ck);
    } else {
        sendText(chosen.phone + " 未在青龙备注中找到对应Cookie");
    }
}

main().catch(function(e) {
    console.error(e);
    sendText("插件执行出错: " + (e.message || JSON.stringify(e)));
});
null;
