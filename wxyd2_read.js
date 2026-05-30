/*
 * 微信阅读自动脚本（青龙/Quantumult X版）
 * 
 * 功能：
 * 1. 自动抓取凭证：微信中打开阅读链接或在阅读页面刷新时，自动拦截抓取 `access-token`，支持多账号自动合并。
 * 2. 自动阅读：自动跟随/read/link和has_next接口进行两步阅读，模拟真人阅读停留。
 * 3. 随机点赞：30%概率自动点赞文章，自动跟随微信短链接重定向获取完整文章参数。
 * 4. 自动提现：积分 >= 2000（0.2元）时自动提现，提现金额向下取整到100积分（如2106积分提2100积分）。
 * 5. 上限检测：自动检测小时上限（28篇）和日上限（180篇），达到后自动停止，保护账号。
 *
 * Version: v1.0.0
 * Author: z.W.
 */

// ====================================================
// Quantumult X 配置说明：
//
// [rewrite_local]
// # 微信阅读 Cookie 自动捕获
// ^https?:\/\/oapi\.liyishabiubiu\.cn\/ url script-request-header https://raw.githubusercontent.com/5jwoj/BeRich/main/wxyd2_read.js
//
// [task_local]
// # 微信自动阅读定时任务（例如每30分钟运行一次，可自行调整）
// */30 8-22 * * * https://raw.githubusercontent.com/5jwoj/BeRich/main/wxyd2_read.js, tag=微信自动阅读2, enabled=true
//
// [mitm]
// hostname = oapi.liyishabiubiu.cn
// ====================================================

const SCRIPT_TAG = "[微信阅读2]";
const API_HOST = "oapi.liyishabiubiu.cn";
const READ_SV_HOST = "read-sv.liyishabiubiu.cn";
const YD_H5_HOST = "yd-h5.ayykjza002.cn";

const LIKE_PROBABILITY = 0.3;
const MAX_READS_PER_RUN = 20;
const WITHDRAW_THRESHOLD = 2000;
const WITHDRAW_STEP = 100;

