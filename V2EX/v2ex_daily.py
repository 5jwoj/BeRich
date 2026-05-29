import os
import re
import time
from typing import Optional, Dict

try:
    import requests
except ImportError:
    print("未安装 requests 库，正在尝试安装...")
    os.system("pip install requests")
    import requests

# ===================================================
# Telegram 推送函数
# ===================================================
def tg_push_message(title: str, content: str):
    """
    使用环境变量 TG_BOT_TOKEN 和 TG_USER_ID 推送消息到 Telegram。
    """
    tg_token = os.environ.get("TG_BOT_TOKEN")
    tg_id = os.environ.get("TG_USER_ID")
    
    if not tg_token or not tg_id:
        print("未检测到 TG_BOT_TOKEN 或 TG_USER_ID 环境变量，跳过 Telegram 推送。")
        return

    # Telegram Bot API URL
    url = f"https://api.telegram.org/bot{tg_token}/sendMessage"
    
    # 格式化消息内容
    message = f"📢 **{title}**\n\n{content}"

    try:
        response = requests.post(url, json={
            "chat_id": tg_id,
            "text": message,
            "parse_mode": "Markdown" # 使用 Markdown 格式进行排版
        }, timeout=10) # 设置超时
        response.raise_for_status()
        print("Telegram 消息推送请求发送成功。")
    except requests.exceptions.RequestException as e:
        print(f"Telegram 消息推送失败，错误: {e}")
# ===================================================

