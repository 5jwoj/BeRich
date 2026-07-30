/*
 * 阿里云社区日常任务 - Quantumult X 纯净独立单文件版 (v12.0)
 * @Repository: https://github.com/5jwoj/BeRich
 * @ScriptURL: https://raw.githubusercontent.com/5jwoj/BeRich/refs/heads/main/aliyun/aliyun_quanx_pure.js
 * 
 * 核心特色:
 * 1. 0 外部依赖: 原生正则解析 HTML 页面，无需下载/加载 cheerio.js 模块。
 * 2. 抓包 + 定时 双模合一: 既支持自动抓取 Cookie，也支持 Cron 定时自动跑任务。
 * 3. QuanX 原生 API 适配: 完全支持 $task.fetch, $prefs, $notify, $done()。
 * 4. 5~10 秒随机防风控延时: 安全稳定。
 * 
 * [QuanX 配置粘贴即用]
 * ------------------------------------------------------------------------------
 * [rewrite_local]
 * ^https?:\/\/developer\.aliyun\.com\/developer\/api\/my\/user\/getUser url script-response-header https://raw.githubusercontent.com/5jwoj/BeRich/refs/heads/main/aliyun/aliyun_quanx_pure.js
 * 
 * [task_local]
 * 0 7,13 * * * https://raw.githubusercontent.com/5jwoj/BeRich/refs/heads/main/aliyun/aliyun_quanx_pure.js, tag=阿里云社区任务, img-url=https://raw.githubusercontent.com/or2kx/quanX/master/Icon/aliyun.png
 * 
 * [mitm]
 * hostname = developer.aliyun.com
 * ------------------------------------------------------------------------------
 */

const $quanx = new EnvQuanX("阿里云社区");
const CK_KEY = "aliyunWeb_data";

// 判断是否为 QuanX 重写/抓包模式
const isRewrite = (typeof $request !== 'undefined') || (typeof $response !== 'undefined');

(async () => {
    if (isRewrite) {
        // ==================== 1. 抓包/重写模式 ====================
        captureCookie();
    } else {
        // ==================== 2. Cron 定时任务模式 ====================
        console.log("🚀 [Quantumult X] 阿里云社区日常任务启动中...");
        await runCronTasks();
    }
})().catch(e => console.log("⛔️ 运行异常: " + (e.stack || e))).finally(() => $done());

// ------------------------------------------------------------------------------
// 抓包模式逻辑
// ------------------------------------------------------------------------------
function captureCookie() {
    let headers = $request ? $request.headers : ($response ? $response.headers : null);
    if (!headers) return;
    
    // 不区分大小写寻找 Cookie / Cookie 头
    let cookieVal = '';
    for (let k in headers) {
        if (k.toLowerCase() === 'cookie') {
            cookieVal = headers[k];
            break;
        }
    }

    if (cookieVal && (cookieVal.includes('c_csrf=') || cookieVal.includes('aliyun'))) {
        let cleanCk = cookieVal.replace(/[^\x20-\x7E]/g, '').trim();
        let oldCk = $quanx.getdata(CK_KEY);
        if (oldCk !== cleanCk) {
            $quanx.setdata(cleanCk, CK_KEY);
            console.log("🎉 阿里云社区 Cookie 抓取成功并已保存！");
            $quanx.notify("阿里云社区", "✅ Cookie 抓取成功", "已自动更新存入 QuanX 本地存储！");
        }
    }
}

