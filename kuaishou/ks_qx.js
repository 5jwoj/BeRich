/**
 * 快手极速版看广告/宝箱刷金币 - Quantumult X 专用版
 * @version v1.1.0
 * 
 * ==================== Quantumult X 配置说明 ====================
 * [task_local]
 * # 自动看广告/宝箱刷金币定时任务
 * 0 8,12,18 * * * https://raw.githubusercontent.com/5jwoj/BeRich/main/kuaishou/ks_qx.js, tag=快手看广告, img-url=https://raw.githubusercontent.com/kwai/logo.png, enabled=true
 * 
 * [rewrite_local]
 * # 打开快手极速版【Earn/任务】页面自动抓取 Cookie
 * ^https?:\/\/nebula\.kuaishou\.com\/rest\/n\/nebula\/activity\/earn\/overview\/basicInfo url script-request-header https://raw.githubusercontent.com/5jwoj/BeRich/main/kuaishou/ks_qx.js
 * 
 * [mitm]
 * hostname = nebula.kuaishou.com
 * 
 * ==================== 账号配置与抓包说明 ====================
 * 1. 【自动抓包】：配置好 [rewrite_local] 与 [mitm] 后，打开快手极速版 App 进入【任务页面】，即可自动抓取并保存 Cookie。
 * 2. 【手动配置】：也可在 BoxJS 或 QX 持久化存储设置 `ksck`，格式：`cookie#salt` 或 `备注#cookie#salt` (多账号用 & 分隔)
 */

// ==================== 用户配置区 ====================
const USER_CONFIG = {
  // 账号配置：支持单/多账号，多个用 & 分隔；如果为 ""，则自动读取 QX 变量 'ksck'
  ksck: "", 
  
  ROUNDS: 5,                        // 执行轮数 (建议 QX 下设置小一点，避免脚本超时)
  COIN_LIMIT: 300000,               // 总金币上限
  SINGLE_ACCOUNT_COIN_LIMIT: 150000,// 单账号金币上限
  LOW_REWARD_LIMIT: 3,              // 连续低奖励停止次数
  KS_CONTINUE_ENABLE: true,         // 是否开启追加广告
  KS_CONTINUE_MAX_COUNT: 3,         // 追加广告最大次数
  KS_EXTRA_TASK_ENABLE: true,       // 是否开启额外任务翻倍
  Task: "box,look",                 // 任务类型，支持 box (宝箱广告), look (观看广告)
  SCRIPT_TITLE: "小飞独享版 (QX版)"
};

// ==================== QX 基础环境适配 ====================
const $ = new Env("快手看广告");

function getEnvVal(key, defaultVal) {
  let val = $.getdata(key) || USER_CONFIG[key];
  if (val === undefined || val === null || val === "") return defaultVal;
  return val;
}

// Base64 编码实现
function base64Encode(str) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  var output = '';
  var i = 0;
  str = unescape(encodeURIComponent(str));
  while (i < str.length) {
    var chr1 = str.charCodeAt(i++);
    var chr2 = str.charCodeAt(i++);
    var chr3 = str.charCodeAt(i++);
    var enc1 = chr1 >> 2;
    var enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
    var enc3 = isNaN(chr2) ? 64 : ((chr2 & 15) << 2) | (chr3 >> 6);
    var enc4 = isNaN(chr3) ? 64 : chr3 & 63;
    output += chars.charAt(enc1) + chars.charAt(enc2) + chars.charAt(enc3) + chars.charAt(enc4);
  }
  return output;
}

// QueryString 格式化
function stringifyQuery(obj) {
  return Object.keys(obj)
    .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(obj[key]))
    .join('&');
}

// 统一 HTTP 请求封装
async function sendRequest(opts) {
  return new Promise(resolve => {
    const method = (opts.method || "GET").toUpperCase();
    const req = {
      url: opts.url,
      method: method,
      headers: opts.headers || {},
      timeout: (opts.timeout || 12000) / 1000
    };
    if (opts.body) {
      req.body = typeof opts.body === "object" ? JSON.stringify(opts.body) : opts.body;
    } else if (opts.form) {
      req.body = stringifyQuery(opts.form);
      if (!req.headers["Content-Type"]) {
        req.headers["Content-Type"] = "application/x-www-form-urlencoded";
      }
    }

    $.request(req, (err, resp, body) => {
      if (err || !resp || resp.statusCode !== 200) {
        resolve(null);
      } else {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      }
    });
  });
}

