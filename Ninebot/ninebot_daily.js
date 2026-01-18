// @name: Ninebot (九号出行) 自动签到 + 领取奖励
// @author: Adapted by Gemini
// @version: 1.2.1
// @description: 适配青龙面板，使用 Authorization 和 deviceId 进行签到，支持多账号，自动领取任务奖励。
// @note: 
// 1. 请确保在青龙面板的依赖管理中安装 'axios' 和 'moment'。
// 2. 账号配置：在环境变量中设置 NINEBOT_ACCOUNTS，支持多种格式：
//    格式1（推荐）：deviceId1#Authorization1#UA1&deviceId2#Authorization2#UA2
//    格式2（JSON）：[{"name":"账号A","deviceId":"...","authorization":"..."}]
//    格式3（单账号）：deviceId#Authorization#UA
// 3. 青龙通知：将自动使用您配置的通知渠道 (如 Telegram)。
// 4. 自动领取奖励：设置环境变量 ENABLE_AUTO_REWARD=true 启用（默认关闭，因为 API 可能需要额外参数）
// 5. v1.1.0 新增：自动领取任务奖励功能
// 6. v1.2.0 新增：支持简化的分隔符格式，支持自定义 User-Agent
// 7. v1.2.1 新增：添加自动领取奖励开关，默认关闭以提高稳定性

const axios = require('axios');
const moment = require('moment');
// 尝试引入青龙通知模块。如果青龙环境找不到，脚本将跳过推送。
let notify = {};
try {
    notify = require('./sendNotify');
} catch (e) {
    console.log("未找到青龙通知模块 (./sendNotify.js)，将跳过推送。");
    notify.sendNotify = (title, content) => {
        console.log(`[通知模拟] ${title}:\n${content}`);
        return Promise.resolve();
    };
}


/**
 * NineBot 签到核心类
 */
class NineBot {
    constructor(deviceId, authorization, name = "九号出行", userAgent = null) {
        if (!deviceId || !authorization) {
            throw new Error(`[${name}] 缺少必要的参数: deviceId 或 authorization`);
        }

        this.msg = [];
        this.name = name;
        this.deviceId = deviceId;
        this.headers = {
            Accept: "application/json, text/plain, */*",
            Authorization: authorization,
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "zh-CN,zh-Hans;q=0.9",
            "Content-Type": "application/json",
            Host: "cn-cbu-gateway.ninebot.com",
            Origin: "https://h5-bj.ninebot.com",
            from_platform_1: "1",
            language: "zh",
            platform: "h5",
            device_id: deviceId,
            sys_language: "zh-CN",
            "User-Agent": userAgent || "Mozilla/5.0 (iPhone; CPU iPhone OS 15_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Segway v6 C 609033420",
            Referer: "https://h5-bj.ninebot.com/",
        };

        // API端点
        this.endpoints = {
            sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
            status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
            userInfo: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance",
            // 任务相关接口 - 使用 v3 版本
            taskList: "https://cn-cbu-gateway.ninebot.com/portal/api/task-center/task/v3/list",
            taskReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/task-center/task/v3/receive"
        };

        // 请求配置
        this.requestConfig = {
            timeout: 10000,
            retry: 3,
            retryDelay: 2000
        };
    }

    /**
     * 带重试机制的请求方法
     */
    async makeRequest(method, url, data = null) {
        let attempts = 0;
        const maxAttempts = this.requestConfig.retry;

        while (attempts < maxAttempts) {
            try {
                console.log(`[${this.name}] 尝试 ${attempts + 1}/${maxAttempts}: ${method} ${url}`);
                const response = await axios({
                    method,
                    url,
                    data,
                    headers: this.headers,
                    timeout: this.requestConfig.timeout
                });

                console.log(`[${this.name}] 请求成功: ${url}`);
                return response.data;
            } catch (error) {
                attempts++;
                const errorMsg = this.getErrorMessage(error);
                console.error(`[${this.name}] 请求失败 (${attempts}/${maxAttempts}):`, errorMsg);
                if (attempts === maxAttempts) {
                    throw new Error(`所有重试失败: ${errorMsg}`);
                }
                await new Promise(resolve => setTimeout(resolve, this.requestConfig.retryDelay));
            }
        }
    }

