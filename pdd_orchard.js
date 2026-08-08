/**
 * 拼多多果园 - Quantumult X 自动浇水领水滴脚本
 * 
 * 官方调试与配置文档见 README.md
 * 
 * [rewrite_local]
 * ^https:\/\/mobile\.yangkeduo\.com\/(garden_index_lz_0\.html|proxy\/api\/api\/manor) url script-request-header https://raw.githubusercontent.com/5jwoj/BeRich/main/pdd_orchard.js
 * 
 * [task_local]
 * 0 8,12,18 * * * https://raw.githubusercontent.com/5jwoj/BeRich/main/pdd_orchard.js, tag=拼多多果园, enabled=true
 * 
 * [mitm]
 * hostname = mobile.yangkeduo.com
 */

const LOG_PREFIX = "[拼多多果园]";
const DEBUG = true; // 调试模式控制台输出控制

const MANOR_BASE = "https://mobile.yangkeduo.com/proxy/api/api";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090a13) UnifiedPCWindowsWechat(0xf254193e) XWEB/19841";

// 全局环境判断与适配
const isRequest = typeof $request !== "undefined";

function log(msg, detail = null) {
  if (!DEBUG) return;
  const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  if (detail !== null) {
    console.log(`${LOG_PREFIX} [${time}] ${msg}\n${typeof detail === 'object' ? JSON.stringify(detail, null, 2) : detail}`);
  } else {
    console.log(`${LOG_PREFIX} [${time}] ${msg}`);
  }
}

// ===== 1. Cookie 抓取（Rewrite 模式） =====
function getCookie() {
  log(">>> 开始执行重写抓取 Cookie 流程 <<<");
  const headers = $request.headers;
  log("拦截到的请求 URL:", $request.url);

  // 找寻 Cookie (区分大小写)
  let cookieHeader = headers["Cookie"] || headers["cookie"] || headers["COOKIE"];

  if (!cookieHeader) {
    log("[警告] 请求头中未找到 Cookie 字段！");
    $done({});
    return;
  }

  log("获取到的原生 Header Cookie:", cookieHeader);

  // 校验是否包含拼多多核心用户标识 pdd_user_id
  const uidMatch = cookieHeader.match(/pdd_user_id=(\d+)/);
  const tubeMatch = cookieHeader.match(/tubetoken=([^;]+)/);

  if (uidMatch) {
    const pdduid = uidMatch[1];
    const tubetoken = tubeMatch ? tubeMatch[1] : "";

    $prefs.setValueForKey(cookieHeader, "pdd_orchard_cookie");
    $prefs.setValueForKey(pdduid, "pdd_orchard_uid");
    if (tubetoken) {
      $prefs.setValueForKey(tubetoken, "pdd_orchard_tubetoken");
    }

    log(`[成功] 已成功提取并保存 Cookie！\nUID: ${pdduid}\nTubeToken: ${tubetoken ? tubetoken.slice(0, 10) + '...' : '未匹配'}`);

    $notify("拼多多果园", "Cookie 抓取成功 🎉", `用户ID: ${pdduid}\nCookie 与凭借已保存至持久化存储`);
  } else {
    log("[提示] 拦截到拼多多域名请求，但 Cookie 中无 pdd_user_id，忽略该请求。");
  }

  $done({});
}

