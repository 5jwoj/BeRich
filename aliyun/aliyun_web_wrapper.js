/*
阿里云社区任务脚本 - Quantumult X 专用包装器 (v5.0 终极拦截版)
@Repository: https://github.com/5jwoj/BeRich
@Description: 
  1. 下载完整版 cheerio.js 并缓存
  2. 注入 cheerio 到全局
  3. 彻底拦截 Env.prototype.initCheerio，阻止原始脚本再次发起 404 下载
*/

const CHEERIO_URLS = [
    'https://raw.githubusercontent.com/5jwoj/BeRich/refs/heads/main/aliyun/cheerio.js',
    'https://raw.githubusercontent.com/5jwoj/BeRich/main/aliyun/cheerio.js',
    'https://cdn.jsdelivr.net/gh/Yuheng0101/X@main/Utils/cheerio.js',
    'https://raw.githubusercontent.com/Yuheng0101/X/main/Utils/cheerio.js'
];

const MAIN_SCRIPT_URL = 'https://raw.githubusercontent.com/leiyiyan/resource/main/script/aliyun_web/aliyun_web.js';

// v5 强刷新 Key
const CACHE_KEY = '5jwoj_cheerio_code_v5';

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
    let code = $prefs.valueForKey(CACHE_KEY);
    if (code && code.length > 80000) {
        console.log(`✅ 使用本地缓存的完整 Cheerio (${code.length} 字节)`);
        return code;
    }

    console.log('📥 正在获取完整版 cheerio.js (需约 96KB)...');
    for (const url of CHEERIO_URLS) {
        try {
            console.log(`🔄 尝试下载: ${url}`);
            code = await httpGet(url, 25000);
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

function injectAndLockCheerio(cheerioCode) {
    try {
        eval(cheerioCode);
        if (typeof createCheerio !== 'function') throw new Error('未找到 createCheerio 函数');
        const cheerioInstance = createCheerio();
        if (!cheerioInstance || typeof cheerioInstance.load !== 'function') throw new Error('createCheerio() 初始化失败');

        // 1. 挂载到全局作用域的所有可能名字
        globalThis.Cheerio = cheerioInstance;
        globalThis.cheerio = cheerioInstance;
        if (typeof self !== 'undefined') {
            self.Cheerio = cheerioInstance;
            self.cheerio = cheerioInstance;
        }

        // 辅助：给实例添加 cheerio 和 initCheerio 拦截
        function patchInstance(inst) {
            inst.Cheerio = cheerioInstance;
            inst.cheerio = cheerioInstance;
            inst.initCheerio = function() {
                console.log('⚡ [拦截成功] 阻止主脚本二次下载，直接返回已注入的 Cheerio');
                this.Cheerio = cheerioInstance;
                this.cheerio = cheerioInstance;
                return Promise.resolve(cheerioInstance);
            };
        }

        // 2. 劫持 Env 类，确保只要一创建 Env 实例或调用 initCheerio，都返回已加载的 cheerio
        let _realEnv = globalThis.Env;
        Object.defineProperty(globalThis, 'Env', {
            get() {
                return function(...args) {
                    const inst = _realEnv ? new _realEnv(...args) : {};
                    patchInstance(inst);
                    return inst;
                };
            },
            set(v) {
                _realEnv = v;
                if (_realEnv && _realEnv.prototype) {
                    _realEnv.prototype.initCheerio = function() {
                        console.log('⚡ [拦截成功] 阻止 Env.prototype 二次下载，直接返回已注入的 Cheerio');
                        this.Cheerio = cheerioInstance;
                        this.cheerio = cheerioInstance;
                        return Promise.resolve(cheerioInstance);
                    };
                }
            },
            configurable: true
        });

        console.log('✅ Cheerio 模块及 Env.initCheerio 拦截器成功注入！');
        return true;
    } catch (e) {
        console.log(`❌ Cheerio 注入失败: ${e}`);
        return false;
    }
}

async function main() {
    console.log('🚀 [5jwoj/BeRich] 阿里云社区任务启动 v5.0...');
    console.log('═'.repeat(45));

    const cheerioCode = await getCheerioCode();
    if (!cheerioCode) {
        console.log('❌ 无法获取完整的 cheerio.js');
        $notify('阿里云社区', '❌ Cheerio 加载失败', '请检查网络或代理');
        $done(); return;
    }

    if (!injectAndLockCheerio(cheerioCode)) {
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
