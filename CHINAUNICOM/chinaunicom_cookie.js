/*
中国联通 Cookie 获取脚本 v1.0

功能说明:
1. 自动拦截联通 APP 的登录请求
2. 提取 token_online 或 ecs_token
3. 支持账号密码模式和 Token 模式
4. 自动保存到 Surge 持久化存储

使用说明:
1. 在 Surge 配置中安装此模块
2. 打开联通 APP，进入"我的"页面
3. 等待抓取成功通知
4. 关闭模块的 MITM 开关（可选）

抓取 URL:
- https://m.client.10010.com/mobileService/onLine.htm (Token 提取)
- https://m.client.10010.com/mobileService/login.htm (账号密码登录)

Author: AI Generated
Date: 2025-12-27
*/

const $ = new Surge();
const cookieName = '中国联通Cookie';
const tokenKey = 'chinaunicom_token';
const mobileKey = 'chinaunicom_mobile';
const ecsTokenKey = 'chinaunicom_ecs_token';

// 检查是否是目标请求
function isCookieRequest() {
    const url = $request.url;
    return url.includes('mobileService/onLine.htm') ||
        url.includes('mobileService/login.htm');
}

// 提取 Token
function extractToken() {
    const url = $request.url;
    const body = $response.body;

    try {
        // 解析响应体
        const data = JSON.parse(body);

        // 情况1: onLine.htm 接口，提取 token_online 和 ecs_token
        if (url.includes('onLine.htm')) {
            const tokenOnline = data.token_online;
            const ecsToken = data.ecs_token;
            const mobile = data.desmobile;

            if (tokenOnline) {
                $.setdata(tokenOnline, tokenKey);
                console.log(`✅ 成功获取 token_online: ${tokenOnline.substring(0, 20)}...`);
            }

            if (ecsToken) {
                $.setdata(ecsToken, ecsTokenKey);
                console.log(`✅ 成功获取 ecs_token: ${ecsToken.substring(0, 20)}...`);
            }

            if (mobile) {
                $.setdata(mobile, mobileKey);
                console.log(`✅ 成功获取手机号: ${mobile}`);
            }

            if (tokenOnline || ecsToken) {
                $.notification.post(
                    cookieName,
                    '✅ Cookie 获取成功',
                    `手机号: ${mobile || '未知'}\n` +
                    `Token: ${tokenOnline ? '已获取' : '未获取'}\n` +
                    `ECS Token: ${ecsToken ? '已获取' : '未获取'}\n\n` +
                    '⚠️ 建议关闭本模块的 MITM，避免重复抓取'
                );
                return true;
            }
        }

        // 情况2: login.htm 接口，提取登录 token
        if (url.includes('login.htm')) {
            const tokenOnline = data.token_online;
            const mobile = data.desmobile;

            if (tokenOnline) {
                $.setdata(tokenOnline, tokenKey);
                $.setdata(mobile, mobileKey);
                console.log(`✅ 登录成功，获取 token: ${tokenOnline.substring(0, 20)}...`);

                $.notification.post(
                    cookieName,
                    '✅ 登录 Token 获取成功',
                    `手机号: ${mobile || '未知'}\n` +
                    `Token: 已保存\n\n` +
                    '⚠️ 建议关闭本模块的 MITM'
                );
                return true;
            }
        }

        return false;

    } catch (e) {
        console.log(`❌ 解析响应失败: ${e.message}`);
        $.notification.post(
            cookieName,
            '❌ Cookie 获取失败',
            `错误: ${e.message}\n请检查脚本或联系开发者`
        );
        return false;
    }
}

// 主逻辑
if (isCookieRequest()) {
    console.log(`🔍 检测到联通请求: ${$request.url}`);
    const success = extractToken();
    if (success) {
        console.log('✅ Cookie 抓取完成');
    }
}

$.done({});