// ===== 2. 封装 QuanX 原生 HTTP POST/GET 请求 =====
function httpRequest(options) {
  return new Promise((resolve, reject) => {
    const reqOpts = {
      url: options.url,
      method: options.method || "POST",
      headers: Object.assign({
        "User-Agent": UA,
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json;charset=UTF-8",
        "Origin": "https://mobile.yangkeduo.com",
        "Referer": "https://mobile.yangkeduo.com/garden_index_lz_0.html",
      }, options.headers || {}),
      body: typeof options.body === "object" ? JSON.stringify(options.body) : options.body
    };

    log(`[HTTP Request] ${reqOpts.method} -> ${reqOpts.url}`);
    if (reqOpts.body) log(`[HTTP Body]`, reqOpts.body);

    $task.fetch(reqOpts).then(
      response => {
        log(`[HTTP Response] Status: ${response.statusCode}`);
        let resData = response.body;
        try {
          resData = JSON.parse(response.body);
        } catch (e) {
          log(`[HTTP Response Warning] 响应体非标准 JSON: ${response.body.slice(0, 100)}`);
        }
        resolve(resData);
      },
      reason => {
        log(`[HTTP Error] 请求异常失败:`, reason);
        reject(reason);
      }
    );
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== 3. 果园自动化业务逻辑 =====

// 查询水滴数
async function getWater(pdduid, cookieStr) {
  const url = `${MANOR_BASE}/manor-gateway/manor/query/user/water?pdduid=${pdduid}&is_back=1`;
  try {
    const res = await httpRequest({
      url,
      headers: { "Cookie": cookieStr },
      body: {}
    });
    return res && res.water_amount ? res.water_amount : 0;
  } catch (e) {
    log("[水滴查询失败]", e);
    return 0;
  }
}

// 获取果园首页数据并刷新 tubetoken
async function getHomePage(pdduid, cookieStr, tubetoken) {
  log("--- [1/6] 刷新果园首页数据 ---");
  const url = `${MANOR_BASE}/manor-query/proxy/home/page?pdduid=${pdduid}`;
  const body = {
    "mission_type": 0,
    "fun_id": "wechat_app_home",
    "message_source": null,
    "page_type": "HOME_PAGE",
    "push_source_mission_type": 0,
    "fruit_config_version": "",
    "unlock_scene_version": "",
    "app_home_click_icon_type": null,
    "tubetoken": tubetoken,
    "push_act_source": null,
    "need_show_home_popup": true,
    "fun_pl": 2
  };

  try {
    const res = await httpRequest({
      url,
      headers: { "Cookie": cookieStr },
      body
    });
    log("首页接口返回:", res);

    if (res.error_code === 40001) {
      log("[错误] 首页接口返回 40001，Cookie 可能已过期，需要重新进入果园抓取！");
      return { newToken: null, water: 0 };
    }

    const newToken = res.tubetoken || tubetoken;
    const water = res.water_amount || 0;
    log(`[首页成功] 当前水滴数: ${water}, 最新 TubeToken: ${newToken ? newToken.slice(0, 10) + '...' : '无'}`);
    return { newToken, water };
  } catch (e) {
    log("[首页加载异常]", e);
    return { newToken: null, water: 0 };
  }
}

// 每日签到
async function dailyCheckin(pdduid, cookieStr, tubetoken) {
  log("--- [2/6] 执行每日签到 ---");
  const url = `${MANOR_BASE}/manor/common/apply/activity?pdduid=${pdduid}`;
  const body = {
    "type": 201811,
    "params": { "ui_id": 3, "type": 2 },
    "fun_id": "wechat_app_home",
    "tubetoken": tubetoken,
    "fun_pl": 2
  };

  try {
    const res = await httpRequest({
      url,
      headers: { "Cookie": cookieStr },
      body
    });
    log("签到返回结果:", res);
    if (res && res.success) {
      log("[签到] 签到成功！🎉");
      return true;
    } else {
      log("[签到] 今日已签到或不可签到:", res ? res.error_msg : "未知");
      return false;
    }
  } catch (e) {
    log("[签到异常]", e);
    return false;
  }
}

// 自动浇水
async function waterTree(pdduid, cookieStr, tubetoken, maxTimes = 50) {
  log("--- [3/6] 开始自动浇水 ---");
  let water = await getWater(pdduid, cookieStr);
  log(`初始水滴数量: ${water}`);

  if (water < 10) {
    log("水滴数量不足 10 颗，跳过浇水");
    return 0;
  }

  const count = Math.min(maxTimes, Math.floor(water / 10));
  let watered = 0;
  const url = `${MANOR_BASE}/manor/water/cost?pdduid=${pdduid}`;

  for (let i = 0; i < count; i++) {
    const body = {
      "atw": true,
      "location_auth": false,
      "last_stay_time": 10 + i * 4,
      "can_trigger_random_mission": false,
      "product_scene": 0,
      "minor": false,
      "ext_params": { "can_trigger201824": true },
      "mission_type": 0,
      "cost_water_amount": 10,
      "merge_cost": false,
      "fun_id": "wechat_app_home",
      "lower_end_device": false,
      "cost_water_competition_in_scene_icon": false,
      "is_small_screen": true,
      "tubetoken": tubetoken,
      "fun_pl": 2
    };

    try {
      const res = await httpRequest({
        url,
        headers: { "Cookie": cookieStr },
        body
      });
      const left = res ? res.now_water_amount : null;

      if (left !== null && left < water) {
        water = left;
        watered++;
        log(`[浇水进度] 第 ${watered}/${count} 次成功, 剩余水滴: ${left}`);
        if (left < 10) break;
        await sleep(300);
      } else {
        log("[浇水] 水滴未扣除或提示达到限制，停止后续浇水", res);
        break;
      }
    } catch (e) {
      log(`[浇水第 ${i + 1} 次异常]`, e);
      break;
    }
  }

  const finalWater = await getWater(pdduid, cookieStr);
  log(`[浇水完成] 共浇水 ${watered} 次，剩余水滴: ${finalWater}`);
  return watered;
}

// 获取任务列表并自动接受/领取
async function handleMissions(pdduid, cookieStr, tubetoken) {
  log("--- [4/6] 获取与做任务 ---");
  const url = `${MANOR_BASE}/manor/mission/list?pdduid=${pdduid}`;
  const requestParamsInfo = {};
  for (let i = 1; i <= 8; i++) {
    requestParamsInfo[String(i)] = { "needRefresh": true };
  }

  const body = {
    "activity_id_list": [201015, 201036],
    "mission_types": [
      38160, 38242, 38090, 38451, 37859, 38428,
      38500, 38501, 38502, 38503, 38504, 38505,
      38600, 38601, 38700, 38701, 38800, 38900,
      37900, 37950, 38000, 38050, 38100, 38150
    ],
    "request_params": {
      "act201015EntryInfo": requestParamsInfo,
      "act201036EntryInfo": requestParamsInfo
    },
    "lower_end_device": false,
    "tubetoken": tubetoken,
    "fun_pl": 2
  };

  try {
    const res = await httpRequest({
      url,
      headers: { "Cookie": cookieStr },
      body
    });

    const activityMap = res.activity_vo_map || {};
    const tasks = [];

    Object.keys(activityMap).forEach(actIdStr => {
      const actId = parseInt(actIdStr);
      const actMissions = activityMap[actIdStr].mission_list || {};

      Object.keys(actMissions).forEach(missionIdStr => {
        const m = actMissions[missionIdStr];
        const missionId = parseInt(missionIdStr);
        let rewardAmount = 0;
        let rewardType = "";

        const rewardInfo = m.reward_info || [];
        for (const ri of rewardInfo) {
          if (ri.reward_type === 1) {
            rewardAmount = ri.min_reward_amount || 0;
            rewardType = "水滴";
            break;
          }
        }
        if (!rewardAmount && rewardInfo.length > 0) {
          rewardAmount = rewardInfo[0].min_reward_amount || 0;
          rewardType = `T${rewardInfo[0].reward_type || '?'}`;
        }

        tasks.push({
          activity_id: actId,
          mission_id: missionId,
          type: m.type,
          unified_status: m.unified_status,
          is_draw: m.is_draw || false,
          is_open: m.is_open || false,
          finished_count: m.finished_count || 0,
          max_count: m.max_count || 0,
          reward_amount: rewardAmount,
          reward_type: rewardType
        });
      });
    });

    const canClaim = tasks.filter(t => !t.is_draw && t.is_open && t.finished_count >= 1);
    const needAccept = tasks.filter(t => !t.is_draw && !t.is_open && t.finished_count >= 1);

    log(`[任务概览] 共找到 ${tasks.length} 个任务，可领取 ${canClaim.length} 个，待接受 ${needAccept.length} 个`);

    // 接受任务
    for (const t of needAccept) {
      log(`[接受任务] 尝试接受: act=${t.activity_id}, id=${t.mission_id}`);
      const acceptUrl = `${MANOR_BASE}/manor/mission/accept?pdduid=${pdduid}`;
      await httpRequest({
        url: acceptUrl,
        headers: { "Cookie": cookieStr },
        body: { "mission_id": t.mission_id, "activity_id": t.activity_id, "tubetoken": tubetoken, "fun_pl": 2 }
      });
      await sleep(400);
    }

    // 领取奖励
    let totalClaimed = 0;
    for (const t of canClaim) {
      log(`[领取任务] 尝试领取: act=${t.activity_id}, id=${t.mission_id}`);
      const drawUrl = `${MANOR_BASE}/manor/mission/draw?pdduid=${pdduid}`;
      const drawRes = await httpRequest({
        url: drawUrl,
        headers: { "Cookie": cookieStr },
        body: { "mission_id": t.mission_id, "activity_id": t.activity_id, "tubetoken": tubetoken, "fun_pl": 2 }
      });
      if (drawRes && drawRes.success) {
        const reward = drawRes.water || drawRes.reward_amount || t.reward_amount;
        totalClaimed += reward;
        log(`[领取成功] act=${t.activity_id}, id=${t.mission_id} -> 获得 +${reward} ${t.reward_type}`);
      }
      await sleep(400);
    }

    return totalClaimed;
  } catch (e) {
    log("[任务列表异常]", e);
    return 0;
  }
}

// 偷水滴主流程
async function stealFromFriends(pdduid, cookieStr, tubetoken) {
  log("--- [5/6] 偷好友与机器人水滴 ---");
  try {
    // 1. 获取好友列表
    const listUrl = `${MANOR_BASE}/manor-query/friend/list/page?pdduid=${pdduid}`;
    const listRes = await httpRequest({
      url: listUrl,
      headers: { "Cookie": cookieStr },
      body: { "page_num": 1, "tubetoken": tubetoken, "fun_pl": 2 }
    });

    const friendList = listRes.friend_list || [];
    const canStealFriends = friendList
      .filter(f => f.steal_water_status && f.steal_water_status.status === 2)
      .map(f => ({ uid: f.uid, nickname: f.nickname || "未知好友", amount: f.amount || 0 }));

    // 2. 获取剩余偷水次数与机器人
    const chanceUrl = `${MANOR_BASE}/manor/steal/chance/lack?pdduid=${pdduid}`;
    const chanceRes = await httpRequest({
      url: chanceUrl,
      headers: { "Cookie": cookieStr },
      body: { "tubetoken": tubetoken, "fun_pl": 2 }
    });

    const stealInfo = (chanceRes.activity_vo_map || {})["201423"] || {};
    const restChance = stealInfo.rest_chance || 0;
    const robots = stealInfo.robots || [];
    const robotTargets = robots.map(r => ({ uid: r.uid, nickname: r.nickname || "机器人", amount: r.water || 0 }));

    log(`[偷水信息] 剩余偷水次数: ${restChance}, 可偷好友: ${canStealFriends.length} 人, 机器人: ${robotTargets.length} 个`);

    const allTargets = [...canStealFriends, ...robotTargets];
    if (allTargets.length === 0 || restChance <= 0) {
      log("[偷水] 没有可偷取的目标或偷水次数已耗尽");
      return 0;
    }

    const maxSteals = Math.min(restChance, allTargets.length);
    let totalStolen = 0;
    let stealSuccessCount = 0;

    for (let i = 0; i < maxSteals; i++) {
      const target = allTargets[i];
      if (target.amount <= 0) continue;

      const dog = Math.floor(Math.random() * 3) + 1; // 随机狗位 1~3
      let stolen = 0;

      for (let retry = 0; retry < 3; retry++) {
        const stealUrl = `${MANOR_BASE}/manor/steal/water?pdduid=${pdduid}`;
        const stealRes = await httpRequest({
          url: stealUrl,
          headers: { "Cookie": cookieStr },
          body: { "friend_uid": target.uid, "steal_type": 10, "dog_status": dog, "tubetoken": tubetoken, "fun_pl": 2 }
        });

        const amount = stealRes ? (stealRes.steal_amount || 0) : 0;
        const bitten = stealRes ? (stealRes.bitten_water || 0) : 0;

        if (amount > 0) {
          stolen = amount;
          break;
        }
        if (bitten > 0) {
          log(`[被狗咬] target=${target.nickname}, dog=${dog}, 扣除水滴=${bitten}, 尝试重试...`);
        }
        await sleep(150);
      }

      if (stolen > 0) {
        totalStolen += stolen;
        stealSuccessCount++;
        log(`[偷水成功] 偷取 ${target.nickname} (UID: ${target.uid}) 获得 +${stolen} 水滴`);
      } else {
        log(`[偷水未成功] 偷取 ${target.nickname} (UID: ${target.uid}) 失败`);
      }
      await sleep(300);
    }

    log(`[偷水统计] 成功偷取 ${stealSuccessCount} 次，共获得水滴: ${totalStolen}`);
    return totalStolen;
  } catch (e) {
    log("[偷水流程异常]", e);
    return 0;
  }
}

// ===== 4. Task 模式主入口 =====
async function main() {
  log(">>> 开始执行拼多多果园定时自动化任务 <<<");

  const cookieStr = $prefs.getValueForKey("pdd_orchard_cookie");
  let pdduid = $prefs.getValueForKey("pdd_orchard_uid");
  let tubetoken = $prefs.getValueForKey("pdd_orchard_tubetoken") || "";

  if (!cookieStr) {
    log("[错误] 未检测到存储的 Cookie！请先开启 QuanX 重写并在微信中打开拼多多果园页面！");
    $notify("拼多多果园 ❌", "未配置或获取到 Cookie", "请打开重写并进入拼多多果园小程序页面自动抓取");
    $done();
    return;
  }

  if (!pdduid) {
    const match = cookieStr.match(/pdd_user_id=(\d+)/);
    if (match) pdduid = match[1];
  }

  if (!pdduid) {
    log("[错误] Cookie 中未能识别 pdd_user_id！");
    $notify("拼多多果园 ❌", "Cookie 无效", "缺失 pdd_user_id 字段，请重新抓取");
    $done();
    return;
  }

  log(`[初始化成功] 当前账号 UID: ${pdduid}`);

  // 1. 刷新首页并刷新 tubetoken
  const { newToken, water: startWater } = await getHomePage(pdduid, cookieStr, tubetoken);
  if (newToken === null) {
    $notify("拼多多果园 ❌", "Cookie 已失效", "请重新在手机上打开拼多多果园抓取最新 Cookie");
    $done();
    return;
  }
  if (newToken && newToken !== tubetoken) {
    tubetoken = newToken;
    $prefs.setValueForKey(tubetoken, "pdd_orchard_tubetoken");
  }

  // 2. 签到
  await dailyCheckin(pdduid, cookieStr, tubetoken);
  await sleep(800);

  // 3. 浇水
  const wateredTimes = await waterTree(pdduid, cookieStr, tubetoken, 50);
  await sleep(800);

  // 4. 做任务领奖励
  const claimedWater = await handleMissions(pdduid, cookieStr, tubetoken);
  await sleep(800);

  // 5. 偷水滴
  const stolenWater = await stealFromFriends(pdduid, cookieStr, tubetoken);

  // 6. 获取最终水滴总数
  const finalWater = await getWater(pdduid, cookieStr);

  const summaryMsg = `账号ID: ${pdduid}\n初始水滴: ${startWater} -> 最终水滴: ${finalWater}\n自动浇水: ${wateredTimes}次\n任务奖励: +${claimedWater}水滴\n偷水收益: +${stolenWater}水滴`;
  log("--- [6/6] 任务汇总 ---", summaryMsg);

  $notify("拼多多果园 自动任务完成 🎉", `水滴余额: ${finalWater}`, summaryMsg);
  $done();
}

// ===== 5. 判断运行环境分支入口 =====
if (isRequest) {
  getCookie();
} else {
  main().catch(err => {
    log("[致命错误] 任务运行捕获到未处理异常:", err);
    $notify("拼多多果园 ❌", "运行发生未捕获异常", String(err));
    $done();
  });
}
