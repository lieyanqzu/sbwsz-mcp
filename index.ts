#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from "@modelcontextprotocol/sdk/types.js";
import fetch, { Response } from "node-fetch";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { parse } from "node:url";

/**
 * SBWSZ API references:
 *  - https://new.sbwsz.com/api/v1/docs
 *
 * 服务器提供以下工具:
 * 1) get_card_by_set_and_number - 通过系列代码和收集编号获取单张卡牌
 * 2) search_cards               - 通过查询字符串搜索卡牌（支持分页和排序）
 * 3) get_sets                  - 获取所有卡牌系列
 * 4) get_set                   - 获取单个系列的详细信息
 * 5) get_set_cards            - 获取特定系列的所有卡牌
 *
 * 每个工具以JSON格式返回数据。
 */

// 定义基础URL
const BASE_URL = "https://new.sbwsz.com/api/v1";

// 错误响应格式
interface SbwszError {
  message: string;
}

// 解析错误响应格式
interface SbwszParseError {
  message: string;
}

// 找不到资源响应格式
interface SbwszNotFound {
  message: string;
}

// 工具定义
const GET_CARD_BY_SET_AND_NUMBER_TOOL: Tool = {
  name: "get_card_by_set_and_number",
  description:
    "通过系列代码和收集编号获取单张卡牌。",
  inputSchema: {
    type: "object",
    properties: {
      set: {
        type: "string",
        description: "系列代码，例如 'NEO'、'MOM'"
      },
      collector_number: {
        type: "string",
        description: "收集编号，例如 '1'、'112'、'1a'"
      }
    },
    required: ["set", "collector_number"]
  }
};

// 添加搜索卡牌工具
const SEARCH_CARDS_TOOL: Tool = {
  name: "search_cards",
  description:
    "通过查询字符串搜索卡牌，支持分页和排序。\n\n" +
    "**查询语法示例:**\n" +
    "- `t:creature c:r` (红色生物)\n" +
    "- `pow>=5 or mv<2` (力量大于等于5或法术力值小于2)\n" +
    "- `o:\"draw a card\" -c:u` (包含\"抓一张牌\"的非蓝色牌)\n" +
    "- `(t:instant or t:sorcery) mv<=3` (3费或以下的瞬间或法术)\n\n" +
    "**分页参数:**\n" +
    "- `page`: 页码 (整数, 默认 1)\n" +
    "- `page_size`: 每页数量 (整数, 默认 20, 最大 100)\n\n" +
    "**排序参数:**\n" +
    "- `order`: 按字段排序，逗号分隔。前缀 `-` 表示降序\n" +
    "  (例如: `name`, `-mv`, `name,-rarity`)\n" +
    "  默认排序: `name`\n\n" +
    "**其他参数:**\n" +
    "- `unique`: 去重方式 (id, oracle_id, illustration_id)\n" +
    "- `priority_chinese`: 是否优先显示中文卡牌",
  inputSchema: {
    type: "object",
    properties: {
      q: {
        type: "string",
        description: "查询字符串，例如 't:creature c:r'、'pow>=5 or mv<2'、's:TDM -t:creature'"
      },
      page: {
        type: "integer",
        description: "页码 (默认 1)"
      },
      page_size: {
        type: "integer",
        description: "每页数量 (默认 20，最大 100)"
      },
      order: {
        type: "string",
        description: "排序字段 (例如: name, -mv, rarity)"
      },
      unique: {
        type: "string",
        description: "去重方式: id(不去重), oracle_id(按卡牌名去重), illustration_id(按插图去重)"
      },
      priority_chinese: {
        type: "boolean",
        description: "是否优先显示中文卡牌 (默认 true)"
      }
    },
    required: ["q"]
  }
};

// 添加获取所有系列工具
const GET_SETS_TOOL: Tool = {
  name: "get_sets",
  description: "返回所有MTG卡牌系列的完整数据，按发布日期降序排列",
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  }
};

// 添加获取单个系列工具
const GET_SET_TOOL: Tool = {
  name: "get_set",
  description: "根据系列代码获取单个系列的详细信息",
  inputSchema: {
    type: "object",
    properties: {
      set_code: {
        type: "string",
        description: "系列代码，例如 'NEO'、'MOM'"
      }
    },
    required: ["set_code"]
  }
};

