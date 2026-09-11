# 💈 美发沙龙座位预约系统 - CentOS 家庭公网 Docker 部署全指南

本文档专门针对你的网络与服务器环境编写：
- **服务器系统**：CentOS 7 / 8 / 9 或 Rocky Linux / AlmaLinux
- **网络环境**：家庭宽带有公网 IP，但 **无 80 和 443 端口**（运营商常规封禁）
- **访问方式**：门店前台 iPad / 手机通过 **公网域名 + 非标端口**（例如：`http://salon.yourdomain.com:18888`）直接访问
- **开发与更新要求**：**修改代码后无需重新 build 镜像，重启 docker 或甚至直接刷新即可生效**。

---

## 目录
1. [免重复 Build 镜像的热更新原理](#一-免重复-build-镜像的热更新原理)
2. [CentOS 环境准备（Docker 与 Compose）](#二-centos-环境准备)
3. [家庭网络与路由器端口映射配置](#三-家庭网络与路由器端口映射配置)
4. [CentOS 系统防火墙配置](#四-centos-系统防火墙配置)
5. [DDNS 动态域名绑定](#五-ddns-动态域名绑定)
6. [项目一键部署运行](#六-项目一键部署运行)
7. [日常更新与维护（极速生效）](#七-日常更新与维护极速生效)
8. [GitHub 仓库提交与版本号维护规范](#八-github-仓库提交与版本号维护规范)

---

## 一、 免重复 Build 镜像的热更新原理

在传统的 Docker 部署中，每次修改了 HTML 或 JS，都需要重新执行耗时几分钟的 `docker build`。
**本项目通过 Docker 卷挂载（Volume Bind Mount）彻底解决了该痛点**：

在 `docker-compose.yml` 中：
```yaml
volumes:
  - ./public:/app/public      # 前端界面、CSS、JS、平面底图
  - ./server:/app/server      # 后端接口与WebSocket
  - ./data:/app/data          # 持久化存储预约记录
  - ./package.json:/app/package.json
```

### 生效机制：
1. **修改前端内容（`public/` 下的任意文件）**：
   - 包含调整 HTML 结构、修改 CSS 颜色、修改 `app.js` 逻辑、更换平面图。
   - **完全不需要重启 Docker！** 容器内实时读取宿主机文件，**门店浏览器按 F5 刷新直接看到最新效果**。
2. **修改后端逻辑（`server/` 下的文件）**：
   - 修改后只需在 CentOS 执行一条轻量重启命令：
     ```bash
     docker compose restart
     ```
   - **耗时仅 1~2 秒**，无需重新打包镜像，容器重新加载代码立即生效。
3. **数据安全**：
   - 所有预约记录实时写入宿主机的 `./data/reservations.json`。即使你升级 Docker 容器或换镜像，数据绝不丢失。

---

## 二、 CentOS 环境准备

如果你的 CentOS 服务器尚未安装 Docker 与 Docker Compose，请执行以下命令：

```bash
# 1. 卸载旧版本并安装必要工具
sudo yum remove -y docker docker-client docker-client-latest docker-common docker-latest docker-latest-logrotate docker-logrotate docker-engine
sudo yum install -y yum-utils git

# 2. 设置国内阿里云 Docker 软件源
sudo yum-config-manager --add-repo http://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo

# 3. 安装 Docker Engine
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 4. 启动 Docker 并设置开机自启
sudo systemctl start docker
sudo systemctl enable docker

# 5. 验证安装
docker --version
docker compose version
```

---

## 三、 家庭网络与路由器端口映射配置

因为家庭公网 IP 没有 80 和 443 端口，我们需要选择一个高位非标端口，例如 **`18888`**。

### 1. 确认光猫与路由器拓扑
- **最佳方案**：光猫改为桥接模式，主路由器进行 PPPoE 拨号，主路由器直接获取公网 IP。
- **查看公网 IP**：登录路由器后台，查看 WAN 口 IP 是否与 `curl cip.cc` 显示的 IP 一致。

### 2. 设置端口映射（虚拟服务器 / NAT 转发）
进入主路由器管理后台（以华硕、小米、TP-Link 或 OpenWrt 为例）：
- 找到 **“高级设置” -> “外部网络 (WAN)” -> “端口转发 / 虚拟服务器”**。
- 新建一条转发规则：
  - **服务名称**：`salon-seat`
  - **外部端口 / WAN 端口**：`18888`（可自定）
  - **内部 IP 地址**：你的 CentOS 服务器局域网静态 IP（如 `192.168.1.100`）
  - **内部端口 / LAN 端口**：`18888`
  - **通信协议**：`TCP`
- 保存并应用。

---

## 四、 CentOS 系统防火墙配置

CentOS 默认开启 `firewalld` 防火墙，必须放行你映射的端口（如 `18888`）：

```bash
# 1. 开放 18888 TCP 端口
sudo firewall-cmd --permanent --add-port=18888/tcp

# 2. 重新加载防火墙规则生效
sudo firewall-cmd --reload

# 3. 检查端口是否成功放行
sudo firewall-cmd --list-ports | grep 18888
```

---

## 五、 DDNS 动态域名绑定

家庭公网 IP 通常每隔几天或路由器重拨时会发生变化。为了让门店前台始终通过固定域名访问，需要配置 DDNS。

1. **购买或拥有一个域名**（如在阿里云、腾讯云或 Cloudflare 托管）。
2. **添加一条二级域名解析**：例如 `salon.yourdomain.com`，初始指向你当前家里的公网 IP。
3. **配置自动更新 DDNS**：
   - **方案 A（最省心）**：直接在主路由器里开启 DDNS 功能（许多路由器自带 Aliyun、花生壳、DynDNS、No-IP 插件）。
   - **方案 B（Docker 运行通用 DDNS 容器）**：
     推荐使用著名的开源 DDNS 工具 `ddns-go`：
     ```bash
     docker run -d --name ddns-go --restart=always --net=host -v /opt/ddns-go:/root jeessy/ddns-go
     ```
     浏览器打开 `http://你的CentOS-IP:9876`，页面上填入你的云厂商 AccessKey，勾选更新 `salon.yourdomain.com` 即可，每当家里 IP 变动会自动同步。

---

## 六、 项目一键部署运行

### 1. 将项目上传或 clone 到 CentOS

```bash
# 进入你习惯存放工程的目录（例如 /opt 或 ~）
cd /opt

# 如果已经推送到 GitHub，可以直接 clone：
git clone https://github.com/你的用户名/salon-seat-reservation.git
cd salon-seat-reservation
```

### 2. 检查或修改端口配置

```bash
# 复制环境变量配置文件（如果不存在）
cp .env.example .env

# 查看配置，默认端口为 18888，如需更改可编辑：
# vi .env
```

### 3. 启动项目

```bash
# 首次构建基础镜像并后台运行
docker compose up -d
```

启动完成后，查看运行状态：
```bash
docker compose ps
# 查看实时日志
docker compose logs -f
```
看到输出 `💈 Salon Seat Reservation System running at http://0.0.0.0:3000` 即表示启动成功！

### 4. 验证访问
- **家里局域网测试**：打开浏览器输入 `http://192.168.1.100:18888`。
- **外网/门店测试**：断开手机 WiFi，使用 4G/5G 流量打开 `http://salon.yourdomain.com:18888`，即可流畅进入沙龙席位看板！

---

## 七、 日常更新与维护（极速生效）

这是针对你的痛点最核心的日常操作指引：

### 场景 1：微调网页样式、文字或平面图坐标
- 直接修改 `public/` 目录下的文件（如 `public/css/style.css`、`public/js/app.js`）。
- **完全不需要碰 Docker**！
- 门店 iPad 浏览器直接下拉刷新，1秒见到最新效果。

### 场景 2：修改了后端服务代码（`server/index.js`）
- 修改代码保存后，在 CentOS 执行：
  ```bash
  docker compose restart
  ```
- **耗时仅 1 秒**，服务立刻重载，无需重复 `docker build`！

### 场景 3：备份与恢复数据
- 所有席位数据仅存放在当前目录的 `data/reservations.json`。
- 备份只需拷走 `data/` 目录即可，迁移服务器或重装机器时原样放回直接恢复。

---

## 八、 GitHub 仓库提交与版本号维护规范

根据用户规则，**每向 GitHub 提交一次更新，必须递增脚本/项目版本号**。

### 提交前操作三步法：
1. **更新版本号**：
   - 打开 `package.json`，修改 `"version": "1.0.1"`（小修复加末位，新功能加中位）。
   - 打开 `public/index.html`，确认右上角 `<div class="system-version">v1.0.1</div>` 同步更新。
2. **提交 Git**：
   ```bash
   git add .
   git commit -m "feat(v1.0.1): 优化预约表单响应并更新版本号"
   git push origin main
   ```
3. **在 CentOS 拉取最新代码**：
   ```bash
   git pull origin main
   # 重启容器即可
   docker compose restart
   ```
