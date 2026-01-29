# JD Cookie Sync - Loon 安装指南

> **作者**: z.W.

## 方法一:使用插件版本(推荐 ✅)

### 步骤 1: 复制插件链接
```
https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/JD_Cookie_Sync_Loon_Local.plugin
```

### 步骤 2: 安装插件
1. 打开 **Loon App**
2. 点击底部 **配置**
3. 找到 **插件** 区域
4. 点击右上角 **➕**
5. 粘贴上面的链接
6. 点击 **确定**

### 步骤 3: 配置参数
安装时 Loon 会提示您填写以下信息:
- **QL_URL**: 青龙面板地址,例如 `http://192.168.1.1:5700`
- **QL_CLIENT_ID**: 您的 Client ID
- **QL_CLIENT_SECRET**: 您的 Client Secret

填写后点击保存即可。

### ✅ 优点
- 配置保存在 Loon 本地,更新插件不会丢失
- 可以在 Loon 的插件管理中随时修改配置
- 自动获取脚本更新

---

## 方法二:使用本地文件(永久配置)

如果您想将配置永久写入脚本,不被更新影响:

### 步骤 1: 下载文件
从 GitHub 下载这两个文件到您的设备:
- `JD_Cookie_Sync_Loon.js`
- `JD_Cookie_Sync_Loon_Local.plugin`

### 步骤 2: 修改脚本
使用文本编辑器打开 `JD_Cookie_Sync_Loon.js`,找到配置部分的 `MANUAL_CONFIG`:

```javascript
const MANUAL_CONFIG = {
    url: "http://192.168.1.1:5700",  // 改成您的青龙地址
    id: "your_client_id",             // 改成您的 Client ID
    secret: "your_client_secret"      // 改成您的 Client Secret
};
```

修改后保存。

### 步骤 3: 上传文件
将文件上传到 iCloud Drive 的 Loon 对应目录:
```
iCloud Drive/Loon/
├── scripts/
│   └── JD_Cookie_Sync_Loon.js
└── Plugins/
    └── JD_Cookie_Sync_Loon_Local.plugin
```

> [!NOTE]
> Loon 的插件（`.plugin`）和脚本（`.js`）不需要放在同一个文件夹。
> - 插件文件放在 `Plugins` 目录
> - 脚本文件放在 `scripts` 目录

### 步骤 4: 安装插件
1. 打开 **Loon App**
2. 点击 **配置** -> **插件** -> **➕**
3. 选择 **从本地安装**
4. 找到并选择 `JD_Cookie_Sync_Loon_Local.plugin`

### ✅ 优点
- 配置永久保存在本地脚本中
- 即使重新安装 Loon 也不会丢失
- 不需要联网也能更新配置

### ⚠️ 缺点
- 脚本更新需要手动下载替换
- 每次替换后需要重新填写配置

---

## 如何获取 Client ID 和 Secret

1. 登录青龙面板
2. 进入 **系统设置** -> **应用设置**
3. 点击 **新建应用**
4. 权限选择 **环境变量**(或所有权限)
5. 复制生成的 Client ID 和 Client Secret

---

## 使用方法

1. 确保 Surge 处于开启状态
2. 确保 MITM 功能已开启并信任证书
3. 打开京东 App 或微信小程序中的京东购物
4. 随便浏览几个页面
5. 查看 Surge 通知,应该会收到成功提示
6. 登录青龙面板检查环境变量 `JD_COOKIE`

---

## 推荐方案

**iOS 用户推荐使用方法一**,因为:
- ✅ 安装简单
- ✅ 配置不会丢失
- ✅ 自动获取更新
- ✅ 可以随时修改配置

**如果您担心配置安全性**,可以使用方法二,将配置保存在本地文件中。
