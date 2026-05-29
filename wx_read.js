/*
 * 微信阅读自动脚本 - Quantumult X 版
 *
 * 功能：
 * 1. 自动抓取凭证：微信中打开阅读链接时，自动拦截抓取 `udtauth40`，无需手动抓包，支持自动合并多账号。
 * 2. 自动阅读：两步奖励领取流程，模拟真人阅读停留，支持双重随机延迟（篇章内 + 篇章间），降低风控风险。
 * 3. 链接重试：阅读链接失效时自动重试获取新链接（最多3次）。
 * 4. 自动提现：账户余额达到提现阈值（0.3元）时，自动取整并发起微信提现。
 * 5. 风控保护：遇到超时/链接失效等失败情况自动记录今日失败，后续运行将自动跳过，保护账号安全。
 *
 * Version: v1.0.1
 * Author: Antigravity
 */

// ====================================================
// Quantumult X 配置说明：
//
// [rewrite_local]
// # 微信阅读 Cookie 自动捕获
// ^https?:\/\/m\.7jvcsjirb\.cn\/ url script-request-header https://raw.githubusercontent.com/5jwoj/BeRich/main/wx_read.js
//
// [task_local]
// # 微信自动阅读定时任务（例如每30分钟运行一次，可自行调整）
// */30 8-22 * * * https://raw.githubusercontent.com/5jwoj/BeRich/main/wx_read.js, tag=微信自动阅读, enabled=true
//
// [mitm]
// hostname = m.7jvcsjirb.cn
// ====================================================

const SCRIPT_TAG = "[微信阅读]";
const HOST = "m.7jvcsjirb.cn";
const REFERER = "http://klld0501105119.eos-shanghai-1.cmecloud.cn/";
const WITHDRAW_THRESHOLD_YUAN = 0.3; // 提现阈值（元）
const MAX_LINK_RETRIES = 3;          // 链接失效重试次数

// 随机 User-Agent 列表
const USER_AGENTS = [
  "Mozilla/5.0 (Linux; Android 15; RMX3700 Build/AP3A.240617.008; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.178 Mobile Safari/537.36 XWEB/1460093 MMWEBSDK/20260502 MMWEBID/2854 REV/4cb416278fee580afddaa1deee63e57ec09535ab MicroMessenger/8.0.72.3100(0x28004839) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64",
  "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/145.0.7680.178 Mobile Safari/537.36 XWEB/1450093 MMWEBSDK/20260429 MMWEBID/1234 MicroMessenger/8.0.70(0x28004635) WeChat/arm64 NetType/WIFI Language/zh_CN"
];

// ====================================================
// 入口分支判断
// ====================================================
if (typeof $request !== "undefined") {
  captureCookie();
} else {
  main().catch((e) => {
    console.log(`${SCRIPT_TAG} 脚本异常终止: ${e}`);
    $done({});
  });
}

// ====================================================
// ① 自动抓取 Cookie (Rewrite 模式)
// ====================================================
function captureCookie() {
  try {
    const headers = $request.headers || {};
    // 兼容大小写
    const udtauth40 = headers["udtauth40"] || headers["UdtAuth40"] || headers["udtauth"] || "";

    if (!udtauth40 || udtauth40.length < 10) {
      $done({});
      return;
    }

    console.log(`${SCRIPT_TAG} [捕获] 检测到凭证 udtauth40: ${udtauth40.substring(0, 15)}...`);

    const raw = $prefs.valueForKey("wxyd1") || "";
    let accounts = [];
    if (raw.trim()) {
      accounts = raw.split("&").filter(Boolean).map(part => {
        const fields = part.split("#");
        return {
          token: fields[0] ? fields[0].trim() : "",
          name: fields[1] ? fields[1].trim() : ""
        };
      }).filter(a => a.token);
    }

    // 检查是否已存在此凭证
    const index = accounts.findIndex(a => a.token === udtauth40);
    if (index === -1) {
      // 新增账号
      const newName = `账号${accounts.length + 1}`;
      accounts.push({ token: udtauth40, name: newName });
      
      const serialized = accounts.map(a => `${a.token}#${a.name}`).join("&");
      $prefs.setValueForKey(serialized, "wxyd1");
      
      console.log(`${SCRIPT_TAG} [捕获] 新账号已保存: ${newName}`);
      $notify(
        "微信阅读 凭证捕获 ✅",
        `成功添加 [${newName}]`,
        "定时任务运行时将自动执行阅读与提现，一IP多号请注意风险！"
      );
    } else {
      console.log(`${SCRIPT_TAG} [捕获] 该账号凭证已存在于列表中，无需重复保存`);
    }
  } catch (e) {
    console.log(`${SCRIPT_TAG} 捕获凭证过程出错: ${e}`);
  }
  $done({});
}

