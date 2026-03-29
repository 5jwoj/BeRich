/*
阿里云社区 Cookie 抓取模块 - Surge版
@Author: z.W.
@Date: 2026-03-29
@Version: 1.0.1
@Description: 
  仅负责抓取阿里云社区Cookie，并同步至青龙面板
  不执行任何任务脚本
  支持Surge模块参数配置
  支持用户名去重，避免重复创建青龙变量

获取 Cookie 方式: 阿里云 APP - 首页 - 积分商城

参数说明 (通过Surge模块argument配置):
  - ql_url: 青龙面板地址 (如: http://192.168.1.100:5700)
  - ql_client_id: 青龙Client ID
  - ql_client_secret: 青龙Client Secret
  - ql_data_name: 青龙变量名 (默认: aliyunWeb_data)

更新日志:
  v1.0.1 - 添加用户名去重逻辑，避免重复创建青龙变量
  v1.0.0 - 初始版本
*/

const scriptName = '阿里云Web Cookie';
const version = 'v1.0.1';
const ckName = 'aliyunWeb_data';

// 解析Surge argument参数
function parseArgument() {
    const args = {};
    if (typeof $argument !== 'undefined' && $argument) {
        const pairs = $argument.split('&');
        for (const pair of pairs) {
            const idx = pair.indexOf('=');
            if (idx > 0) {
                const key = pair.substring(0, idx);
                const value = pair.substring(idx + 1);
                if (key && value) {
                    args[key] = decodeURIComponent(value);
                }
            }
        }
    }
    return args;
}

const args = parseArgument();

// 青龙配置 - 从argument参数获取
const qlUrl = args.ql_url || '';
const qlClientId = args.ql_client_id || '';
const qlClientSecret = args.ql_client_secret || '';
const qlDataName = args.ql_data_name || 'aliyunWeb_data';

/**
 * 获取青龙Token
 */
async function getQlToken() {
    if (!qlUrl || !qlClientId || !qlClientSecret) {
        console.log('⚠️ 青龙配置不完整，跳过同步');
        return null;
    }
    
    const url = `${qlUrl}/open/auth/token?client_id=${qlClientId}&client_secret=${qlClientSecret}`;
    
    return new Promise((resolve) => {
        $httpClient.get(url, (error, response, body) => {
            if (error) {
                console.log('❌ 获取青龙Token失败: ' + error);
                resolve(null);
                return;
            }
            try {
                const data = JSON.parse(body);
                if (data.code === 200 && data.data && data.data.token) {
                    console.log('✅ 获取青龙Token成功');
                    resolve(data.data.token);
                } else {
                    console.log('❌ 获取青龙Token失败: ' + (data.message || JSON.stringify(data)));
                    resolve(null);
                }
            } catch (e) {
                console.log('❌ 解析青龙Token响应失败: ' + e);
                resolve(null);
            }
        });
    });
}

/**
 * 查询青龙中的现有变量
 */
async function queryQlEnv(token) {
    const url = `${qlUrl}/open/envs?searchValue=${qlDataName}`;
    
    return new Promise((resolve) => {
        const options = {
            url: url,
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            }
        };
        
        $httpClient.get(options, (error, response, body) => {
            if (error) {
                console.log('❌ 查询青龙变量失败: ' + error);
                resolve([]);
                return;
            }
            try {
                const data = JSON.parse(body);
                if (data.code === 200 && data.data) {
                    console.log('✅ 查询青龙变量成功，数量: ' + data.data.length);
                    resolve(data.data);
                } else {
                    console.log('⚠️ 查询青龙变量返回空');
                    resolve([]);
                }
            } catch (e) {
                console.log('❌ 解析青龙查询响应失败: ' + e);
                resolve([]);
            }
        });
    });
}

/**
 * 更新青龙变量
 */
async function updateQlEnv(token, envId, value) {
    const url = `${qlUrl}/open/envs`;
    
    const body = JSON.stringify({
        id: envId,
        name: qlDataName,
        value: value,
        remarks: '阿里云社区Cookie - Surge自动同步 ' + new Date().toLocaleString()
    });
    
    return new Promise((resolve) => {
        const options = {
            url: url,
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json;charset=UTF-8'
            },
            body: body
        };
        
        $httpClient.put(options, (error, response, syncBody) => {
            if (error) {
                console.log('❌ 更新青龙变量失败: ' + error);
                resolve(false);
                return;
            }
            try {
                const data = JSON.parse(syncBody);
                if (data.code === 200) {
                    console.log('✅ 更新青龙变量成功，ID: ' + envId);
                    resolve(true);
                } else {
                    console.log('❌ 更新青龙变量失败: ' + (data.message || JSON.stringify(data)));
                    resolve(false);
                }
            } catch (e) {
                console.log('❌ 解析青龙更新响应失败: ' + e);
                resolve(false);
            }
        });
    });
}

/**
 * 新增青龙变量
 */
async function addQlEnv(token, value) {
    const url = `${qlUrl}/open/envs`;
    
    const body = JSON.stringify([{
        name: qlDataName,
        value: value,
        remarks: '阿里云社区Cookie - Surge自动同步 ' + new Date().toLocaleString()
    }]);
    
    return new Promise((resolve) => {
        const options = {
            url: url,
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json;charset=UTF-8'
            },
            body: body
        };
        
        $httpClient.post(options, (error, response, syncBody) => {
            if (error) {
                console.log('❌ 新增青龙变量失败: ' + error);
                resolve(false);
                return;
            }
            try {
                const data = JSON.parse(syncBody);
                if (data.code === 200) {
                    console.log('✅ 新增青龙变量成功');
                    resolve(true);
                } else {
                    console.log('❌ 新增青龙变量失败: ' + (data.message || JSON.stringify(data)));
                    resolve(false);
                }
            } catch (e) {
                console.log('❌ 解析青龙新增响应失败: ' + e);
                resolve(false);
            }
        });
    });
}

