/*
阿里云社区 Cookie 抓取模块 - Loon 专用版
@Author: z.W.
@Date: 2026-08-22
@Version: 2.0.0
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
  v2.0.0 - 重写为 Loon 专用版，参照 JD_Cookie_Sync_Loon.js 的 BoxJS 读取模式
           移除 Surge $argument 依赖，直接用 $persistentStore 读 BoxJS 配置
  v1.0.4 - 修复 Loon 下 $httpClient 必须传对象参数导致青龙同步静默失败的问题
  v1.0.3 - 修复 $prefs/$persistentStore 双存储读取，避免 Loon+BoxJS 环境下配置漏读
  v1.0.2 - 添加BoxJS支持，多平台兼容层
  v1.0.1 - 添加用户名去重逻辑，避免重复创建青龙变量
  v1.0.0 - 初始版本
*/

const scriptName = '阿里云Web Cookie';
const version = 'v2.0.0';
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
 * 同步变量到青龙 - 智能去重
 */
async function syncToQinglong(token, cookieData, dataStr) {
    if (!token) {
        console.log(`[${scriptName}] ⚠️ Token为空，无法同步`);
        return false;
    }
    
    // 查询青龙中现有的变量
    const existingEnvs = await queryQlEnv(token);
    
    // 查找是否存在相同用户名的变量
    let matchedEnv = null;
    
    for (const env of existingEnvs) {
        if (env.name === qlDataName && env.value) {
            try {
                let storedData = env.value;
                let parsedData = null;
                if (storedData.startsWith('[') || storedData.startsWith('{')) {
                    parsedData = JSON.parse(storedData);
                }
                
                if (parsedData) {
                    if (Array.isArray(parsedData)) {
                        for (const item of parsedData) {
                            if (item.userId === cookieData.userId || item.userName === cookieData.userName) {
                                matchedEnv = env;
                                console.log(`[${scriptName}] 📝 找到匹配用户: ${cookieData.userName}, 变量ID: ${env.id}`);
                                break;
                            }
                        }
                    } else if (parsedData.userId === cookieData.userId || parsedData.userName === cookieData.userName) {
                        matchedEnv = env;
                        console.log(`[${scriptName}] 📝 找到匹配用户: ${cookieData.userName}, 变量ID: ${env.id}`);
                    }
                } else {
                    if (storedData.includes(cookieData.userName) || storedData.includes(cookieData.userId)) {
                        matchedEnv = env;
                        console.log(`[${scriptName}] 📝 找到匹配用户(字符串匹配): ${cookieData.userName}, 变量ID: ${env.id}`);
                    }
                }
                
                if (matchedEnv) break;
                
            } catch (e) {
                if (env.value.includes(cookieData.userName) || env.value.includes(cookieData.userId)) {
                    matchedEnv = env;
                    console.log(`[${scriptName}] 📝 找到匹配用户(字符串匹配): ${cookieData.userName}, 变量ID: ${env.id}`);
                    break;
                }
            }
        }
    }
    
    if (matchedEnv) {
        console.log(`[${scriptName}] 📝 更新现有变量，ID: ${matchedEnv.id}`);
        return await updateQlEnv(token, matchedEnv.id, dataStr);
    } else {
        console.log(`[${scriptName}] 📝 新增新变量`);
        return await addQlEnv(token, dataStr);
    }
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
        
        // 构建Cookie数据
        const cookieData = {
            userId: (userInfo && userInfo.nickname) || '未知用户',
            userName: (userInfo && userInfo.nickname) || '未知用户',
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
        
        // 检查是否已存在该用户（本地），更新或新增
        const existingIndex = existingData.findIndex(item => item.userId === cookieData.userId);
        if (existingIndex >= 0) {
            existingData[existingIndex] = cookieData;
            console.log(`[${scriptName}] ✅ 更新本地用户Cookie: ${cookieData.userName}`);
        } else {
            existingData.push(cookieData);
            console.log(`[${scriptName}] ✅ 新增本地用户Cookie: ${cookieData.userName}`);
        }
        
        // 保存到本地
        const dataStr = JSON.stringify(existingData);
        writeStore(dataStr, ckName);
        console.log(`[${scriptName}] ✅ Cookie已保存到本地，账号数: ${existingData.length}`);
        
        // 同步到青龙
        const token = await getQlToken();
        
        if (token) {
            const syncResult = await syncToQinglong(token, cookieData, dataStr);
            
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
