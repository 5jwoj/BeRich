# 邦邦赚 v7 Quantumult X 脚本 💰

全量广告位自动刷金币脚本（v7 优化版），支持自动重写抓取 `Authorization Bearer Token` 及定时上报广告看视频收益。

---

## 🛠️ 远程配置说明 (Quantumult X)

在 Quantumult X 配置文件中添加以下规则（或直接远程引用）：

```ini
[rewrite_local]
# 1) 自动抓包重写
^https?:\/\/hd\.hnqlwlkj\.xyz\/g\/ url script-request-header https://raw.githubusercontent.com/5jwoj/BeRich/main/bangbangzhuan/bangbangzhuan_qx.js

[task_local]
# 2) 定时任务
30 8 * * * https://raw.githubusercontent.com/5jwoj/BeRich/main/bangbangzhuan/bangbangzhuan_qx.js, tag=邦邦赚, img-url=https://raw.githubusercontent.com/Orz-3/mini/master/Color/reward.png, enabled=true

[mitm]
hostname = hd.hnqlwlkj.xyz
```

---

## 📖 使用方法

1. 配置好重写规则与 MITM 证书。
2. 打开“邦邦赚”APP，脚本会自动抓取账号 Token 并弹出 QuanX 通知。
3. 脚本将在设定的 Cron 时间点触发运行，完成打卡后推送包含金币增长及余额的通知信息。

---

## ⚙️ 环境变量说明

可通过 QuanX 存储或 BoxJS 配置：

| 变量名 | 说明 | 默认值 |
| :--- | :--- | :--- |
| `bbz_token` | 抓取的 Bearer Token (多账号用 `#` 或 `&` 分隔) | 自动抓取 |
| `bbz_max_count` | 单次运行最多观看/上报广告次数 | `15` |
| `bbz_device_id` | 设备 ID | 自动随机生成 |
| `bbz_oaid` | OAID 标识 | 自动随机生成 |
| `bbz_appcode` | 应用 Code | `206` |