// ==================== 签名系统 ====================
const SIGN_API = {
  NEBULA: "http://111.170.173.91:3000"
};

const Sign = {
  getEncSign: async (base64Data) => {
    try {
      const result = await sendRequest({
        method: "POST",
        url: `${SIGN_API.NEBULA}/encsign`,
        headers: { "Content-Type": "application/json" },
        body: { data: base64Data },
        timeout: 12000,
      });
      return result?.status ? result.data : null;
    } catch (e) { return null; }
  },
  getNsSign: async (reqInfo) => {
    try {
      const result = await sendRequest({
        method: "POST",
        url: `${SIGN_API.NEBULA}/nssig`,
        headers: { "Content-Type": "application/json" },
        body: { 
          path: reqInfo.urlpath, 
          data: reqInfo.reqdata, 
          salt: reqInfo.salt 
        },
        timeout: 12000,
      });
      if (result?.data) {
        return { 
          sig: result.data.sig, 
          __NStokensig: result.data.nstokensig, 
          __NS_sig3: result.data.nssig3, 
          __NS_xfalcon: result.data.nssig4 || result.data.xfalcon || "" 
        };
      }
      return null;
    } catch (e) { return null; }
  }
};

// ==================== 广告解析 ====================
const AdParser = {
  parse: (adRawData) => {
    const result = {
      title: "", expectedCoin: 1, creativeId: "", llsid: "",
      hasRewardEnd: false, isMultiple: false, multiple: 1,
      baseCoin: 1, hasExtraTask: false
    };
    if (!adRawData?.ad) return result;
    result.creativeId = adRawData.ad.creativeId || "";
    result.llsid = (adRawData.exp_tag || "").split("/")[1]?.split("_")?.[0] || "";
    try {
      const extData = JSON.parse(adRawData.ad.extData || "{}");
      result.expectedCoin = Math.floor(Number(extData.awardCoin) || 0);
    } catch (e) {}
    if (result.expectedCoin === 0) {
      const inspire = adRawData.ad.adDataV2?.inspirePersonalize || adRawData.ad.adDataV2?.inspireAdInfo?.inspirePersonalize;
      result.expectedCoin = Math.floor(Number(inspire?.awardValue || inspire?.neoValue || 1));
    }
    try {
      let inspireInfo = null;
      const ad = adRawData.ad || {};
      if (adRawData.liveInspireAwardInfo) inspireInfo = adRawData.liveInspireAwardInfo;
      else if (ad.liveInspireAwardInfo) inspireInfo = ad.liveInspireAwardInfo;
      else if (ad.adDataV2?.inspireAdInfo?.liveInspireAwardInfo) inspireInfo = ad.adDataV2.inspireAdInfo.liveInspireAwardInfo;
      
      if (inspireInfo?.enableLiveInspireAwardCoinMultiple === true) {
        const amount = inspireInfo.liveInspireAwardCoinAmount;
        if (amount && amount > 0) {
          result.isMultiple = true;
          result.multiple = inspireInfo.liveInspireAwardCoinMultiple;
          result.baseCoin = inspireInfo.liveInspireAwardCoinCount;
          result.expectedCoin = Math.floor(Number(amount));
        }
      }
    } catch (e) {}
    try {
      const templates = adRawData.ad.adDataV2?.templateDatas;
      if (templates && Array.isArray(templates)) {
        result.hasExtraTask = templates.some(t => t.resourceType === 1);
      }
    } catch (e) {}
    result.hasRewardEnd = adRawData.ad.adDataV2?.onceAgainRewardInfo?.hasMore || false;
    return result;
  }
};

// ==================== 辅助函数与解析 ====================
function formatAccountName(nickname, remark) {
  if (remark) return `【${remark}】`;
  if (!nickname || nickname.length <= 4) return `【${nickname || '未知'}】`;
  return `【${nickname.substring(0, 2)}**${nickname.substring(nickname.length - 2)}】`;
}