    /**
     * 执行签到
     */
    async sign() {
        try {
            console.log(`[${this.name}] 开始执行签到 API...`);
            const responseData = await this.makeRequest(
                "post",
                this.endpoints.sign,
                { deviceId: this.deviceId }
            );

            if (responseData.code === 0) {
                console.log(`[${this.name}] 签到 API 调用成功`);
                return true;
            } else {
                const errorMsg = responseData.msg || "未知错误";
                this.msg.push({ name: "签到结果", value: `签到失败: ${errorMsg}` });
                console.error(`[${this.name}] 签到失败:`, errorMsg);
                return false;
            }
        } catch (error) {
            this.handleError("签到", error);
            return false;
        }
    }

    /**
     * 验证登录状态并获取签到信息
     */
    async valid() {
        try {
            console.log(`[${this.name}] 验证登录状态并获取签到信息...`);
            const timestamp = moment().valueOf();
            const responseData = await this.makeRequest(
                "get",
                `${this.endpoints.status}?t=${timestamp}`
            );

            if (responseData.code === 0) {
                console.log(`[${this.name}] 验证成功，获取到签到信息`);
                return [responseData.data, ""];
            }
            const errorMsg = responseData.msg || "验证失败";
            console.error(`[${this.name}] 验证失败:`, errorMsg);
            return [false, errorMsg];
        } catch (error) {
            const errorMsg = `登录验证异常: ${this.getErrorMessage(error)}`;
            console.error(`[${this.name}] ${errorMsg}`);
            return [false, errorMsg];
        }
    }

    /**
     * 获取用户余额/积分信息（独立获取金币数）
     */
    async getAccountBalance() {
        try {
            console.log(`[${this.name}] 尝试独立获取账户金币余额...`);
            const responseData = await this.makeRequest("get", this.endpoints.userInfo);

            const balance = responseData.data?.balance;

            if (balance !== undefined && balance !== null) {
                console.log(`[${this.name}] 成功获取到金币余额: ${balance}`);
                return balance;
            } else {
                console.log(`[${this.name}] 成功调用 API，但 response.data 中未找到 'balance' 字段。`);
                return '未找到 balance 字段';
            }
        } catch (error) {
            console.error(`[${this.name}] 独立获取余额失败: ${this.getErrorMessage(error)}`);
            return '获取失败';
        }
    }

    /**
     * 获取任务列表
     */
    async getTaskList() {
        try {
            console.log(`[${this.name}] 获取任务列表...`);

            // 使用正确的 v3 API，添加必需的查询参数
            const appVersion = "609113620"; // 从抓包获取的版本号
            const platformType = "iOS";
            const typeCode = "1"; // 1 表示日常任务

            const url = `${this.endpoints.taskList}?typeCode=${typeCode}&appVersion=${appVersion}&platformType=${platformType}`;

            console.log(`[${this.name}] 请求 URL: ${url}`);
            const responseData = await this.makeRequest("get", url);

            // 详细日志：输出完整响应以便调试
            console.log(`[${this.name}] 任务列表 API 响应:`, JSON.stringify(responseData, null, 2));

            if (responseData.code === 0 && responseData.data) {
                console.log(`[${this.name}] 成功获取任务列表`);
                return responseData.data;
            } else {
                console.error(`[${this.name}] 获取任务列表失败 - Code: ${responseData.code}, Msg: ${responseData.msg || "未知错误"}`);
                console.error(`[${this.name}] 完整响应:`, responseData);
                return null;
            }
        } catch (error) {
            console.error(`[${this.name}] 获取任务列表异常:`, this.getErrorMessage(error));
            return null;
        }
    }

    /**
     * 领取任务奖励
     * @param {number} taskId - 任务ID
     * @param {string} taskName - 任务名称（用于日志）
     */
    async receiveTaskReward(taskId, taskName) {
        try {
            console.log(`[${this.name}] 尝试领取任务奖励: ${taskName} (ID: ${taskId})`);
            const responseData = await this.makeRequest(
                "post",
                this.endpoints.taskReceive,
                { taskId: taskId }
            );

            if (responseData.code === 0) {
                const reward = responseData.data?.reward || "未知奖励";
                console.log(`[${this.name}] 成功领取奖励: ${taskName} -> ${reward}`);
                return { success: true, reward: reward };
            } else {
                const errorMsg = responseData.msg || "未知错误";
                console.error(`[${this.name}] 领取奖励失败: ${taskName} -> ${errorMsg}`);
                return { success: false, error: errorMsg };
            }
        } catch (error) {
            const errorMsg = this.getErrorMessage(error);
            console.error(`[${this.name}] 领取奖励异常: ${taskName} ->`, errorMsg);
            return { success: false, error: errorMsg };
        }
    }

