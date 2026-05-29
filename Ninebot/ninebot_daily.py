# -*- coding: utf-8 -*-
"""
cron: 0 9 * * *
new Env('九号出行');
"""

import requests
import json
import os
import time
import random
from urllib3.util.retry import Retry
from requests.adapters import HTTPAdapter
# ⚠️ 注意: 这里的 notify 模块假设您所在的青龙环境已内置或提供了该模块。
from notify import send 
from datetime import datetime

# ==========================================================
# ⚠️ 配置说明：
# 请在青龙面板中设置环境变量：NINEBOT_ACCOUNTS
# 格式：deviceId1#Authorization1#UA1&deviceId2#Authorization2#UA2
# ----------------------------------------------------------

def create_session():
    """创建带有重试策略的 Session"""
    retry_strategy = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[408, 429, 500, 502, 503, 504],
        allowed_methods=["HEAD", "GET", "POST"]
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session = requests.Session()
    session.mount("https://", adapter)
    return session

def parse_accounts(env_str):
    """解析环境变量中的账号字符串"""
    if not env_str:
        print("❌ 错误：环境变量 NINEBOT_ACCOUNTS 为空，请配置账号信息。")
        return []
        
    accounts = env_str.split('&')
    result = []
    for account in accounts:
        try:
            device_id, authorization, ua = account.split('#', 2)
            result.append({
                "deviceId": device_id.strip(), 
                "authorization": authorization.strip(),
                "ua": ua.strip()
            })
        except ValueError:
            print(f"⚠️ 警告：账号格式错误，跳过该账号：{account}")
            continue
    return result

class Ninebot():
    name = "九号出行"

    def __init__(self, check_item):
        self.signUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign"
        self.validUrl = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status"
        self.headers = {
            "Authorization": check_item.get("authorization"),
            "language": "zh",
            "User-Agent": check_item.get("ua"),
            "Accept-Encoding": "gzip, deflate",
            "Connection": "keep-alive"
        }
        self.check_item = check_item
        self.session = create_session()

    def safe_request(self, method, url, **kwargs):
        """安全请求，包含随机延迟和错误处理"""
        try:
            # 添加随机延迟避免高频请求
            time.sleep(random.uniform(0.5, 1.5))
            
            response = self.session.request(
                method=method,
                url=url,
                timeout=(10, 30),
                **kwargs
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            # print(f"请求异常: {str(e)}") # 避免打印过多日志
            return {"code": -1, "msg": f"网络请求失败或超时: {str(e)}"}

    def sign(self, msg):
        """执行签到操作"""
        try:
            response_data = self.safe_request(
                "POST",
                self.signUrl,
                headers=self.headers,
                json={"deviceId": self.check_item.get("deviceId")}
            )
            
            if response_data.get("code") == 0:
                msg.append({"name": "签到成功", "value": response_data.get("msg", "签到成功")})
            else:
                msg.append({"name": "签到失败", "value": response_data.get("msg", str(response_data))})
        except Exception as e:
            msg.extend([
                {"name": "签到信息", "value": "签到流程异常"},
                {"name": "错误信息", "value": str(e)},
            ])

    def valid(self):
        """检查签到状态"""
        try:
            # 添加时间戳防止缓存
            timestamp_ms = int(datetime.now().timestamp() * 1000)
            response_data = self.safe_request(
                "GET",
                f"{self.validUrl}?t={timestamp_ms}",
                headers=self.headers
            )
            
            if response_data.get("code") == 0 and response_data.get("data"):
                return response_data.get("data"), ""
            
            # 如果 code 不为 0 或 data 为空，则视为验证失败
            return False, response_data.get("msg", "登录验证失败")
        except Exception as e:
            return False, f"登录验证异常: {str(e)}"

    def main(self):
        """主执行流程"""
        valid_data, err_info = self.valid()
        msg = []
        
        if valid_data:
            completed = valid_data.get("currentSignStatus") == 1
            msg.extend([
                {"name": "连续签到天数", "value": f"{valid_data.get('consecutiveDays', 0)}天"},
                {"name": "今日签到状态", "value": "✅ 已签到" if completed else "❌ 未签到"}
            ])
            if not completed:
                print("未签到，尝试签到...")
                self.sign(msg)
        else:
            msg.append({"name": "验证信息", "value": f"❌ 验证失败: {err_info}"})
        
        # 格式化输出字符串
        return "\n".join([f"{item.get('name')}: {item.get('value')}" for item in msg])

# ==========================================================
# ⬇️ 脚本的入口点 (替换了 @GetConfig 装饰器) ⬇️
# ==========================================================
def run_ninebot():
    """读取环境变量并执行所有账号的签到任务"""
    
    # 直接从环境变量中获取账号信息
    accounts_env = os.getenv('NINEBOT_ACCOUNTS')
    
    if not accounts_env:
        print("🚫 未找到环境变量 NINEBOT_ACCOUNTS，请检查配置。")
        send('九号出行', "❌ 脚本终止：缺少环境变量 NINEBOT_ACCOUNTS")
        return

    accounts = parse_accounts(accounts_env)
    
    if not accounts:
        print("🚫 未解析到有效账号，脚本终止。")
        return
        
    results = []
    print(f"📦 共找到 {len(accounts)} 个账号需要处理。")
    
    for index, account in enumerate(accounts):
        account_info = f"--- 账号 {index + 1} ---"
        print(account_info)
        
        try:
            result_details = Ninebot(account).main()
            result = f"{account_info}\n{result_details}"
            results.append(result)
            print(result_details)
        except Exception as e:
            error_msg = f"{account_info}\n❌ 账号处理发生严重异常: {str(e)}"
            results.append(error_msg)
            print(error_msg)
            
        print("-" * 20)
        
    # 发送最终通知
    send('九号出行', "\n\n".join(results))

if __name__ == "__main__":
    run_ninebot()