// 添加获取系列卡牌工具
const GET_SET_CARDS_TOOL: Tool = {
  name: "get_set_cards",
  description: "获取特定系列的所有卡牌，支持分页和排序。",
  inputSchema: {
    type: "object",
    properties: {
      set_code: {
        type: "string",
        description: "系列代码，例如 'NEO'、'MOM'"
      },
      page: {
        type: "integer",
        description: "页码 (默认 1)"
      },
      page_size: {
        type: "integer",
        description: "每页数量 (默认 20，最大 100)"
      },
      order: {
        type: "string",
        description: "排序字段 (例如: collector_number, name, -mv)"
      },
      priority_chinese: {
        type: "boolean",
        description: "是否优先显示中文卡牌 (默认 true)"
      }
    },
    required: ["set_code"]
  }
};

// 返回我们的工具集
const SBWSZ_TOOLS = [
  GET_CARD_BY_SET_AND_NUMBER_TOOL,
  SEARCH_CARDS_TOOL,
  GET_SETS_TOOL,
  GET_SET_TOOL,
  GET_SET_CARDS_TOOL
] as const;

// 添加获取单个系列处理函数
async function handleGetSet(setCode: string) {
  const url = `${BASE_URL}/set/${encodeURIComponent(setCode.toUpperCase())}`;
  const response = await fetch(url);
  return handleSbwszResponse(response);
}

// 处理响应的通用函数
async function handleSbwszResponse(response: Response) {
  if (!response.ok) {
    // 尝试解析错误
    let errorObj: SbwszError | SbwszParseError | SbwszNotFound | null = null;
    try {
      errorObj = await response.json() as SbwszError | SbwszParseError | SbwszNotFound;
    } catch {
      // 回退到通用错误
    }
    
    if (errorObj && errorObj.message) {
      return {
        content: [
          {
            type: "text",
            text: `SBWSZ API 错误: ${errorObj.message} (状态码: ${response.status})`
          }
        ],
        isError: true
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `HTTP 错误 ${response.status}: ${response.statusText}`
          }
        ],
        isError: true
      };
    }
  }
  
  // 如果正常，解析 JSON
  const data = await response.json();
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2)
      }
    ],
    isError: false
  };
}

// 处理工具调用
async function handleGetCardBySetAndNumber(set: string, collectorNumber: string) {
  const url = `${BASE_URL}/card/${encodeURIComponent(set)}/${encodeURIComponent(collectorNumber)}`;
  const response = await fetch(url);
  return handleSbwszResponse(response);
}

// 添加搜索卡牌处理函数
async function handleSearchCards(
  q: string, 
  page?: number, 
  pageSize?: number, 
  order?: string, 
  unique?: string, 
  priorityChinese?: boolean
) {
  // 构建查询 URL
  let url = `${BASE_URL}/result?q=${encodeURIComponent(q)}`;
  
  // 添加可选参数
  if (page !== undefined) url += `&page=${page}`;
  if (pageSize !== undefined) url += `&page_size=${pageSize}`;
  if (order !== undefined) url += `&order=${encodeURIComponent(order)}`;
  if (unique !== undefined) url += `&unique=${encodeURIComponent(unique)}`;
  if (priorityChinese !== undefined) url += `&priority_chinese=${priorityChinese}`;
  
  const response = await fetch(url);
  return handleSbwszResponse(response);
}

// 添加获取所有系列处理函数
async function handleGetSets() {
  const url = `${BASE_URL}/sets`;
  const response = await fetch(url);
  return handleSbwszResponse(response);
}


// 添加获取系列卡牌处理函数
async function handleGetSetCards(
  setCode: string,
  page?: number,
  pageSize?: number,
  order?: string,
  priorityChinese?: boolean
) {
  // 构建基础 URL
  let url = `${BASE_URL}/set/${encodeURIComponent(setCode.toUpperCase())}/cards`;

  // 添加查询参数
  const params = new URLSearchParams();
  if (page !== undefined) params.append('page', page.toString());
  if (pageSize !== undefined) params.append('page_size', pageSize.toString());
  if (order !== undefined) params.append('order', order);
  if (priorityChinese !== undefined) params.append('priority_chinese', priorityChinese.toString());

  // 如果有查询参数，添加到 URL
  const queryString = params.toString();
  if (queryString) {
    url += `?${queryString}`;
  }

  const response = await fetch(url);
  return handleSbwszResponse(response);
}

