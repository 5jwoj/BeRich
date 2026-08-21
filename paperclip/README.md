# Paperclip 插件集合 (Loon 适配版) 📑

> [!NOTE]
> **致谢与声明**：
> 本目录下的全部插件底层逻辑与脚本实现均源自优秀开源项目 **[MaYIHEI/paperclip](https://github.com/MaYIHEI/paperclip)**，特别感谢原作者 **[@MaYIHEI](https://github.com/MaYIHEI)** 的辛勤开发与维护！
> 
> 本仓库将其封装转为 **Loon 插件（.plugin）** 形式，仅为方便 Loon 用户一键导入、快捷管理及自动更新，未对原脚本核心逻辑做修改，配置参数完全兼容原作者的官方 BoxJS 订阅。

---

## 📦 插件清单与一键导入

| 插件名称 | 核心功能 | 插件文件 | 一键导入链接 |
| :--- | :--- | :--- | :--- |
| **WPS 签到与福利** | 每日签到、限量爆款抢领、会员试用申请、打卡、天天抽奖、小程序打卡 | [`wps.plugin`](./wps.plugin) | `https://raw.githubusercontent.com/5jwoj/BeRich/main/paperclip/wps.plugin` |
| **QQ 音乐签到与福利** | 绿钻成长值、金币中心签到、每日任务领奖、定时金币、红包雨 | [`qqmusic.plugin`](./qqmusic.plugin) | `https://raw.githubusercontent.com/5jwoj/BeRich/main/paperclip/qqmusic.plugin` |
| **小米商城 (米金+抽奖)** | 每日米金签到、连签奖励、「狂欢礼」活动任务与自动抽奖 | [`mishop.plugin`](./mishop.plugin) | `https://raw.githubusercontent.com/5jwoj/BeRich/main/paperclip/mishop.plugin` |
| **一点万象签到** | 华润万象商场每日签到，自动抓取 Token，支持连签天数与积分查询 | [`newmixc.plugin`](./newmixc.plugin) | `https://raw.githubusercontent.com/5jwoj/BeRich/main/paperclip/newmixc.plugin` |
| **腾讯视频 VIP 签到** | VIP 每日签到领取 V力值，Cookie 一次抓取后自动续期，无人值守 | [`tenvideo.plugin`](./tenvideo.plugin) | `https://raw.githubusercontent.com/5jwoj/BeRich/main/paperclip/tenvideo.plugin` |
| **龙湖天街 App 签到抽奖** | 日日签领取成长值/珑珠，内置随机时间防风控，自动扬剑珑珠抽奖 | [`lhtj.plugin`](./lhtj.plugin) | `https://raw.githubusercontent.com/5jwoj/BeRich/main/paperclip/lhtj.plugin` |

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
| `qqmusic_data` | Cookie 数据 | 自动抓取 | 主凭证及自动续期凭证 |
| `qqmusic_task_favorite` | 收藏任务 | `true` (开启) | 临时收藏歌曲/歌单/有声书并关注歌手，领奖后自动恢复原状态 |
| `qqmusic_task_activity` | 附属活动任务 | `true` (开启) | 金币抽奖签到、红包雨、浮动宝箱与活动任务卡 |
| `qqmusic_clear` | 清除 Cookie | `false` | 设为 `true` 运行一次后清空凭据并自动复位 |
| `qqmusic_debug` | 调试模式 | `false` | 开启后打印续期、签到与每日任务诊断日志 |

### 📖 使用方法
1. 在 Loon 中添加并启用 `qqmusic.plugin` 插件；
2. 开启 Loon 的 **MITM** 并确保已信任证书；
3. 打开 **「QQ 音乐」APP**，进入「我的 -> 会员中心」以及「金币中心 -> 每日签到」一次，收到 `✅ QQ 音乐 Cookie 获取成功` 通知即表示抓取成功；
4. 挂着 Loon 代理即可，脚本会全自动续期、每日签到并按时段做任务。

---

## 3️⃣ 小米商城（米金签到 + 狂欢礼抽奖）(`mishop.plugin`)

### 📌 功能特性
- 📱 **米金签到**：每日自动签到领 5 米金，连签 2/7/14 天自动领取阶段红包奖励。
- 📱 **狂欢礼活动与抽奖**：动态读取活动，随机间隔完成分享与 10 秒浏览任务，并自动消耗可用次数进行抽奖。

### 🔧 BoxJS 参数对照

#### 米金签到（应用 ID：`paperclip.mishop`）
| 参数 Key | 名称 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `mishop_data` | Cookie 数据 | 自动抓取 | 米金商城签到凭证 |
| `mishop_clear` | 清除 Cookie | `false` | 运行一次后清空已抓 Cookie 并复位 |
| `mishop_debug` | 调试模式 | `false` | 开启后打印签到接口原始响应 |

#### 狂欢礼抽奖（应用 ID：`paperclip.milottery`）
| 参数 Key | 名称 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `milottery_data` | Cookie 数据 | 自动抓取 | 狂欢礼活动与抽奖凭证 |
| `milottery_clear` | 清除 Cookie | `false` | 运行一次后清空已抓 Cookie 与活动配置并复位 |
| `milottery_debug` | 调试模式 | `false` | 开启后打印诊断日志 |

### 📖 使用方法
1. 在 Loon 中添加并启用 `mishop.plugin` 插件；
2. 开启 Loon 的 **MITM** 并确保已信任证书；
3. **抓取凭据**：
   - **米金签到**：打开小米商城 APP -> 首页「米金商城」入口 -> 手动点一次签到（收到 `✅ 小米商城 Cookie 获取成功`）；
   - **狂欢礼抽奖**：打开小米商城 APP ->「狂欢礼」-> 进入抽奖活动页（收到 `✅ 小米抽奖 Cookie 获取成功`）；
4. **定时执行**：
   - 每天 **08:15** 自动执行米金签到；
   - 每天 **08:30** 自动执行狂欢礼任务与抽奖。

---

## 4️⃣ 一点万象签到 (`newmixc.plugin`)

### 📌 功能特性
- 🏬 **每日签到**：自动完成华润万象商场每日签到，领取积分
- 🏬 **连签查询**：签到后自动显示当前连签天数与积分余额
- 🏬 **阶段奖励**：如有连签阶段奖励（优惠券/积分）自动领取并通知
- 🏬 **支持商场**：覆盖万象汇、万象城、万象天地等全系华润商场

### 🔧 BoxJS 参数对照（应用 ID：`paperclip.newmixc`）

| 参数 Key | 名称 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `newmixc_data` | Cookie 数据 | 自动抓取 | 签到凭证（含 token、mallNo、imei 等） |
| `newmixc_clear` | 清除 Cookie | `false` | 设为 `true` 运行一次后清空凭证并自动复位 |
| `newmixc_debug` | 调试模式 | `false` | 开启后打印签名、接口原始响应等诊断日志 |

### 📖 使用方法
1. 在 Loon 中添加并启用 `newmixc.plugin` 插件；
2. 开启 Loon 的 **MITM** 并确保已信任证书；
3. 打开 **「一点万象」APP**，进入任意页面停留约 1 秒（自动触发 `getPersonalData` 接口），收到 `✅ 一点万象 Cookie 获取成功` 通知即表示抓取成功；
4. 每天 **08:37** 自动执行签到。

> **注意**：脚本按 Cookie 中的 `mallNo` 签到**单一商场**。若需多商场签到，请切换商场后重新抓取 Cookie。

---

## 5️⃣ 腾讯视频 VIP 签到 (`tenvideo.plugin`)

### 📌 功能特性
- 📺 **每日签到**：VIP 每日自动签到，领取 V力值
- 📺 **自动续期**：cron 运行时先自动刷新 Cookie 再签到，真正无人值守
- 📺 **单脚本架构**：同一脚本兼任 Cookie 抓取（http-request）与签到任务（cron）
- 📺 **抓取方式**：iOS 微信打开「腾讯视频」小程序点几下即可，无需 App 本体

### 🔧 BoxJS 参数对照（应用 ID：`paperclip.tenvideo`）

| 参数 Key | 名称 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `tenvideo_cookie` | Cookie 数据 | 自动抓取 | 登录凭证，抓取后自动续期 |
| `tenvideo_clear` | 清除 Cookie | `false` | 设为 `true` 运行一次后清空凭证并自动复位 |
| `tenvideo_debug` | 调试模式 | `false` | 开启后打印续期、签到接口原始响应等诊断日志 |

### 📖 使用方法
1. 在 Loon 中添加并启用 `tenvideo.plugin` 插件；
2. 开启 Loon 的 **MITM** 并确保已信任证书；
3. **抓取 Cookie（二选一）**：
   - **推荐**：iOS 微信打开「腾讯视频」小程序随便点几下，收到 `✅ 腾讯视频 Cookie 获取成功` 即可；
   - 或 Safari 登录 `v.qq.com`（请求桌面网站）切后台再切回触发；
4. 每天 **00:10** 自动续期并执行签到。

> **注意**：Cookie 会随正常使用滚动，若 cron 报「刷新失败」，iOS 微信重新打开腾讯视频小程序即可重抓。

---

## 6️⃣ 龙湖天街 App 签到抽奖 (`lhtj.plugin`)

### 📌 功能特性
- 🌆 **每日签到**：完成龙珠 H5「日日签」领取成长值与珑珠
- 🌆 **幸运抽奖**：自动消耗当日次数进行珑珠抽奖（含大奖）
- 🌆 **随机签到时间**：内置当日随机目标分钟，到点才签、当天不再重复触发，有效防范固定时刻特征识别
- 🌆 **单脚本架构**：同一脚本兼任 Cookie 抓取与签到+抽奖任务

### 🔧 BoxJS 参数对照（应用 ID：`paperclip.lhtj_app`）

| 参数 Key | 名称 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `lhtj_app_data` | Cookie 数据 | 自动抓取 | L0 通道鉴权头（usertoken + dxrisk-token） |
| `lhtj_app_random` | 随机签到时间 | `true` | 开启后内部随机摇出目标分钟，**需配密集 cron** |
| `lhtj_app_window` | 随机时段 | `8-10` | 随机签到的小时范围，仅当 random 开启时生效 |
| `lhtj_app_lottery` | 自动抽奖 | `true` | 签到后自动消耗当日抽奖次数抽奖 |
| `lhtj_app_clear` | 清除 Cookie | `false` | 设为 `true` 运行一次后清空已抓 Cookie 并复位 |
| `lhtj_app_debug` | 调试模式 | `false` | 开启后打印各接口请求/响应日志 |

### 📖 使用方法
1. 在 Loon 中添加并启用 `lhtj.plugin` 插件；
2. 开启 Loon 的 **MITM** 并确保已信任证书；
3. 打开 **「龙湖天街」App** →「会员 / 日日签」→ 点签到按鈕一次，收到 `✅ 龙湖天街 App Cookie 获取成功` 通知即抓取成功；
4. 每天 **08:00–10:00** 内随机时刻自动签到并抽奖。

> **注意**：本插件为 **App 通道(L0)**，与小程序通道互不兼容，勿同时启用。若签到返回风控码 (8040012/8040013)，建议暂停脚本、手动签到养号一段时间再恢复。

---

## 📜 版本记录

| 版本 | 日期 | 说明 |
| :--- | :--- | :--- |
| `v1.0.5` | 2026-08-21 | 新增龙湖天街 App 签到抽奖插件适配 (`lhtj.plugin`) |
| `v1.0.4` | 2026-08-21 | 新增腾讯视频 VIP 签到插件适配 (`tenvideo.plugin`) |
| `v1.0.3` | 2026-08-21 | 新增华润万象「一点万象」签到插件适配 (`newmixc.plugin`) |
| `v1.0.2` | 2026-08-21 | 合并适配小米商城全功能插件 (`mishop.plugin`)，集成米金签到与狂欢礼活动抽奖 |
| `v1.0.1` | 2026-08-21 | 新增 QQ 音乐 Loon 插件适配 (`qqmusic.plugin`)，支持三条独立 cron 任务调度 |
| `v1.0.0` | 2026-08-21 | 首发：将 MaYIHEI/paperclip 的 WPS 脚本转为 Loon 插件形式 (`wps.plugin`) |

---

## 🔗 相关项目与致谢

- 原项目仓库：[MaYIHEI/paperclip](https://github.com/MaYIHEI/paperclip)
- 原作者频道：[Telegram @mayihei](https://t.me/mayihei)
