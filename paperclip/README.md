# Paperclip 插件集合 (Loon 适配版) 📑

> [!NOTE]
> **致谢与声明**：
> 本目录下的全部插件底层逻辑与脚本实现均源自优秀开源项目 **[MaYIHEI/paperclip](https://github.com/MaYIHEI/paperclip)**，特别感谢原作者 **[@MaYIHEI](https://github.com/MaYIHEI)** 的辛勤开发与维护！
> 
> 本仓库将其封装转为 **Loon 插件（.plugin）** 形式，仅为方便 Loon 用户一键导入、快捷管理及自动更新，未对原脚本核心逻辑做修改，配置参数完全兼容原作者的官方 BoxJS 订阅。

---

## 📦 插件清单与一键导入

| 插件名称 | 说明 | 插件文件 | 一键导入链接 |
| :--- | :--- | :--- | :--- |
| **WPS 签到与福利** | 每日签到、限量爆款抢领、会员试用申请、打卡、天天抽奖、小程序打卡 | [`wps.plugin`](./wps.plugin) | `https://raw.githubusercontent.com/5jwoj/BeRich/main/paperclip/wps.plugin` |
| **QQ 音乐签到与福利** | 绿钻成长值、金币中心签到、每日任务领奖、定时金币、红包雨 | [`qqmusic.plugin`](./qqmusic.plugin) | `https://raw.githubusercontent.com/5jwoj/BeRich/main/paperclip/qqmusic.plugin` |

---

## ⚙️ BoxJS 配置（通用）

所有插件**均无需生成新的 BoxJS 订阅**，直接使用原作者官方 BoxJS 订阅即可统一管理：

- **原作者 BoxJS 订阅地址**：
  ```text
  https://raw.githubusercontent.com/MaYIHEI/paperclip/main/paperclip.boxjs.json
  ```

---

## 1️⃣ WPS 签到与福利 (`wps.plugin`)

### 📌 功能特性
- 🎁 **每日签到**：任务中心每日自动签到，积分 +1
- 🎁 **限量爆款**：福利中心每天 10:00 限量爆款抢领
- 🎁 **会员试用申请**：三档免费会员试用（7天/月卡/季卡）全自动申领，次日开奖
- 🎁 **打卡领会员**：福利中心连续打卡领会员碎片
- 🎁 **天天抽奖**：福利中心每日 1 次免费抽奖
- 🎁 **小程序打卡**：WPS 小程序每日打卡，抽权益包等

### 🔧 BoxJS 参数对照（应用 ID：`paperclip.wps`）

| 参数 Key | 名称 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `wps_sid` | Cookie (`wps_sid`) | 自动抓取 | 登录态长效凭证，进 APP 自动抓取或手动填入 |
| `wps_task_hot` | 限量爆款 | `true` (开启) | 每天 10:00 限量抢 |
| `wps_task_trial` | 会员试用 | `true` (开启) | 三档试用全部申领，次日开奖 |
| `wps_task_signin` | 每日签到 | `true` (开启) | 任务中心签到 |
| `wps_task_fragment` | 打卡领会员 | `true` (开启) | 福利中心连续打卡 |
| `wps_task_lottery` | 天天抽奖 | `true` (开启) | 每日免费抽奖 |
| `wps_task_clockin` | 小程序打卡 | `true` (开启) | 抽权益包等 |
| `wps_clear` | 清除 Cookie | `false` | 设为 `true` 运行一次后清空凭证并自动复位 |
| `wps_debug` | 调试模式 | `false` | 开启后打印各任务接口原始响应日志 |

### 📖 使用方法
1. 在 Loon 中添加并启用 `wps.plugin` 插件；
2. 开启 Loon 的 **MITM** 并确保已信任证书；
3. 打开 **「WPS Office」APP**，进入「我的」->「任务中心」或「福利中心 / 天天领福利」停留 1~2 秒，收到 `✅ WPS Cookie 获取成功` 通知即抓取成功；
4. 每天 **上午 10:00** 自动执行所有任务。

---

## 2️⃣ QQ 音乐签到与福利 (`qqmusic.plugin`)

### 📌 功能特性
- 🎵 **绿钻成长值签到**：自动完成绿钻会员中心签到
- 🎵 **金币中心签到**：金币中心每日签到与金币抽奖
- 🎵 **每日任务**：完成临时关注/收藏等任务，领奖后自动恢复原状态
- 🎵 **定时金币 & 浮动宝箱**：9:00~10:59 分钟级智能调度领金币（本地到期判断，未到时间不联网）
- 🎵 **时段红包雨**：覆盖 6 个时段（0点、8点、12点、16点、20点、22点）自动抢红包

### 🔧 BoxJS 参数对照（应用 ID：`paperclip.qqmusic`）

| 参数 Key | 名称 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `qqmusic_data` | Cookie 数据 | 自动抓取 | 主凭证及续期凭证，自动维护 |
| `qqmusic_task_favorite` | 收藏任务 | `true` (开启) | 临时收藏歌曲/歌单/有声书并关注歌手，领奖后自动恢复原状态 |
| `qqmusic_task_activity` | 附属活动任务 | `true` (开启) | 金币抽奖签到、红包雨、浮动宝箱与活动任务卡 |
| `qqmusic_clear` | 清除 Cookie | `false` | 设为 `true` 运行一次后清空凭据并自动复位 |
| `qqmusic_debug` | 调试模式 | `false` | 开启后打印续期、签到与每日任务诊断日志 |

### 📖 使用方法
1. 在 Loon 中添加并启用 `qqmusic.plugin` 插件；
2. 开启 Loon 的 **MITM** 并确保已信任证书；
3. 打开 **「QQ 音乐」APP**，进入「我的 -> 会员中心」以及「金币中心 -> 每日签到」一次，收到 `✅ QQ 音乐 Cookie 获取成功` 通知即表示抓取成功；
4. 之后保持挂着 Loon 代理即可，脚本会全自动续期、每日签到并按时段做任务。

---

## 📜 版本记录

| 版本 | 日期 | 说明 |
| :--- | :--- | :--- |
| `v1.0.1` | 2026-08-21 | 新增 QQ 音乐 Loon 插件适配 (`qqmusic.plugin`)，支持三条独立 cron 任务调度 |
| `v1.0.0` | 2026-08-21 | 首发：将 MaYIHEI/paperclip 的 WPS 脚本转为 Loon 插件形式 (`wps.plugin`) |

---

## 🔗 相关项目与致谢

- 原项目仓库：[MaYIHEI/paperclip](https://github.com/MaYIHEI/paperclip)
- 原作者频道：[Telegram @mayihei](https://t.me/mayihei)
- QQ 音乐签名算法致谢：[L-1124/QQMusicApi](https://github.com/L-1124/QQMusicApi)
