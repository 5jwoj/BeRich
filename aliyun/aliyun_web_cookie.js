/*
阿里云社区 Cookie 抓取模块 - Loon 专用版
@Author: z.W.
@Date: 2026-08-22
@Version: 2.2.1
@Description: 
  仅负责抓取阿里云社区Cookie，并同步至青龙面板
  不执行任何任务脚本
  Loon 专用：支持 BoxJS 配置或脚本内硬编码配置
  支持用户名去重，避免重复创建青龙变量

获取 Cookie 方式: 阿里云 APP - 首页 - 积分商城

配置说明:
  方式一 (推荐)：BoxJS 订阅 BeRich_Loon.boxjs.json，在应用「阿里云社区任务 (Loon)」中填写
  方式二：直接修改脚本下方 MANUAL_CONFIG 中的值

  BoxJS / 配置项:
  - ql_url: 青龙面板地址 (如: http://192.168.1.100:5700)
  - ql_client_id: 青龙Client ID
  - ql_client_secret: 青龙Client Secret
  - ql_data_name: 青龙变量名 (默认: aliyunWeb_data)

更新日志:
  v2.2.1 - 修复本地去重：三重匹配（userId / token内cna / token完全相同）
           写入前清理历史重复条目，防止旧版残留数据导致假多账号
  v2.2.0 - 【关键修复】青龙存储格式改为纯 Cookie 字符串（多账号用@分隔）
           原 JSON 数组格式导致主脚本按@分割出假多账号，每段都不是合法 Cookie → 提示失效
           本地 Loon 持久化仍保留 JSON 数组（供去重用）
  v2.1.1 - 修复兜底逻辑：精确匹配失败时，只要有同名变量（>=1）就更新第一个，不再新建
           修复 userId 写死 nickname 导致去重语义丢失：改用 Cookie 中 cna 字段作唯一标识
  v2.0.0 - 重写为 Loon 专用版，参照 JD_Cookie_Sync_Loon.js 的 BoxJS 读取模式
           移除 Surge $argument 依赖，直接用 $persistentStore 读 BoxJS 配置
  v1.0.4 - 修复 Loon 下 $httpClient 必须传对象参数导致青龙同步静默失败的问题
  v1.0.3 - 修复 $prefs/$persistentStore 双存储读取，避免 Loon+BoxJS 环境下配置漏读
  v1.0.2 - 添加BoxJS支持，多平台兼容层
  v1.0.1 - 添加用户名去重逻辑，避免重复创建青龙变量
  v1.0.0 - 初始版本
*/

const scriptName = '阿里云Web Cookie';
const version = 'v2.2.1';
const ckName = 'aliyunWeb_data';

// ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
// 如果不使用 BoxJS，请直接修改下面的引号内容
const MANUAL_CONFIG = {
    ql_url: "",           // 必填，例如 "http://192.168.1.1:5700"
    ql_client_id: "",     // 必填，Client ID
    ql_client_secret: "", // 必填，Client Secret
    ql_data_name: ""      // 选填，默认 aliyunWeb_data
};
// ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

/**
 * 从 BoxJS 持久化存储中读取指定 key 的值
 * Loon 中 BoxJS 通过 $persistentStore 存储，不隔离脚本
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
 * 写入本地持久化存储
 */
function writeStore(val, key) {
    try {
        $persistentStore.write(val, key);
    } catch (_) {}
}

/**
 * 发送通知
 */
function notify(title, subtitle, body) {
    try {
        $notification.post(title, subtitle, body);
    } catch (_) {
        console.log(`${title} | ${subtitle} | ${body}`);
    }
}

// 读取青龙配置 - 优先从 MANUAL_CONFIG 获取，然后从 BoxJS 获取
const qlUrl = MANUAL_CONFIG.ql_url || getBoxJSSetting('ql_url') || '';
const qlClientId = MANUAL_CONFIG.ql_client_id || getBoxJSSetting('ql_client_id') || '';
const qlClientSecret = MANUAL_CONFIG.ql_client_secret || getBoxJSSetting('ql_client_secret') || '';
const qlDataName = MANUAL_CONFIG.ql_data_name || getBoxJSSetting('ql_data_name') || 'aliyunWeb_data';

// 打印配置状态（脱敏）
console.log(`[${scriptName}] 配置状态: URL=${qlUrl || '❌未设置'}, ClientID=${qlClientId ? '✅已设置' : '❌未设置'}, ClientSecret=${qlClientSecret ? '✅已设置' : '❌未设置'}, DataName=${qlDataName}`);

