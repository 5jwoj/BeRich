# 拼多多果园 Quantumult X (QuanX) 自动化脚本

本脚本专为 **Quantumult X** 设计，支持访问拼多多果园自动提取 Cookie 凭据，并配置 Cron 定时自动完成签到、浇水领水滴、做任务和偷好友水滴。

包含全流程控制台详细日志输出，方便在 App 查看调试与排错。

GitHub 仓库地址：[https://github.com/5jwoj/BeRich](https://github.com/5jwoj/BeRich)

---

## 🚀 配置说明

在 Quantumult X 配置文件中，按以下步骤添加规则：

### 1. 配置 MITM 域名解析

在 `[mitm]` 模块下添加拼多多域名（如已有 `hostname` 字段，则追加用逗号分隔）：

```ini
[mitm]
hostname = mobile.yangkeduo.com
```

### 2. 配置 Rewrite 重写规则（自动提取 Cookie）

在 `[rewrite_local]` 模块下添加以下重写规则：

```ini
[rewrite_local]
^https:\/\/mobile\.yangkeduo\.com\/(garden_index_lz_0\.html|proxy\/api\/api\/manor) url script-request-header https://raw.githubusercontent.com/5jwoj/BeRich/main/pdd_orchard.js
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
   - 打开微信或拼多多 App，进入 **多多果园** 页面。
   - Quantumult X 将自动拦截请求并弹出系统通知：`拼多多果园 - Cookie 抓取成功 🎉`。
3. **查看调试日志**：
   - 打开 Quantumult X -> 底部控制台 (Console) / 日志 (Logs)。
   - 过滤日志关键词 `[拼多多果园]`，可以看到包含 HTTP 请求、响应状态码、当前水滴数、偷水详情等调试输出。
4. **定时运行**：
   - 抓取成功后即可关闭重写规则（或保留），Cron 定时任务将按设定的时间自动运行并通知结果。

---

## 🛠️ 功能列表

- [x] **重写自动抓取 Cookie**：提取 `pdd_user_id``tubetoken` 并持久化存储
- [x] **首页刷新**：自动获取最新水滴余额与 `tubetoken`
- [x] **每日签到**：自动触发果园每日签到活动
- [x] **自动浇水**：按 10 水滴/次扣减，自动循环浇水至不足 10 水滴
- [x] **做任务领水滴**：自动扫描任务列表，自动接受未开启任务并自动领取已完成水滴
- [x] **好友&机器人偷水**：自动扫描好友与机器人水滴，随机狗位选择与防狗咬重试
- [x] **详细日志**：开启 `DEBUG = true` 全流程日志，排错一目了然
