// [version: 1.0.0]
/**
 * 统一茄皇的家五期 - Quantumult X 自动化脚本（含自动抓包）
 * @version 1.0.0
 *
 * 说明：
 * 1. 自动抓包：开启重写与 MitM 后，打开“统一茄皇的家”小程序，提示抓包成功即可。
 * 2. 定时任务：每天自动做日常任务、浇水、偷好友能量并推送通知。
 *
 * [rewrite_local]
 * ^https:\/\/farmgames\.ioutu\.cn\/api\/web\/ url script-request-header https://raw.githubusercontent.com/5jwoj/BeRich/main/tyqh/tyqh.js
 *
 * [task_local]
 * 0 9,18 * * * https://raw.githubusercontent.com/5jwoj/BeRich/main/tyqh/tyqh.js, tag=统一茄皇的家, enabled=true
 *
 * [mitm]
 * hostname = farmgames.ioutu.cn
 */

const $ = new Env("统一茄皇的家五期");
const TOKEN_KEY = "qiehuang_token";
const BASE_URL = "https://farmgames.ioutu.cn";

// 默认浏览页面配置
const DEFAULT_BROWSE_TARGETS = {
  BROWSE_QIEHUANG: "/cms_design/design?productInstanceId=3171023957&vid=0&pageid=91156028957&essharewid=1501328539&share_vid=6013753979957&pmc=3%7C5.essharewid.0-3.vid.0-2%7C3%7C5.share_vid.86400",
};

// ===================== 入口判定 =====================
if (typeof $request !== "undefined") {
  // 抓包模式
  getCookie();
  $.done();
} else {
  // 定时任务模式
  main()
    .catch((e) => $.logErr(e))
    .finally(() => $.done());
}

// ===================== 自动抓包逻辑 =====================
function getCookie() {
  if ($request && $request.headers) {
    const headers = $request.headers;
    const auth = headers["Authorization"] || headers["authorization"];
    if (auth && auth.startsWith("Bearer ")) {
      const oldToken = $.getdata(TOKEN_KEY);
      if (oldToken !== auth) {
        $.setdata(auth, TOKEN_KEY);
        $.msg($.name, "🎉 自动抓包成功！", "已成功保存/更新 Token 凭据，可关闭抓包重写。");
        $.log(`[${$.name}] 成功抓取 Token: ${auth.slice(0, 20)}...`);
      }
    }
  }
}

// ===================== 主业务逻辑 =====================
async function main() {
  const token = $.getdata(TOKEN_KEY);
  if (!token) {
    $.msg($.name, "⚠️ 未检测到 Token", "请打开 Quantumult X 重写并进入“统一茄皇的家”小程序进行抓包！");
    return;
  }

  $.log(`\n━━━━━━ ${$.name} v1.0.0 开始运行 ━━━━━━`);
  const logs = [];

  try {
    // 1. 查询个人状态
    const homeInfo = await apiGet("/api/web/member/tomato/home", token);
    const nickName = homeInfo.nickName || "茄皇农夫";
    logs.push(`👤 账号：${nickName}`);
    logs.push(`📊 初始状态：能量 ${homeInfo.energyBalance || 0}，番茄 ${homeInfo.tomatoBalance || 0}`);

    // 2. 做任务
    logs.push("\n📋 【开始日常任务】");
    const tasks = await apiGet("/api/web/member/tomato/tasks", token);
    let completedCount = 0;

    for (const task of tasks || []) {
      if (String(task.completed) === "1" || task.actionType === "DONE") {
        $.log(`  ✔ ${task.taskName}（已完成）`);
        continue;
      }
      if (task.taskType === "FRIEND_STEAL_ENERGY") continue;

      try {
        if (task.taskType === "BROWSE") {
          const target = task.browseTarget || DEFAULT_BROWSE_TARGETS.BROWSE_QIEHUANG;
          await apiPost("/api/web/member/tomato/page-visit", { pagePath: target }, token);
          await $.wait(3000);
        }

        const res = await apiPost("/api/web/member/tomato/tasks/complete", {
          taskType: task.taskType,
          browseTarget: task.browseTarget || "",
        }, token);

        if (res.code === 200) {
          const reward = res.data?.rewardText || task.rewardText || "已完成";
          logs.push(`  ✔ ${task.taskName}（${reward}）`);
          completedCount++;
        } else {
          logs.push(`  ✖ ${task.taskName}（${res.msg || "失败"}）`);
        }
      } catch (e) {
        logs.push(`  ✖ ${task.taskName}（${e.message}）`);
      }
      await $.wait(1500);
    }
    if (completedCount === 0) logs.push("  当前无可执行任务");

    // 3. 浇水
    logs.push("\n💧 【开始浇水/使用能量】");
    const beforeWater = await apiGet("/api/web/member/tomato/home", token);
    if (Number(beforeWater.energyBalance || 0) > 0) {
      const waterRes = await apiPost("/api/web/member/tomato/energy/use", null, token);
      if (waterRes.code === 200) {
        const d = waterRes.data || {};
        logs.push(`  ✔ 消耗能量 ${d.usedEnergyAmount || 0}，获得番茄 ${d.gainedTomatoAmount || 0}`);
        logs.push(`  🌱 当前阶段：${d.stageName || "成长中"} (${d.currentExp || 0}/${d.stageRequiredExp || 0})`);
      } else {
        logs.push(`  ✖ 浇水失败：${waterRes.msg || "未知错误"}`);
      }
    } else {
      logs.push("  当前无可用能量");
    }

    // 4. 偷好友能量
    logs.push("\n🤝 【偷好友能量】");
    const friendsRes = await apiGet("/api/web/member/tomato/friends?pageNum=1&pageSize=50", token);
    const friends = friendsRes.rows || [];
    let stolenCount = 0;
    let stolenEnergy = 0;

    for (const f of friends) {
      if (Number(f.friendStatus) === 0 && f.friendTomatoUserId) {
        try {
          const fHome = await apiGet(`/api/web/member/tomato/friends/${f.friendTomatoUserId}/home`, token);
          const amount = Number(fHome.stealAmount || 0);
          if (String(fHome.canSteal) === "1" && amount > 0) {
            const stealRes = await apiPost("/api/web/member/tomato/friends/steal", { friendTomatoUserId: f.friendTomatoUserId }, token);
            if (stealRes.code === 200) {
              stolenCount++;
              stolenEnergy += amount;
            }
          }
        } catch (e) {}
        await $.wait(1000);
      }
    }
    if (stolenCount > 0) {
      logs.push(`  ✔ 成功收取 ${stolenCount} 位好友，共 ${stolenEnergy} 能量`);
    } else {
      logs.push("  暂无可收取的能量");
    }

    // 5. 结算最终状态
    const finalHome = await apiGet("/api/web/member/tomato/home", token);
    logs.push(`\n🏁 最终状态：能量 ${finalHome.energyBalance || 0}，番茄 ${finalHome.tomatoBalance || 0}`);

    // 发送系统通知
    $.msg($.name, `账号：${nickName} 运行完成`, logs.join("\n"));

  } catch (err) {
    $.logErr(err);
    $.msg($.name, "❌ 运行异常", err.message || String(err));
  }
}