/**
 * 发起 HTTP GET 请求 (Loon 原生 $httpClient)
 */
function httpGet(options) {
    return new Promise((resolve) => {
        const opts = typeof options === 'string' ? { url: options } : options;
        $httpClient.get(opts, (err, resp, body) => {
            resolve({ err, resp, body });
        });
    });
}

/**
 * 发起 HTTP POST 请求
 */
function httpPost(options) {
    return new Promise((resolve) => {
        const opts = typeof options === 'string' ? { url: options } : options;
        $httpClient.post(opts, (err, resp, body) => {
            resolve({ err, resp, body });
        });
    });
}

/**
 * 发起 HTTP PUT 请求
 */
function httpPut(options) {
    return new Promise((resolve) => {
        const opts = typeof options === 'string' ? { url: options } : options;
        $httpClient.put(opts, (err, resp, body) => {
            resolve({ err, resp, body });
        });
    });
}

/**
 * 获取青龙Token
 */
async function getQlToken() {
    if (!qlUrl || !qlClientId || !qlClientSecret) {
        console.log(`[${scriptName}] ⚠️ 青龙配置不完整，跳过同步`);
        console.log(`[${scriptName}]   ql_url=${qlUrl || '(空)'}`);
        console.log(`[${scriptName}]   ql_client_id=${qlClientId ? '***' : '(空)'}`);
        console.log(`[${scriptName}]   ql_client_secret=${qlClientSecret ? '***' : '(空)'}`);
        return null;
    }
    
    // 自动修正 URL 格式
    let url = qlUrl;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'http://' + url;
    }
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    
    const tokenUrl = `${url}/open/auth/token?client_id=${qlClientId}&client_secret=${qlClientSecret}`;
    console.log(`[${scriptName}] 正在获取青龙Token: ${url}/open/auth/token?client_id=***&client_secret=***`);
    
    const res = await httpGet({ url: tokenUrl });
    if (res.err) {
        console.log(`[${scriptName}] ❌ 获取青龙Token网络错误: ${res.err}`);
        return null;
    }
    try {
        const data = JSON.parse(res.body);
        if (data.code === 200 && data.data && data.data.token) {
            console.log(`[${scriptName}] ✅ 获取青龙Token成功`);
            return data.data.token;
        } else {
            console.log(`[${scriptName}] ❌ 获取青龙Token失败: ${data.message || JSON.stringify(data)}`);
            return null;
        }
    } catch (e) {
        console.log(`[${scriptName}] ❌ 解析青龙Token响应失败: ${e}`);
        console.log(`[${scriptName}]   响应体: ${res.body}`);
        return null;
    }
}

/**
 * 查询青龙中的现有变量
 */
async function queryQlEnv(token) {
    let url = qlUrl;
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'http://' + url;
    if (url.endsWith('/')) url = url.slice(0, -1);
    
    const queryUrl = `${url}/open/envs?searchValue=${qlDataName}`;
    
    const options = {
        url: queryUrl,
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        }
    };
    
    const res = await httpGet(options);
    if (res.err) {
        console.log(`[${scriptName}] ❌ 查询青龙变量失败: ${res.err}`);
        return [];
    }
    try {
        const data = JSON.parse(res.body);
        if (data.code === 200 && data.data) {
            // 兼容新版青龙 API (data 可为数组或 {list, total})
            const envList = Array.isArray(data.data) ? data.data : (data.data.list || []);
            console.log(`[${scriptName}] ✅ 查询青龙变量成功，数量: ${envList.length}`);
            return envList;
        } else {
            console.log(`[${scriptName}] ⚠️ 查询青龙变量返回异常: ${JSON.stringify(data)}`);
            return [];
        }
    } catch (e) {
        console.log(`[${scriptName}] ❌ 解析青龙查询响应失败: ${e}`);
        return [];
    }
}

/**
 * 更新青龙变量
 */
