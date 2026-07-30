/*
阿里云社区任务脚本 - Quantumult X 专用包装器 (v4.0 容错修复版)
@Repository: https://github.com/5jwoj/BeRich
*/

const CHEERIO_URLS = [
    // 优先级 1: 5jwoj 仓库
    'https://raw.githubusercontent.com/5jwoj/BeRich/refs/heads/main/aliyun/cheerio.js',
    'https://raw.githubusercontent.com/5jwoj/BeRich/main/aliyun/cheerio.js',
    // 优先级 2: 完整原版 CDN 镜像 (96KB 完整未截断版)
    'https://cdn.jsdelivr.net/gh/Yuheng0101/X@main/Utils/cheerio.js',
    'https://raw.githubusercontent.com/Yuheng0101/X/main/Utils/cheerio.js'
];

const MAIN_SCRIPT_URL = 'https://raw.githubusercontent.com/leiyiyan/resource/main/script/aliyun_web/aliyun_web.js';

// v4 强刷新 Key
const CACHE_KEY = '5jwoj_cheerio_code_v4';

function httpGet(url, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(`超时 (${timeout}ms)`), timeout);
        $task.fetch({ url: url }).then(
            response => {
                clearTimeout(timer);
                if (response.statusCode === 200 && response.body && response.body.length > 5000) {
                    resolve(response.body);
                } else {
                    reject(`HTTP ${response.statusCode}, 长度: ${response.body?.length || 0}`);
                }
            },
            reason => { clearTimeout(timer); reject(reason.error || reason); }
        );
    });
}

async function getCheerioCode() {
    // 1. 本地缓存检查 (必须大于 80000 字节才是完整版)
    let code = $prefs.valueForKey(CACHE_KEY);
    if (code && code.length > 80000) {
        console.log(`✅ 使用本地缓存的完整 Cheerio (${code.length} 字节)`);
        return code;
    }

    // 2. 从候选列表依次下载，确保文件完整 (> 80000 字节)
    console.log('📥 正在获取完整版 cheerio.js (需约 96KB)...');
    for (const url of CHEERIO_URLS) {
        try {
            console.log(`🔄 尝试下载: ${url}`);
            code = await httpGet(url, 25000);
            
            // 校验文件完整性: 必须包含 createCheerio 且大小 > 80000 字节
            if (code && code.includes('createCheerio') && code.length > 80000) {
                console.log(`✅ 下载成功！文件完整 (${code.length} 字节)，写入本地缓存`);
                $prefs.setValueForKey(code, CACHE_KEY);
                return code;
            } else if (code) {
                console.log(`⚠️ 文件不完整 (仅 ${code.length} 字节)，跳过此源`);
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
    console.log('🚀 [5jwoj/BeRich] 阿里云社区任务启动 v4.0...');
    console.log('═'.repeat(45));

    const cheerioCode = await getCheerioCode();
    if (!cheerioCode) {
        console.log('❌ 无法获取完整的 cheerio.js');
        $notify('阿里云社区', '❌ Cheerio 加载失败', '请检查网络或代理');
        $done(); return;
    }

    if (!injectCheerio(cheerioCode)) {
        $notify('阿里云社区', '❌ Cheerio 注入失败', '初始化 createCheerio() 失败');
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