function parseAccountConfig(configString) {
  const parts = String(configString || "").trim().split("#");
  if (parts.length < 2) return null;
  let remark = null, cookie, salt;
  
  if (parts.length >= 4) [remark, cookie, salt] = parts;
  else if (parts.length === 3) {
    if (parts[2].includes("socks5://") || parts[2].includes("|")) [cookie, salt] = parts;
    else [remark, cookie, salt] = parts;
  } else if (parts.length === 2) [cookie, salt] = parts;
  else return null;
  
  return { remark: remark || null, salt, cookie };
}

function loadAccounts() {
  const accounts = [];
  const seen = new Set();
  let count = 0;
  const rawKsck = getEnvVal("ksck", "");
  
  if (rawKsck) {
    rawKsck.split("&").map(c => c.trim()).filter(Boolean).forEach(cfg => {
      if (!seen.has(cfg)) {
        const acc = parseAccountConfig(cfg);
        if (acc) { acc.index = ++count; accounts.push(acc); seen.add(cfg); }
      }
    });
  }
  return accounts;
}

async function getAccountBasicInfo(cookie) {
  const url = "https://nebula.kuaishou.com/rest/n/nebula/activity/earn/overview/basicInfo?source=bottom_guide_first";
  const res = await sendRequest({
    method: "GET", url,
    headers: {
      Host: "nebula.kuaishou.com",
      "User-Agent": "kwai-android aegon/3.56.0",
      Cookie: cookie
    }, timeout: 12000
  });
  if (res?.result === 1 && res.data) {
    return {
      nickname: res.data.userData?.nickname || null,
      totalCoin: res.data.totalCoin ?? null,
      allCash: res.data.allCash ?? null
    };
  }
  return null;
}

// ==================== 核心任务类 ====================
class KuaishouAdTask {
  constructor(opts) {
    const { index, salt, cookie, remark, nickname = "" } = opts;
    this.index = index;
    this.salt = salt;
    this.cookie = cookie;
    this.remark = remark || null;
    this.nickname = nickname || (remark ? remark : "账号" + index);
    
    this.coinLimit = parseInt(getEnvVal("COIN_LIMIT", 300000));
    this.singleAccountCoinLimit = parseInt(getEnvVal("SINGLE_ACCOUNT_COIN_LIMIT", 150000));
    this.lowRewardLimit = parseInt(getEnvVal("LOW_REWARD_LIMIT", 3));
    
    this.coinExceeded = false;
    const taskEnv = getEnvVal("Task", "box,look");
    this.tasksToExecute = taskEnv.split(",").map(t => t.trim().toLowerCase()).filter(t => ["box", "look"].includes(t));
    if (!this.tasksToExecute.length) this.tasksToExecute = ["box", "look"];

    this.extractCookieInfo();
    this.headers = {
      Host: "nebula.kuaishou.com",
      "User-Agent": "kwai-android aegon/4.28.0",
      "X-REQUESTID": "176141384176960896",
      Cookie: this.cookie,
      "Content-Type": "application/json",
    };
    this.taskReportPath = "/rest/r/ad/task/report";
    this.startTime = Date.now();
    this.endTime = this.startTime - 30000;
    
    this.taskConfigs = {
      box: { name: "宝箱广告", businessId: 606, posId: 20346, subPageId: 100024064, pageId: 11101, requestSceneType: 1, taskType: 1 },
      look: { name: "观看广告", businessId: 672, posId: 24067, subPageId: 100026367, pageId: 11101, requestSceneType: 1, taskType: 2 },
    };
    
    this.taskStats = {};
    this.tasksToExecute.forEach(k => {
      if (this.taskConfigs[k]) this.taskStats[k] = { success: 0, failed: 0, totalReward: 0 };
    });
    
    this.lowRewardStreak = 0;
    this.stopAllTasks = false;
    this.stopReason = "";
    this.taskLimitReached = {};
    this.tasksToExecute.forEach(k => { if (this.taskConfigs[k]) this.taskLimitReached[k] = false; });
    this.accumulatedCoin = 0;
    this.singleAccountLimitReached = false;
  }