// ====================================================
// ② 定时阅读逻辑 (Task 模式)
// ====================================================
async function main() {
  const raw = $prefs.valueForKey("wxyd1") || "";
  if (!raw.trim()) {
    console.log(`${SCRIPT_TAG} 未找到有效账号，请先在微信中打开阅读链接捕获凭证，或在 BoxJS 中配置变量 wxyd1`);
    $notify("微信阅读 ⚠️", "未找到有效凭证", "请先在微信中打开阅读页面进行自动抓包");
    $done({});
    return;
  }

  const accounts = raw.split("&").filter(Boolean).map((part, idx) => {
    const fields = part.split("#");
    return {
      token: fields[0] ? fields[0].trim() : "",
      name: fields[1] ? fields[1].trim() : `账号${idx + 1}`
    };
  }).filter(a => a.token);

  console.log(`${SCRIPT_TAG} 共加载 ${accounts.length} 个账号`);
  let summary = "";

  for (let i = 0; i < accounts.length; i++) {
    const { token, name } = accounts[i];
    
    if (isAccountFailedToday(token)) {
      console.log(`\n⏭️ 跳过账号 [${name}]：今日已记录失败，不再重试`);
      summary += `\n👤 [${name}]: ⏭️ 今日已记录失败，跳过`;
      continue;
    }

    console.log(`\n========== 开始处理账号: [${name}] ==========`);
    let accountLog = `👤 [${name}]\n`;
    const ua = getRandomUA();

    // 1. 获取初始用户信息
    const userInfo = await getUserInfo(token, ua);
    if (!userInfo) {
      accountLog += "❌ 获取用户信息失败\n";
      console.log(accountLog);
      markAccountFailed(token);
      summary += `\n${accountLog}`;
      continue;
    }

    let balance = userInfo.score;
    let rest = userInfo.rest;
    console.log(`💰 当前余额: ${balance.toFixed(2)} 元 | 📖 剩余可读次数: ${rest}`);

    if (rest <= 0) {
      accountLog += `💰 余额: ${balance.toFixed(2)} 元 | ⚠️ 今日无可读篇数，跳过`;
      console.log(accountLog);
      summary += `\n${accountLog}`;
      continue;
    }

    // 2. 开始循环阅读
    let successCount = 0;
    let stopDueToBan = false;

    while (rest > 0) {
      // 篇章间随机延迟 3 到 15 秒
      const interDelay = Math.floor(Math.random() * 13) + 3;
      console.log(`⏰ 篇章间延迟 ${interDelay} 秒后开始第 ${successCount + 1} 次阅读...`);
      await sleep(interDelay * 1000);

      const isReadOk = await doOneRead(token, ua);
      if (isReadOk) {
        successCount++;
        console.log(`✅ 第 ${successCount} 次阅读成功`);
        
        // 每次阅读成功后，立即获取最新余额与剩余次数（兼容动态刷新下一轮）
        const freshInfo = await getUserInfo(token, ua);
        if (freshInfo) {
          balance = freshInfo.score;
          rest = freshInfo.rest;
          console.log(`📊 实时统计: 成功阅读 ${successCount} 篇，最新余额: ${balance.toFixed(2)} 元，剩余可读次数: ${rest}`);
        } else {
          // 若获取异常，自动扣减 rest 以防死循环
          rest--;
        }
      } else {
        console.log(`❌ 第 ${successCount + 1} 次阅读失败，终止该账号本日阅读`);
        markAccountFailed(token);
        stopDueToBan = true;
        break;
      }
    }

    accountLog += `✨ 本次成功阅读: ${successCount} 篇`;
    if (stopDueToBan) {
      accountLog += " ⚠️ (检测到风控或失败提前终止)";
    }

    // 3. 获取最终余额并提现
    // 稍微等待 2 秒确保最后一次收益完全入账
    await sleep(2000);
    const finalInfo = await getUserInfo(token, ua);
    if (finalInfo) {
      const finalBalance = finalInfo.score;
      accountLog += `\n💰 最终余额: ${finalBalance.toFixed(2)} 元`;
      
      if (finalBalance >= WITHDRAW_THRESHOLD_YUAN) {
        console.log(`💸 达到提现门槛 ${WITHDRAW_THRESHOLD_YUAN} 元，开始自动提现...`);
        const withdrawResult = await withdraw(token, finalBalance, ua);
        accountLog += `\n💸 提现结果: ${withdrawResult}`;
      } else {
        accountLog += `\n💸 提现结果: 余额未满 ${WITHDRAW_THRESHOLD_YUAN} 元，不发起提现`;
      }
    } else {
      accountLog += "\n❌ 获取最终余额失败";
    }

    console.log(`\n[${name}] 处理完毕`);
    console.log(accountLog);
    summary += `\n${accountLog}\n`;

    // 账号间防关联延迟 5 秒
    if (i < accounts.length - 1) {
      await sleep(5000);
    }
  }

  // 4. 发送全局汇总通知
  console.log("\n========== 微信自动阅读运行汇总 ==========");
  console.log(summary.trim());
  $notify("微信阅读 运行报告 📝", `共处理 ${accounts.length} 个账号`, summary.trim());
  $done({});
}

