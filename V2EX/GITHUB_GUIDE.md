# GitHub 提交指南

## 步骤 1: 配置 Git 用户信息（首次使用需要）

```bash
git config --global user.name "你的GitHub用户名"
git config --global user.email "你的GitHub邮箱"
```

示例：
```bash
git config --global user.name "zhangsan"
git config --global user.email "zhangsan@example.com"
```

## 步骤 2: 提交代码到本地仓库

```bash
# 查看当前状态
git status

# 提交代码
git commit -m "Initial commit: V2EX 每日签到助手 v1.1.0"
```

## 步骤 3: 在 GitHub 上创建仓库

1. 访问 https://github.com/new
2. 填写仓库信息：
   - Repository name: `v2ex-daily-helper` （或其他你喜欢的名称）
   - Description: `V2EX 每日签到助手 - 自动领取登录奖励`
   - 选择 Public 或 Private
   - **不要**勾选 "Initialize this repository with a README"（我们已经有了）
3. 点击 "Create repository"

## 步骤 4: 关联远程仓库并推送

GitHub 创建完成后，会显示命令提示，执行以下命令：

```bash
# 添加远程仓库（替换为你的 GitHub 用户名和仓库名）
git remote add origin https://github.com/你的用户名/v2ex-daily-helper.git

# 推送到 GitHub
git branch -M main
git push -u origin main
```

示例：
```bash
git remote add origin https://github.com/zhangsan/v2ex-daily-helper.git
git branch -M main
git push -u origin main
```

## 步骤 5: 验证

访问你的 GitHub 仓库页面，确认代码已成功上传。

## 后续更新代码

当你修改代码后，使用以下命令提交更新：

```bash
# 添加所有修改的文件
git add .

# 提交修改
git commit -m "描述你的修改内容"

# 推送到 GitHub
git push
```

## 常见问题

### Q: 推送时要求输入用户名和密码？

A: GitHub 已不再支持密码认证，需要使用 Personal Access Token (PAT)：

1. 访问 https://github.com/settings/tokens
2. 点击 "Generate new token" → "Generate new token (classic)"
3. 设置权限（至少勾选 `repo`）
4. 生成并复制 token
5. 推送时使用 token 作为密码

### Q: 如何使用 SSH 方式推送？

A: 配置 SSH 密钥后，使用 SSH URL：

```bash
git remote set-url origin git@github.com:你的用户名/v2ex-daily-helper.git
```

SSH 密钥配置参考：https://docs.github.com/zh/authentication/connecting-to-github-with-ssh

## 当前项目状态

✅ Git 仓库已初始化
✅ 文件已添加到暂存区
⏳ 等待配置用户信息后提交

## 下一步操作

请执行以下命令：

```bash
# 1. 配置用户信息（替换为你的信息）
git config --global user.name "你的用户名"
git config --global user.email "你的邮箱"

# 2. 提交代码
git commit -m "Initial commit: V2EX 每日签到助手 v1.1.0"

# 3. 在 GitHub 创建仓库后，关联并推送
git remote add origin https://github.com/你的用户名/仓库名.git
git branch -M main
git push -u origin main
```