// A map of sessionId -> { transport, server } for SSE connections
const transportsBySession = new Map<
  string,
  { transport: SSEServerTransport; server: Server }
>();

// 创建服务器实例
function createSbwszServer() {
  const newServer = new Server(
    {
      name: "mcp-server/sbwsz",
      version: "1.0.2"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // 设置工具列表处理器
  newServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: SBWSZ_TOOLS
  }));

  // 设置工具调用处理器
  newServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args } = request.params;
      switch (name) {
        case "get_card_by_set_and_number": {
          const { set, collector_number } = args as { set: string; collector_number: string };
          return await handleGetCardBySetAndNumber(set.toUpperCase(), collector_number);
        }
        case "search_cards": {
          const { q, page, page_size, order, unique, priority_chinese } = args as { 
            q: string; 
            page?: number; 
            page_size?: number; 
            order?: string; 
            unique?: string; 
            priority_chinese?: boolean 
          };
          return await handleSearchCards(q, page, page_size, order, unique, priority_chinese);
        }
        case "get_sets": {
          return await handleGetSets();
        }
        case "get_set": {
          const { set_code } = args as { set_code: string };
          return await handleGetSet(set_code);
        }
        case "get_set_cards": {
          const { set_code, page, page_size, order, priority_chinese } = args as {
            set_code: string;
            page?: number;
            page_size?: number;
            order?: string;
            priority_chinese?: boolean;
          };
          return await handleGetSetCards(set_code, page, page_size, order, priority_chinese);
        }
        default:
          return {
            content: [
              {
                type: "text",
                text: `错误: 未知的工具名称 "${name}"`
              }
            ],
            isError: true
          };
      }
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `错误: ${(err as Error).message}`
          }
        ],
        isError: true
      };
    }
  });

  return newServer;
}

// 启动服务器
async function runServer() {
  const argv = await yargs(hideBin(process.argv))
    .option("sse", {
      type: "boolean",
      description: "使用 SSE 传输而不是 stdio",
      default: false
    })
    .option("port", {
      type: "number",
      description: "SSE 传输使用的端口",
      default: 3000
    })
    .help().argv;

  if (argv.sse) {
    const httpServer = createServer(
      async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        const url = parse(req.url ?? "", true);

        if (req.method === "GET" && url.pathname === "/sse") {
          // Client establishing SSE connection
          const transport = new SSEServerTransport("/messages", res);
          const sbwszServer = createSbwszServer();

          // Store them in our map for routing POSTs
          transportsBySession.set(transport.sessionId, {
            transport,
            server: sbwszServer
          });

          // Set SSE headers
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");

          // Connect transport to server
          sbwszServer.connect(transport).catch((err) => {
            console.error("Error attaching SSE transport:", err);
            res.end();
          });

          console.error(
            `新的 SSE 连接已建立 (会话: ${transport.sessionId})`
          );

          // Return here - the response will be kept open for SSE
          return;
        } else if (req.method === "POST" && url.pathname === "/messages") {
          // Client sending an MCP message over POST
          const sessionId = url.query.sessionId as string;
          const record = transportsBySession.get(sessionId);

          if (!record) {
            res.writeHead(404, "Unknown session");
            res.end();
            return;
          }

          // Forward the POST body to this session's transport
          await record.transport.handlePostMessage(req, res);
          return;
        } else {
          res.writeHead(404, "Not Found");
          res.end();
          return;
        }
      }
    );

    httpServer.listen(argv.port, () => {
      console.error(
        `SBWSZ MCP 服务器监听中 http://localhost:${argv.port}`
      );
    });
  } else {
    // Standard stdio mode
    const server = createSbwszServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("SBWSZ MCP 服务器在 stdio 上运行");
  }
}

runServer().catch((error) => {
  console.error("启动 SBWSZ 服务器时发生致命错误:", error);
  process.exit(1);
});
