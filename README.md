# BeRich 🚀

个人自动化脚本合集，旨在让生活更智能、更高效。包含针对 Surge 和 Loon 的多项优质脚本。

---

## 📂 项目列表

| 项目 | 描述 | 支持平台 |
| :--- | :--- | :--- |
| [**weibo (微博)**](./weibo) | 微博每日自动签到，支持多账号。 | Surge, Loon |
| [**JDCK (京东)**](./JDCK) | 自动化。自动捕获京东 Cookie 并同步至青龙面板。 | Surge, Loon |
| [**NFSQ (农夫山泉)**](./NFSQ) | 农夫山泉小程序自动任务与抽奏。 | Surge, Loon |
| [**V2EX**](./V2EX) | V2EX 每日签到，自动领取登录奖励。 | 青龙面板 |
| [**Ninebot (九号出行)**](./Ninebot) | 九号出行自动签到，支持自动领取任务奖励。 | 青龙面板 |

---

## 📦 安装方式

### Quantumult X 用户 - BoxJS 订阅

> [!IMPORTANT]
> BoxJS 仅适用于 **Quantumult X** 用户。Surge 和 Loon 用户请查看各项目目录下的对应 README 文件。

#### 一键订阅（推荐）

在 BoxJS 中添加以下订阅链接，即可一次性订阅所有脚本：

```
https://raw.githubusercontent.com/5jwoj/BeRich/main/boxjs/BeRich.boxjs.json
```

#### 分别订阅

如果只需要某个功能，可以使用以下单独订阅：

- **京东Cookie同步**: `https://raw.githubusercontent.com/5jwoj/BeRich/main/JDCK/JD_Cookie_Sync_QX.boxjs.json`
- **微博每日签到**: `https://raw.githubusercontent.com/5jwoj/BeRich/main/weibo/weibo.boxjs.json`

详细说明请查看：[boxjs/README.md](./boxjs/README.md)

### Surge 用户

请使用模块（`.sgmodule`）方式安装，详见各项目目录下的 `README.md` 或 `README_Surge.md` 文件。

### Loon 用户

请使用插件（`.plugin`）方式安装，详见各项目目录下的 `README_Loon.md` 文件。

---

## 🛠️ 通用使用指南

### 环境准备

- **Surge**: 安装并激活 Surge，使用模块（`.sgmodule`）方式安装脚本
- **Loon**: 安装并激活 Loon，插件文件（`.plugin`）放在 `Plugins` 目录，脚本文件（`.js`）放在 `scripts` 目录
- **Quantumult X**: 安装并激活 Quantumult X，可使用 BoxJS 订阅或手动配置

### 证书配置

所有平台都必须开启 **MITM** 功能并正确安装/信任证书，否则无法捕获 Cookie 或 Token。

### 安装方式

- **Surge**: 优先使用模块（`.sgmodule`）进行一键安装
- **Loon**: 使用插件（`.plugin`）进行安装，注意插件和脚本不需要放在同一文件夹
- **Quantumult X**: 使用 BoxJS 订阅或手动添加重写规则和定时任务

## 📄 免责声明

1.  本仓库提供的所有脚本仅供学习与编程研究，严禁用于任何商业用途。
2.  用户在下载、使用该脚本时需自行承担风险，作者不保证脚本的持久性与准确性。
3.  如有侵权，请联系作者进行删除。

---

> [!NOTE]
> 如果觉得好用，欢迎点个 **Star** ⭐ 支持一下！