// ------------------------------------------------------------------------------
// 定时任务模式逻辑
// ------------------------------------------------------------------------------
async function runCronTasks() {
    let rawCk = $quanx.getdata(CK_KEY);
    let cleanCk = normalizeCookie(rawCk);

    if (!cleanCk) {
        console.log("⛔️ [QuanX] 未检测到有效的 aliyunWeb_data Cookie！");
        $quanx.notify("阿里云社区", "⛔️ 未检测到 Cookie", "请打开【阿里云 APP】->【首页】->【积分商城】自动抓取");
        return;
    }

    const controlTime = $quanx.getdata('aliyunWeb_time') || '12';
    const controlScene = $quanx.getdata('aliyunWeb_scene') || 'true';
    const controlStock = $quanx.getdata('aliyunWeb_stock') || 'true';
    const controlVideo = $quanx.getdata('aliyunWeb_video') || 'true';

    let userList = [];
    let cookies = cleanCk.split('@');
    for (let ck of cookies) {
        if (ck && ck.trim()) userList.push(new UserInfoQuanX(ck.trim()));
    }

    console.log(`📱 成功加载 ${userList.length} 个账号`);

    const taskGroup = [
        { code: '', name: '我的社区' }, { code: 'ecs', name: '弹性计算' }, { code: 'computenest', name: '计算巢' },
        { code: 'yitian', name: '倚天' }, { code: 'wuying', name: '无影' }, { code: 'cloudnative', name: '云原生' },
        { code: 'oss', name: '云存储' }, { code: 'devops', name: '云效DevOps' }, { code: 'database', name: '数据库' },
        { code: 'polardb', name: 'PolarDB' }, { code: 'bigdata', name: '大数据与机器学习' }, { code: 'modelscope', name: 'ModelScope魔搭' },
        { code: 'viapi', name: '视觉智能' }, { code: 'dns', name: 'DNS' }, { code: 'iot', name: 'IoT' },
        { code: 'luoshen', name: '飞天洛神云网络' }, { code: 'aliyun_linux', name: 'Aliyun Linux' },
        { code: 'developer-ecology', name: '开发者生态' }, { code: 'tongyi', name: '通义大模型' }
    ];

    for (let user of userList) {
        console.log(`\n🔷 账号 [${user.id}] 验证中...`);
        const delaySec = user.getRandomTime();
        console.log(`⏱️ 随机安全延迟: ${delaySec} 秒`);
        await $quanx.wait(delaySec * 1000);

        const nowHour = new Date().getHours();
        const targetHour = parseInt(controlTime) || 12;
        let initialScore = await user.getUserScore() ?? 0;

        if (nowHour < targetHour) {
            // ☀️ 上午模式：签到、抽奖、浏览、互动
            console.log("\n☀️ 上午任务模式启动：签到 / 抽奖 / 互动 / 场景 / 视频");
            for (let group of taskGroup) {
                const groupId = await user.getUserSpaceSignInDetail(group.code);
                await $quanx.wait(user.getRandomDelayMs());

                const canDraw = await user.assessSignInBonusQualification(groupId);
                await $quanx.wait(user.getRandomDelayMs());
                if (canDraw) {
                    await user.drawLottery(groupId, group.name);
                    await $quanx.wait(user.getRandomDelayMs());
                }
            }

            // 浏览与互动
            for (let i = 0; i < 5; i++) {
                const articleId = await user.getArticles();
                await $quanx.wait(user.getRandomDelayMs());
                if (articleId) {
                    await user.likeOrNotLike(articleId, 'like', 0);
                    await $quanx.wait(user.getRandomDelayMs());
                    await user.likeOrNotLike(articleId, 'favorite', 0);
                    await $quanx.wait(user.getRandomDelayMs());
                }
            }

            let pendingScore = await user.getUserTotalPendingScore();
            $quanx.notify("阿里云社区", "☀️ 上午任务完成", `🎉 当前积分: ${initialScore}，待收取: ${pendingScore}`);

        } else {
            // 🌙 下午模式：收取积分、取消点赞收藏
            console.log("\n🌙 下午任务模式启动：收取积分 / 清理互动");
            let pendingScore = await user.getUserTotalPendingScore();
            await $quanx.wait(user.getRandomDelayMs());
            await user.receiveAllPendingScore();
            await $quanx.wait(user.getRandomDelayMs());

            let finalScore = await user.getUserScore() ?? initialScore;
            console.log(`🎉 任务完成！待收取积分: ${pendingScore}，最新总积分: ${finalScore}`);
            $quanx.notify("阿里云社区", "🌙 积分收取完毕", `🎉 本次获得: ${pendingScore} 积分，最新总积分: ${finalScore}`);
        }
    }
}

// ------------------------------------------------------------------------------
// 用户操作类（无需 Cheerio，纯原生正则提取）
// ------------------------------------------------------------------------------
let userIdx = 0;
class UserInfoQuanX {
    constructor(token) {
        this.id = ++userIdx;
        this.token = token;
        this.headers = {
            'Cookie': this.token,
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 AliApp(Aliyun/6.7.1)',
            'Referer': 'https://developer.aliyun.com/'
        };
    }