async function updateQlEnv(token, envId, value) {
    let url = qlUrl;
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'http://' + url;
    if (url.endsWith('/')) url = url.slice(0, -1);
    
    const body = JSON.stringify({
        id: envId,
        name: qlDataName,
        value: value,
        remarks: '阿里云社区Cookie - Loon自动同步 ' + new Date().toLocaleString()
    });
    
    const options = {
        url: `${url}/open/envs`,
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json;charset=UTF-8'
        },
        body: body
    };
    
    const res = await httpPut(options);
    if (res.err) {
        console.log(`[${scriptName}] ❌ 更新青龙变量失败: ${res.err}`);
        return false;
    }
    try {
        const data = JSON.parse(res.body);
        if (data.code === 200) {
            console.log(`[${scriptName}] ✅ 更新青龙变量成功，ID: ${envId}`);
            return true;
        } else {
            console.log(`[${scriptName}] ❌ 更新青龙变量失败: ${data.message || JSON.stringify(data)}`);
            return false;
        }
    } catch (e) {
        console.log(`[${scriptName}] ❌ 解析青龙更新响应失败: ${e}`);
        return false;
    }
}

/**
 * 新增青龙变量
 */
async function addQlEnv(token, value) {
    let url = qlUrl;
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'http://' + url;
    if (url.endsWith('/')) url = url.slice(0, -1);
    
    const body = JSON.stringify([{
        name: qlDataName,
        value: value,
        remarks: '阿里云社区Cookie - Loon自动同步 ' + new Date().toLocaleString()
    }]);
    
    const options = {
        url: `${url}/open/envs`,
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json;charset=UTF-8'
        },
        body: body
    };
    
    const res = await httpPost(options);
    if (res.err) {
        console.log(`[${scriptName}] ❌ 新增青龙变量失败: ${res.err}`);
        return false;
    }
    try {
        const data = JSON.parse(res.body);
        if (data.code === 200) {
            console.log(`[${scriptName}] ✅ 新增青龙变量成功`);
            return true;
        } else {
            console.log(`[${scriptName}] ❌ 新增青龙变量失败: ${data.message || JSON.stringify(data)}`);
            return false;
        }
    } catch (e) {
        console.log(`[${scriptName}] ❌ 解析青龙新增响应失败: ${e}`);
        return false;
    }
}

/**
 * 同步变量到青龙 - 智能去重（v2.1.0 修复版）
 * 修复：① userName/userId 为「未知用户」时去重失效
 *       ② 青龙存储格式（数组/对象/字符串）不一致导致匹配失败
 *       ③ 兜底：同名变量已存在则直接更新，杜绝重复创建
 */
async function syncToQinglong(token, cookieData, dataStr) {
    if (!token) {
        console.log(`[${scriptName}] ⚠️ Token为空，无法同步`);
        return false;
    }
    
    // 查询青龙中现有的变量
    const existingEnvs = await queryQlEnv(token);
    
    // 过滤出所有同名变量（name === qlDataName）
    const sameNameEnvs = existingEnvs.filter(env => env.name === qlDataName);
    console.log(`[${scriptName}] 🔍 同名变量数量: ${sameNameEnvs.length}`);
    
    // 用户名为「未知用户」时：只要同名变量存在就直接更新第一个，避免无法匹配而重复创建
    const isUnknownUser = !cookieData.userId || cookieData.userId === '未知用户' ||
                          !cookieData.userName || cookieData.userName === '未知用户';
    
    if (isUnknownUser && sameNameEnvs.length > 0) {
        const target = sameNameEnvs[0];
        console.log(`[${scriptName}] ⚠️ 用户信息未知，兜底更新同名变量，ID: ${target.id}`);
        return await updateQlEnv(token, target.id, dataStr);
    }
    
    // 精确匹配：尝试通过 userId / userName 找到对应的青龙变量
    let matchedEnv = null;
    
    for (const env of sameNameEnvs) {
        if (!env.value) continue;
        try {
            let parsedData = null;
            const trimmed = env.value.trim();
            if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                parsedData = JSON.parse(trimmed);
            }
            
            if (parsedData) {
                const list = Array.isArray(parsedData) ? parsedData : [parsedData];
                for (const item of list) {
                    if (item.userId === cookieData.userId || item.userName === cookieData.userName) {
                        matchedEnv = env;
                        console.log(`[${scriptName}] 📝 找到匹配用户: ${cookieData.userName}, 变量ID: ${env.id}`);
                        break;
                    }
                }
            } else {
                // 纯字符串兜底匹配
                if (env.value.includes(cookieData.userName) || env.value.includes(cookieData.userId)) {
                    matchedEnv = env;
                    console.log(`[${scriptName}] 📝 找到匹配用户(字符串匹配): ${cookieData.userName}, 变量ID: ${env.id}`);
                }
            }
        } catch (e) {
            if (env.value.includes(cookieData.userName) || env.value.includes(cookieData.userId)) {
                matchedEnv = env;
                console.log(`[${scriptName}] 📝 找到匹配用户(异常兜底): ${cookieData.userName}, 变量ID: ${env.id}`);
            }
        }
        if (matchedEnv) break;
    }
    
    if (matchedEnv) {
        console.log(`[${scriptName}] 📝 更新现有变量，ID: ${matchedEnv.id}`);
        return await updateQlEnv(token, matchedEnv.id, dataStr);
    }
    
    // 最终兜底：精确匹配失败但同名变量已存在（≥1个），直接更新第一个，杜绝重复创建
    // 修复 v2.1.1: 原逻辑仅在 length===1 时兜底，当存在≥2个同名变量时会继续走到新建逻辑
    if (sameNameEnvs.length >= 1) {
        const target = sameNameEnvs[0];
        console.log(`[${scriptName}] ⚠️ 未精确匹配到用户，兜底更新第一个同名变量（共${sameNameEnvs.length}个），ID: ${target.id}`);
        return await updateQlEnv(token, target.id, dataStr);
    }
    
    // 确实没有同名变量，才新增
    console.log(`[${scriptName}] 📝 未找到同名变量，新增变量`);
    return await addQlEnv(token, dataStr);
}

