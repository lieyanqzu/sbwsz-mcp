[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/lieyanqzu-sbwsz-mcp-badge.png)](https://mseep.ai/app/lieyanqzu-sbwsz-mcp)

# 大学院废墟(sbwsz.com) MCP Server

[English](README/README.en.md) | 中文

一个基于 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 的服务端，用于与 [大学院废墟](https://sbwsz.com/) API 交互。提供了一系列工具来查询万智牌中文卡牌信息。

[![smithery badge](https://smithery.ai/badge/@lieyanqzu/sbwsz-mcp)](https://smithery.ai/server/@lieyanqzu/sbwsz-mcp)

<a href="https://glama.ai/mcp/servers/@lieyanqzu/sbwsz-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@lieyanqzu/sbwsz-mcp/badge" />
</a>

## API 文档

本服务端基于大学院废墟的公开 API。您可以在以下地址查看完整的 API 文档：

- [大学院废墟 API 文档](https://new.sbwsz.com/api/v1/docs)


## 使用示例

![使用示例](README/use_case.png)

## 功能特性

- **get_card_by_set_and_number**  
  通过系列代码和收集编号获取单张卡牌。
- **search_cards**  
  通过查询字符串搜索卡牌，支持分页和排序。支持复杂的查询语法，如 `t:creature c:r`（红色生物）或 `pow>=5 or mv<2`（力量大于等于5或法术力值小于2）。
- **get_sets**  
  获取所有卡牌系列的信息。
- **get_set**  
  获取单个系列的详细信息。
- **get_set_cards**  
  获取特定系列的所有卡牌，支持分页和排序。
- **hzls**  
  活字乱刷，将输入的文本使用万智牌卡牌图像拼接成图片。

## 使用方法

### 通过 NPM 包使用

```bash
# 全局安装
npm install -g sbwsz-mcp-server

# 或直接运行（推荐）
npx sbwsz-mcp-server
```

### 本地开发

```bash
# 克隆项目
git clone <repository-url>
cd sbwsz-mcp

# 安装依赖
npm install

# 构建项目
npm run build

# 运行 STDIO 模式
npm run start:stdio

# 运行 HTTP 模式
npm run start:http
```

### 运行模式

服务端支持两种运行模式：

#### STDIO 模式（默认）
用于与 Claude Desktop 等 MCP 客户端直接集成：

```bash
npm run start:stdio
```

#### HTTP 模式
用于容器部署或 HTTP 客户端访问：

```bash
npm run start:http
```

HTTP 服务器将在端口 8081 上启动，端点为 `http://localhost:8081/mcp`

### 在 Claude Desktop 中集成

在 `claude_desktop_config.json` 中添加配置：

#### 使用 NPX（推荐）
```json
{
  "mcpServers": {
    "sbwsz": {
      "command": "npx",
      "args": ["sbwsz-mcp-server"]
    }
  }
}
```

#### 使用本地构建
```json
{
  "mcpServers": {
    "sbwsz": {
      "command": "node",
      "args": ["path/to/sbwsz-mcp/dist/index.js"],
      "cwd": "path/to/sbwsz-mcp"
    }
  }
}
```

### Docker 部署

```bash
# 构建镜像
docker build -t sbwsz-mcp .

# 运行 STDIO 模式（用于集成）
docker run -i --rm sbwsz-mcp

# 运行 HTTP 模式（用于服务）
docker run -p 8081:8081 sbwsz-mcp
```

### 跨平台支持

项目使用 `cross-env` 确保在所有平台上正确设置环境变量：

- **Windows**: `npm run start:http` 或 `npm run start:stdio`
- **macOS/Linux**: `npm run start:http` 或 `npm run start:stdio`
- **Docker**: 自动使用 HTTP 模式
