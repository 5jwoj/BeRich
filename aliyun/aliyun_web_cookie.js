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
        console.log('📝 解析参数: ' + $argument);
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
                // 青龙API返回格式: {"code":200,"data":{"token":"xxx","token_type":"Bearer","expiration":xxx}}
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
 * 同步变量到青龙 - 使用新增方式
 */
async function syncToQinglong(token, value) {
    if (!token) {
        console.log('⚠️ Token为空，无法同步');
        return false;
    }
    
    // 使用新增接口，青龙会自动处理重复
    const url = `${qlUrl}/open/envs`;
    
    // 构建请求体 - 青龙新增接口需要数组格式
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
                    console.log('❌ 同步到青龙失败: ' + (data.message || JSON.stringify(data)));
                    resolve(false);
                }
            } catch (e) {
                console.log('❌ 解析青龙响应失败: ' + e);
                resolve(false);
            }
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
                `用户: ${cookieData.userName}\n账号数: ${existingData.length}\n已同步至青龙变量: ${qlDataName}`);
        } else {
            $notification.post(scriptName, '⚠️ Cookie已保存', 
                `用户: ${cookieData.userName}\n账号数: ${existingData.length}\n本地保存成功，青龙同步失败`);
        }
    } else {
        $notification.post(scriptName, '🎉 Cookie获取成功', 
            `用户: ${cookieData.userName}\n账号数: ${existingData.length}\n已保存到本地（青龙未配置或连接失败）`);
    }
    
    $done({});
}

// 执行
getCookie();
