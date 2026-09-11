FROM node:18-alpine

# 设置国内镜像源与时区
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

WORKDIR /app

# 先复制依赖定义，利用 Docker 缓存层
COPY package.json ./

# 安装运行依赖
RUN npm install --production --registry=https://registry.npmmirror.com

# 默认拷贝代码（作为基础兜底）
COPY . .

# 暴露容器内部端口
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# 默认启动命令：使用 --watch 监听文件变更，实现修改代码热生效
CMD ["node", "--watch", "server/index.js"]