  get displayName() { return formatAccountName(this.nickname, this.remark); }
  get queryParams() { return `mod=Xiaomi(MI 11)&appver=${this.appver}&egid=${this.egid}&did=${this.did}`; }

  extractCookieInfo() {
    try {
      this.egid = this.cookie.match(/egid=([^;]+)/)?.[1] || "";
      this.did = this.cookie.match(/did=([^;]+)/)?.[1] || "";
      this.userId = this.cookie.match(/userId=([^;]+)/)?.[1] || "";
      this.kuaishouApiSt = this.cookie.match(/kuaishou\.api_st=([^;]+)/)?.[1] || "";
      this.appver = this.cookie.match(/appver=([^;]+)/)?.[1] || "13.7.20.10468";
    } catch (e) {}
  }

  async checkCoinLimit() {
    try {
      const info = await getAccountBasicInfo(this.cookie);
      if (info?.totalCoin && parseInt(info.totalCoin) >= this.coinLimit) {
        this.coinExceeded = true;
        this.stopAllTasks = true;
        this.stopReason = "总金币达上限";
        return true;
      }
      return false;
    } catch (e) { return false; }
  }

  checkSingleAccountCoinLimit() {
    if (this.accumulatedCoin >= this.singleAccountCoinLimit) {
      this.singleAccountLimitReached = true;
      this.stopAllTasks = true;
      this.stopReason = "单号金币达上限";
      $.log(`🥀 ${this.displayName} 单号金币达上限(${this.singleAccountCoinLimit})，停止任务`);
      return true;
    }
    return false;
  }

  async retryOperation(op, desc, max = 3, delay = 2000) {
    for (let i = 0; i < max; i++) {
      try {
        const res = await op();
        if (res) return res;
      } catch (e) {}
      if (i < max - 1) await $.wait(delay);
    }
    return null;
  }

  async getAdInfo(taskConfig) {
    try {
      const adPath = "/rest/e/reward/mixed/ad";
      const formData = {
        encData: "|encData|", sign: "|sign|", cs: "false",
        client_key: "2ac2a76d", videoModelCrowdTag: "1_23",
        os: "android", "kuaishou.api_st": this.kuaishouApiSt,
        uQaTag: "1##swLdgl:99#ecPp:-9#cmNt:-0#cmHs:-3#cmMnsl:-0",
      };
      const queryData = {
        earphoneMode: "1", mod: "Xiaomi(23116PN5BC)",
        appver: this.appver, isp: "CUCC", language: "zh-cn",
        ud: this.userId, did_tag: "0", net: "WIFI", kcv: "1599",
        app: "0", kpf: "ANDROID_PHONE", ver: "11.6", android_os: "0",
        boardPlatform: "pineapple", kpn: "NEBULA", androidApiLevel: "35",
        country_code: "cn", sys: "ANDROID_15", sw: "1080", sh: "2400",
        abi: "arm64", userRecoBit: "0",
      };
      const requestBody = {
        appInfo: { appId: "kuaishou_nebula", name: "快手极速版", packageName: "com.kuaishou.nebula", version: this.appver, versionCode: -1 },
        deviceInfo: { osType: 1, osVersion: "15", deviceId: this.did, screenSize: { width: 1080, height: 2249 }, ftt: "" },
        userInfo: { userId: this.userId, age: 0, gender: "" },
        impInfo: [{ pageId: taskConfig.pageId, subPageId: taskConfig.subPageId, action: 0, browseType: 3, impExtData: "{}", mediaExtData: "{}" }],
      };
      const encoded = base64Encode(JSON.stringify(requestBody));
      const encSign = await Sign.getEncSign(encoded);
      if (!encSign) return null;
      formData.encData = encSign.encdata;
      formData.sign = encSign.sign;
      const postData = stringifyQuery(formData) + "&" + stringifyQuery(queryData);
      const sigRes = await Sign.getNsSign({ urlpath: adPath, reqdata: postData, salt: this.salt });
      if (!sigRes) return null;
      const finalQuery = { ...queryData, sig: sigRes.sig, __NS_sig3: sigRes.__NS_sig3, __NS_xfalcon: sigRes.__NS_xfalcon, __NStokensig: sigRes.__NStokensig };
      const url = `https://api.e.kuaishou.com${adPath}?${stringifyQuery(finalQuery)}`;
      const res = await sendRequest({
        method: "POST", url,
        headers: { Host: "api.e.kuaishou.com", "User-Agent": "kwai-android aegon/3.56.0", Cookie: "kuaishou_api_st=" + this.kuaishouApiSt },
        form: formData, timeout: 12000
      });
      if (res?.errorMsg === "OK" && res.feeds?.[0]) {
        return AdParser.parse(res.feeds[0]);
      }
      return null;
    } catch (e) { return null; }
  }

