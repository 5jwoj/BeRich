/**
 * Duolingo Lazy - QX Token 自动捕获脚本
 * 版本: v1.1.0 (详细日志 & 多源抓取增强版)
 * 描述: 支持从 Authorization Header 及 Cookie 中自动提取 JWT Token，并输出详细日志
 */

(async () => {
  const VERSION = "v1.1.0";
  const url = $request.url;
  const headers = $request.headers || {};

  console.log(`[Duolingo Capture ${VERSION}] 🔍 拦截请求: ${url}`);

  let jwt = "";
  let source = "";

  // ── 1. 尝试从 Authorization Header 提取 ───────────────────────────
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === "authorization") {
      const val = headers[key];
      if (val && val.toLowerCase().startsWith("bearer ")) {
        jwt = val.substring(7).trim();
        source = `Header (${key})`;
        break;
      }
    }
  }

  // ── 2. 若 Header 未找到，尝试从 Cookie 提取 ───────────────────────
  if (!jwt) {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === "cookie") {
        const cookieStr = headers[key] || "";
        // 匹配 jwt_token=xxx 或 jwt=xxx
        const match = cookieStr.match(/(?:jwt_token|jwt)=([^;]+)/);
        if (match && match[1]) {
          jwt = match[1].trim();
          source = `Cookie (${key})`;
          break;
        }
      }
    }
  }

  // 如果未发现 Token
  if (!jwt) {
    console.log(`[Duolingo Capture ${VERSION}] ℹ️ 当前请求未找到 Bearer Token 或 jwt_token Cookie`);
    $done({});
    return;
  }

  // 验证 JWT 基本三段式格式
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    console.log(`[Duolingo Capture ${VERSION}] ⚠️ 抓取到的字符串非标准 JWT 结构 (${source}): ${jwt.substring(0, 15)}...`);
    $done({});
    return;
  }

  console.log(`[Duolingo Capture ${VERSION}] 🎯 成功抓取 Token 来源: ${source}`);

  // ── 3. 解析 JWT Payload ─────────────────────────────────────────
  let payload = {};
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    payload = JSON.parse(atob(base64));
  } catch (e) {
    console.log(`[Duolingo Capture ${VERSION}] ❌ JWT Payload 解码失败:`, e);
    $done({});
    return;
  }

  const userId = String(payload.sub || payload.id || "");
  const expTs = payload.exp || 0;
  const expireAt = expTs
    ? new Date(expTs * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })
    : "无限制";
  const nowTs = Math.floor(Date.now() / 1000);

  console.log(`[Duolingo Capture ${VERSION}] 👤 用户 ID: ${userId}, Token 过期时间: ${expireAt}`);

  // ── 4. 检查是否过期 ─────────────────────────────────────────────
  if (expTs && expTs < nowTs) {
    console.log(`[Duolingo Capture ${VERSION}] ⚠️ Token 已过期!`);
    $notify(
      `🦜 Duolingo Lazy ${VERSION}`,
      "⚠️ 捕获到已过期的 Token",
      `过期时间: ${expireAt}\n请在 App 中重新登录账号！`
    );
    $done({});
    return;
  }

  // ── 5. 读取历史记录并判断 ────────────────────────────────────────
  const oldJWT = $persistentStore.read("duolingo_jwt") || "";
  const isUpdated = oldJWT !== jwt;

  // 写入存储
  $persistentStore.write(jwt, "duolingo_jwt");
  if (userId) {
    $persistentStore.write(userId, "duolingo_uid");
  }

  // ── 6. 尝试拉取/确认用户语言偏好 ─────────────────────────────────
  let fromLang = $persistentStore.read("duolingo_from_lang") || "en";
  let learningLang = $persistentStore.read("duolingo_learning_lang") || "zh";

  if (userId) {
    try {
      const userInfoResp = await new Promise((resolve, reject) => {
        $task.fetch({
          url: `https://www.duolingo.com/2017-06-30/users/${userId}?fields=fromLanguage,learningLanguage`,
          method: "GET",
          headers: {
            "Authorization": `Bearer ${jwt}`,
            "User-Agent": "Duolingo/5.2.35 iPhone/18.1",
          },
        }).then(resolve).catch(reject);
      });

      if (userInfoResp.statusCode === 200) {
        const info = JSON.parse(userInfoResp.body);
        if (info.fromLanguage) fromLang = info.fromLanguage;
        if (info.learningLanguage) learningLang = info.learningLanguage;

        $persistentStore.write(fromLang, "duolingo_from_lang");
        $persistentStore.write(learningLang, "duolingo_learning_lang");
        console.log(`[Duolingo Capture ${VERSION}] 🌐 语言信息更新: ${fromLang} -> ${learningLang}`);
      }
    } catch (e) {
      console.log(`[Duolingo Capture ${VERSION}] ⚠️ 获取语言详情失败 (不影响 Token):`, e.message || e);
    }
  }

  // ── 7. 发送通知提示 ─────────────────────────────────────────────
  if (isUpdated) {
    $notify(
      `🦜 Duolingo Lazy ${VERSION}`,
      "🎉 Token 自动捕获/更新成功！",
      `用户 ID: ${userId}\n学习语言: ${learningLang} (母语: ${fromLang})\n过期时间: ${expireAt}\n来源: ${source}`
    );
  } else {
    console.log(`[Duolingo Capture ${VERSION}] ℹ️ Token 未发生变化，已刷新有效状态。`);
    // 即使 Token 没变，为方便调试，也发送一次弹窗通知
    $notify(
      `🦜 Duolingo Lazy ${VERSION}`,
      "✅ Token 状态正常 (重复验证)",
      `用户 ID: ${userId}\n当前 Token 保持有效\n过期时间: ${expireAt}`
    );
  }

  $done({});
})();
