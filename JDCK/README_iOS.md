# JD Cookie Sync - iOS 版 Surge 安装指南

## 方法一:使用配置版模块(推荐 ✅)

### 步骤 1: 复制模块链接
```
https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/JD_Cookie_Sync_iOS.sgmodule
```

### 步骤 2: 安装模块
1. 打开 **Surge App**
2. 点击底部 **首页**
3. 向下滑动找到 **模块** 区域
4. 点击右上角 **➕**
5. 粘贴上面的链接
6. 点击 **好** 或 **确定**

### 步骤 3: 配置参数
安装时 Surge 会提示您填写以下信息:
- **QL_URL**: 青龙面板地址,例如 `http://192.168.1.1:5700`
- **QL_CLIENT_ID**: 您的 Client ID
- **QL_CLIENT_SECRET**: 您的 Client Secret

填写后点击保存即可。

### ✅ 优点
- 配置保存在 Surge 本地,更新模块不会丢失
- 可以在 Surge 的模块管理中随时修改配置
- 自动获取脚本更新

---

## 方法二:使用本地脚本(永久配置)

如果您想将配置永久写入脚本,不被更新影响:

### 步骤 1: 下载文件
从 GitHub 下载这两个文件到您的设备:
- `jd_cookie_sync_surge.js`
- `JD_Cookie_Sync_Local.sgmodule`

### 步骤 2: 修改脚本
使用文本编辑器打开 `jd_cookie_sync_surge.js`,找到第 14-22 行的 `MANUAL_CONFIG` 部分:

```javascript
const MANUAL_CONFIG = {
    url: "http://192.168.1.1:5700",  // 改成您的青龙地址
    id: "your_client_id",             // 改成您的 Client ID
    secret: "your_client_secret"      // 改成您的 Client Secret
};
```

修改后保存。

### 步骤 3: 上传文件
将修改好的两个文件上传到 iCloud Drive 的 Surge 文件夹:
```
iCloud Drive/Surge/
├── jd_cookie_sync_surge.js
└── JD_Cookie_Sync_Local.sgmodule
```

### 步骤 4: 安装模块
1. 打开 **Surge App**
2. 点击 **首页** -> **模块** -> **➕**
3. 选择 **从本地安装**
4. 找到并选择 `JD_Cookie_Sync_Local.sgmodule`

### ✅ 优点
- 配置永久保存在本地脚本中
- 即使重新安装 Surge 也不会丢失
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
