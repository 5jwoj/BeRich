/**
 * Duolingo Lazy - QX 自动刷课脚本
 * 类型: task (cron 定时任务)
 * 默认时间: 每天 08:00 自动执行
 *
 * 依赖: 需要先运行 duolingo_capture.js 捕获 JWT
 * 
 * 配置项（在脚本顶部修改）:
 *   TARGET_XP   - 每次任务目标 XP（每课 10 XP，建议最低 10）
 *   ENABLE_BONUS - 是否开启 bonus 奖励点
 */

// ═══════════════════════════════════════════
// ⚙️  用户配置区
// ═══════════════════════════════════════════
const TARGET_XP = 20;       // 目标 XP（10 的倍数，每课赚 10 XP）
const ENABLE_BONUS = true;   // 是否启用 bonus 加成
const DELAY_MS = 1500;       // 每课之间的延迟（毫秒），模拟人工操作
// ═══════════════════════════════════════════

(async () => {
  // ── 读取持久化存储 ────────────────────────────────────────────────
  const jwt = $persistentStore.read("duolingo_jwt");
  const userId = $persistentStore.read("duolingo_uid");
  const fromLang = $persistentStore.read("duolingo_from_lang") || "en";
  const learningLang = $persistentStore.read("duolingo_learning_lang") || "zh";

  // ── 前置检查 ──────────────────────────────────────────────────────
  if (!jwt || !userId) {
    $notify(
      "🦜 Duolingo Lazy",
      "❌ 未找到登录信息",
      "请先打开 Duolingo App，等待 Token 自动捕获后再运行此脚本"
    );
    $done();
    return;
  }

  // 验证 JWT 是否过期
  try {
    const base64 = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64));
    const nowTs = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowTs + 300) {
      $notify(
        "🦜 Duolingo Lazy",
        "⚠️ Token 已过期",
        "请重新打开 Duolingo App 刷新 Token"
      );
      // 清除过期 Token
      $persistentStore.write("", "duolingo_jwt");
      $done();
      return;
    }
  } catch (e) {
    console.log("[Duolingo] JWT 解析失败:", e);
  }

  // ── 计算需要刷几节课 ──────────────────────────────────────────────
  const totalLessons = Math.ceil(TARGET_XP / 10);
  let completedLessons = 0;
  let totalEarnedXP = 0;

  console.log(`[Duolingo] 开始刷课: 目标 ${TARGET_XP} XP，共 ${totalLessons} 节课`);
  console.log(`[Duolingo] 语言: ${fromLang} -> ${learningLang}, userId: ${userId}`);

  $notify(
    "🦜 Duolingo Lazy",
    "🚀 开始自动刷课",
    `目标: ${TARGET_XP} XP (${totalLessons} 节课)\n语言: ${learningLang}`
  );

  // ── 通用 HTTP 请求封装 ────────────────────────────────────────────
  const duoFetch = (url, method, body) =>
    new Promise((resolve, reject) => {
      const opts = {
        url,
        method,
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
          "User-Agent":
            "Duolingo/5.2.35 iPhone/18.1 (iPhone; iPhone OS 18.1 like Mac OS X)",
          "Accept": "application/json",
          "Accept-Language": "zh-Hans-CN;q=1, en-CN;q=0.9",
        },
      };
      if (body) {
        opts.body = JSON.stringify(body);
      }
      $task.fetch(opts).then(resolve).catch(reject);
    });

  // ── 延迟函数 ──────────────────────────────────────────────────────
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── 单节课完成逻辑 ────────────────────────────────────────────────
  async function completeSingleLesson() {
    // Step 1: 创建练习会话
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

    if (createResp.statusCode !== 200 && createResp.statusCode !== 201) {
      throw new Error(`创建会话失败: HTTP ${createResp.statusCode} - ${createResp.body}`);
    }

    const session = JSON.parse(createResp.body);
    const sessionId = session.id;
    if (!sessionId) {
      throw new Error("会话 ID 为空，服务器响应: " + createResp.body);
    }
    console.log(`[Duolingo] 创建会话成功: ${sessionId}`);

    // 模拟做题耗时（随机 30-90 秒）
    const timeTaken = Math.floor(Math.random() * 60) + 30;
    const startTime = Math.floor(Date.now() / 1000) - timeTaken;
    const endTime = Math.floor(Date.now() / 1000);

    // 短暂等待，模拟真实用户行为
    await sleep(800);

    // Step 2: 提交课程完成
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

    if (completeResp.statusCode !== 200 && completeResp.statusCode !== 201) {
      throw new Error(`提交完成失败: HTTP ${completeResp.statusCode} - ${completeResp.body}`);
    }

    const result = JSON.parse(completeResp.body);
    const xpEarned = result.xpGained || result.xpEarned || 10;
    console.log(`[Duolingo] 课程完成，获得 XP: ${xpEarned}`);
    return xpEarned;
  }

  // ── 主循环 ────────────────────────────────────────────────────────
  const errors = [];
  
  for (let i = 0; i < totalLessons; i++) {
    try {
      const xp = await completeSingleLesson();
      completedLessons++;
      totalEarnedXP += xp;
      console.log(`[Duolingo] 进度: ${completedLessons}/${totalLessons} 课 | 已获 XP: ${totalEarnedXP}`);

      // 课与课之间延迟
      if (i < totalLessons - 1) {
        await sleep(DELAY_MS);
      }
    } catch (err) {
      console.log(`[Duolingo] 第 ${i + 1} 课失败:`, err.message || err);
      errors.push(`第 ${i + 1} 课: ${err.message || "未知错误"}`);
      
      // 如果是 401/403，Token 已失效，立即终止
      if (
        err.message &&
        (err.message.includes("401") || err.message.includes("403"))
      ) {
        $notify(
          "🦜 Duolingo Lazy",
          "❌ 认证失败",
          "Token 已失效，请重新打开 Duolingo App 刷新 Token"
        );
        $persistentStore.write("", "duolingo_jwt");
        $done();
        return;
      }

      // 其他错误等待后继续
      await sleep(2000);
    }
  }

  // ── 完成通知 ──────────────────────────────────────────────────────
  if (completedLessons === totalLessons) {
    $notify(
      "🦜 Duolingo Lazy",
      "🎉 刷课完成！",
      `共完成 ${completedLessons} 节课\n获得 XP: ${totalEarnedXP}\n连胜已保住 🔥`
    );
  } else if (completedLessons > 0) {
    $notify(
      "🦜 Duolingo Lazy",
      `⚠️ 部分完成 (${completedLessons}/${totalLessons})`,
      `获得 XP: ${totalEarnedXP}\n失败 ${errors.length} 节课\n${errors[0] || ""}`
    );
  } else {
    $notify(
      "🦜 Duolingo Lazy",
      "❌ 刷课失败",
      `全部 ${totalLessons} 节课均失败\n${errors[0] || "请检查网络或 Token"}`
    );
  }

  $done();
})();
