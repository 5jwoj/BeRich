"""
JD Cookie Sync to Qinglong - mitmproxy (Android Termux) Version

适配工具：mitmproxy（在 Termux 中运行）
适配系统：Android (通过 Termux)

功能：
1) 在 Android Termux 中运行 mitmproxy 作为本机代理
2) 将 Android Wi-Fi 设置中的代理指向 127.0.0.1:8080
3) 自动拦截京东 App 的请求，提取 Cookie 并同步青龙

Version: v1.0.0
Author: z.W.

── 安装与使用步骤 ──
1. 安装 Termux（从 F-Droid 安装，Google Play 版本已过时）
2. 在 Termux 中运行：
   pkg update && pkg install python -y
   pip install mitmproxy requests
3. 安装 mitmproxy 证书（首次运行后会生成）：
   - 运行一次 mitmproxy 后，证书在 ~/.mitmproxy/mitmproxy-ca-cert.pem
   - 将手机 Wi-Fi 代理设为 127.0.0.1:8080
   - 访问 http://mitm.it 安装证书（Android 需要在"受信任的凭据"中启用）
4. 修改下方 CONFIG 配置
5. 运行脚本：
   mitmdump -s JD_Cookie_Sync_mitmproxy.py --listen-host 0.0.0.0 --listen-port 8080

── Android 11+ 证书安装注意事项 ──
Android 7+ 默认不信任用户安装的证书，需要 root 或使用网络安全配置绕过。
推荐方式：使用 Magisk + MagiskTrustUserCerts 模块将 mitmproxy 证书移入系统证书目录。
"""

import re
import time
import json
import threading
import requests
from mitmproxy import http

# =====================================================
# 📝 配置区域 - 请修改下面的内容
# =====================================================
CONFIG = {
    "ql_url": "",           # 必填，例如 "http://192.168.1.1:5700"
    "ql_client_id": "",     # 必填，青龙应用 Client ID
    "ql_client_secret": "",  # 必填，青龙应用 Client Secret
    "cooldown_minutes": 5,   # 冷却时间（分钟），默认 5 分钟
}
# =====================================================

# 内存缓存（进程内有效，重启清空）
_cache = {}
_cache_lock = threading.Lock()

# 目标 URL 匹配规则（与 QX/Surge 版保持一致）
TARGET_HOSTS = {
    "api.m.jd.com",
    "me-api.jd.com",
    "plogin.m.jd.com",
    "wq.jd.com",
    "api.jd.com",
}


def request(flow: http.HTTPFlow) -> None:
    """mitmproxy 请求拦截入口"""
    host = flow.request.pretty_host

    # 仅处理京东相关域名
    if not any(t in host for t in TARGET_HOSTS):
        return

    cookie_header = flow.request.headers.get("Cookie", "") or \
                    flow.request.headers.get("cookie", "")
    if not cookie_header:
        return

    pt_key = _get_cookie_value(cookie_header, "pt_key")
    pt_pin_raw = _get_cookie_value(cookie_header, "pt_pin")

    if not pt_key or not pt_pin_raw:
        return

    pt_pin = _safe_decode(pt_pin_raw)
    jd_cookie = f"pt_key={pt_key};pt_pin={pt_pin};"

    # 检查配置
    ql_url = CONFIG["ql_url"].rstrip("/")
    ql_client_id = CONFIG["ql_client_id"]
    ql_client_secret = CONFIG["ql_client_secret"]
    cooldown_minutes = CONFIG.get("cooldown_minutes", 5)

    if not ql_url or not ql_client_id or not ql_client_secret:
        print("[JD Cookie Sync] ⚠️  CONFIG 未填写，请编辑脚本")
        return

    if not ql_url.startswith("http"):
        ql_url = "http://" + ql_url

    # 冷却检查
    cache_key = f"cookie_{pt_pin}"
    ts_key = f"ts_{pt_pin}"

    with _cache_lock:
        cached = _cache.get(cache_key)
        last_ts = _cache.get(ts_key, 0)

    now = time.time()
    cooldown_sec = cooldown_minutes * 60

    if cached == jd_cookie and (now - last_ts) < cooldown_sec:
        remaining = int((cooldown_sec - (now - last_ts)) / 60)
        print(f"[JD Cookie Sync] Cookie 未变化，冷却中（剩余约 {remaining} 分钟）, 跳过")
        return

    print(f"[JD Cookie Sync] 检测到 pt_pin={pt_pin}，准备同步...")

    # 在后台线程中异步同步，不阻塞代理
    threading.Thread(
        target=_do_sync,
        args=(ql_url, ql_client_id, ql_client_secret, pt_pin, jd_cookie, cache_key, ts_key),
        daemon=True
    ).start()