// ===================== 网络请求封装 =====================
function apiGet(path, token) {
  return new Promise((resolve, reject) => {
    const options = {
      url: BASE_URL + path,
      headers: {
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Mobile Safari/537.36 MicroMessenger/8.0.50)",
        "Authorization": token,
        "Referer": `${BASE_URL}/`,
        "Origin": BASE_URL,
      },
    };
    $.get(options, (err, resp, data) => {
      if (err) return reject(err);
      try {
        const json = JSON.parse(data);
        resolve(json.data !== undefined ? json.data : json);
      } catch (e) {
        reject(new Error(`解析 JSON 失败: ${data}`));
      }
    });
  });
}

function apiPost(path, body, token) {
  return new Promise((resolve, reject) => {
    const options = {
      url: BASE_URL + path,
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Mobile Safari/537.36 MicroMessenger/8.0.50)",
        "Authorization": token,
        "Referer": `${BASE_URL}/`,
        "Origin": BASE_URL,
      },
      body: body ? JSON.stringify(body) : "",
    };
    $.post(options, (err, resp, data) => {
      if (err) return reject(err);
      try {
        const json = JSON.parse(data);
        resolve(json);
      } catch (e) {
        reject(new Error(`解析 JSON 失败: ${data}`));
      }
    });
  });
}

// ===================== QuanX/Surge/Loon 兼容 Env 库 =====================
function Env(name, opts) {
  return new (class {
    constructor(name, opts) {
      this.name = name;
      this.logs = [];
      Object.assign(this, opts);
    }
    isQuanX() { return typeof $task !== "undefined"; }
    isSurge() { return typeof $httpClient !== "undefined" && typeof $loon === "undefined"; }
    isLoon() { return typeof $loon !== "undefined"; }
    getdata(key) {
      if (this.isQuanX()) return $prefs.valueForKey(key);
      if (this.isSurge() || this.isLoon()) return $persistentStore.read(key);
    }
    setdata(val, key) {
      if (this.isQuanX()) return $prefs.setValueForKey(val, key);
      if (this.isSurge() || this.isLoon()) return $persistentStore.write(val, key);
    }
    msg(title = this.name, subtitle = "", json = "") {
      if (this.isQuanX()) $notify(title, subtitle, json);
      if (this.isSurge() || this.isLoon()) $notification.post(title, subtitle, json);
    }
    log(...args) {
      console.log(`[${this.name}]`, ...args);
    }
    logErr(err) {
      console.log(`[${this.name}] ERROR:`, err);
    }
    wait(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    get(options, callback) {
      if (this.isQuanX()) {
        if (typeof options === "string") options = { url: options };
        options.method = "GET";
        $task.fetch(options).then(
          (resp) => callback(null, resp, resp.body),
          (reason) => callback(reason.error, null, null)
        );
      }
    }
    post(options, callback) {
      if (this.isQuanX()) {
        if (typeof options === "string") options = { url: options };
        options.method = "POST";
        $task.fetch(options).then(
          (resp) => callback(null, resp, resp.body),
          (reason) => callback(reason.error, null, null)
        );
      }
    }
    done(val = {}) {
      $done(val);
    }
  })(name, opts);
}