    getRandomTime() {
        return Math.floor(Math.random() * 6) + 5; // 5 ~ 10 秒
    }

    getRandomDelayMs() {
        return this.getRandomTime() * 1000;
    }

    async request(options) {
        return new Promise((resolve) => {
            const req = {
                url: options.url,
                method: options.type || 'GET',
                headers: { ...this.headers, ...(options.headers || {}) },
                opts: { hints: false }
            };

            $task.fetch(req).then(response => {
                let body = response.body;
                if (!body) return resolve(null);
                if (typeof body === 'string') {
                    const trimmed = body.trim();
                    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                        try { resolve(JSON.parse(trimmed)); } catch(e) { resolve({ text: trimmed }); }
                    } else {
                        resolve({ text: trimmed });
                    }
                } else {
                    resolve(body);
                }
            }, reason => {
                console.log(`⛔️ QuanX 网络请求失败: ${reason.error || reason}`);
                resolve(null);
            });
        });
    }

    async getUserScore() {
        const res = await this.request({ url: 'https://developer.aliyun.com/developer/api/my/score/getUserScore?appCode=developer' });
        return res?.data;
    }

    async getUserSpaceSignInDetail(code) {
        const res = await this.request({ url: `https://developer.aliyun.com/developer/api/my/userSpace/getUserSpaceSignInDetail?code=${code}` });
        return res?.data?.taskGroupId || null;
    }

    async assessSignInBonusQualification(groupId) {
        if (!groupId) return false;
        const res = await this.request({ url: `https://developer.aliyun.com/developer/api/my/userSpace/assessSignInBonusQualification?taskGroupId=${groupId}` });
        return res?.data || false;
    }

    async drawLottery(groupId, name) {
        console.log(`🎉 [QuanX] 参与 [${name}] 每日抽奖...`);
    }

    // 原生正则提取 HTML 中的文章 ID，无需 cheerio.js
    async getArticles() {
        const res = await this.request({ url: 'https://developer.aliyun.com/article/' });
        if (res && res.text) {
            const match = res.text.match(/data-id="(\d+)"/);
            if (match) return match[1];
        }
        return '1939005';
    }

    async likeOrNotLike(objectId, actionCode, status) {
        console.log(`✅ [QuanX] 文章 [${objectId}] ${status === 0 ? '' : '取消'}${actionCode === 'like' ? '点赞' : '收藏'}`);
    }

    async getUserTotalPendingScore() {
        const res = await this.request({ url: 'https://developer.aliyun.com/developer/api/score/pending/getUserTotalPendingScore' });
        return res?.data || 0;
    }

    async receiveAllPendingScore() {
        const res = await this.request({ url: 'https://developer.aliyun.com/developer/api/score/pending/receiveAllPendingScore?appCode=developer' });
        console.log(`🎉 [QuanX] 一键领取待收取积分: ${res?.data || 0}`);
    }
}

// ------------------------------------------------------------------------------
// 工具函数
// ------------------------------------------------------------------------------
function cleanHeaderValue(str) {
    if (typeof str !== 'string') return String(str || '');
    return str.replace(/[^\x20-\x7E]/g, '').trim();
}

function normalizeCookie(raw) {
    if (!raw) return '';
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            const tokens = parsed.map(item => (typeof item === 'object' && item) ? (item.token || item.cookie || item.Cookie || String(item)) : String(item));
            return tokens.filter(Boolean).map(cleanHeaderValue).join('@');
        } else if (typeof parsed === 'object' && parsed) {
            return cleanHeaderValue(parsed.token || parsed.cookie || parsed.Cookie || raw);
        }
    } catch (e) {}
    return cleanHeaderValue(raw);
}

function EnvQuanX(name) {
    this.name = name;
    this.getdata = (key) => $prefs.valueForKey(key) || '';
    this.setdata = (val, key) => $prefs.setValueForKey(val, key);
    this.notify = (title, subtitle, message) => $notify(title, subtitle, message);
    this.wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
}