    /**
     * 自动领取所有可领取的任务奖励
     */
    async autoReceiveRewards() {
        try {
            console.log(`[${this.name}] 开始自动领取任务奖励...`);
            const taskData = await this.getTaskList();

            if (!taskData) {
                console.warn(`[${this.name}] 无法获取任务列表，跳过领取奖励环节`);
                this.msg.push({ name: "领取奖励", value: "获取任务列表失败，可能该账号无权限访问任务接口" });
                return;
            }

            // 查找所有可领取的任务（状态为已完成但未领取）
            // 根据实际API返回结构调整，常见字段：status, canReceive, isReceived 等
            const receivableTasks = [];

            // 遍历任务列表，查找可领取的任务
            // 假设结构为 { taskList: [...] } 或直接是数组
            const tasks = Array.isArray(taskData) ? taskData : (taskData.taskList || taskData.list || []);

            console.log(`[${this.name}] 任务列表结构:`, typeof taskData, Array.isArray(taskData) ? `数组(${taskData.length}项)` : '对象');
            console.log(`[${this.name}] 解析到的任务数量: ${tasks.length}`);

            for (const task of tasks) {
                // 常见判断条件：
                // 1. status === 2 或 status === 'completed' (已完成)
                // 2. canReceive === true 或 isReceived === false (可领取)
                // 3. received === false 或 receiveStatus === 0 (未领取)

                const canReceive =
                    (task.status === 2 || task.status === 'completed') &&
                    (task.canReceive === true || task.isReceived === false || task.received === false || task.receiveStatus === 0);

                if (canReceive) {
                    receivableTasks.push({
                        id: task.taskId || task.id,
                        name: task.taskName || task.name || `任务${task.taskId || task.id}`,
                        reward: task.reward || task.rewardDesc || "未知奖励"
                    });
                }
            }

            console.log(`[${this.name}] 发现 ${receivableTasks.length} 个可领取的任务`);

            if (receivableTasks.length === 0) {
                this.msg.push({ name: "领取奖励", value: "暂无可领取的任务奖励" });
                return;
            }

            // 逐个领取奖励
            const results = [];
            for (const task of receivableTasks) {
                const result = await this.receiveTaskReward(task.id, task.name);
                results.push({
                    name: task.name,
                    success: result.success,
                    reward: result.reward || result.error
                });
                // 避免请求过快，延迟1秒
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // 汇总结果
            const successCount = results.filter(r => r.success).length;
            const failCount = results.length - successCount;

            let rewardSummary = `成功 ${successCount} 个，失败 ${failCount} 个`;
            if (successCount > 0) {
                const successTasks = results.filter(r => r.success).map(r => `  • ${r.name}: ${r.reward}`).join('\n');
                rewardSummary += `\n成功领取:\n${successTasks}`;
            }
            if (failCount > 0) {
                const failTasks = results.filter(r => !r.success).map(r => `  • ${r.name}: ${r.reward}`).join('\n');
                rewardSummary += `\n领取失败:\n${failTasks}`;
            }

            this.msg.push({ name: "领取奖励", value: rewardSummary });

        } catch (error) {
            console.error(`[${this.name}] 自动领取奖励异常:`, error);
            this.msg.push({ name: "领取奖励", value: `异常: ${error.message}` });
        }
    }

    /**
     * 错误处理
     */
    handleError(action, error) {
        const errorMessage = this.getErrorMessage(error);
        console.error(`[${this.name}] ${action}错误:`, errorMessage);
        this.msg.push(
            { name: `${action}结果`, value: `${action}失败` },
            { name: "错误详情", value: errorMessage }
        );
    }

    /**
     * 提取错误信息
     */
    getErrorMessage(error) {
        return error.response
            ? `状态码: ${error.response.status}, 信息: ${error.response.data?.msg || error.message}`
            : error.message;
    }

    /**
     * 获取日志信息
     */
    get logs() {
        return this.msg.map((one) => `${one.name}: ${one.value}`).join("\n");
    }

    /**
     * 运行签到流程
     */
    async run() {
        try {
            console.log(`[${this.name}] 开始执行签到任务...`);

            // 1. 独立获取金币总数 (用于通知的初始余额)
            const currentBalance = await this.getAccountBalance();

            // 2. 首次获取签到状态
            let [validData, errInfo] = await this.valid();

            if (validData) {
                const completed = validData.currentSignStatus === 1;

                // 记录初始状态
                this.msg.push({
                    name: "账号名称",
                    value: this.name,
                });

                this.msg.push({
                    name: "当前金币总数",
                    value: `${currentBalance}`,
                });

                this.msg.push({
                    name: "连续签到天数",
                    value: `${validData.consecutiveDays || 0}天`,
                });
                this.msg.push({
                    name: "今日签到状态",
                    value: completed ? "已签到🎉" : "未签到❌",
                });

                if (!completed) {
                    // 执行签到
                    const signSuccess = await this.sign();
                    if (signSuccess) {
                        // 签到成功后重新获取最新状态
                        console.log(`[${this.name}] 签到成功，获取最新数据...`);

                        // 签到成功后，再次独立获取金币总数以更新结果
                        const newBalance = await this.getAccountBalance();

                        // 获取最新签到状态，但我们主要目的是为了更新连续天数
                        const [newValidData] = await this.valid();

                        // 更新结果
                        this.msg.push({ name: "签到结果", value: "签到成功🎉🎉" });
                        if (newValidData) {
                            // 更新金币总数
                            const pointsIndex = this.msg.findIndex(item => item.name === "当前金币总数");
                            if (pointsIndex !== -1) {
                                this.msg[pointsIndex].value = `${newBalance}`;
                            }

                            // 查找并更新连续签到天数
                            const index = this.msg.findIndex(item => item.name === "连续签到天数");
                            if (index !== -1) {
                                this.msg[index].value = `${newValidData.consecutiveDays || 0}天`;
                            }
                            // 查找并更新今日签到状态
                            const statusIndex = this.msg.findIndex(item => item.name === "今日签到状态");
                            if (statusIndex !== -1) {
                                this.msg[statusIndex].value = "已签到🎉";
                            }
                        } else {
                            this.msg.push({ name: "状态更新", value: "签到成功，但获取最新状态失败" });
                        }
                    }
                } else {
                    this.msg.push({ name: "签到结果", value: "今日已签到，跳过" });
                    console.log(`[${this.name}] 今日已签到，无需重复签到`);
                }

                // 3. 新增：自动领取任务奖励（可通过环境变量控制）
                const enableAutoReward = process.env.ENABLE_AUTO_REWARD === 'true';
                if (enableAutoReward) {
                    console.log(`[${this.name}] 开始检查并领取任务奖励...`);
                    await this.autoReceiveRewards();
                } else {
                    console.log(`[${this.name}] 自动领取奖励功能已关闭（设置 ENABLE_AUTO_REWARD=true 启用）`);
                    this.msg.push({ name: "领取奖励", value: "功能已关闭（可设置 ENABLE_AUTO_REWARD=true 启用）" });
                }

                // 4. 领取奖励后再次获取余额
                const finalBalance = await this.getAccountBalance();
                const balanceIndex = this.msg.findIndex(item => item.name === "当前金币总数");
                if (balanceIndex !== -1) {
                    this.msg[balanceIndex].value = `${finalBalance}`;
                }

            } else {
                this.msg.push({ name: "验证结果", value: errInfo });
                this.msg.push({ name: "签到结果", value: "登录验证失败，无法签到" });
            }
        } catch (error) {
            this.msg.push({ name: "执行结果", value: `执行异常: ${error.message}` });
            console.error(`[${this.name}] 任务执行时发生未捕获异常:`, error);
        } finally {
            console.log(`[${this.name}] 任务执行完成`);
        }
    }
}


/**
 * 初始化并执行签到
 */
async function init() {
    let accounts = [];
    const envAccounts = process.env.NINEBOT_ACCOUNTS;
    const envDeviceId = process.env.NINEBOT_DEVICE_ID;
    const envAuth = process.env.NINEBOT_AUTHORIZATION;

    if (envAccounts) {
        // 检测格式：如果包含 # 和 &，则使用新格式解析
        if (envAccounts.includes('#') && envAccounts.includes('&')) {
            console.log("📋 检测到新格式配置 (deviceId#Authorization#UA&...)");
            try {
                // 新格式：deviceId1#Authorization1#UA1&deviceId2#Authorization2#UA2
                const accountStrings = envAccounts.split('&');
                accounts = accountStrings.map((accountStr, index) => {
                    const parts = accountStr.split('#');
                    if (parts.length < 2) {
                        console.warn(`⚠️ 警告：账号格式错误，跳过该账号：${accountStr}`);
                        return null;
                    }
                    return {
                        name: `账号${index + 1}`,
                        deviceId: parts[0].trim(),
                        authorization: parts[1].trim(),
                        userAgent: parts[2] ? parts[2].trim() : null
                    };
                }).filter(acc => acc !== null && acc.deviceId && acc.authorization);

                console.log(`✅ 成功解析 ${accounts.length} 个账号`);
            } catch (e) {
                console.error("❌ 解析新格式配置失败:", e.message);
                accounts = [];
            }
        }
        // 检测格式：如果只包含 #，则使用单账号新格式
        else if (envAccounts.includes('#')) {
            console.log("📋 检测到单账号新格式配置 (deviceId#Authorization#UA)");
            try {
                const parts = envAccounts.split('#');
                if (parts.length >= 2) {
                    accounts.push({
                        name: "默认账号",
                        deviceId: parts[0].trim(),
                        authorization: parts[1].trim(),
                        userAgent: parts[2] ? parts[2].trim() : null
                    });
                    console.log(`✅ 成功解析单账号配置`);
                } else {
                    console.error("❌ 单账号格式错误，至少需要 deviceId#Authorization");
                }
            } catch (e) {
                console.error("❌ 解析单账号配置失败:", e.message);
                accounts = [];
            }
        }
        // 旧格式：JSON 数组
        else {
            console.log("📋 检测到 JSON 格式配置");
            try {
                const parsedAccounts = JSON.parse(envAccounts);
                accounts = parsedAccounts.map((acc, index) => ({
                    name: acc.name || `账号${index + 1}`,
                    deviceId: acc.deviceId,
                    authorization: acc.authorization,
                    userAgent: acc.userAgent || null
                })).filter(acc => acc.deviceId && acc.authorization);
                console.log(`✅ 成功解析 ${accounts.length} 个账号`);
            } catch (e) {
                console.error("❌ 环境变量 NINEBOT_ACCOUNTS 格式错误，请检查格式:", e.message);
                accounts = [];
            }
        }
    }
    // 处理单账号配置（旧格式兼容）
    else if (envDeviceId && envAuth) {
        accounts.push({
            name: process.env.NINEBOT_NAME || "默认账号",
            deviceId: envDeviceId,
            authorization: envAuth,
            userAgent: process.env.NINEBOT_UA || null
        });
    }

    if (accounts.length === 0) {
        console.error("❌ 未配置任何有效的九号出行账号信息。");
        console.error("请设置环境变量 NINEBOT_ACCOUNTS，支持以下格式：");
        console.error("  1. 新格式（推荐）: deviceId1#Authorization1#UA1&deviceId2#Authorization2#UA2");
        console.error("  2. JSON 格式: [{\"name\":\"账号1\",\"deviceId\":\"...\",\"authorization\":\"...\"}]");
        console.error("  3. 单账号: NINEBOT_DEVICE_ID 和 NINEBOT_AUTHORIZATION");
        return;
    }

    // 执行所有账号的签到并收集结果
    const allResults = [];
    console.log(`\n================== 共发现 ${accounts.length} 个账号 ==================`);
    for (const account of accounts) {
        console.log(`\n===== 开始处理账号: ${account.name} =====`);
        try {
            const bot = new NineBot(account.deviceId, account.authorization, account.name, account.userAgent);
            await bot.run();
            allResults.push({
                name: account.name,
                logs: bot.logs
            });
        } catch (e) {
            allResults.push({
                name: account.name,
                logs: `初始化失败: ${e.message}`
            });
        }
    }

    // 生成汇总通知内容
    const title = "🛴 九号出行签到结果";
    let message = allResults.map(acc => {
        // 判断是否成功 (根据日志中的特定成功标记)
        const status = acc.logs.includes("已签到🎉") ? "✅" : "❌";
        return `${status} ${acc.name}\n  ${acc.logs.replace(/\n/g, "\n  ")}`;
    }).join("\n\n");

    // 推送消息
    console.log("\n================== 准备推送通知 ==================");
    await notify.sendNotify(title, message);
}

// 启动执行
init();
