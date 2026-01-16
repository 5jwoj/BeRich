# BeRich BoxJS 订阅合集

这是一个合并了所有 BeRich 项目脚本的 BoxJS 订阅文件，方便一次性订阅所有功能。

## 📦 包含的应用

1. **京东Cookie同步** - 自动捕获京东Cookie并同步到青龙面板
2. **微博每日签到** - 微博自动签到脚本

## 🚀 使用方法

### 方法：直接订阅（推荐）

在 BoxJS 中添加以下订阅链接：

```
https://raw.githubusercontent.com/5jwoj/BeRich/main/boxjs/BeRich.boxjs.json
```

## 📝 配置说明

### 京东Cookie同步

需要配置以下参数：
- **青龙面板地址**：青龙面板的完整地址（包括端口号）
- **Client ID**：在青龙面板创建的应用 ID
- **Client Secret**：在青龙面板创建的应用密钥

详细使用说明请查看：[JDCK/README_QX.md](../JDCK/README_QX.md)

### 微博每日签到

需要配置以下参数：
- **微博 Token**：通过重写规则自动获取
- **微博 Cookie (SUB)**：用于钱包签到

详细使用说明请查看：[weibo/README.md](../weibo/README.md)

## ⚙️ Quantumult X 配置

请确保在 Quantumult X 配置文件中添加相应的重写规则和定时任务。

具体配置方法请参考各个脚本目录下的 README 文件。

## 📄 更新日志

### v1.0.0 (2026-01-16)
- 初始版本
- 合并京东Cookie同步和微博签到两个 BoxJS 订阅

## 🔗 相关链接

- 项目地址：https://github.com/5jwoj/BeRich
- 问题反馈：https://github.com/5jwoj/BeRich/issues

## 📜 许可证

MIT License
