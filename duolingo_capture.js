/**
 * Duolingo Lazy - QX Token & Cookie 自动捕获脚本
 * 版本: v1.2.0 (网页登录/Cookie增强 & 静音去重版)
 * 描述: 支持从 Authorization Header 及 Request/Response Cookie 中自动提取网页端与App端的 JWT Token
 */

(async () => {
  const VERSION = "v1.2.0";
  
  // 1. 获取 request 或 response 的 url 及 headers
  const req = typeof $request !== "undefined" ? $request : null;
  const res = typeof $response !== "undefined" ? $response : null;
  const url = (req && req.url) || (res && res.url) || "";
  
  // 忽略常见的无鉴权静态资源请求（图片、CSS、字体、JS 文件等），提高响应性能
  if (/\.(png|jpg|jpeg|gif|svg|css|js|woff|woff2|ttf|ico)$/i.test(url)) {
    $done({});
    return;
  }

  const reqHeaders = (req && req.headers) || {};
  const resHeaders = (res && res.headers) || {};

  let jwt = "";
  let source = "";

  // ── 1. 检查 Authorization Header (App 及网页 API 常见) ───────────────
  for (const key of Object.keys(reqHeaders)) {
    if (key.toLowerCase() === "authorization") {
      const val = reqHeaders[key];
      if (val && val.toLowerCase().startsWith("bearer ")) {
        jwt = val.substring(7).trim();
        source = `Header (${key})`;
        break;
      }
    }
  }

  // ── 2. 检查 Request Cookie (网页登录后发起的各种请求) ────────────────
  if (!jwt) {
    for (const key of Object.keys(reqHeaders)) {
      if (key.toLowerCase() === "cookie") {
        const cookieStr = reqHeaders[key] || "";
        // 匹配 jwt_token=xxx 或 jwt=xxx 或 jwt_token_cn=xxx
        const match = cookieStr.match(/(?:jwt_token|jwt|jwt_token_cn)=([^;]+)/i);
        if (match && match[1]) {
          jwt = match[1].trim();
          source = `Request Cookie (${key})`;
          break;
        }
      }
    }
  }

  // ── 3. 检查 Response Set-Cookie (网页登录接口下发) ─────────────────
  if (!jwt && resHeaders) {
    for (const key of Object.keys(resHeaders)) {
      if (key.toLowerCase() === "set-cookie") {
        const setCookieVal = resHeaders[key];
        const cookieStrs = Array.isArray(setCookieVal) ? setCookieVal : [setCookieVal || ""];
        for (const cookieStr of cookieStrs) {
          const match = cookieStr.match(/(?:jwt_token|jwt|jwt_token_cn)=([^;]+)/i);
          if (match && match[1]) {
            jwt = match[1].trim();
            source = `Response Set-Cookie (${key})`;
            break;
          }
        }
        if (jwt) break;
      }
    }
  }

  // 如果未发现 Token，静默退出（不输出冗余日志，避免控制台刷屏）
  if (!jwt) {
    $done({});
    return;
  }

  // 验证 JWT 基本三段式结构
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    $done({});
    return;
  }

  // ── 4. 安全解析 JWT Payload (对 base64 自动补齐 '=') ──────────────────
  function safeDecodePayload(jwtStr) {
    try {
      const p = jwtStr.split(".")[1];
      let base64 = p.replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4 !== 0) {
        base64 += "=";
      }
      return JSON.parse(atob(base64));
    } catch (e) {
      return null;
    }
  }

  const payload = safeDecodePayload(jwt);
  if (!payload) {
    console.log(`[Duolingo Capture ${VERSION}] ❌ JWT Payload 解码失败 (${source})`);
    $done({});
    return;
  }

  const userId = String(payload.sub || payload.id || "");
  const expTs = payload.exp || 0;
  const expireAt = expTs
    ? new Date(expTs * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })
    : "无限制";
  const nowTs = Math.floor(Date.now() / 1000);

  console.log(`[Duolingo Capture ${VERSION}] 🎯 捕捉到凭证 来源: ${source}, 拦截URL: ${url}`);
  console.log(`[Duolingo Capture ${VERSION}] 👤 用户 ID: ${userId}, Token 过期时间: ${expireAt}`);

  // ── 5. 检查是否已过期 ─────────────────────────────────────────────
  if (expTs && expTs < nowTs) {
    console.log(`[Duolingo Capture ${VERSION}] ⚠️ 捕获的 Token 已过期!`);
    $notify(
      `🦜 Duolingo Lazy ${VERSION}`,
      "⚠️ 捕获到已过期的 Token/Cookie",
      `过期时间: ${expireAt}\n请在网页或 App 中重新登录账号！`
    );
    $done({});
    return;
  }

  // ── 6. 读取历史记录并判断是否更新 ───────────────────────────────
  const oldJWT = $persistentStore.read("duolingo_jwt") || "";
  const isUpdated = oldJWT !== jwt;

  // 写入持久化存储
  $persistentStore.write(jwt, "duolingo_jwt");
  if (userId) {
    $persistentStore.write(userId, "duolingo_uid");
  }

  // ── 7. 尝试拉取/确认用户语言偏好 ─────────────────────────────────
  let fromLang = $persistentStore.read("duolingo_from_lang") || "en";
  let learningLang = $persistentStore.read("duolingo_learning_lang") || "zh";

  if (userId && isUpdated) {
    try {
      const userInfoResp = await new Promise((resolve, reject) => {
        $task.fetch({
          url: `https://www.duolingo.com/2017-06-30/users/${userId}?fields=fromLanguage,learningLanguage`,
          method: "GET",
          headers: {
            "Authorization": `Bearer ${jwt}`,
            "Cookie": `jwt_token=${jwt}`,
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
          },
        }).then(resolve).catch(reject);
      });

      if (userInfoResp && userInfoResp.statusCode === 200 && userInfoResp.body) {
        const info = JSON.parse(userInfoResp.body);
        if (info.fromLanguage) fromLang = info.fromLanguage;
        if (info.learningLanguage) learningLang = info.learningLanguage;

        $persistentStore.write(fromLang, "duolingo_from_lang");
        $persistentStore.write(learningLang, "duolingo_learning_lang");
        console.log(`[Duolingo Capture ${VERSION}] 🌐 语言信息更新: ${fromLang} -> ${learningLang}`);
      }
    } catch (e) {
      console.log(`[Duolingo Capture ${VERSION}] ⚠️ 获取语言详情失败 (不影响凭证存储):`, e.message || e);
    }
  }

  // ── 8. 发送通知提示 ─────────────────────────────────────────────
  // 关键优化：只有当 Token 全新/更新时才弹出卡片通知，避免网页频繁加载时产生弹窗轰炸
  if (isUpdated) {
    $notify(
      `🦜 Duolingo Lazy ${VERSION}`,
      "🎉 Cookie/Token 捕获成功！",
      `用户 ID: ${userId}\n学习语言: ${learningLang} (母语: ${fromLang})\n过期时间: ${expireAt}\n来源: ${source}`
    );
  } else {
    console.log(`[Duolingo Capture ${VERSION}] ℹ️ 凭证保持有效 (已打卡/重复刷新中，无需重复弹窗)`);
  }

  $done({});
})();