  async generateSignature(creativeId, llsid, taskConfig, adInfo) {
    try {
      const neoInfos = [{
        creativeId, extInfo: "", llsid,
        requestSceneType: taskConfig.requestSceneType,
        taskType: taskConfig.taskType, watchExpId: "", watchStage: 0
      }];
      if (getEnvVal("KS_EXTRA_TASK_ENABLE", true) && adInfo?.hasExtraTask) {
        neoInfos.push({
          clientExtInfo: '{"serialPaySuccess":false}',
          creativeId, extInfo: "", llsid, adExtInfo: "",
          materialTime: 0, watchAdTime: 0,
          requestSceneType: taskConfig.requestSceneType,
          taskType: 3, watchExpId: "", watchStage: 0
        });
      }
      const bizStr = JSON.stringify({
        businessId: taskConfig.businessId,
        endTime: this.endTime, extParams: "", mediaScene: "video",
        neoInfos, pageId: taskConfig.pageId, posId: taskConfig.posId,
        reportType: 0, sessionId: "", startTime: this.startTime, subPageId: taskConfig.subPageId,
      });
      const postData = `bizStr=${encodeURIComponent(bizStr)}&cs=false&client_key=2ac2a76d`;
      const urlData = this.queryParams + "&" + postData;
      const sign = await Sign.getNsSign({ urlpath: this.taskReportPath, reqdata: urlData, salt: this.salt });
      return sign ? { sig: sign.sig, sig3: sign.__NS_sig3, sigtoken: sign.__NStokensig, post: postData } : null;
    } catch (e) { return null; }
  }

  async submitReport(sig, sig3, sigtoken, postData, taskKey, taskConfig, adInfo, isContinue = false) {
    try {
      const url = `https://api.e.kuaishou.com${this.taskReportPath}?${this.queryParams}&sig=${sig}&__NS_sig3=${sig3}&__NS_xfalcon=&__NStokensig=${sigtoken}`;
      const res = await sendRequest({
        method: "POST", url,
        headers: { Host: "api.e.kuaishou.cn", "User-Agent": "kwai-android aegon/3.56.0", Cookie: this.cookie, "Content-Type": "application/x-www-form-urlencoded" },
        body: postData, timeout: 12000
      });
      if (!res) return { success: false, reward: 0, error: "接口无响应" };
      if (res.result === 1) {
        const reward = res.data?.neoAmount || 0;
        this.accumulatedCoin += reward;
        if (this.checkSingleAccountCoinLimit()) return { success: false, reward: 0, limitReached: true, error: "单号金币达上限" };
        
        let icon = taskConfig.businessId === 606 ? "📦" : "🎬";
        let shortName = taskConfig.businessId === 606 ? "宝箱" : (isContinue ? "追加" : "广告");
        const multiTag = adInfo?.isMultiple ? ` x${adInfo.multiple}倍` : "";
        
        $.log(`${icon} ${this.displayName} ${shortName}${multiTag}: +${reward} -> 累计: ${this.accumulatedCoin}`);
        
        if (!isContinue) {
          if (reward === 1 || reward === 10) {
            this.lowRewardStreak++;
            if (this.lowRewardStreak >= this.lowRewardLimit) {
              $.log(`🥀 ${this.displayName} 连续${this.lowRewardLimit}次低奖励，停止任务`);
              this.stopAllTasks = true;
              this.stopReason = "连续低奖励";
            }
          } else this.lowRewardStreak = 0;
        }
        if (this.taskStats[taskKey]) {
          this.taskStats[taskKey].success++;
          this.taskStats[taskKey].totalReward += reward;
        }
        return { success: true, reward, hasRewardEnd: adInfo?.hasRewardEnd };
      }
      if ([20107, 20108, 1003, 415].includes(res.result)) {
        $.log(`⭕ ${this.displayName} ${taskConfig.name} 已达今日上限`);
        this.taskLimitReached[taskKey] = true;
        return { success: false, reward: 0, limit: true, error: "今日已达上限" };
      }
      return { success: false, reward: 0, error: `提交失败 code:${res.result}` };
    } catch (e) {
      return { success: false, reward: 0, error: `提交异常: ${e.message}` };
    }
  }

