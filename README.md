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

服务端支持两种运行模式：

1. 标准 stdio 模式（默认）
2. 无状态 Streamable HTTP 模式，提供 HTTP 端点

### 使用 NPX

如果你本地安装了 Node.js：

```bash
# Stdio 模式
npx sbwsz-mcp-server

# Streamable HTTP 模式
npx sbwsz-mcp-server --http
```

### 连接到服务端

#### Stdio 模式

你的应用程序或环境（如 Claude Desktop）可以通过 stdio 直接与服务端通信。

#### Streamable HTTP 模式

当使用 Streamable HTTP 模式运行时（使用 `--http` 参数）：

服务端将在以下端点可用：

- Streamable HTTP 端点：`http://localhost:3000/mcp`

该模式为无状态模式，不维护会话信息，提供更简化和高效的通信方式。

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

或在 Streamable HTTP 模式下运行：

```bash
docker run -i --rm -p 3000:3000 mcp/sbwsz --http
```