class V2exDailyHelper:
    """V2EX 每日登录奖励领取脚本"""

    def __init__(self, cookie: str, ua: Optional[str] = None):
        if not cookie:
            raise ValueError("V2EX_COOKIE 环境变量未设置或为空")
        self.cookie = cookie
        self.ua = ua if ua else "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        self.session = requests.Session()
        self.daily_url = "https://www.v2ex.com/mission/daily"
        self.balance_url = "https://www.v2ex.com/balance"

    def _get_headers(self) -> dict:
        """获取请求头"""
        return {
            "user-agent": self.ua,
            "cookie": self.cookie,
            "referer": "https://www.v2ex.com/mission/daily",
        }

    def check_cookie_status(self) -> bool:
        """
        检测 Cookie 是否有效
        :return: True 有效, False 失效
        """
        print("正在检测 Cookie 有效性...")
        try:
            r = self.session.get(self.daily_url, headers=self._get_headers(), allow_redirects=True)
            
            if "/signin" in r.url:
                print("检测结果: Cookie 已失效 (页面跳转至登录页)")
                return False
            
            if "登出" in r.text or "/signout" in r.text:
                print("检测结果: Cookie 有效")
                return True
            
            print("检测结果: Cookie 已失效 (未检测到登录特征)")
            return False

        except requests.exceptions.SSLError as e:
            print(f"❌ 警告：检测到 SSL 证书错误。这通常是环境问题 (Python/证书过期)。错误: {e}")
            print("⚠️ 建议更新 pip install certifi 或检查环境。脚本继续运行，但可能不稳定。")
            return True # 遇到 SSL 错误时，先假设 Cookie 有效并继续尝试后续操作
        except requests.exceptions.RequestException as e:
            print(f"检测 Cookie 时发生网络错误: {e}")
            return True


    def _get_once_code(self) -> Optional[str]:
        """获取一次性验证码 (Once Code)"""
        print("正在尝试获取 Once Code...")
        try:
            r = self.session.get(self.daily_url, headers=self._get_headers(), allow_redirects=True)
            r.raise_for_status()
            
            # 检查是否跳转到登录页面（Cookie 失效）
            if "/signin" in r.url:
                error_msg = "❌ 获取 Once Code 失败：Cookie 已失效，页面跳转到登录页。请更新 Cookie。"
                print(error_msg)
                tg_push_message("V2EX Cookie 已失效", error_msg)
                return None
            
            if "每日登录奖励已领取" in r.text:
                print("【V2EX 签到】今日奖励已领取，无需重复操作。")
                balance_dict = self._get_balance_info()
                balance_str = self._format_balance(balance_dict)
                tg_push_message("V2EX 签到通知", f"今日奖励已领取，无需重复操作。\n\n{balance_str}")
                return None

            match = re.search(r'/mission/daily/redeem\?once=(\d+)', r.text)
            if match:
                once_code = match.group(1)
                print(f"成功获取到 Once Code: {once_code}")
                return once_code
            else:
                print("未能找到 Once Code。")
                return None
        except requests.exceptions.SSLError as e:
            print(f"❌ 警告：获取 Once Code 时发生 SSL 错误: {e}")
            return None
        except requests.exceptions.RequestException as e:
            print(f"获取 Once Code 失败，网络错误: {e}")
            return None


    def _get_balance_info(self) -> Dict[str, Optional[int]]:
        """
        获取账户余额信息（铜币、银币、金币）并返回字典。
        支持多种页面结构（文本或图片显示货币）。
        """
        print("正在查询最新账户余额...")
        balance_result: Dict[str, Optional[int]] = {
            "copper": None, # 铜币
            "silver": None, # 银币
            "gold": None    # 金币
        }
        try:
            r = self.session.get(self.balance_url, headers=self._get_headers())
            r.raise_for_status()
            
            # 策略 1: 匹配 balance_area 区域 (常见的侧边栏/顶部结构)
            # 结构通常是: <a href="/balance" ...> ... number <img ... alt="S"> ... </a>
            # 或者纯文本形式
            balance_area_match = re.search(r'<a href="/balance" class="balance_area"[^>]*>(.*?)</a>', r.text, re.DOTALL)
            
            found = False
            
            if balance_area_match:
                content = balance_area_match.group(1)
                # 匹配: 数字 + 可能的空白 + 图片(alt属性) 或 文本(铜币/银币/金币)
                # 例子: 10 <img src="..." alt="S">
                # 例子: 10 银币
                
                # 查找所有 数字 + (图片alt 或 文本)
                # pattern: (\d+)\s*(?:<img[^>]+alt="([^"]+)"|([^\s<]+))
                # 但这样可能太复杂，分两步走
                
                # 尝试匹配带图片的格式
                img_items = re.findall(r'(\d+)\s*<img[^>]+alt="([^"]+)"', content)
                for amount_str, alt_text in img_items:
                    amount = int(amount_str)
                    alt_text = alt_text.strip().upper()
                    if alt_text in ["B", "BRONZE", "铜币"]:
                        balance_result["copper"] = amount
                        found = True
                    elif alt_text in ["S", "SILVER", "银币"]:
                        balance_result["silver"] = amount
                        found = True
                    elif alt_text in ["G", "GOLD", "金币"]:
                        balance_result["gold"] = amount
                        found = True
                        
                # 如果没找到图片格式，尝试匹配文本格式 (在 balance_area 内)
                if not found:
                    text_items = re.findall(r'(\d+)\s*(铜币|银币|金币)', content)
                    for amount_str, currency_name in text_items:
                        amount = int(amount_str)
                        if currency_name == "铜币":
                            balance_result["copper"] = amount
                            found = True
                        elif currency_name == "银币":
                            balance_result["silver"] = amount
                            found = True
                        elif currency_name == "金币":
                            balance_result["gold"] = amount
                            found = True

            # 策略 2: 如果策略 1 失败，尝试旧的 span class="balance_l" 匹配
            if not found:
                balance_pattern_old = r'<span class="balance_l">\s*(\d+)\s*</span>.*?(铜币|银币|金币)'
                matches = re.findall(balance_pattern_old, r.text, re.DOTALL)
                for amount_str, currency_name in matches:
                    amount = int(amount_str)
                    if currency_name == "铜币":
                        balance_result["copper"] = amount
                        found = True
                    elif currency_name == "银币":
                        balance_result["silver"] = amount
                        found = True
                    elif currency_name == "金币":
                        balance_result["gold"] = amount
                        found = True

            # 检查结果
            if all(v is None for v in balance_result.values()):
                print("警告：未能通过正则匹配到账户余额信息。")
                # 保存调试文件
                debug_file = "debug_balance_error.html"
                with open(debug_file, "w", encoding="utf-8") as f:
                    f.write(r.text)
                print(f"已将页面内容保存至 {debug_file} 以供调试。请检查该文件内容。")

        except requests.exceptions.SSLError as e:
            print(f"❌ 警告：查询余额时发生 SSL 错误: {e}")
        except requests.exceptions.RequestException as e:
            print(f"查询余额失败，网络错误: {e}")
        except Exception as e:
            print(f"查询余额时发生未知错误: {e}")
            
        return balance_result
    
    
    def _format_balance(self, balance_dict: Dict[str, Optional[int]]) -> str:
        """
        将余额字典格式化为推送消息字符串，并计算总额。
        """
        copper = balance_dict.get("copper")
        silver = balance_dict.get("silver")
        gold = balance_dict.get("gold")
        
        if copper is None and silver is None and gold is None:
            return "⚠️ 无法获取账户余额信息。"

        balance_parts = []
        if copper is not None:
            balance_parts.append(f"{copper} 铜币")
        if silver is not None:
            balance_parts.append(f"{silver} 银币")
        if gold is not None:
            balance_parts.append(f"{gold} 金币")
        
        # 计算总额 (铜币当量)
        total_copper_equivalent = 0
        
        if gold is not None:
            total_copper_equivalent += gold * 10000
        if silver is not None:
            total_copper_equivalent += silver * 100
        if copper is not None:
            total_copper_equivalent += copper
            
        balance_info = "**账户余额:** " + "、".join(balance_parts)
        
        if total_copper_equivalent > 0:
            balance_info += f"\n**总额 (铜币当量):** {total_copper_equivalent}"
        
        return balance_info


    def redeem_daily_reward(self):
        """领取每日登录奖励"""
        
        # 优先检查 Cookie 是否有效
        if not self.check_cookie_status():
            error_msg = "⛔️ V2EX Cookie 已失效，请更新 Cookie。"
            print(error_msg)
            tg_push_message("V2EX 登录失效", error_msg)
            return

        once_code = self._get_once_code()
        
        if once_code is None:
            return

        redeem_url = f"https://www.v2ex.com/mission/daily/redeem?once={once_code}"
        
        print("正在尝试领取每日登录奖励...")
        try:
            r = self.session.get(redeem_url, headers=self._get_headers(), allow_redirects=True)
            r.raise_for_status()
            
            # 检查是否跳转到登录页面（Cookie 失效）
            if "/signin" in r.url:
                error_msg = "❌ 领取失败：Cookie 已失效，页面跳转到登录页。请更新 Cookie。"
                print(f"【V2EX 签到】{error_msg}")
                print(f"调试信息: 跳转 URL: {r.url}")
                tg_push_message("V2EX Cookie 已失效", error_msg)
                return
            
            push_content = ""
            
            if "每日登录奖励已领取" in r.text or "已成功领取每日登录奖励" in r.text:
                success_msg = "✅ 恭喜！每日登录奖励领取成功。"
                print(f"【V2EX 签到】{success_msg}")
                balance_dict = self._get_balance_info()
                balance_info = self._format_balance(balance_dict)
                push_content = f"{success_msg}\n\n{balance_info}"
                tg_push_message("V2EX 签到成功", push_content) 
                
            elif "请重新登录" in r.text or r.status_code == 403:
                error_msg = "❌ 领取失败：Cookie 可能已过期，请检查并更新。"
                print(f"【V2EX 签到】{error_msg}")
                tg_push_message("V2EX 签到失败", error_msg)
                
            else:
                success_match = re.search(r'<div class="box">\s*<div class="message">(.*?)</div>', r.text)
                if success_match:
                    success_msg = f"✅ 领取成功提示: {success_match.group(1).strip()}"
                    print(f"【V2EX 签到】{success_msg}")
                    balance_dict = self._get_balance_info()
                    balance_info = self._format_balance(balance_dict)
                    push_content = f"{success_msg}\n\n{balance_info}"
                    tg_push_message("V2EX 签到成功", push_content)
                else:
                    warning_msg = "❓ 领取操作完成，但结果提示不明确，请登录 V2EX 确认。"
                    print(f"【V2EX 签到】{warning_msg}")
                    print(f"调试信息: 状态码 {r.status_code}, URL {r.url}")
                    print(f"页面内容摘要: {r.text[:200]}...")
                    tg_push_message("V2EX 签到提醒", warning_msg)
                    
        except requests.exceptions.SSLError as e:
            print(f"❌ 警告：领取奖励时发生 SSL 错误: {e}")
        except requests.exceptions.RequestException as e:
            error_msg = f"❌ 领取奖励失败，网络错误: {e}"
            print(f"【V2EX 签到】{error_msg}")
            tg_push_message("V2EX 签到失败", error_msg)
        except Exception as e:
            error_msg = f"❌ 发生未知错误: {e}"
            print(f"【V2EX 签到】{error_msg}")
            tg_push_message("V2EX 签到失败", error_msg)

if __name__ == "__main__":
    V2EX_COOKIE = os.environ.get("V2EX_COOKIE")
    
    if not V2EX_COOKIE:
        print("致命错误：环境变量 V2EX_COOKIE 未设置，脚本退出。")
        tg_push_message("V2EX 签到配置错误", "致命错误：V2EX_COOKIE 环境变量未设置，请检查青龙配置。")
    else:
        # 兼容多账号，按换行符分隔
        cookies = V2EX_COOKIE.split('\n')
        
        for i, cookie in enumerate(cookies):
            if not cookie.strip():
                continue
            
            print(f"\n--- 开始执行第 {i+1} 个 V2EX 账户签到 ---")
            try:
                helper = V2exDailyHelper(cookie=cookie.strip())
                helper.redeem_daily_reward()
            except ValueError as e:
                print(f"配置错误: {e}")
            
            # 如果还有下一个账号，则等待，避免并发过高
            if i < len(cookies) - 1:
                time.sleep(3)