def _do_sync(ql_url, client_id, client_secret, pt_pin, jd_cookie, cache_key, ts_key):
    """后台执行同步任务"""
    try:
        token = _get_ql_token(ql_url, client_id, client_secret)
        if not token:
            print("[JD Cookie Sync] ❌ 获取青龙 Token 失败")
            return

        result = _sync_cookie_to_ql(ql_url, token, pt_pin, jd_cookie)

        if result["ok"]:
            with _cache_lock:
                _cache[cache_key] = jd_cookie
                _cache[ts_key] = time.time()

            if result.get("changed"):
                print(f"[JD Cookie Sync] ✅ {result['title']}: {result.get('subtitle', '')}")
            else:
                print(f"[JD Cookie Sync] ✅ Cookie 已是最新，无需更新")
        else:
            print(f"[JD Cookie Sync] ❌ 同步失败: {result.get('message', '未知错误')}")

    except Exception as e:
        print(f"[JD Cookie Sync] ❌ 同步异常: {e}")


def _get_cookie_value(cookie_str: str, key: str) -> str:
    """从 Cookie 字符串中提取指定键"""
    match = re.search(rf'(?:^|;\s*){re.escape(key)}=([^;]*)', cookie_str)
    return match.group(1) if match else None


def _safe_decode(s: str) -> str:
    """安全 URL 解码"""
    try:
        from urllib.parse import unquote
        return unquote(s)
    except Exception:
        return s


def _get_ql_token(url: str, client_id: str, client_secret: str) -> str:
    """获取青龙面板 Token"""
    try:
        resp = requests.get(
            f"{url}/open/auth/token",
            params={"client_id": client_id, "client_secret": client_secret},
            timeout=10
        )
        body = resp.json()
        if body.get("code") == 200 and body.get("data", {}).get("token"):
            return body["data"]["token"]
        print(f"[JD Cookie Sync] Auth Failed: {body}")
        return None
    except Exception as e:
        print(f"[JD Cookie Sync] Auth Error: {e}")
        return None


def _sync_cookie_to_ql(url: str, token: str, pt_pin: str, new_value: str) -> dict:
    """同步 Cookie 到青龙面板"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    try:
        # 搜索已有的 JD_COOKIE
        resp = requests.get(
            f"{url}/open/envs",
            params={"searchValue": pt_pin},
            headers=headers,
            timeout=10
        )
        body = resp.json()

        if body.get("code") != 200 or not isinstance(body.get("data"), list):
            return {"ok": False, "message": f"青龙接口返回异常: {body}"}

        envs = body["data"]
        target = next(
            (e for e in envs
             if e.get("name") == "JD_COOKIE" and
             isinstance(e.get("value"), str) and
             f"pt_pin={pt_pin}" in e["value"]),
            None
        )

        changed = False

        if target:
            # 如果被禁用，先启用
            if target.get("status") != 0:
                requests.put(
                    f"{url}/open/envs/enable",
                    headers=headers,
                    json=[target["id"]],
                    timeout=10
                )
                changed = True

            # 如果值不同，更新
            if target["value"] != new_value:
                requests.put(
                    f"{url}/open/envs",
                    headers=headers,
                    json={"id": target["id"], "name": "JD_COOKIE",
                          "value": new_value, "remarks": target.get("remarks", "")},
                    timeout=10
                )
                changed = True
                return {"ok": True, "changed": True, "title": "✅ Cookie 已更新", "subtitle": pt_pin}

            if changed:
                return {"ok": True, "changed": True, "title": "✅ Cookie 已启用", "subtitle": pt_pin}
            else:
                return {"ok": True, "changed": False}

        # 不存在：创建新的
        requests.post(
            f"{url}/open/envs",
            headers=headers,
            json=[{"name": "JD_COOKIE", "value": new_value,
                   "remarks": f"Android mitmproxy - {pt_pin}"}],
            timeout=10
        )
        return {"ok": True, "changed": True, "title": "✅ Cookie 已创建", "subtitle": pt_pin}

    except Exception as e:
        return {"ok": False, "message": str(e)}
