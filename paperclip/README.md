# Paperclip · WPS 签到与福利 (Loon 插件) 📑

<p align="center">
  <img src="https://raw.githubusercontent.com/MaYIHEI/pin/refs/heads/main/app/wps.png" width="80" alt="WPS" />
</p>

> [!NOTE]
> **致谢与声明**：
> 本插件的底层逻辑与脚本实现均源自优秀开源项目 **[MaYIHEI/paperclip](https://github.com/MaYIHEI/paperclip)**，特别感谢原作者 **[@MaYIHEI](https://github.com/MaYIHEI)** 的辛勤开发与维护！
> 
> 本仓库将其转为 **Loon 插件（.plugin）** 形式，仅为方便 Loon 用户一键导入、快捷管理及自动更新，未对原脚本核心逻辑做修改，配置参数完全兼容原作者的 BoxJS 订阅。

---

## 📌 功能特性

WPS Office 每日签到 + 福利中心多项福利任务，自动获取 WPS 积分与超级会员时长：

- 🎁 **每日签到**：任务中心每日自动签到，积分 +1
- 🎁 **限量爆款**：福利中心每天 10:00 限量爆款抢领
- 🎁 **会员试用申请**：三档免费会员试用（7天/月卡/季卡）全自动申领，次日开奖
- 🎁 **打卡领会员**：福利中心连续打卡领会员碎片
- 🎁 **天天抽奖**：福利中心每日 1 次免费抽奖
- 🎁 **小程序打卡**：WPS 小程序每日打卡，抽 PDF / 图片权益包等

---

## 🚀 Loon 插件安装

### 一键导入链接
在 Loon 中点击「配置」->「插件」->「从 URL 添加」填入以下链接：

```text
https://raw.githubusercontent.com/5jwoj/BeRich/main/paperclip/wps.plugin
```

---

## ⚙️ 参数与 BoxJS 配置

本插件**无需生成新的 BoxJS 订阅**，直接使用原作者的官方 BoxJS 订阅即可统一管理开关和参数：

- **原作者 BoxJS 订阅链接**：
  ```text
  https://raw.githubusercontent.com/MaYIHEI/paperclip/main/paperclip.boxjs.json
  ```

### BoxJS 面板参数对照（`paperclip.wps`）

| 参数 Key | 名称 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `wps_sid` | Cookie (`wps_sid`) | 自动抓取 | WPS 登录态，抓一次长期有效，也可手动填入 |
| `wps_task_hot` | 限量爆款 | `true` (开启) | 每天 10:00 限量抢 |
| `wps_task_trial` | 会员试用 | `true` (开启) | 三档试用全部申领，次日开奖 |
| `wps_task_signin` | 每日签到 | `true` (开启) | 任务中心签到 |
| `wps_task_fragment` | 打卡领会员 | `true` (开启) | 福利中心连续打卡 |
| `wps_task_lottery` | 天天抽奖 | `true` (开启) | 每日免费抽奖 |
| `wps_task_clockin` | 小程序打卡 | `true` (开启) | 抽权益包等 |
| `wps_clear` | 清除 Cookie | `false` | 设为 `true` 运行一次后清空凭证并自动复位 |
| `wps_debug` | 调试模式 | `false` | 开启后打印各任务接口原始响应日志 |

---

## 📖 使用步骤

1. **启用插件**：在 Loon 中导入并开启 `WPS 签到与福利` 插件。
2. **信任证书**：确保已正确开启 Loon 的 **MITM** 并已在系统设置中信任 Loon 证书。
3. **抓取凭证**：打开手机上的 **「WPS Office」APP**，进入任意活动页（如「我的」->「任务中心」或「福利中心 / 天天领福利」停留 1~2 秒），收到 `✅ WPS Cookie 获取成功` 系统通知即表示抓取成功。
4. **自动运行**：脚本将在每天 **上午 10:00** 自动触发执行（此时恰逢限量爆款开抢时间）。

---

## 📜 版本记录

| 版本 | 日期 | 说明 |
| :--- | :--- | :--- |
| `v1.0.0` | 2026-08-21 | 首发：将 MaYIHEI/paperclip 的 WPS 脚本转为 Loon 插件形式，适配原作者 BoxJS 规范 |

---

## 🔗 相关项目

- 原项目仓库：[MaYIHEI/paperclip](https://github.com/MaYIHEI/paperclip)
- 原项目 WPS 源码：[paperclip/app/wps](https://github.com/MaYIHEI/paperclip/tree/main/app/wps)
- 原作者频道：[Telegram @mayihei](https://t.me/mayihei)