/**
 * 同步变量到青龙 - 智能去重
 */
async function syncToQinglong(token, cookieData, dataStr) {
    if (!token) {
        console.log('⚠️ Token为空，无法同步');
        return false;
    }
    
    // 查询青龙中现有的变量
    const existingEnvs = await queryQlEnv(token);
    
    // 查找是否存在相同用户名的变量
    let matchedEnv = null;
    
    for (const env of existingEnvs) {
        if (env.name === qlDataName && env.value) {
            try {
                // 解析青龙中存储的Cookie数据
                let storedData = env.value;
                
                // 尝试解析JSON
                let parsedData = null;
                if (storedData.startsWith('[') || storedData.startsWith('{')) {
                    parsedData = JSON.parse(storedData);
                }
                
                // 检查是否包含相同用户名
                if (parsedData) {
                    if (Array.isArray(parsedData)) {
                        // 数组格式，检查每个元素
                        for (const item of parsedData) {
                            if (item.userId === cookieData.userId || item.userName === cookieData.userName) {
                                matchedEnv = env;
                                console.log('📝 找到匹配用户: ' + cookieData.userName + ', 变量ID: ' + env.id);
                                break;
                            }
                        }
                    } else if (parsedData.userId === cookieData.userId || parsedData.userName === cookieData.userName) {
                        matchedEnv = env;
                        console.log('📝 找到匹配用户: ' + cookieData.userName + ', 变量ID: ' + env.id);
                    }
                } else {
                    // 非JSON格式，检查字符串中是否包含用户名
                    if (storedData.includes(cookieData.userName) || storedData.includes(cookieData.userId)) {
                        matchedEnv = env;
                        console.log('📝 找到匹配用户(字符串匹配): ' + cookieData.userName + ', 变量ID: ' + env.id);
                    }
                }
                
                if (matchedEnv) break;
                
            } catch (e) {
                // 解析失败，检查字符串匹配
                if (env.value.includes(cookieData.userName) || env.value.includes(cookieData.userId)) {
                    matchedEnv = env;
                    console.log('📝 找到匹配用户(字符串匹配): ' + cookieData.userName + ', 变量ID: ' + env.id);
                    break;
                }
            }
        }
    }
    
    // 根据匹配结果决定更新还是新增
    if (matchedEnv) {
        // 更新现有变量
        console.log('📝 更新现有变量，ID: ' + matchedEnv.id);
        return await updateQlEnv(token, matchedEnv.id, dataStr);
    } else {
        // 新增变量
        console.log('📝 新增新变量');
        return await addQlEnv(token, dataStr);
    }
}

/**
 * 主函数 - 获取Cookie
 */
async function getCookie() {
    console.log('🚀 ' + scriptName + ' ' + version + ' 开始执行');
    
    if (!$request) {
        $done({});
        return;
    }
    
    // 获取请求头中的Cookie
    const headers = $request.headers;
    const cookie = headers['Cookie'] || headers['cookie'] || '';
    
    if (!cookie) {
        console.log('❌ 未获取到Cookie');
        $notification.post(scriptName, '❌ 获取Cookie失败', '未在请求头中找到Cookie');
        $done({});
        return;
    }
    
    console.log('✅ 获取到Cookie长度: ' + cookie.length);
    
    // 获取响应体中的用户信息
    let userInfo = null;
    if ($response && $response.body) {
        try {
            const bodyData = JSON.parse($response.body);
            if (bodyData && bodyData.data) {
                userInfo = {
                    nickname: bodyData.data.nickname || '',
                    avatar: bodyData.data.avatar || ''
                };
                console.log('✅ 获取用户信息: ' + userInfo.nickname);
            }
        } catch (e) {
            console.log('⚠️ 解析响应体失败: ' + e);
        }
    }
    
    // 构建Cookie数据
    const cookieData = {
        userId: userInfo?.nickname || '未知用户',
        userName: userInfo?.nickname || '未知用户',
        avatar: userInfo?.avatar || '',
        token: cookie
    };
    
    // 获取现有Cookie数据（本地）
    let existingData = [];
    try {
        const stored = $persistentStore.read(ckName);
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
        console.log('✅ 更新本地用户Cookie: ' + cookieData.userName);
    } else {
        existingData.push(cookieData);
        console.log('✅ 新增本地用户Cookie: ' + cookieData.userName);
    }
    
    // 保存到本地
    const dataStr = JSON.stringify(existingData);
    $persistentStore.write(dataStr, ckName);
    console.log('✅ Cookie已保存到本地，账号数: ' + existingData.length);
    
    // 同步到青龙
    const token = await getQlToken();
    
    if (token) {
        const syncResult = await syncToQinglong(token, cookieData, dataStr);
        
        if (syncResult) {
            $notification.post(scriptName + ' ' + version, '🎉 Cookie同步成功', 
                `用户: ${cookieData.userName}\n账号数: ${existingData.length}\n已同步至青龙变量: ${qlDataName}`);
        } else {
            $notification.post(scriptName + ' ' + version, '⚠️ Cookie已保存', 
                `用户: ${cookieData.userName}\n账号数: ${existingData.length}\n本地保存成功，青龙同步失败`);
        }
    } else {
        $notification.post(scriptName + ' ' + version, '🎉 Cookie获取成功', 
            `用户: ${cookieData.userName}\n账号数: ${existingData.length}\n已保存到本地（青龙未配置或连接失败）`);
    }
    
    $done({});
}

// 执行
getCookie();
