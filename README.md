# 大学院废墟(sbwsz.com) MCP Server

[![smithery badge](https://smithery.ai/badge/@lieyanqzu/sbwsz-mcp)](https://smithery.ai/server/@lieyanqzu/sbwsz-mcp)

一个基于 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 的服务器，用于与 [SBWSZ](https://sbwsz.com/) API 交互。提供了一系列工具来查询万智牌卡牌信息。

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

## 使用方法

服务器支持两种运行模式：

1. 标准 stdio 模式（默认）
2. 服务器发送事件（SSE）模式，提供 HTTP 端点

### 使用 NPX

如果你本地安装了 Node.js：

```bash
# Stdio 模式
npx sbwsz-mcp-server

# SSE 模式
npx sbwsz-mcp-server --sse
```

### 连接到服务器

#### Stdio 模式

你的应用程序或环境（如 Claude Desktop）可以通过 stdio 直接与服务器通信。

#### SSE 模式

当使用 SSE 模式运行时（使用 `--sse` 参数），你可以使用 MCP CLI 连接：

```bash
npx @wong2/mcp-cli --sse http://localhost:3000/sse
```

服务器将在以下端点可用：

- SSE 端点：`http://localhost:3000/sse`
- 消息端点：`http://localhost:3000/messages`

### 在 claude_desktop_config.json 中集成

stdio 模式的示例配置：

```json
{
  "mcpServers": {
    "sbwsz": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "mcp/sbwsz"]
    }
  }
}
```

或使用 npx：

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

### 使用 Docker 构建

```bash
docker build -t mcp/sbwsz .
```

然后你可以在 stdio 模式下运行：

```bash
docker run -i --rm mcp/sbwsz
```

或在 SSE 模式下运行：

```bash
docker run -i --rm -p 3000:3000 mcp/sbwsz --sse
```
