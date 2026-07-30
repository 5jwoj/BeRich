/*
阿里云社区任务脚本 - Quantumult X 专用包装器
@Repository: https://github.com/5jwoj/BeRich
*/

const CHEERIO_URLS = [
    'https://raw.githubusercontent.com/5jwoj/BeRich/refs/heads/main/aliyun/cheerio.js',
    'https://raw.githubusercontent.com/5jwoj/BeRich/main/aliyun/cheerio.js'
];
const MAIN_SCRIPT_URL = 'https://raw.githubusercontent.com/leiyiyan/resource/main/script/aliyun_web/aliyun_web.js';
const CACHE_KEY = '5jwoj_cheerio_code_cache';

function httpGet(url, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(`超时 (${timeout}ms)`), timeout);
        $task.fetch({ url: url }).then(
            response => {
                clearTimeout(timer);
                if (response.statusCode === 200 && response.body && response.body.length > 1000) {
                    resolve(response.body);
                } else {
                    reject(`HTTP ${response.statusCode}`);
                }
            },
            reason => { clearTimeout(timer); reject(reason.error || reason); }
        );
    });
}

async function getCheerioCode() {
    let code = $prefs.valueForKey(CACHE_KEY);
    if (code && code.length > 5000) {
        console.log(`✅ 使用本地缓存的 Cheerio (${code.length} 字节)`);
        return code;
    }
    console.log('📥 正在从 GitHub (5jwoj/BeRich) 下载 cheerio.js...');
    for (const url of CHEERIO_URLS) {
        try {
            code = await httpGet(url, 20000);
            if (code && code.includes('createCheerio')) {
                console.log(`✅ 下载成功 (${code.length} 字节)，已写入本地缓存`);
                $prefs.setValueForKey(code, CACHE_KEY);
                return code;
            }
        } catch (e) {
            console.log(`⚠️ 下载失败: ${e}`);
        }
    }
    return null;
}

function injectCheerio(cheerioCode) {
    try {
        eval(cheerioCode);
        if (typeof createCheerio !== 'function') throw new Error('未找到 createCheerio 函数');
        const cheerioInstance = createCheerio();
        if (!cheerioInstance || typeof cheerioInstance.load !== 'function') throw new Error('createCheerio() 初始化失败');

        globalThis.Cheerio = cheerioInstance;
        if (typeof self !== 'undefined') self.Cheerio = cheerioInstance;

        let _realEnv = globalThis.Env;
        Object.defineProperty(globalThis, 'Env', {
            get() {
                return function(...args) {
                    const inst = _realEnv ? new _realEnv(...args) : {};
                    inst.Cheerio = cheerioInstance;
                    return inst;
                };
            },
            set(v) { _realEnv = v; },
            configurable: true
        });

        console.log('✅ Cheerio 模块成功注入！');
        return true;
    } catch (e) {
        console.log(`❌ Cheerio 注入失败: ${e}`);
        return false;
    }
}

async function main() {
    console.log('🚀 [5jwoj/BeRich] 阿里云社区任务启动...');
    console.log('═'.repeat(45));

    const cheerioCode = await getCheerioCode();
    if (!cheerioCode) {
        console.log('❌ 无法获取 cheerio.js，请确认已上传到 5jwoj/BeRich 仓库');
        $notify('阿里云社区', '❌ Cheerio 加载失败', '请检查仓库文件');
        $done(); return;
    }

    if (!injectCheerio(cheerioCode)) {
        $notify('阿里云社区', '❌ Cheerio 注入失败', '无法初始化 createCheerio()');
        $done(); return;
    }

    console.log('📥 正在下载阿里云社区主脚本...');
    try {
        const mainScript = await httpGet(MAIN_SCRIPT_URL, 30000);
        console.log(`✅ 主脚本获取成功 (${mainScript.length} 字节)`);
        console.log('═'.repeat(45));
        console.log('▶️ 开始执行主脚本...');
        eval(mainScript);
    } catch (e) {
        console.log(`❌ 主脚本运行失败: ${e}`);
        $notify('阿里云社区', '❌ 主脚本运行失败', String(e));
        $done();
    }
}

main();
