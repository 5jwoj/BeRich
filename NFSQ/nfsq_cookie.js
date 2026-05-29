/**
 * 农夫山泉 - Cookie抓取脚本
 * 
 * 使用说明:
 * 1. 打开 Loon 并启用此插件
 * 2. 打开微信中的农夫山泉小程序
 * 3. 随便点击一下，触发请求
 * 4. 看到通知提示"Cookie获取成功"即可
 * 5. 之后可以关闭插件的重写功能，保留定时任务即可
 */

const $ = new Env("农夫山泉Cookie");
const KEY_DATA = "nfsq_data";

!(async () => {
    try {
        const headers = $request.headers;

        // 获取关键认证信息（兼容大小写）
        const apitoken = headers["apitoken"] || headers["Apitoken"] || headers["APITOKEN"] || "";
        const uniqueIdentity = headers["unique_identity"] || headers["Unique_identity"] || headers["UNIQUE_IDENTITY"] ||
            headers["unique-identity"] || headers["Unique-Identity"] || "";

        if (!apitoken) {
            console.log("未找到 apitoken");
            $done({});
            return;
        }

        if (!uniqueIdentity) {
            console.log("未找到 unique_identity");
            $done({});
            return;
        }

        // 组合成存储格式: apitoken&unique_identity
        const newData = `${apitoken}&${uniqueIdentity}`;
        const oldData = $.getdata(KEY_DATA) || "";

        // 检查是否有变化
        if (oldData === newData) {
            console.log("Cookie 未变化，无需更新");
            $done({});
            return;
        }

        // 多账号处理：检查是否已存在该账号
        let accounts = [];
        if (oldData) {
            accounts = oldData.split("\n").filter(x => x.trim());
        }

        // 检查当前账号是否已存在（通过 unique_identity 判断）
        let found = false;
        for (let i = 0; i < accounts.length; i++) {
            const parts = accounts[i].split("&");
            if (parts.length >= 2 && parts[1] === uniqueIdentity) {
                // 更新已存在账号
                accounts[i] = newData;
                found = true;
                $.msg("农夫山泉", `✅ 账号 ${i + 1} Cookie已更新`, "");
                break;
            }
        }

        if (!found) {
            // 新账号
            accounts.push(newData);
            $.msg("农夫山泉", `✅ 新账号 Cookie获取成功`, `当前共 ${accounts.length} 个账号`);
        }

        // 保存数据
        const finalData = accounts.join("\n");
        $.setdata(finalData, KEY_DATA);

        console.log(`Cookie 保存成功，当前共 ${accounts.length} 个账号`);

    } catch (e) {
        console.log("抓取异常: " + e.message);
    }

    $done({});
})();


// ============= Loon/Surge/QX 兼容环境 =============
function Env(name) {
    const isLoon = typeof $loon !== "undefined";
    const isSurge = typeof $httpClient !== "undefined" && !isLoon;
    const isQX = typeof $task !== "undefined";

    const getdata = (key) => {
        if (isLoon || isSurge) return $persistentStore.read(key);
        if (isQX) return $prefs.valueForKey(key);
        return null;
    };

    const setdata = (val, key) => {
        if (isLoon || isSurge) return $persistentStore.write(val, key);
        if (isQX) return $prefs.setValueForKey(val, key);
        return false;
    };

    const msg = (title, subtitle, body) => {
        if (isLoon) $notification.post(title, subtitle, body);
        else if (isSurge) $notification.post(title, subtitle, body);
        else if (isQX) $notify(title, subtitle, body);
    };

    return {
        name,
        getdata,
        setdata,
        msg,
        log: console.log
    };
}
