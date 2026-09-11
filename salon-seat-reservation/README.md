# 💈 ReMINGLE PLUS 席位预约与调度系统

[![Version](https://img.shields.io/badge/version-1.1.1-gold.svg)](package.json)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](docker-compose.yml)
[![Node](https://img.shields.io/badge/node-18+-green.svg)](package.json)
[![License](https://img.shields.io/badge/license-MIT-purple.svg)](LICENSE)

基于沙龙实际 CAD 平面动线图开发的**可视化席位预约与看板系统**。专为沙龙前台 iPad、电脑或现场大屏打造，支持实时查看工位占用、预约开单、前台一键取消占用释放工位。

---

## ✨ 核心特性

- 📅 **多日期预约与看板切换（方案B数据分日架构）**：
  - 支持快捷切换「今天 / 明天 / 后天 / 任意未来日期」看板。
  - 前台可随时为顾客预约未来的时间，各日期座位占用互不影响、独立维护。
  - 查看未来日期时显示智能横幅与高亮徽章，可随时一键返回今天看板。
- 🗺️ **真实平面图可视化排布**：以店面 CAD 动线平面图为底图，精确映射 VIP 双人间、VIP 三人间、剪发区、头皮护理单人间等席位。
- ⚡ **两态极简流转（符合前台高效操作）**：
  - 🟢 **未使用**：半透明呼吸边框，直观标示闲置，前台点击即可极速录入预约。
  - 🔵 **已预约**：卡片直观聚合展示：**发型师、助理、到店时间、服务项目、结束时间、顾客来源及手机号**。
- 🚫 **随时一键取消占用**：前台人员在卡片上可一键释放座位，秒变“未使用”，杜绝繁琐流程。
- ⏱️ **项目时长自动推算**：点击服务项目（如染发+120分、剪发+45分、头皮SPA+60分），系统根据到店时间自动计算预估结束时间。
- 🔄 **WebSocket 毫秒级多端同步**：前台 iPad、电脑收银台、手机端同时在线，任意一端修改，全店屏幕无感实时更新。
- 🎯 **点位拖拽微调与工位重命名**：内置校准开关与自定义命名，所有日期基础模板自动全局同步。
- 🐳 **修改代码免重新 Build 镜像（Volume 挂载）**：
  - 前端改动（HTML/CSS/JS/图片）：**浏览器直接刷新即可看到最新界面**！
  - 后端改动（接口逻辑）：`docker compose restart` 1秒生效，无需重复 `docker build`。
  - 数据持久化保存在宿主机 `./data/` 目录，容器更新数据永不丢失。

---

## 🏗️ 目录结构

```text
salon-seat-reservation/
├── Dockerfile                 # 容器构建文件（支持代码监听热生效）
├── docker-compose.yml         # 编排配置（卷目录映射，免build更新）
├── package.json               # 项目定义（当前版本: 1.0.0）
├── .env.example               # 外部端口配置环境变量
├── public/                    # 前端代码目录（修改后浏览器刷新直接生效）
│   ├── index.html             # 主界面（iPad/大屏高保真界面）
│   ├── css/
│   │   └── style.css          # 高端黑金磨砂玻璃暗黑风格
│   ├── js/
│   │   └── app.js             # 交互、WebSocket通信与业务逻辑
│   └── assets/
│       └── floorplan.png      # 店面平面设计图
├── server/                    # 后端服务目录
│   └── index.js               # Express API + WebSocket 广播
├── data/                      # 持久化数据目录（Docker挂载目录）
│   ├── default-seats.json     # 初始席位定义
│   └── reservations.json      # 实时预约与席位数据
└── DEPLOY.md                  # 详尽的家庭CentOS与公网部署指南
```

---

## 🚀 快速启动（本地开发）

```bash
# 1. 安装依赖
npm install

# 2. 启动服务（支持代码修改热监听）
npm run dev

# 浏览器访问：http://localhost:3000
```

---

## 🐳 Docker 生产部署

详见 [详细部署教程 (DEPLOY.md)](DEPLOY.md)。
简易启动步骤：

```bash
# 1. 复制配置文件
cp .env.example .env

# 2. 一键构建并启动
docker compose up -d

# 3. 以后修改了代码？
# 修改前端文件：浏览器直接刷新即可！
# 修改后端文件：执行重启即可，无需再次 build！
docker compose restart
```

---

## 📌 版本规范

本项目严格遵循语义化版本号管理（Semantic Versioning）：
- 每次向 GitHub 仓库提交代码更新前，必须在 `package.json` 及 `sys-version` 中递增版本号（如 `1.0.0` -> `1.0.1`）。
