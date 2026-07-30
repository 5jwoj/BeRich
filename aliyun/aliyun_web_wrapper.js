/*
阿里云社区任务脚本 - Quantumult X 专用包装器 (v8.0 作用域隔离修复版)
@Repository: https://github.com/5jwoj/BeRich
@Description: 
  1. 缓存并注入完整版 Cheerio.js (352KB)
  2. 劫持 Env 避免二次下载 404 链接
  3. 使用 new Function 隔离作用域，彻底解决 userCookie 重复变量声明冲突
  4. 显式调用 $done() 完成脚本任务闭环
*/

const CHEERIO_URLS = [
    'https://raw.githubusercontent.com/5jwoj/BeRich/refs/heads/main/aliyun/cheerio.js',
    'https://raw.githubusercontent.com/5jwoj/BeRich/main/aliyun/cheerio.js',
    'https://cdn.jsdelivr.net/gh/Yuheng0101/X@main/Utils/cheerio.js',
    'https://raw.githubusercontent.com/Yuheng0101/X/main/Utils/cheerio.js'
];

const MAIN_SCRIPT_URL = 'https://raw.githubusercontent.com/leiyiyan/resource/main/script/aliyun_web/aliyun_web.js';

// v8 缓存 Key
const CACHE_KEY = '5jwoj_cheerio_code_v8';

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
        eval(cheerioCode);
        if (typeof createCheerio !== 'function') throw new Error('未找到 createCheerio 函数');
        const cheerioInstance = createCheerio();
        if (!cheerioInstance || typeof cheerioInstance.load !== 'function') throw new Error('createCheerio() 初始化失败');

        globalThis.Cheerio = cheerioInstance;
        globalThis.cheerio = cheerioInstance;
        if (typeof self !== 'undefined') {
            self.Cheerio = cheerioInstance;
            self.cheerio = cheerioInstance;
        }

        function patchEnvInstance(inst) {
            inst.Cheerio = cheerioInstance;
            inst.cheerio = cheerioInstance;
            inst.initCheerio = function() {
                console.log('⚡ [成功拦截] 阻止 $.initCheerio() 二次下载 404 链接');
                this.Cheerio = cheerioInstance;
                this.cheerio = cheerioInstance;
                return Promise.resolve(cheerioInstance);
            };
        }

        const CurrentEnv = globalThis.Env || (typeof Env !== 'undefined' ? Env : null);

        if (CurrentEnv) {
            if (CurrentEnv.prototype) {
                CurrentEnv.prototype.Cheerio = cheerioInstance;
                CurrentEnv.prototype.cheerio = cheerioInstance;
                CurrentEnv.prototype.initCheerio = function() {
                    console.log('⚡ [成功拦截] 阻止 Env.prototype.initCheerio 二次下载');
                    this.Cheerio = cheerioInstance;
                    this.cheerio = cheerioInstance;
                    return Promise.resolve(cheerioInstance);
                };
            }

            function ProxyEnv(name, opts) {
                const inst = new CurrentEnv(name, opts);
                patchEnvInstance(inst);
                return inst;
            }
            ProxyEnv.prototype = CurrentEnv.prototype;
            globalThis.Env = ProxyEnv;
        }

        console.log('✅ Cheerio 模块及 Env 拦截器成功注入！');
        return true;
    } catch (e) {
        console.log(`❌ Cheerio 注入失败: ${e}`);
        return false;
    }
}

async function runWrapper() {
    console.log('🚀 [5jwoj/BeRich] 阿里云社区任务启动 v8.0...');
    console.log('═'.repeat(45));

    const _chkCk = $prefs.valueForKey('aliyunWeb_data');
    if (!_chkCk) {
        console.log('⚠️ 提醒：当前未检测到 aliyunWeb_data (Cookie)，请确保已在 QX / BoxJs 中配置。');
    }

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
        
        // 使用 new Function 提供完全干净独立的局部作用域，避免与外层变量(如 userCookie)同名冲突
        const runMain = new Function(mainScript + '\nif (typeof main === "function") { return main(); }');
        const res = runMain();
        if (res && typeof res.then === 'function') {
            await res;
        }
        
        console.log('═'.repeat(45));
        console.log('🎉 阿里云社区任务全部执行完成！');
    } catch (e) {
        console.log(`❌ 主脚本运行出错: ${e}`);
        $notify('阿里云社区', '❌ 主脚本运行出错', String(e));
    } finally {
        $done();
    }
}

runWrapper();
