/*
阿里云社区任务脚本 - Quantumult X 专用包装器
@Repository: https://github.com/5jwoj/BeRich
@Author: z.W. & 5jwoj
@Description: 
  自动加载 5jwoj/BeRich 仓库中的 cheerio.js 并注入到全局环境，
  解决 Quantumult X 中运行阿里云社区脚本时卡在下载 Cheerio 的问题。

[task_local]
0 7,13 * * * https://raw.githubusercontent.com/5jwoj/BeRich/main/aliyun_web_wrapper.js, tag=阿里云社区日常任务, img-url=https://raw.githubusercontent.com/Orz-3/mini/master/Color/Aliyun.png, enabled=true

[rewrite_local]
^https?:\/\/developer\.aliyun\.com\/developer\/api\/my\/user\/getUser url script-response-body https://raw.githubusercontent.com/leiyiyan/resource/main/script/aliyun_web/aliyun_web.js

[mitm]
hostname = developer.aliyun.com
*/

// ==================== 配置区 ====================
// 你的 GitHub 仓库文件地址 (支持 main 和 master 分支自动重试)
const CHEERIO_URLS = [
    'https://raw.githubusercontent.com/5jwoj/BeRich/main/cheerio.js',
    'https://raw.githubusercontent.com/5jwoj/BeRich/master/cheerio.js'
];

// 原始阿里云社区脚本地址
const MAIN_SCRIPT_URL = 'https://raw.githubusercontent.com/leiyiyan/resource/main/script/aliyun_web/aliyun_web.js';

// 本地持久化缓存 Key
const CACHE_KEY = '5jwoj_cheerio_code_cache';

// ==================== 工具函数 ====================

function httpGet(url, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(`请求超时 (${timeout}ms)`), timeout);
        $task.fetch({ url: url }).then(
            response => {
                clearTimeout(timer);
                if (response.statusCode === 200 && response.body && response.body.length > 1000) {
                    resolve(response.body);
                } else {
                    reject(`HTTP状态码: ${response.statusCode}, 内容长度: ${response.body?.length || 0}`);
                }
            },
            reason => {
                clearTimeout(timer);
                reject(reason.error || reason);
            }
        );
    });
}

// ==================== Cheerio 加载与注入 ====================

async function getCheerioCode() {
    // 1. 优先尝试使用本地缓存
    let code = $prefs.valueForKey(CACHE_KEY);
    if (code && code.length > 5000) {
        console.log(`✅ 使用本地缓存的 Cheerio 代码 (${code.length} 字节)`);
        return code;
    }

    // 2. 无缓存时，从 5jwoj/BeRich 仓库下载
    console.log('📥 正在从 GitHub (5jwoj/BeRich) 下载 cheerio.js...');
    for (const url of CHEERIO_URLS) {
        try {
            console.log(`🔄 尝试链接: ${url}`);
            code = await httpGet(url, 20000);
            if (code && code.includes('createCheerio')) {
                console.log(`✅ 下载成功 (${code.length} 字节)，已写入本地缓存`);
                $prefs.setValueForKey(code, CACHE_KEY);
                return code;
            }
        } catch (e) {
            console.log(`⚠️ 链接下载失败: ${e}`);
        }
    }

    return null;
}

function injectCheerio(cheerioCode) {
    try {
        // 执行 cheerio.js 代码，获取 createCheerio 函数
        eval(cheerioCode);
        
        if (typeof createCheerio !== 'function') {
            throw new Error('未找到 createCheerio 函数');
        }

        // 初始化 cheerio 实例
        const cheerioInstance = createCheerio();
        if (!cheerioInstance || typeof cheerioInstance.load !== 'function') {
            throw new Error('createCheerio() 初始化失败，缺少 load 方法');
        }

        // 绑定到全局作用域
        globalThis.Cheerio = cheerioInstance;
        if (typeof self !== 'undefined') self.Cheerio = cheerioInstance;

        // Hook Env 构造函数，确保每个 $ 实例都有 $.Cheerio
        let _realEnv = globalThis.Env;
        Object.defineProperty(globalThis, 'Env', {
            get() {
                return function(...args) {
                    const inst = _realEnv ? new _realEnv(...args) : {};
                    inst.Cheerio = cheerioInstance;
                    return inst;
                };
            },
            set(v) {
                _realEnv = v;
            },
            configurable: true
        });

        console.log('✅ Cheerio 模块全局注入成功!');
        return true;
    } catch (e) {
        console.log(`❌ Cheerio 注入失败: ${e}`);
        return false;
    }
}

// ==================== 主逻辑 ====================

async function main() {
    console.log('🚀 [5jwoj/BeRich] 阿里云社区任务启动...');
    console.log('═'.repeat(45));

    // 步骤 1: 获取 Cheerio 代码
    const cheerioCode = await getCheerioCode();
    if (!cheerioCode) {
        console.log('❌ 无法获取 cheerio.js');
        console.log('💡 请检查是否已将 cheerio.js 上传至 https://github.com/5jwoj/BeRich');
        $notify('阿里云社区', '❌ Cheerio 加载失败', '请检查 5jwoj/BeRich 仓库中是否有 cheerio.js');
        $done();
        return;
    }

    // 步骤 2: 注入 Cheerio
    const injected = injectCheerio(cheerioCode);
    if (!injected) {
        $notify('阿里云社区', '❌ Cheerio 注入失败', '无法初始化 createCheerio()');
        $done();
        return;
    }

    // 步骤 3: 下载并运行原始阿里云社区脚本
    console.log('📥 正在下载阿里云社区主脚本...');
    try {
        const mainScript = await httpGet(MAIN_SCRIPT_URL, 30000);
        console.log(`✅ 主脚本获取成功 (${mainScript.length} 字节)`);
        console.log('═'.repeat(45));
        console.log('▶️ 开始执行主脚本...');
        
        // 运行主脚本
        eval(mainScript);
    } catch (e) {
        console.log(`❌ 主脚本运行失败: ${e}`);
        $notify('阿里云社区', '❌ 主脚本运行失败', String(e));
        $done();
    }
}

main();
