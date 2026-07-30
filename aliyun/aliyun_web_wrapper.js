/*
阿里云社区任务脚本 - Quantumult X 专用包装器 (v6.0 深度拦截版)
@Repository: https://github.com/5jwoj/BeRich
@Description: 
  1. 下载完整版 cheerio.js 并缓存 (96KB)
  2. 深度劫持 QX 环境中的 Env 类与原型链
  3. 强制在 new Env() 实例化时给 $ 挂载 $.Cheerio 并彻底封锁 initCheerio 下载
*/

const CHEERIO_URLS = [
    'https://raw.githubusercontent.com/5jwoj/BeRich/refs/heads/main/aliyun/cheerio.js',
    'https://raw.githubusercontent.com/5jwoj/BeRich/main/aliyun/cheerio.js',
    'https://cdn.jsdelivr.net/gh/Yuheng0101/X@main/Utils/cheerio.js',
    'https://raw.githubusercontent.com/Yuheng0101/X/main/Utils/cheerio.js'
];

const MAIN_SCRIPT_URL = 'https://raw.githubusercontent.com/leiyiyan/resource/main/script/aliyun_web/aliyun_web.js';

// v6 强刷新 Key
const CACHE_KEY = '5jwoj_cheerio_code_v6';

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

function injectAndHijackEnv(cheerioCode) {
    try {
        // 1. 执行 cheerio 代码定义 createCheerio()
        eval(cheerioCode);
        if (typeof createCheerio !== 'function') throw new Error('未找到 createCheerio 函数');
        const cheerioInstance = createCheerio();
        if (!cheerioInstance || typeof cheerioInstance.load !== 'function') throw new Error('createCheerio() 初始化失败');

        // 2. 挂载到全局
        globalThis.Cheerio = cheerioInstance;
        globalThis.cheerio = cheerioInstance;
        if (typeof self !== 'undefined') {
            self.Cheerio = cheerioInstance;
            self.cheerio = cheerioInstance;
        }

        // 辅助补丁函数：确保任何 $ 实例都有 Cheerio
        function patchEnvInstance(inst) {
            inst.Cheerio = cheerioInstance;
            inst.cheerio = cheerioInstance;
            inst.initCheerio = function() {
                console.log('⚡ [成功拦截] 阻止 $.initCheerio() 二次下载 404 链接，直接返回预载 Cheerio');
                this.Cheerio = cheerioInstance;
                this.cheerio = cheerioInstance;
                return Promise.resolve(cheerioInstance);
            };
        }

        // 3. 拦截现有全局 Env 类
        const CurrentEnv = globalThis.Env || (typeof Env !== 'undefined' ? Env : null);

        if (CurrentEnv) {
            // A. 补丁原型链
            if (CurrentEnv.prototype) {
                CurrentEnv.prototype.Cheerio = cheerioInstance;
                CurrentEnv.prototype.cheerio = cheerioInstance;
                CurrentEnv.prototype.initCheerio = function() {
                    console.log('⚡ [成功拦截] 阻止 Env.prototype.initCheerio 二次下载，使用预载 Cheerio');
                    this.Cheerio = cheerioInstance;
                    this.cheerio = cheerioInstance;
                    return Promise.resolve(cheerioInstance);
                };
            }

            // B. 劫持构造函数：当执行 const $ = new Env(...) 时强制挂载 $.Cheerio
            function ProxyEnv(name, opts) {
                const inst = new CurrentEnv(name, opts);
                patchEnvInstance(inst);
                return inst;
            }
            ProxyEnv.prototype = CurrentEnv.prototype;
            globalThis.Env = ProxyEnv;
        }

        console.log('✅ Cheerio 模块及 Env 类劫持补丁注入成功！');
        return true;
    } catch (e) {
        console.log(`❌ Cheerio 注入/劫持失败: ${e}`);
        return false;
    }
}

async function main() {
    console.log('🚀 [5jwoj/BeRich] 阿里云社区任务启动 v6.0...');
    console.log('═'.repeat(45));

    const cheerioCode = await getCheerioCode();
    if (!cheerioCode) {
        console.log('❌ 无法获取完整的 cheerio.js');
        $notify('阿里云社区', '❌ Cheerio 加载失败', '请检查网络或代理');
        $done(); return;
    }

    if (!injectAndHijackEnv(cheerioCode)) {
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