// ====================================================
// ③ 核心业务 API 函数
// ====================================================

/**
 * 获取用户信息
 */
async function getUserInfo(udtauth40, ua) {
  const urlParam = "%3Fmoy%3Dcuk%26sd7%3Dkax%26upuid%3D7808401";
  const url = `https://${HOST}/tuijian?url=${urlParam}&url2=http%3A%2F%2Fklld0501105119.eos-shanghai-1.cmecloud.cn%2Findex.html&upuid=7808401`;
  const headers = {
    "Host": HOST,
    "X-Requested-With": "XMLHttpRequest",
    "User-Agent": ua,
    "Accept": "application/json, text/plain, */*",
    "udtauth40": udtauth40,
    "Referer": REFERER,
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": "\"Android\""
  };

  try {
    const res = await httpGet(url, headers);
    if (!res.body) return null;
    const data = JSON.parse(res.body);
    if (data && data.code === 0) {
      const user = data.data.user;
      const infoView = data.data.infoView;
      return {
        real_upuid: user.upuid,
        score: parseFloat(user.score) / 100, // 分转元
        rest: parseInt(infoView.rest || 0)
      };
    } else {
      console.log(`${SCRIPT_TAG} getUserInfo 接口返回错误: ${JSON.stringify(data)}`);
      return null;
    }
  } catch (e) {
    console.log(`${SCRIPT_TAG} getUserInfo 异常: ${e}`);
    return null;
  }
}

/**
 * 获取微信跳转链接 sc_url
 */
async function getArticleScUrl(udtauth40, ua) {
  const url = `https://${HOST}/new/bbbbb`;
  const headers = {
    "Host": HOST,
    "X-Requested-With": "XMLHttpRequest",
    "User-Agent": ua,
    "Accept": "application/json, text/plain, */*",
    "udtauth40": udtauth40,
    "Referer": REFERER,
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": "\"Android\""
  };

  try {
    const res = await httpGet(url, headers);
    if (!res.body) return null;
    const data = JSON.parse(res.body);
    if (data && data.sc_url) {
      return data.sc_url;
    } else {
      console.log(`${SCRIPT_TAG} getArticleScUrl 接口返回缺失 sc_url: ${JSON.stringify(data)}`);
      return null;
    }
  } catch (e) {
    console.log(`${SCRIPT_TAG} getArticleScUrl 异常: ${e}`);
    return null;
  }
}

