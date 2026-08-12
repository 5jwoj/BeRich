/**
 * Duolingo Lazy - QX 自动刷课脚本
 * 版本: v1.2.0 (详细日志 & 异常兼容增强版)
 * 类型: task (cron 定时任务)
 * 默认时间: 每天 08:00 自动执行
 *
 * 依赖: 需要先运行 duolingo_capture.js 捕获 JWT Token / Cookie
 */

// ═══════════════════════════════════════════
// ⚙️  用户配置区
// ═══════════════════════════════════════════
const TARGET_XP = 20;       // 目标 XP（每课约 10 XP，建议 10-30）
const ENABLE_BONUS = true;   // 是否启用 bonus 加成
const DELAY_MS = 1500;       // 课与课之间的间隔延迟（毫秒）
// ═══════════════════════════════════════════

(async () => {
  const VERSION = "v1.2.0";
  console.log(`[Duolingo Farm ${VERSION}] 🚀 启动定时刷课任务...`);

  // ── 读取持久化存储 ────────────────────────────────────────────────
  const jwt = $persistentStore.read("duolingo_jwt");
  const userId = $persistentStore.read("duolingo_uid");
  const fromLang = $persistentStore.read("duolingo_from_lang") || "en";
  const learningLang = $persistentStore.read("duolingo_learning_lang") || "zh";

  // ── 前置检查 ──────────────────────────────────────────────────────
  if (!jwt || !userId) {
    console.log(`[Duolingo Farm ${VERSION}] ❌ 错误: 未能在存储中找到 duolingo_jwt 或 duolingo_uid`);
    $notify(
      `🦜 Duolingo Lazy ${VERSION}`,
      "❌ 未找到登录凭据",
      "请在浏览器打开网页版或手机 App 登录 Duolingo，等待 Cookie/Token 自动捕获成功后再试！"
    );
    $done();
    return;
  }

  // 验证 JWT 是否过期
  try {
    const parts = jwt.split(".");
    if (parts.length === 3) {
      let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4 !== 0) {
        base64 += "=";
      }
      const payload = JSON.parse(atob(base64));
      const nowTs = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < nowTs + 300) {
        console.log(`[Duolingo Farm ${VERSION}] ⚠️ JWT 已过期或即将过期!`);
        $notify(
          `🦜 Duolingo Lazy ${VERSION}`,
          "⚠️ 登录凭据已过期",
          "请重新登录 Duolingo 网页或 App 自动更新 Token"
        );
        $persistentStore.write("", "duolingo_jwt");
        $done();
        return;
      }
    }
  } catch (e) {
    console.log(`[Duolingo Farm ${VERSION}] ⚠️ JWT 检查提示:`, e);
  }

  // ── 计算课程数量 ──────────────────────────────────────────────────
  const totalLessons = Math.ceil(TARGET_XP / 10);
  let completedLessons = 0;
  let totalEarnedXP = 0;

  console.log(`[Duolingo Farm ${VERSION}] 🎯 目标: ${TARGET_XP} XP (${totalLessons} 节课), 用户ID: ${userId}`);
  console.log(`[Duolingo Farm ${VERSION}] 🌐 语言方向: ${fromLang} -> ${learningLang}`);

  $notify(
    `🦜 Duolingo Lazy ${VERSION}`,
    "🚀 开始自动刷课",
    `目标: ${TARGET_XP} XP (${totalLessons} 节课)\n当前语言: ${learningLang}`
  );

  const duoFetch = (url, method, body) =>
    new Promise((resolve, reject) => {
      const opts = {
        url,
        method,
        headers: {
          Authorization: `Bearer ${jwt}`,
          Cookie: `jwt_token=${jwt}`,
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
          "Accept": "application/json",
        },
      };
      if (body) {
        opts.body = JSON.stringify(body);
      }
      $task.fetch(opts).then(resolve).catch(reject);
    });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function completeSingleLesson(index) {
    console.log(`[Duolingo Farm ${VERSION}] ⏳ [${index + 1}/${totalLessons}] 正在创建练习会话...`);

    const sessionBody = {
      challengeTypes: [
        "assist", "characterIntro", "characterMatch", "characterPuzzle",
        "characterSelect", "characterTrace", "characterWrite",
        "completeReverseTranslation", "definition", "dialogue",
        "extendedMatch", "extendedListenMatch", "form", "freeResponse",
        "gapFill", "judge", "listen", "listenComplete", "listenMatch",
        "match", "name", "listenComprehension", "listenIsolation",
        "listenSpeak", "listenTap", "orderTapComplete", "partialListen",
        "partialReverse", "patternTapComplete", "radioBinary", "radioImage",
        "reverseTap", "selectPronunciation", "selectTranslation", "svgPuzzle",
        "syllableTap", "syllableListenTap", "speak", "tapCloze",
        "tapClozeTable", "tapComplete", "tapCompleteTable", "tapDescribe",
        "translate", "transliterate", "transliterationAssist", "typeCloze",
        "typeClozeTable", "typeComplete", "typeCompleteTable", "writeEmail",
      ],
      currentMasteredSkillCount: 0,
      fromLanguage: fromLang,
      isFinalSkill: false,
      juiciness: 1,
      learningLanguage: learningLang,
      maxInLessonPodcasts: 1,
      nux: null,
      podcastLearningLanguage: null,
      prioritizeSmallSkills: true,
      sessionType: "GLOBAL_PRACTICE",
      skillIds: [],
      smartTipsVersion: 2,
      type: "PRACTICE",
    };

    const createResp = await duoFetch(
      "https://www.duolingo.com/2017-06-30/sessions",
      "POST",
      sessionBody
    );

    if (!createResp || (createResp.statusCode !== 200 && createResp.statusCode !== 201)) {
      const code = createResp ? createResp.statusCode : "Network Error";
      const body = createResp ? createResp.body : "";
      throw new Error(`创建会话失败 HTTP ${code}: ${body}`);
    }

    const session = JSON.parse(createResp.body);
    const sessionId = session.id;
    if (!sessionId) {
      throw new Error("未能获取会话 ID");
    }
    console.log(`[Duolingo Farm ${VERSION}] ✅ 会话创建成功 ID: ${sessionId}`);

    const timeTaken = Math.floor(Math.random() * 60) + 30;
    const startTime = Math.floor(Date.now() / 1000) - timeTaken;
    const endTime = Math.floor(Date.now() / 1000);

    await sleep(800);

    console.log(`[Duolingo Farm ${VERSION}] ⏳ [${index + 1}/${totalLessons}] 正在提交完成结果...`);
    const completeBody = {
      endTime,
      failed: false,
      startTime,
      timeTaken,
      enableBonusPoints: ENABLE_BONUS,
      type: "PRACTICE",
    };

    const completeResp = await duoFetch(
      `https://www.duolingo.com/2017-06-30/sessions/${sessionId}`,
      "PUT",
      completeBody
    );

    if (!completeResp || (completeResp.statusCode !== 200 && completeResp.statusCode !== 201)) {
      const code = completeResp ? completeResp.statusCode : "Network Error";
      const body = completeResp ? completeResp.body : "";
      throw new Error(`提交完成失败 HTTP ${code}: ${body}`);
    }

    const result = JSON.parse(completeResp.body);
    const xpEarned = result.xpGained || result.xpEarned || 10;
    console.log(`[Duolingo Farm ${VERSION}] 🎉 [${index + 1}/${totalLessons}] 单课完成，获得 ${xpEarned} XP`);
    return xpEarned;
  }

  const errors = [];
  for (let i = 0; i < totalLessons; i++) {
    try {
      const xp = await completeSingleLesson(i);
      completedLessons++;
      totalEarnedXP += xp;

      if (i < totalLessons - 1) {
        await sleep(DELAY_MS);
      }
    } catch (err) {
      console.log(`[Duolingo Farm ${VERSION}] ❌ 第 ${i + 1} 课失败:`, err.message || err);
      errors.push(`第 ${i + 1} 课: ${err.message || "未知错误"}`);

      if (
        err.message &&
        (err.message.includes("401") || err.message.includes("403"))
      ) {
        $notify(
          `🦜 Duolingo Lazy ${VERSION}`,
          "❌ 认证失效",
          "登录状态已失效，请重新登录 Duolingo 网页或 App 更新 Cookie/Token"
        );
        $persistentStore.write("", "duolingo_jwt");
        $done();
        return;
      }
      await sleep(2000);
    }
  }

  // ── 结果通知 ──────────────────────────────────────────────────────
  if (completedLessons === totalLessons) {
    $notify(
      `🦜 Duolingo Lazy ${VERSION}`,
      "🎉 全部完成！",
      `已完成 ${completedLessons} 节课\n获得 XP: ${totalEarnedXP}\n连胜打卡保住了 🔥`
    );
  } else if (completedLessons > 0) {
    $notify(
      `🦜 Duolingo Lazy ${VERSION}`,
      `⚠️ 部分完成 (${completedLessons}/${totalLessons})`,
      `成功: ${completedLessons} 课 (${totalEarnedXP} XP)\n失败: ${errors.length} 课`
    );
  } else {
    $notify(
      `🦜 Duolingo Lazy ${VERSION}`,
      "❌ 刷课任务失败",
      `原因: ${errors[0] || "网络响应异常，请查看日志"}`
    );
  }

  $done();
})();