  async executeTask(taskKey) {
    const taskConfig = this.taskConfigs[taskKey];
    if (!taskConfig || this.taskLimitReached[taskKey] || this.stopAllTasks) {
      return { success: false, error: "任务已达上限或停止" };
    }
    try {
      const adInfo = await this.retryOperation(() => this.getAdInfo(taskConfig), `获取${taskConfig.name}`, 3);
      if (!adInfo) {
        if (this.taskStats[taskKey]) this.taskStats[taskKey].failed++;
        return { success: false, error: "获取广告失败" };
      }
      
      const watchTime = Math.floor(Math.random() * 5000) + 15000;
      await $.wait(watchTime);
      
      const sig = await this.retryOperation(() => this.generateSignature(adInfo.creativeId, adInfo.llsid, taskConfig, adInfo), `生成签名`, 3);
      if (!sig) {
        if (this.taskStats[taskKey]) this.taskStats[taskKey].failed++;
        return { success: false, error: "生成签名失败" };
      }
      const mainRes = await this.retryOperation(
        () => this.submitReport(sig.sig, sig.sig3, sig.sigtoken, sig.post, taskKey, taskConfig, adInfo),
        `提交报告`, 3
      );
      if (!mainRes?.success) {
        if (this.taskStats[taskKey]) this.taskStats[taskKey].failed++;
        return { success: false, error: mainRes?.error || "提交奖励失败" };
      }

      let continueCount = 0;
      const enableContinue = getEnvVal("KS_CONTINUE_ENABLE", true);
      const maxContinue = parseInt(getEnvVal("KS_CONTINUE_MAX_COUNT", 3));
      
      if (enableContinue && adInfo.hasRewardEnd && maxContinue > 0) {
        while (continueCount < maxContinue && !this.stopAllTasks) {
          continueCount++;
          const cAd = await this.getAdInfo(taskConfig);
          if (!cAd) break;
          await $.wait(15000);
          const cSig = await this.generateSignature(cAd.creativeId, cAd.llsid, taskConfig, cAd);
          if (!cSig) break;
          const cRes = await this.submitReport(cSig.sig, cSig.sig3, cSig.sigtoken, cSig.post, taskKey, taskConfig, cAd, true);
          if (!cRes.success) break;
          await $.wait(2000);
        }
      }
      return { success: true, continueCount };
    } catch (e) {
      $.log(`❌ ${this.displayName} 任务异常(${taskConfig.name}): ${e.message}`);
      if (this.taskStats[taskKey]) this.taskStats[taskKey].failed++;
      return { success: false, error: `任务异常: ${e.message}` };
    }
  }

  async runRound(roundNum) {
    if (this.stopAllTasks) return;
    for (const taskKey of this.tasksToExecute) {
      if (this.stopAllTasks) break;
      await this.executeTask(taskKey);
      await $.wait(3000);
    }
  }
}

