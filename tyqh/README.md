# 统一茄皇的家五期 🍅

版本：`v1.0.0`

统一茄皇的家五期 Quantumult X 自动脚本，支持自动拦截并保存 Token，自动完成日常浏览与领取任务、使用能量浇水以及偷好友能量。

---

## 🚀 配置说明

### Quantumult X 配置

#### 1. 重写与抓包 (`[rewrite_local]`)
在 Quantumult X 的重写配置中添加以下代码：

```ini
[rewrite_local]
^https:\/\/farmgames\.ioutu\.cn\/api\/web\/ url script-request-header https://raw.githubusercontent.com/5jwoj/BeRich/main/tyqh/tyqh.js

[mitm]
hostname = farmgames.ioutu.cn
```

#### 2. 定时任务 (`[task_local]`)
在定时任务中添加（每天 9:00 及 18:00 自动运行）：

```ini
[task_local]
0 9,18 * * * https://raw.githubusercontent.com/5jwoj/BeRich/main/tyqh/tyqh.js, tag=统一茄皇的家, enabled=true
```

---

## 📖 使用指南

1. **开启 MitM 与重写**：确保已安装并信任 Quantumult X 的证书。
2. **自动抓包**：微信搜索并打开 **“统一茄皇的家”** 小程序。
3. **抓包成功通知**：进入小程序后，QuanX 会自动推送 `🎉 自动抓包成功！` 的系统消息。
4. **关闭抓包重写（可选）**：抓包成功后，可暂停重写开关以提升运行速度。