/**
 * 主函数 - 获取Cookie
 */
(async () => {
    console.log(`🚀 ${scriptName} ${version} 开始执行 (Loon)`);
    
    try {
        if (typeof $request === 'undefined' || !$request) {
            console.log(`[${scriptName}] ⚠️ 未检测到 $request，非抓包触发`);
            $done({});
            return;
        }
        
        // 获取请求头中的Cookie
        const headers = $request.headers;
        const cookie = headers['Cookie'] || headers['cookie'] || '';
        
        if (!cookie) {
            console.log(`[${scriptName}] ❌ 未获取到Cookie`);
            notify(scriptName, '❌ 获取Cookie失败', '未在请求头中找到Cookie');
            $done({});
            return;
        }
        
        console.log(`[${scriptName}] ✅ 获取到Cookie长度: ${cookie.length}`);
        
        // 获取响应体中的用户信息
        let userInfo = null;
        if (typeof $response !== 'undefined' && $response && $response.body) {
            try {
                const bodyData = JSON.parse($response.body);
                if (bodyData && bodyData.data) {
                    userInfo = {
                        nickname: bodyData.data.nickname || '',
                        avatar: bodyData.data.avatar || ''
                    };
                    console.log(`[${scriptName}] ✅ 获取用户信息: ${userInfo.nickname}`);
                }
            } catch (e) {
                console.log(`[${scriptName}] ⚠️ 解析响应体失败: ${e}`);
            }
        }
        
        // 从 Cookie 中提取稳定的唯一标识 cna（阿里云设备ID，不会随昵称变化）
        // 格式示例: cna=XXXXXXXXXXXXXXXX; 若不存在则回退使用 nickname
        let stableUserId = '未知用户';
        const cnaMatch = cookie.match(/(?:^|;\s*)cna=([^;]+)/);
        if (cnaMatch && cnaMatch[1]) {
            stableUserId = cnaMatch[1].trim();
        } else if (userInfo && userInfo.nickname) {
            stableUserId = userInfo.nickname;
        }
        
        // 构建Cookie数据
        const cookieData = {
            userId: stableUserId,                               // 唯一标识（cna 或 nickname 兜底）
            userName: (userInfo && userInfo.nickname) || '未知用户', // 展示用昵称
            avatar: (userInfo && userInfo.avatar) || '',
            token: cookie
        };
        
        // 获取现有Cookie数据（本地）
        let existingData = [];
        try {
            const stored = getBoxJSSetting(ckName);
            if (stored) {
                existingData = JSON.parse(stored);
                if (!Array.isArray(existingData)) {
                    existingData = [];
                }
            }
        } catch (e) {
            existingData = [];
        }
        
        // 检查是否已存在该用户（本地），三重匹配防止历史格式不同导致重复追加：
        // 1) 精确匹配 userId（cna 或 nickname）
        // 2) 通过已存 token 内的 cna 值匹配（兼容旧版用 nickname 存 userId 的情况）
        // 3) token 字符串完全相同（完全重复的抓包）
        let existingIndex = existingData.findIndex(item => item.userId === cookieData.userId);
        
        if (existingIndex < 0 && stableUserId !== '未知用户') {
            // 二次匹配：从已存条目的 token 里提取 cna，看是否和本次一致
            existingIndex = existingData.findIndex(item => {
                if (!item.token) return false;
                const m = item.token.match(/(?:^|;\s*)cna=([^;]+)/);
                return m && m[1].trim() === stableUserId;
            });
            if (existingIndex >= 0) {
                console.log(`[${scriptName}] 🔍 通过 cna 二次匹配到旧条目，合并更新（防止重复）`);
            }
        }
        
        if (existingIndex < 0) {
            // 三次匹配：token 完全相同（重复抓包）
            existingIndex = existingData.findIndex(item => item.token === cookieData.token);
            if (existingIndex >= 0) {
                console.log(`[${scriptName}] 🔍 token 完全相同，跳过重复追加`);
            }
        }
        
        if (existingIndex >= 0) {
            existingData[existingIndex] = cookieData;
            console.log(`[${scriptName}] ✅ 更新本地用户Cookie: ${cookieData.userName}`);
        } else {
            existingData.push(cookieData);
            console.log(`[${scriptName}] ✅ 新增本地用户Cookie: ${cookieData.userName}`);
        }
        
        // 去重清理：移除 cna 相同但 userId 不同的历史残留条目（只保留最新的那条）
        const seenCna = new Set();
        const cleanedData = [];
        for (const item of existingData) {
            const m = item.token && item.token.match(/(?:^|;\s*)cna=([^;]+)/);
            const cnaKey = m ? m[1].trim() : item.userId;
            if (!seenCna.has(cnaKey)) {
                seenCna.add(cnaKey);
                cleanedData.push(item);
            } else {
                console.log(`[${scriptName}] 🧹 清理重复条目: userId=${item.userId}`);
            }
        }
        const deduped = cleanedData;
        if (deduped.length < existingData.length) {
            console.log(`[${scriptName}] 🧹 去重完成: ${existingData.length} → ${deduped.length} 条`);
        }
        
        // 保存到本地（JSON 格式，含用户信息，供 Loon 去重使用）
        const dataStr = JSON.stringify(deduped);
        writeStore(dataStr, ckName);
        console.log(`[${scriptName}] ✅ Cookie已保存到本地，账号数: ${deduped.length}`);
        
        // 用清理后的数据替换 existingData，供后续同步
        existingData = deduped;
        
        // 构建青龙所需的纯 Cookie 字符串（多账号用 @ 分隔）
        // 主脚本 aliyun_web.js 按 @ 分割来识别多账号，必须存纯 Cookie 字符串，不能存 JSON
        const qlCookieStr = existingData.map(item => item.token).join('@');
        console.log(`[${scriptName}] 📋 青龙同步格式: 纯Cookie字符串，账号数: ${existingData.length}`);
        
        // 同步到青龙
        const token = await getQlToken();
        
        if (token) {
            const syncResult = await syncToQinglong(token, cookieData, qlCookieStr);
            
            if (syncResult) {
                notify(scriptName + ' ' + version, '🎉 Cookie同步成功', 
                    `用户: ${cookieData.userName}\n账号数: ${existingData.length}\n已同步至青龙变量: ${qlDataName}`);
            } else {
                notify(scriptName + ' ' + version, '⚠️ Cookie已保存', 
                    `用户: ${cookieData.userName}\n账号数: ${existingData.length}\n本地保存成功，青龙同步失败`);
            }
        } else {
            // 配置未填写时给出更明确的提示
            if (!qlUrl || !qlClientId || !qlClientSecret) {
                notify(scriptName + ' ' + version, '⚠️ Cookie已保存，青龙未配置', 
                    `用户: ${cookieData.userName}\n请在BoxJS订阅「BeRich Loon合集」中配置青龙面板信息\n或修改脚本内 MANUAL_CONFIG`);
            } else {
                notify(scriptName + ' ' + version, '⚠️ Cookie已保存，青龙连接失败', 
                    `用户: ${cookieData.userName}\n账号数: ${existingData.length}\n请检查青龙面板地址和网络`);
            }
        }
        
    } catch (e) {
        console.log(`[${scriptName}] ❌ 脚本执行异常: ${e && e.message ? e.message : e}`);
        notify(scriptName, '❌ 脚本执行异常', String(e && e.message ? e.message : e));
    } finally {
        $done({});
    }
})();
