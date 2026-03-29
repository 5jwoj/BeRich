/*
阿里云社区 Cookie 抓取模块 - Surge版
@Author: z.W.
@Date: 2026-03-29
@Description: 
  仅负责抓取阿里云社区Cookie，并同步至青龙面板
  不执行任何任务脚本
  支持Surge模块参数配置

获取 Cookie 方式: 阿里云 APP - 首页 - 积分商城

参数说明 (通过Surge模块argument配置):
  - ql_url: 青龙面板地址 (如: http://192.168.1.100:5700)
  - ql_client_id: 青龙Client ID
  - ql_client_secret: 青龙Client Secret
  - ql_data_name: 青龙变量名 (默认: aliyunWeb_data)
*/

const scriptName = '阿里云Web Cookie';
const ckName = 'aliyunWeb_data';

// 解析Surge argument参数
function parseArgument() {
    const args = {};
    if (typeof $argument !== 'undefined' && $argument) {
        const pairs = $argument.split('&');
        for (const pair of pairs) {
            const [key, value] = pair.split('=');
            if (key && value) {
                args[key] = decodeURIComponent(value);
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
        console.log('配置状态: qlUrl=' + (qlUrl ? '已配置' : '未配置') + 
                    ', qlClientId=' + (qlClientId ? '已配置' : '未配置') + 
                    ', qlClientSecret=' + (qlClientSecret ? '已配置' : '未配置'));
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
                if (data.code === 200 && data.token) {
                    console.log('✅ 获取青龙Token成功');
                    resolve(data.token);
                } else {
                    console.log('❌ 获取青龙Token失败: ' + (data.message || '未知错误'));
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
 * 同步变量到青龙
 */
async function syncToQinglong(token, value) {
    if (!token) return false;
    
    const url = `${qlUrl}/open/envs`;
    const body = JSON.stringify({
        name: qlDataName,
        value: value,
        remarks: '阿里云社区Cookie - Surge自动同步'
    });
    
    // 先查询是否存在
    return new Promise((resolve) => {
        $httpClient.get({
            url: `${url}?searchValue=${qlDataName}`,
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            }
        }, (error, response, queryBody) => {
            let existingId = null;
            try {
                const data = JSON.parse(queryBody);
                if (data.code === 200 && data.data && data.data.length > 0) {
                    existingId = data.data[0].id;
                    console.log('📝 青龙中已存在变量，ID: ' + existingId);
                }
            } catch (e) {
                console.log('⚠️ 查询青龙变量失败，将尝试新增');
            }
            
            // 更新或新增
            const method = existingId ? 'put' : 'post';
            const requestUrl = existingId ? `${url}/${existingId}` : url;
            
            const options = {
                url: requestUrl,
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: body
            };
            
            $httpClient[method](options, (error, response, syncBody) => {
                if (error) {
                    console.log('❌ 同步到青龙失败: ' + error);
                    resolve(false);
                    return;
                }
                try {
                    const data = JSON.parse(syncBody);
                    if (data.code === 200) {
                        console.log('✅ 同步到青龙成功');
                        resolve(true);
                    } else {
                        console.log('❌ 同步到青龙失败: ' + (data.message || '未知错误'));
                        resolve(false);
                    }
                } catch (e) {
                    console.log('❌ 解析青龙响应失败: ' + e);
                    resolve(false);
                }
            });
        });
    });
}

/**
 * 主函数 - 获取Cookie
 */
async function getCookie() {
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
    
    // 获取现有Cookie数据
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
    
    // 检查是否已存在该用户，更新或新增
    const existingIndex = existingData.findIndex(item => item.userId === cookieData.userId);
    if (existingIndex >= 0) {
        existingData[existingIndex] = cookieData;
        console.log('✅ 更新用户Cookie: ' + cookieData.userName);
    } else {
        existingData.push(cookieData);
        console.log('✅ 新增用户Cookie: ' + cookieData.userName);
    }
    
    // 保存到本地
    const dataStr = JSON.stringify(existingData);
    $persistentStore.write(dataStr, ckName);
    console.log('✅ Cookie已保存到本地，账号数: ' + existingData.length);
    
    // 同步到青龙
    const token = await getQlToken();
    if (token) {
        const syncResult = await syncToQinglong(token, dataStr);
        if (syncResult) {
            $notification.post(scriptName, '🎉 Cookie同步成功', 
                `用户: ${cookieData.userName}\n账号数: ${existingData.length}\n已同步至青龙`);
        } else {
            $notification.post(scriptName, '⚠️ Cookie已保存', 
                `用户: ${cookieData.userName}\n账号数: ${existingData.length}\n本地保存成功，青龙同步失败`);
        }
    } else {
        $notification.post(scriptName, '🎉 Cookie获取成功', 
            `用户: ${cookieData.userName}\n账号数: ${existingData.length}\n已保存到本地`);
    }
    
    $done({});
}

// 执行
getCookie();