/**
 * 两步领取奖励
 */
async function claimReward(udtauth40, z_param, article_host, ua) {
  const baseUrl = `https://${HOST}/dodoaa/mmaa`;
  const headers = {
    "Host": HOST,
    "User-Agent": ua,
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "*/*",
    "Origin": `http://${article_host}`,
    "Referer": `http://${article_host}/`,
    "udtauth40": udtauth40,
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": "\"Android\""
  };

  try {
    // 第一次请求：获取 jkey
    const r1 = randomNumberStr();
    const url1 = `${baseUrl}?z=${z_param}&pageshow=&r=${r1}`;
    console.log(`${SCRIPT_TAG} 正在发送第一步阅读请求...`);
    
    const res1 = await httpGet(url1, headers);
    if (!res1.body) return false;
    
    const data1 = JSON.parse(res1.body);
    if (data1.url && data1.url.includes("/error.html")) {
      return "link_invalid";
    }
    
    const jkey = data1.jkey;
    if (!jkey) {
      console.log(`${SCRIPT_TAG} 未能从第一步响应中提取 jkey: ${res1.body}`);
      return false;
    }

    // 模拟阅读停留：随机延迟 5 到 20 秒
    const readWait = Math.floor(Math.random() * 16) + 5;
    console.log(`⏳ 模拟阅读，在页面停留 ${readWait} 秒...`);
    await sleep(readWait * 1000);

    // 第二次请求：携带 jkey 领奖
    const r2 = randomNumberStr();
    const url2 = `${baseUrl}?z=${z_param}&pageshow=&r=${r2}&jkey=${jkey}`;
    console.log(`${SCRIPT_TAG} 正在发送第二步领奖请求...`);

    const res2 = await httpGet(url2, headers);
    if (!res2.body) return false;
    
    const data2 = JSON.parse(res2.body);
    if (data2.success_msg) {
      console.log(`✅ 接口反馈: ${data2.success_msg}`);
      return true;
    } else {
      console.log(`${SCRIPT_TAG} 领奖失败: ${res2.body}`);
      return false;
    }
  } catch (e) {
    console.log(`${SCRIPT_TAG} claimReward 发生异常: ${e}`);
    return false;
  }
}

/**
 * 执行一次完整阅读流程（带链接重试）
 */
async function doOneRead(udtauth40, ua) {
  for (let retry = 0; retry < MAX_LINK_RETRIES; retry++) {
    const scUrl = await getArticleScUrl(udtauth40, ua);
    if (!scUrl) return false;
    console.log(`🔗 获取到跳转链接 sc_url: ${scUrl}`);

    const realUrl = extractRealArticleUrl(scUrl);
    if (!realUrl) return false;
    console.log(`📄 真实文章链接: ${realUrl}`);

    const zParam = getQueryParam(realUrl, "z");
    if (!zParam) {
      console.log(`${SCRIPT_TAG} 真实文章链接中缺少 z 参数`);
      return false;
    }

    const articleHost = getHost(realUrl);
    if (!articleHost) {
      console.log(`${SCRIPT_TAG} 无法提取真实文章域名`);
      return false;
    }

    const result = await claimReward(udtauth40, zParam, articleHost, ua);
    if (result === true) {
      return true;
    } else if (result === "link_invalid") {
      console.log(`⚠️ 链接失效，正在进行第 ${retry + 1}/${MAX_LINK_RETRIES} 次重试...`);
      await sleep(3000);
      continue;
    } else {
      return false;
    }
  }
  
  console.log(`❌ 重试了 ${MAX_LINK_RETRIES} 次依然失败`);
  return false;
}

/**
 * 自动提现（金额向下取整到角，单位：分）
 */
