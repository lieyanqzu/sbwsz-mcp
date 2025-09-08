FROM node:22-slim

# 设置工作目录
WORKDIR /app

# 复制package文件
COPY package*.json ./

# 安装所有依赖（需要dev依赖来编译TypeScript）
RUN npm ci

# 复制源代码
COPY . .

# 构建TypeScript代码
RUN npm run build

# 设置传输模式为HTTP
ENV TRANSPORT=http

# 直接用node启动服务器
CMD ["node", "dist/index.js"] 