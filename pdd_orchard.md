# 拼多多果园 Quantumult X (QuanX) 自动化脚本 (v1.1.0 最新适配版)

本脚本专为 **Quantumult X** 设计，同步了 2026 最新 Python 修复版 (`拼多多果园修复版.py`) 的核心业务逻辑。支持在微信小程序访问拼多多果园时自动抓取拼接完整凭据（含 `PDDAccessToken`、`pdd_user_id` 和 `tubetoken`），并可通过 Cron 定时任务全自动完成每日签到、循环浇水领水滴、批量做任务/领水滴以及好友/机器人智能抢水滴。

包含全流程控制台详细日志输出，方便在 App 查看调试与排错。

GitHub 仓库地址：[https://github.com/5jwoj/BeRich](https://github.com/5jwoj/BeRich)

---

## ⚡ v1.1.0 适配升级说明

1. **偷水/抢水逻辑全面升级**：
   - 适配最新的好友与机器人接口数据结构，增加多重防御性 null 值空校验。
   - 引入 **狗位防咬重试机制**：当遭遇狗咬或请求 miss 时，自动针对同一狗位进行最多 3 次重试，显著提高偷水成功率。
   - 智能合并好友列表与机器人水滴列表，精准匹配每日剩余偷水次数。
2. **任务处理机制强化**：
   - 拓宽任务类型覆盖范围（包含 `38160`, `38242`, `38090`, `38451` 等 24 种任务类型及双重入口信息）。
   - 支持解析多类奖励（水滴及其他类型），自动区分 `需接受` 与 `可领取` 任务，优先自动接受再批量领取奖励。
3. **异常处理与 Token 自动续期**：
   - 捕获 `40001` 错误码并及时发送凭据失效通知。
   - 在首页刷新及各个环节中自动保存最新的 `tubetoken`，防止凭据过期。
4. **Cookie 抓取重写规则优化**：
   - 规则收窄至 `mobile.yangkeduo.com`，增量融合累积 Header Cookie，确保保存包含 `PDDAccessToken` 的全套关键凭据。

---

## 🚀 配置说明

在 Quantumult X 配置文件中，按以下步骤添加规则：

### 1. 配置 MITM 域名解析

在 `[mitm]` 模块下添加拼多多域名（如已有 `hostname` 字段，则追加用逗号分隔）：

```ini
[mitm]
hostname = mobile.yangkeduo.com, *.yangkeduo.com
```

### 2. 配置 Rewrite 重写规则（自动提取 Cookie）

在 `[rewrite_local]` 模块下添加以下重写规则：

```ini
[rewrite_local]
^https?:\/\/mobile\.yangkeduo\.com\/ url script-request-header https://raw.githubusercontent.com/5jwoj/BeRich/main/pdd_orchard.js
```

### 3. 配置 Task 定时任务规则

在 `[task_local]` 模块下添加定时任务规则（示例：每天 8 点、12 点、18 点自动执行）：

```ini
[task_local]
0 8,12,18 * * * https://raw.githubusercontent.com/5jwoj/BeRich/main/pdd_orchard.js, tag=拼多多果园, enabled=true
```

---

## 📱 使用步骤

1. **证书与 MITM**：确保 Quantumult X 已安装并信任证书，且已开启 `MITM`。
2. **首次提取 Cookie**：
   - 在 **【微信】** 中搜索并打开 **拼多多** 小程序，进入 **多多果园** 页面。
   - Quantumult X 将自动拦截请求并弹出系统通知：`拼多多果园 v1.1.0 🎉 完整 Cookie 抓取成功！`。
3. **查看调试日志**：
   - 打开 Quantumult X -> 底部控制台 (Console) / 日志 (Logs)。
   - 过滤日志关键词 `[拼多多果园]`，可以看到包含 HTTP 请求、响应状态码、当前水滴数、偷水详情等调试输出。
4. **定时运行**：
   - 抓取成功后即可自动运行，Cron 定时任务将按设定的时间自动运行并发送通知。

---

## 🛠️ 功能列表

- [x] **重写自动抓取 Cookie**：增量融合提取 `pdd_user_id`、`PDDAccessToken`、`tubetoken` 并持久化存储
- [x] **首页刷新与续期**：自动获取最新水滴余额与 `tubetoken` 自动续期
- [x] **每日签到**：自动触发果园每日签到活动 (`type: 201811`)
- [x] **自动浇水**：按 10 水滴/次扣减，自动循环浇水至不足 10 水滴
- [x] **做任务领水滴**：自动扫描 24 种任务类型，自动接受未开启任务并自动批量领取已完成水滴
- [x] **好友&机器人偷水**：自动扫描好友与机器人水滴，随机狗位选择与同狗位 3 次防狗咬重试
- [x] **详细日志与通知**：开启全流程日志与状态通知，排错一目了然