async function withdraw(udtauth40, balanceYuan, ua) {
  const withdrawAmountFen = Math.floor(balanceYuan * 10) * 10;
  if (withdrawAmountFen <= 0) {
    return "金额不足 0.1 元，无法提现";
  }

  const url = `https://${HOST}/withdrawal/doWithdraw`;
  const headers = {
    "Host": HOST,
    "X-Requested-With": "XMLHttpRequest",
    "User-Agent": ua,
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/x-www-form-urlencoded",
    "udtauth40": udtauth40,
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": "\"Android\"",
    "Origin": REFERER.replace(/\/$/, ""),
    "Referer": REFERER
  };
  const body = `amount=${withdrawAmountFen}&type=wx`;

  try {
    const res = await httpPost(url, headers, body);
    if (!res.body) return "提现返回包为空";
    
    let bodyText = res.body.trim();
    if (bodyText.includes("<pre>") && bodyText.includes("</pre>")) {
      bodyText = bodyText.split("</pre>").pop().trim();
    }
    
    const result = JSON.parse(bodyText);
    if (result && result.code === 0) {
      const withdrawYuan = withdrawAmountFen / 100;
      console.log(`✅ 提现成功！提现金额: ${withdrawYuan.toFixed(2)} 元`);
      return `提现成功 ${withdrawYuan.toFixed(2)} 元`;
    } else {
      return `提现失败: ${result.msg || "未知错误"}`;
    }
  } catch (e) {
    return `提现异常: ${e}`;
  }
}

// ====================================================
// ④ 辅助与底层工具函数
// ====================================================

/**
 * 获取随机 User-Agent
 */
function getRandomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * 生成 17 位随机小数的字符串（用作请求中的 r 参数）
 */
function randomNumberStr() {
  let digits = "";
  for (let i = 0; i < 17; i++) {
    digits += Math.floor(Math.random() * 10);
  }
  return "0." + digits;
}

/**
 * 获取链接中的 Query 参数值
 */
function getQueryParam(url, name) {
  const regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)");
  const results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return "";
  return decodeURIComponent(results[2].replace(/\+/g, " "));
}

/**
 * 从 sc_url 解析真实文章链接
 */
function extractRealArticleUrl(scUrl) {
  const query = getQueryParam(scUrl, "query");
  if (!query) {
    console.log(`${SCRIPT_TAG} sc_url 中找不到 query 参数`);
    return null;
  }
  let decoded = query;
  if (decoded.indexOf("httP://") === 0) {
    decoded = decoded.replace("httP://", "http://");
  }
  return decoded;
}

/**
 * 从 URL 中解析 Host
 */
function getHost(url) {
  const match = url.match(/^https?:\/\/([^/?#]+)(?:[/?#]|$)/i);
  return match ? match[1] : null;
}

/**
 * 获取今日的 YYYY-MM-DD 字符串
 */
function getTodayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 账号失败管理 (基于 $prefs 存储)
 */
function isAccountFailedToday(token) {
  try {
    const raw = $prefs.valueForKey("wxyd_failed_accounts");
    if (!raw) return false;
    const failed = JSON.parse(raw);
    const today = getTodayStr();
    return failed[token] === today;
  } catch (e) {
    return false;
  }
}

function markAccountFailed(token) {
  try {
    const raw = $prefs.valueForKey("wxyd_failed_accounts");
    let failed = {};
    if (raw) {
      try { failed = JSON.parse(raw); } catch(e) {}
    }
    const today = getTodayStr();
    failed[token] = today;
    
    // 清理非今日的失败记录，保持存储整洁
    for (const key in failed) {
      if (failed[key] !== today) {
        delete failed[key];
      }
    }
    
    $prefs.setValueForKey(JSON.stringify(failed), "wxyd_failed_accounts");
    console.log(`${SCRIPT_TAG} 已记录当前账号今日失败，后续运行将自动跳过`);
  } catch (e) {
    console.log(`${SCRIPT_TAG} markAccountFailed 记录出错: ${e}`);
  }
}

/**
 * 延迟等待 Promise
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Quantumult X HTTP 底层适配请求器
 */
function httpRequest(options) {
  return new Promise((resolve, reject) => {
    $task.fetch(options).then(
      (res) => resolve(res),
      (err) => reject(err.error || err)
    );
  });
}

function httpGet(url, headers) {
  return httpRequest({
    url,
    method: "GET",
    headers
  });
}

function httpPost(url, headers, body) {
  return httpRequest({
    url,
    method: "POST",
    headers,
    body
  });
}
