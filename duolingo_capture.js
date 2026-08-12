/**
 * Duolingo Lazy - QX Token 自动捕获脚本
 * 类型: http-request（请求拦截）
 * 触发条件: 打开 Duolingo App，任意 API 请求时自动触发
 *
 * 捕获内容:
 *   - JWT Token (Authorization Header)
 *   - User ID (从 JWT payload 解析)
 *   - 学习语言 / 母语 (从用户信息接口)
 */

(async () => {
  const url = $request.url;
  const headers = $request.headers;

  // ── 1. 提取 Authorization Header 中的 JWT ──────────────────────────
  const authHeader =
    headers["Authorization"] ||
    headers["authorization"] ||
    headers["AUTHORIZATION"] ||
    "";

  if (!authHeader.startsWith("Bearer ")) {
    // 没有 Bearer Token，跳过（不是需要鉴权的请求）
    $done({});
    return;
  }

  const jwt = authHeader.replace("Bearer ", "").trim();
  if (!jwt || jwt.split(".").length !== 3) {
    $done({});
    return;
  }

  // ── 2. 解析 JWT Payload 取 userId & 过期时间 ──────────────────────
  let payload;
  try {
    // QX 环境支持 atob
    const base64 = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    payload = JSON.parse(atob(base64));
  } catch (e) {
    console.log("[Duolingo] JWT 解析失败:", e);
    $done({});
    return;
  }

  const userId = String(payload.sub || "");
  const expireAt = payload.exp
    ? new Date(payload.exp * 1000).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
      })
    : "未知";
  const nowTs = Math.floor(Date.now() / 1000);

  // ── 3. 检查是否已保存过相同 Token（避免重复通知）─────────────────
  const savedJWT = $persistentStore.read("duolingo_jwt") || "";
  const isNew = savedJWT !== jwt;

  if (!isNew) {
    // Token 未变化，静默跳过
    $done({});
    return;
  }

  // ── 4. 检查 Token 是否已过期 ─────────────────────────────────────
  if (payload.exp && payload.exp < nowTs) {
    $notify(
      "🦜 Duolingo Lazy",
      "⚠️ Token 已过期",
      `过期时间: ${expireAt}\n请重新登录 Duolingo App`
    );
    $done({});
    return;
  }

  // ── 5. 保存 JWT 和 userId ─────────────────────────────────────────
  $persistentStore.write(jwt, "duolingo_jwt");
  $persistentStore.write(userId, "duolingo_uid");
  console.log("[Duolingo] JWT 已保存，userId:", userId);

  // ── 6. 拉取用户语言设置（fromLanguage / learningLanguage）───────────
  if (userId) {
    try {
      const userInfoResp = await new Promise((resolve, reject) => {
        $task.fetch({
          url: `https://www.duolingo.com/2017-06-30/users/${userId}?fields=fromLanguage,learningLanguage,courses`,
          method: "GET",
          headers: {
            Authorization: `Bearer ${jwt}`,
            "Content-Type": "application/json",
            "User-Agent":
              "Duolingo/5.2.35 iPhone/18.1 (iPhone; iPhone OS 18.1 like Mac OS X)",
          },
        }).then(resolve).catch(reject);
      });

      if (userInfoResp.statusCode === 200) {
        const info = JSON.parse(userInfoResp.body);
        const from = info.fromLanguage || "en";
        const learning = info.learningLanguage || "zh";
        $persistentStore.write(from, "duolingo_from_lang");
        $persistentStore.write(learning, "duolingo_learning_lang");
        console.log(`[Duolingo] 语言设置: ${from} -> ${learning}`);

        $notify(
          "🦜 Duolingo Lazy",
          "✅ Token 捕获成功",
          `用户ID: ${userId}\n学习: ${learning} | 母语: ${from}\nToken过期: ${expireAt}`
        );
      } else {
        throw new Error(`HTTP ${userInfoResp.statusCode}`);
      }
    } catch (e) {
      console.log("[Duolingo] 拉取用户信息失败:", e);
      // 即使拉取用户信息失败，Token 本身已保存，通知用户
      $notify(
        "🦜 Duolingo Lazy",
        "✅ Token 已捕获",
        `用户ID: ${userId}\nToken过期: ${expireAt}\n（语言信息获取失败，将使用默认值）`
      );
    }
  }

  $done({});
})();