// ==================== 自动重写抓包入口 ====================
function GetCookie() {
  if ($request && $request.url.includes("/earn/overview/basicInfo")) {
    const headers = $request.headers;
    const cookie = headers["Cookie"] || headers["cookie"];
    if (cookie && cookie.includes("kuaishou.api_st")) {
      const userId = cookie.match(/userId=([^;]+)/)?.[1] || "未知用户";
      let oldKsck = $.getdata("ksck") || "";
      let salt = "12345678";
      
      if (oldKsck) {
        let parts = oldKsck.split("#");
        if (parts.length >= 2) salt = parts[parts.length - 1];
      }
      
      let newAcc = `${cookie}#${salt}`;
      let updated = false;

      if (!oldKsck) {
        $.setdata(newAcc, "ksck");
        updated = true;
      } else {
        let accList = oldKsck.split("&");
        let foundIndex = accList.findIndex(acc => acc.includes(`userId=${userId}`));
        if (foundIndex !== -1) {
          let oldParts = accList[foundIndex].split("#");
          let oldSalt = oldParts.length >= 2 ? oldParts[oldParts.length - 1] : salt;
          accList[foundIndex] = `${cookie}#${oldSalt}`;
          $.setdata(accList.join("&"), "ksck");
          updated = true;
        } else {
          accList.push(newAcc);
          $.setdata(accList.join("&"), "ksck");
          updated = true;
        }
      }

      if (updated) {
        $.msg("快手极速版", "🎉 Cookie 自动抓取成功", `已成功保存/更新账号[${userId}]的信息！`);
        $.log(`[抓包成功] 用户ID: ${userId}`);
      }
    }
  }
  $done({});
}

// ==================== 定时任务主流程入口 ====================
async function Main() {
  const accounts = loadAccounts();
  const title = getEnvVal("SCRIPT_TITLE", "小飞独享版 (QX版)");
  
  $.log(`\n═══════════════════════════════════════`);
  $.log(`           💮 ${title} 💮`);
  $.log(`═══════════════════════════════════════`);

  if (!accounts.length) {
    $.log("❌ 未检测到有效账号，请配置 'ksck' 或使用 App 进入任务页自动抓包");
    $.msg(title, "运行失败", "未设置账号 COOKIE，请进入 App 任务页进行自动抓包");
    return;
  }

  $.log(`已加载 ${accounts.length} 个账号`);
  const maxRounds = parseInt(getEnvVal("ROUNDS", 5));
  let notifyMsg = [];

  for (const acc of accounts) {
    const initInfo = await getAccountBasicInfo(acc.cookie);
    const nickname = initInfo?.nickname || `账号${acc.index}`;
    const task = new KuaishouAdTask({ ...acc, nickname });
    
    $.log(`\n开始处理: ${task.displayName} (初始金币: ${initInfo?.totalCoin || 0})`);
    await task.checkCoinLimit();

    if (!task.coinExceeded) {
      for (let round = 1; round <= maxRounds; round++) {
        if (task.stopAllTasks) break;
        $.log(`--- ${task.displayName} 第 ${round}/${maxRounds} 轮 ---`);
        await task.runRound(round);
      }
    } else {
      $.log(`⭕ ${task.displayName} 金币已超限，跳过任务`);
    }

    const finalInfo = await getAccountBasicInfo(acc.cookie);
    const earnedCoin = (finalInfo?.totalCoin || 0) - (initInfo?.totalCoin || 0);
    notifyMsg.push(`${task.displayName}: +${earnedCoin}金币 (当前: ${finalInfo?.totalCoin || 0})`);
  }

  if (notifyMsg.length > 0) {
    $.msg(title, "任务执行完毕", notifyMsg.join("\n"));
  }
}

// 入口判断：请求拦截(重写) OR 定时任务
if (typeof $request !== "undefined") {
  GetCookie();
} else {
  Main()
    .catch((e) => $.logErr(e))
    .finally(() => $done());
}

// ==================== Env 兼容类实现 ====================
function Env(name) {
  this.name = name;
  this.logs = [];
  this.log = (...args) => {
    console.log(args.join(" "));
    this.logs.push(args.join(" "));
  };
  this.logErr = (e) => console.log(`[ERROR] ${e}`);
  this.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  this.getdata = (key) => {
    if (typeof $prefs !== "undefined") return $prefs.valueForKey(key);
    return null;
  };
  this.setdata = (val, key) => {
    if (typeof $prefs !== "undefined") return $prefs.setValueForKey(val, key);
    return false;
  };
  this.msg = (title, subtitle, body) => {
    if (typeof $notify !== "undefined") $notify(title, subtitle, body);
  };
  this.request = (opts, callback) => {
    if (typeof $task !== "undefined") {
      $task.fetch(opts).then(
        (response) => callback(null, response, response.body),
        (reason) => callback(reason, null, null)
      );
    }
  };
}
