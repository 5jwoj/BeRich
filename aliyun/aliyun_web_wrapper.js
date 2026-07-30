/*
阿里云社区任务脚本 - Quantumult X 专用包装器 (v10.0 任务/抓包双模全能版)
@Repository: https://github.com/5jwoj/BeRich
@Description: 
  1. 支持 Cron 定时任务与 HTTP Rewrite 抓包双重模式
  2. 预加载 352KB 完整版 Cheerio
  3. 兼容 BoxJs 及 $prefs 的 aliyunWeb_data Key 检查与打印
*/

const CHEERIO_URLS = [
    'https://raw.githubusercontent.com/5jwoj/BeRich/refs/heads/main/aliyun/cheerio.js',
    'https://raw.githubusercontent.com/5jwoj/BeRich/main/aliyun/cheerio.js',
    'https://cdn.jsdelivr.net/gh/Yuheng0101/X@main/Utils/cheerio.js',
    'https://raw.githubusercontent.com/Yuheng0101/X/main/Utils/cheerio.js'
];

const MAIN_SCRIPT_URL = 'https://raw.githubusercontent.com/leiyiyan/resource/main/script/aliyun_web/aliyun_web.js';

// v10 缓存 Key
const CACHE_KEY = '5jwoj_cheerio_code_v10';

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
    if (code && code.length > 30000 && code.includes('createCheerio')) {
        console.log(`✅ 使用本地缓存的完整 Cheerio (${code.length} 字节)`);
        return code;
    }

    console.log('📥 正在获取完整版 cheerio.js...');
    for (const url of CHEERIO_URLS) {
        try {
            code = await httpGet(url, 25000);
            if (code && code.includes('createCheerio') && code.length > 30000) {
                console.log(`✅ 下载成功！文件完整 (${code.length} 字节)，写入本地缓存`);
                $prefs.setValueForKey(code, CACHE_KEY);
                return code;
            }
        } catch (e) {
            console.log(`⚠️ 下载失败 [${url}]: ${e}`);
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

        globalThis.loadCheerio = function() {
            console.log('⚡ [拦截成功] 返回预载完成的 Cheerio 模块');
            return Promise.resolve(cheerioInstance);
        };

        function patchEnvInstance(inst) {
            inst.Cheerio = cheerioInstance;
            inst.cheerio = cheerioInstance;
            inst.initCheerio = function() {
                this.Cheerio = cheerioInstance;
                return Promise.resolve(cheerioInstance);
            };
            inst.loadCheerio = function() {
                this.Cheerio = cheerioInstance;
                return Promise.resolve(cheerioInstance);
            };
        }

        const CurrentEnv = globalThis.Env || (typeof Env !== 'undefined' ? Env : null);

        if (CurrentEnv) {
            if (CurrentEnv.prototype) {
                CurrentEnv.prototype.Cheerio = cheerioInstance;
                CurrentEnv.prototype.cheerio = cheerioInstance;
                CurrentEnv.prototype.initCheerio = function() {
                    this.Cheerio = cheerioInstance;
                    return Promise.resolve(cheerioInstance);
                };
                CurrentEnv.prototype.loadCheerio = function() {
                    this.Cheerio = cheerioInstance;
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

        console.log('✅ Cheerio 模块及环境拦截补丁注入成功！');
        return true;
    } catch (e) {
        console.log(`❌ Cheerio 注入失败: ${e}`);
        return false;
    }
}

async function start() {
    // 判别模式：如果是 Rewrite 抓包触发（存在 $request 或 $response），直接运行主脚本抓包逻辑
    const isRewrite = (typeof $request !== 'undefined') || (typeof $response !== 'undefined');

    if (isRewrite) {
        console.log('🌐 [抓包模式] 检测到阿里云 API 请求，正在抓取/更新 Cookie...');
        try {
            const mainScript = await httpGet(MAIN_SCRIPT_URL, 30000);
            eval(mainScript);
        } catch (e) {
            console.log(`❌ 抓包脚本运行失败: ${e}`);
        } finally {
            $done({});
        }
        return;
    }

    // 定时任务 / 手动运行模式
    console.log('🚀 [5jwoj/BeRich] 阿里云社区任务启动 v10.0...');
    console.log('═'.repeat(45));

    // 尝试多种可能的 Key 并自动转换 QX 抓包格式
    let rawCk = $prefs.valueForKey('aliyunWeb_data') || $prefs.valueForKey('aliyunWeb_Cookie');
    
    function normalizeCookie(raw) {
        if (!raw) return '';
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                console.log(`💡 检测到 QX JSON 格式的 Cookie 数组 (含 ${parsed.length} 个账号)，正在自动解析提纯...`);
                const tokens = parsed.map(item => (typeof item === 'object' && item) ? (item.token || item.cookie || item.Cookie || String(item)) : String(item));
                return tokens.filter(Boolean).join('@');
            } else if (typeof parsed === 'object' && parsed) {
                return parsed.token || parsed.cookie || parsed.Cookie || raw;
            }
        } catch (e) {}
        return raw;
    }

    const cleanCk = normalizeCookie(rawCk);

    if (!cleanCk) {
        console.log('⚠️ 【重要提示】在 QX 本地存储 ($prefs) 中未读到有效的 aliyunWeb_data！');
        console.log('💡 请打开【阿里云 APP】 -> 【积分商城】进行抓包，或在 BoxJs 中配置并保存 Cookie。');
        $notify('阿里云社区', '⚠️ 未检测到 Cookie (aliyunWeb_data)', '请先打开阿里云 APP -> 积分商城 抓取 Cookie');
    } else {
        console.log(`✅ 已成功解析并准备 Cookie (提纯后长度: ${cleanCk.length} 字符)`);
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

    // 拦截与修复 Env.prototype.getdata 以返回提纯后的 Cookie
    const CurrentEnv = globalThis.Env;
    if (CurrentEnv && CurrentEnv.prototype) {
        const origGetdata = CurrentEnv.prototype.getdata;
        CurrentEnv.prototype.getdata = function(key) {
            if (key === 'aliyunWeb_data' || key === 'aliyunWeb_Cookie') {
                return cleanCk || origGetdata.call(this, key);
            }
            return origGetdata.call(this, key);
        };
    }

    console.log('📥 正在下载阿里云社区主脚本...');
    try {
        const mainScript = await httpGet(MAIN_SCRIPT_URL, 30000);
        console.log(`✅ 主脚本获取成功 (${mainScript.length} 字节)`);
        console.log('═'.repeat(45));
        console.log('▶️ 开始执行主脚本...');
        
        // 直接 eval 执行主脚本（其底部 IIFE 会自动触发 checkEnv 及 main 运行）
        eval(mainScript);
        
        console.log('═'.repeat(45));
        console.log('🎉 阿里云社区任务全部执行完成！');
    } catch (e) {
        console.log(`❌ 主脚本运行出错: ${e}`);
        $notify('阿里云社区', '❌ 主脚本运行出错', String(e));
    } finally {
        $done();
    }
}

start();