// 随机 User-Agent 列表
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 NetType/WIFI MicroMessenger/7.0.20.1781(0x6700143B) WindowsWechat(0x63090a13) UnifiedPCWindowsWechat(0xf2541923) XWEB/19841",
  "Mozilla/5.0 (Linux; Android 15; RMX3700 Build/AP3A.240617.008; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.178 Mobile Safari/537.36 XWEB/1460093 MMWEBSDK/20260502 MMWEBID/2854 MicroMessenger/8.0.72.3100(0x28004839) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64",
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
    const url = $request.url || "";
    
    // 1. 从请求头提取 access-token
    let token = headers["access-token"] || headers["access_token"] || "";
    
    // 2. 如果请求头没有，尝试从 URL 参数获取 ak
    if (!token && url.includes("ak=")) {
      const akMatch = url.match(/[?&]ak=([^&#]+)/);
      if (akMatch) {
        token = decodeURIComponent(akMatch[1]);
      }
    }

    if (!token || token.length < 10) {
      $done({});
      return;
    }

    console.log(`${SCRIPT_TAG} [捕获] 检测到凭证 token: ${token.substring(0, 15)}...`);

    // 读取已存储的多账号
    const raw = $prefs.valueForKey("wxyd2") || "";
    let accounts = raw.split("&").filter(Boolean).map((part, idx) => {
      const fields = part.split("#");
      return {
        token: fields[0] ? fields[0].trim() : "",
        name: fields[1] ? fields[1].trim() : `账号${idx + 1}`
      };
    }).filter(a => a.token);

    const existIndex = accounts.findIndex(a => a.token === token);
    if (existIndex !== -1) {
      console.log(`${SCRIPT_TAG} [捕获] 账号已存在，无需重复记录`);
    } else {
      const newName = `账号${accounts.length + 1}`;
      accounts.push({ token, name: newName });
      const serialized = accounts.map(a => `${a.token}#${a.name}`).join("&");
      $prefs.setValueForKey(serialized, "wxyd2");
      console.log(`${SCRIPT_TAG} [捕获] 新凭证已追加保存，当前共有 ${accounts.length} 个账号`);
      $notify(
        "微信阅读2 凭证更新 🔄",
        `获取成功: ${newName}`,
        "已自动将其存入多账号列表中！"
      );
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
  const raw = $prefs.valueForKey("wxyd2") || "";
  if (!raw.trim()) {
    console.log(`${SCRIPT_TAG} 未找到有效账号，请先在微信中打开阅读链接捕获凭证`);
    $notify("微信阅读2 ⚠️", "未找到有效凭证", "请先在微信中打开阅读页面进行自动抓包");
    $done({});
    return;
  }

  // 解析账号列表
  let accounts = raw.split("&").filter(Boolean).map((part, idx) => {
    const fields = part.split("#");
    return {
      token: fields[0] ? fields[0].trim() : "",
      name: fields[1] ? fields[1].trim() : `账号${idx + 1}`
    };
  }).filter(a => a.token);

  console.log(`${SCRIPT_TAG} 共加载 ${accounts.length} 个账号`);
  let summary = "";

  for (let i = 0; i < accounts.length; i++) {
    let { token, name } = accounts[i];
    console.log(`\n========== 开始处理账号: [${name}] ==========`);
    let accountLog = `👤 [${name}]\n`;
    const ua = getRandomUA();

    // 1. 登录初始化并可能更新 token
    const freshToken = await quickLogin(token, ua);
    if (!freshToken) {
      accountLog += "❌ 登录失败，跳过该账号\n";
      console.log(accountLog);
      summary += `\n${accountLog}`;
      continue;
    }
    if (freshToken !== token) {
      console.log(`${SCRIPT_TAG} token 已刷新: ${freshToken.substring(0, 10)}...`);
      token = freshToken;
      // 同步更新存储中的账号 token
      accounts[i].token = token;
      const serialized = accounts.map(a => `${a.token}#${a.name}`).join("&");
      $prefs.setValueForKey(serialized, "wxyd2");
    }

    // 2. 获取初始用户信息
    const user = await getUserProfile(token, ua);
    if (!user) {
      accountLog += "❌ 获取用户信息失败，跳过该账号\n";
      console.log(accountLog);
      summary += `\n${accountLog}`;
      continue;
    }
    
    // 如果返回了真实的昵称，同步更新
    if (user.nickname && user.nickname !== name) {
      name = user.nickname;
      accounts[i].name = name;
      const serialized = accounts.map(a => `${a.token}#${a.name}`).join("&");
      $prefs.setValueForKey(serialized, "wxyd2");
    }

    console.log(`💰 当前积分: ${user.balance} (${user.balance_yuan.toFixed(4)} 元)`);

    // 3. 获取阅读进度
    const readInfo = await getTodayReadInfo(token, ua);
    if (!readInfo) {
      accountLog += "❌ 获取阅读进度失败，跳过该账号\n";
      console.log(accountLog);
      summary += `\n${accountLog}`;
      continue;
    }

    console.log(`📖 今日已读: ${readInfo.today_count} / ${readInfo.total_count}`);
    console.log(`⏰ 当前小时已读: ${readInfo.hour_current_count} / ${readInfo.hour_max_count}`);

    if (readInfo.read_status !== "valid") {
      accountLog += `⚠️ 阅读状态异常: ${readInfo.read_status_text || "未知"}\n`;
      console.log(accountLog);
      summary += `\n${accountLog}`;
      continue;
    }

    if (readInfo.today_count >= readInfo.total_count) {
      accountLog += "⚠️ 今日已达到总上限，跳过\n";
      console.log(accountLog);
      summary += `\n${accountLog}`;
      continue;
    }

    if (readInfo.hour_current_count >= readInfo.hour_max_count) {
      accountLog += `⚠️ 已达到小时上限: ${readInfo.read_status_text || "等待"}\n`;
      console.log(accountLog);
      summary += `\n${accountLog}`;
      continue;
    }

    const remainingToday = readInfo.total_count - readInfo.today_count;
    const remainingHour = readInfo.hour_max_count - readInfo.hour_current_count;
    const maxReads = Math.min(remainingToday, remainingHour, MAX_READS_PER_RUN);
    console.log(`💡 预计本次可读次数: ${maxReads}`);

    let successCount = 0;
    for (let index = 1; index <= maxReads; index++) {
      const delay = Math.floor(Math.random() * 5) + 3; // 随机 3~7 秒
      console.log(`⏰ ${delay} 秒后开始第 ${index} 次阅读...`);
      await sleep(delay * 1000);

      const isReadOk = await doOneRead(token, ua, index);
      if (!isReadOk) {
        console.log(`❌ 第 ${index} 次阅读失败，终止该账号本日阅读`);
        break;
      }

      successCount++;
      console.log(`✅ 第 ${successCount} 次阅读成功`);
      await sleep(2000);
    }

    accountLog += `✨ 本次成功阅读: ${successCount} 篇\n`;

    // 4. 尝试提现
    console.log("💸 开始尝试提现...");
    const withdrawResult = await doWithdraw(token, ua);
    if (withdrawResult) {
      accountLog += `💸 提现状况: 发起成功\n`;
    } else {
      accountLog += `💸 提现状况: 未提现或失败\n`;
    }

    // 5. 获取最终余额
    const finalUser = await getUserProfile(token, ua);
    if (finalUser) {
      accountLog += `💰 最终积分: ${finalUser.balance} (${finalUser.balance_yuan.toFixed(4)} 元)\n`;
    }

    console.log(`\n[${name}] 处理完毕`);
    console.log(accountLog);
    summary += `\n${accountLog}`;

    if (i < accounts.length - 1) {
      await sleep(5000); // 账号间防关联延迟
    }
  }

  console.log("\n========== 微信自动阅读2 运行汇总 ==========");
  console.log(summary.trim());
  $notify("微信阅读2 运行报告 📝", `共处理 ${accounts.length} 个账号`, summary.trim());
  $done({});
}

// ====================================================
// ③ 核心业务 API 函数
// ====================================================

/**
 * 快速登录 (quick_login)
 */
async function quickLogin(token, ua) {
  const url = `https://${API_HOST}/api/client/auth/quick_login?ak=${encodeURIComponent(token)}`;
  const headers = {
    "User-Agent": ua,
    "Accept": "application/json, text/plain, */*",
    "Origin": `http://${YD_H5_HOST}`,
    "Referer": `http://${YD_H5_HOST}/`
  };
  try {
    const res = await httpGet(url, headers);
    if (!res.body) return null;
    const payload = JSON.parse(res.body);
    if (payload && payload.code === 0) {
      return payload.data.access_token || token;
    }
    console.log(`${SCRIPT_TAG} quickLogin 返回异常: ${res.body}`);
    return null;
  } catch (e) {
    console.log(`${SCRIPT_TAG} quickLogin 异常: ${e}`);
    return null;
  }
}

/**
 * 获取用户信息 (profile)
 */
async function getUserProfile(token, ua) {
  const url = `https://${API_HOST}/api/client/user/profile`;
  const headers = {
    "User-Agent": ua,
    "Accept": "application/json, text/plain, */*",
    "access-token": token,
    "Origin": `http://${YD_H5_HOST}`,
    "Referer": `http://${YD_H5_HOST}/`
  };
  try {
    const res = await httpGet(url, headers);
    if (!res.body) return null;
    const payload = JSON.parse(res.body);
    if (payload && payload.code === 0) {
      const profile = payload.data || {};
      const balance = parseInt(profile.balance || 0);
      return {
        user_id: profile.id,
        nickname: profile.nickname || "",
        balance: balance,
        balance_yuan: balance / 10000
      };
    }
    console.log(`${SCRIPT_TAG} getUserProfile 返回异常: ${res.body}`);
    return null;
  } catch (e) {
    console.log(`${SCRIPT_TAG} getUserProfile 异常: ${e}`);
    return null;
  }
}

/**
 * 获取阅读进度 (pages/index)
 */
async function getTodayReadInfo(token, ua) {
  const url = `https://${API_HOST}/api/client/user/pages/index`;
  const headers = {
    "User-Agent": ua,
    "Accept": "application/json, text/plain, */*",
    "access-token": token,
    "Origin": `http://${YD_H5_HOST}`,
    "Referer": `http://${YD_H5_HOST}/`
  };
  try {
    const res = await httpGet(url, headers);
    if (!res.body) return null;
    const payload = JSON.parse(res.body);
    if (payload && payload.code === 0) {
      const data = payload.data || {};
      return {
        today_count: parseInt(data.today_count || 0),
        total_count: parseInt(data.today_total_count || 180),
        hour_max_count: parseInt(data.hour_max_count || 28),
        hour_current_count: parseInt(data.limit_index || 0),
        read_status: data.read_status || "valid",
        read_status_text: data.read_status_text || ""
      };
    }
    console.log(`${SCRIPT_TAG} getTodayReadInfo 返回异常: ${res.body}`);
    return null;
  } catch (e) {
    console.log(`${SCRIPT_TAG} getTodayReadInfo 异常: ${e}`);
    return null;
  }
}

/**
 * 获取阅读入口 (read/link)
 */
async function getMiddleUrl(token, ua) {
  const url = `https://${API_HOST}/api/client/user/read/link?type=click`;
  const headers = {
    "User-Agent": ua,
    "Accept": "application/json, text/plain, */*",
    "access-token": token,
    "Origin": `http://${YD_H5_HOST}`,
    "Referer": `http://${YD_H5_HOST}/`
  };
  try {
    const res = await httpGet(url, headers);
    if (!res.body) return null;
    const payload = JSON.parse(res.body);
    if (payload && payload.code === 0) {
      return payload.data.url || null;
    }
    console.log(`${SCRIPT_TAG} getMiddleUrl 返回异常: ${res.body}`);
    return null;
  } catch (e) {
    console.log(`${SCRIPT_TAG} getMiddleUrl 异常: ${e}`);
    return null;
  }
}

/**
 * 校验并获取下一篇文章 (has_next)
 */
async function callHasNext(val, aid, st, ua) {
  let url = `http://${READ_SV_HOST}/api/client/read/has_next?val=${encodeURIComponent(val)}`;
  if (aid) url += `&aid=${encodeURIComponent(aid)}`;
  if (st) url += `&st=${encodeURIComponent(st)}`;

  const headers = {
    "User-Agent": ua,
    "Accept": "application/json, text/plain, */*",
    "Origin": `http://${YD_H5_HOST}`,
    "Referer": `http://${YD_H5_HOST}/`
  };

  try {
    const res = await httpGet(url, headers);
    if (!res.body) return { url: null, aid: null, code: -1 };
    const payload = JSON.parse(res.body);
    const code = parseInt(payload.code !== undefined ? payload.code : -1);
    if (code !== 0) {
      return { url: null, aid: null, code: code };
    }
    const data = payload.data || {};
    return {
      url: data.url || null,
      aid: data.aid || null,
      code: 0
    };
  } catch (e) {
    console.log(`${SCRIPT_TAG} callHasNext 异常: ${e}`);
    return { url: null, aid: null, code: -1 };
  }
}

/**
 * 获取文章真实重定向链接
 */
async function getFullWechatUrl(shortUrl, ua) {
  const headers = { "User-Agent": ua };
  try {
    const res = await httpRequest({
      url: shortUrl,
      method: "GET",
      headers: headers,
      opts: { redirection: true } // Quantumult X 默认会自动跟随重定向
    });
    // 如果返回的头部包含 Location，则直接使用它。如果没有，可能 fetch 已经处理完毕并返回了最终页面
    // 我们可以尝试从 res.headers["Location"] 或 res.headers["location"] 提取
    const redirectUrl = res.headers["Location"] || res.headers["location"] || res.url;
    return redirectUrl || shortUrl;
  } catch (e) {
    console.log(`${SCRIPT_TAG} getFullWechatUrl 异常: ${e}`);
    return null;
  }
}

/**
 * 发送点赞请求
 */
async function sendLike(shortWechatUrl, ua) {
  const fullUrl = await getFullWechatUrl(shortWechatUrl, ua);
  if (!fullUrl) {
    console.log(`${SCRIPT_TAG} 点赞跳过: 无法获取文章完整 URL`);
    return false;
  }

  const queryParams = parseQueryString(fullUrl);
  const required = {
    "__biz": queryParams["__biz"] || "",
    "mid": queryParams["mid"] || "",
    "idx": queryParams["idx"] || "",
    "sn": queryParams["sn"] || ""
  };

  if (!required["__biz"] || !required["mid"] || !required["idx"] || !required["sn"]) {
    console.log(`${SCRIPT_TAG} 点赞跳过: 完整 URL 缺少必要参数`);
    return false;
  }

  const likeParams = {
    "uin": queryParams["uin"] || "",
    "key": queryParams["key"] || "",
    "pass_ticket": queryParams["pass_ticket"] || "",
    "wxtoken": "777",
    "devicetype": "UnifiedPCWindows",
    "clientversion": "f2541923",
    "version": "f2541923",
    "__biz": required["__biz"],
    "x5": "0",
    "f": "json",
    "user_article_role": "0"
  };

  let likeQuery = "";
  for (const k in likeParams) {
    if (likeParams[k]) {
      likeQuery += `&${k}=${encodeURIComponent(likeParams[k])}`;
    }
  }
  if (likeQuery) likeQuery = likeQuery.substring(1);

  const likeUrl = `https://mp.weixin.qq.com/mp/jsmonitor?${likeQuery}`;
  const headers = {
    "User-Agent": ua,
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": "https://mp.weixin.qq.com",
    "Referer": fullUrl
  };
  const body = `idkey=115849_69_1&t=${Math.random()}`;

  try {
    const res = await httpPost(likeUrl, headers, body);
    if (!res.body) return false;
    const payload = JSON.parse(res.body);
    if (payload && payload.ret === 0) {
      console.log(`${SCRIPT_TAG} 点赞成功`);
      return true;
    }
    console.log(`${SCRIPT_TAG} 点赞返回异常: ${res.body}`);
    return false;
  } catch (e) {
    console.log(`${SCRIPT_TAG} 点赞异常: ${e}`);
    return false;
  }
}

/**
 * 执行单次阅读流程
 */
async function doOneRead(token, ua, index) {
  // 1. 获取阅读入口
  const middleUrl = await getMiddleUrl(token, ua);
  if (!middleUrl) {
    console.log(`${SCRIPT_TAG} 获取阅读入口失败`);
    return false;
  }
  console.log(`${SCRIPT_TAG} 第 ${index} 次阅读入口: ${middleUrl}`);

  const val = getQueryParam(middleUrl, "val");
  if (!val) {
    console.log(`${SCRIPT_TAG} 阅读入口缺少 val 参数`);
    return false;
  }

  // 2. 第一次 has_next
  const firstRes = await callHasNext(val, null, null, ua);
  if (firstRes.code !== 0) {
    console.log(`${SCRIPT_TAG} 第一次 has_next 失败，错误码: ${firstRes.code}`);
    return false;
  }
  console.log(`${SCRIPT_TAG} 第一次 has_next 返回文章: ${firstRes.url || "无"}`);

  // 3. 模拟页面停留 7~15 秒
  const staySeconds = Math.floor(Math.random() * 9) + 7;
  console.log(`${SCRIPT_TAG} 模拟阅读，在页面停留 ${staySeconds} 秒...`);
  await sleep(staySeconds * 1000);

  // 4. 第二次 has_next 进行结算和获取下一篇
  const st = Date.now().toString();
  const secondRes = await callHasNext(val, firstRes.aid, st, ua);
  if (secondRes.code !== 0) {
    console.log(`${SCRIPT_TAG} 第二次 has_next 失败，错误码: ${secondRes.code}`);
    if (secondRes.code === -90101) {
      console.log(`${SCRIPT_TAG} 已达到当前小时阅读上限`);
    }
    return false;
  }

  console.log(`${SCRIPT_TAG} 第二次 has_next 返回文章: ${secondRes.url || "无"}`);

  // 5. 随机点赞
  if (secondRes.url && Math.random() < LIKE_PROBABILITY) {
    await sendLike(secondRes.url, ua);
  } else if (secondRes.url) {
    console.log(`${SCRIPT_TAG} 本次未触发点赞`);
  }

  return true;
}

/**
 * 自动提现
 */
async function doWithdraw(token, ua) {
  const user = await getUserProfile(token, ua);
  if (!user) {
    console.log(`${SCRIPT_TAG} 提现跳过: 获取余额失败`);
    return false;
  }

  const balance = user.balance;
  if (balance < WITHDRAW_THRESHOLD) {
    console.log(`${SCRIPT_TAG} 余额 ${balance} 积分 (${user.balance_yuan.toFixed(4)} 元)，不足 ${WITHDRAW_THRESHOLD} 积分，暂不提现`);
    return false;
  }

  // 向下取整到 WITHDRAW_STEP
  const amount = Math.floor(balance / WITHDRAW_STEP) * WITHDRAW_STEP;
  if (amount <= 0) {
    console.log(`${SCRIPT_TAG} 提现跳过: 可提现金额为 0`);
    return false;
  }

  const url = `https://${API_HOST}/api/client/user/balance/withdraw?amount=${amount}&pay_method=wx`;
  const headers = {
    "User-Agent": ua,
    "Accept": "application/json, text/plain, */*",
    "access-token": token,
    "Origin": `http://${YD_H5_HOST}`,
    "Referer": `http://${YD_H5_HOST}/`
  };

  try {
    const res = await httpGet(url, headers);
    if (!res.body) return false;
    const payload = JSON.parse(res.body);
    if (payload && payload.code === 0) {
      const withdrawal = payload.data.withdrawal || {};
      console.log(`${SCRIPT_TAG} 提现成功: 金额 ${withdrawal.amount || amount} 积分，状态 ${withdrawal.status || "未知"}`);
      return true;
    }
    console.log(`${SCRIPT_TAG} 提现接口返回异常: ${res.body}`);
    return false;
  } catch (e) {
    console.log(`${SCRIPT_TAG} 提现异常: ${e}`);
    return false;
  }
}

// ====================================================
// ④ 辅助与底层工具函数
// ====================================================

function getRandomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getQueryParam(url, name) {
  const regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)");
  const results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return "";
  return decodeURIComponent(results[2].replace(/\+/g, " "));
}

function parseQueryString(url) {
  const params = {};
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) return params;
  const queryString = url.substring(queryIndex + 1);
  const pairs = queryString.split('&');
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i].split('=');
    if (pair.length > 0 && pair[0]) {
      params[decodeURIComponent(pair[0])] = pair[1] ? decodeURIComponent(pair[1]) : "";
    }
  }
  return params;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
