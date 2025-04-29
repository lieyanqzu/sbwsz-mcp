#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  JSONRPCError
} from "@modelcontextprotocol/sdk/types.js";
import fetch, { Response } from "node-fetch";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { parse } from "node:url";
import { randomUUID } from "node:crypto";

/**
 * SBWSZ API references:
 *  - https://www.sbwsz.com/api/v1/docs
 *
 * 服务端提供以下工具:
 * 1) get_card_by_set_and_number - 通过系列代码和收集编号获取单张卡牌
 * 2) search_cards               - 通过查询字符串搜索卡牌（支持分页和排序）
 * 3) get_sets                   - 获取所有卡牌系列
 * 4) get_set                    - 获取单个系列的详细信息
 * 5) get_set_cards              - 获取特定系列的所有卡牌
 * 6) hzls                       - 活字乱刷（使用卡牌图像拼接句子）
 *
 * 每个工具以JSON格式返回数据。
 */

// 定义基础URL
const BASE_URL = "https://www.sbwsz.com/api/v1";

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
  },
  annotations: {
    title: "由系列代码和收集编号获取单张卡牌",
    readOnlyHint: true,
    openWorldHint: true
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
  },
  annotations: {
    title: "通过查询字符串搜索卡牌",
    readOnlyHint: true,
    openWorldHint: true
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
  },
  annotations: {
    title: "获取所有卡牌系列",
    readOnlyHint: true,
    openWorldHint: true
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
  },
  annotations: {
    title: "获取单个系列的详细信息",
    readOnlyHint: true,
    openWorldHint: true
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
  },
  annotations: {
    title: "获取特定系列的所有卡牌",
    readOnlyHint: true,
    openWorldHint: true
  }
};

// 添加卡牌图像拼接句子工具
const HZLS_TOOL: Tool = {
  name: "hzls",
  description: "活字乱刷（使用卡牌图像拼接句子），将输入的文本使用魔法卡牌图像拼接成图片",
  inputSchema: {
    type: "object",
    properties: {
      target_sentence: {
        type: "string",
        description: "要拼接的目标句子/文本"
      },
      cut_full_image: {
        type: "boolean",
        description: "是否使用卡牌完整图像 (默认 true)"
      },
      with_link: {
        type: "boolean",
        description: "是否包含链接水印 (默认 true)"
      }
    },
    required: ["target_sentence"]
  },
  annotations: {
    title: "使用卡牌图像拼接句子",
    readOnlyHint: true,
    openWorldHint: true
  }
};

// 返回我们的工具集
const SBWSZ_TOOLS = [
  GET_CARD_BY_SET_AND_NUMBER_TOOL,
  SEARCH_CARDS_TOOL,
  GET_SETS_TOOL,
  GET_SET_TOOL,
  GET_SET_CARDS_TOOL,
  HZLS_TOOL
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

// 添加卡牌图像拼接句子处理函数
async function handleHzls(
  targetSentence: string,
  cutFullImage?: boolean,
  withLink?: boolean
) {
  // 构建基础 URL
  let url = `${BASE_URL}/hzls?target_sentence=${encodeURIComponent(targetSentence)}`;

  // 添加可选参数
  if (cutFullImage !== undefined) url += `&cut_full_image=${cutFullImage}`;
  if (withLink !== undefined) url += `&with_link=${withLink}`;

  try {
    const response = await fetch(url);
    
    // 处理错误响应
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        content: [
          {
            type: "text",
            text: `HTTP 错误 ${response.status}: ${response.statusText}${errorText ? `\n响应内容: ${errorText}` : ""}`
          }
        ],
        isError: true
      };
    }
    
    // 处理成功响应 - 读取图片数据
    const buffer = await response.arrayBuffer();
    const base64Data = Buffer.from(buffer).toString('base64');
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    // 返回图像内容
    return {
      content: [
        {
          type: "text",
          text: `活字乱刷成功生成图片`
        },
        {
          type: "image",
          data: base64Data,
          mimeType: contentType
        }
      ],
      isError: false
    };
  } catch (error) {
    // 捕获所有其他错误（网络错误、解析错误等）
    return {
      content: [
        {
          type: "text",
          text: `活字乱刷请求失败: ${(error as Error).message}` 
        },
        {
          type: "text",
          text: `活字乱刷成功生成图片链接：\n${url}`
        }
      ],
      isError: true
    };
  }
}

// 创建服务端实例
function createSbwszServer() {
  const newServer = new Server(
    {
      name: "mcp-server/sbwsz",
      version: "1.2.0"
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
        case "hzls": {
          const { target_sentence, cut_full_image, with_link } = args as {
            target_sentence: string;
            cut_full_image?: boolean;
            with_link?: boolean;
          };
          return await handleHzls(target_sentence, cut_full_image, with_link);
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

// 创建错误响应
function createErrorResponse(message: string): JSONRPCError {
  return {
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: message,
    },
    id: randomUUID(),
  };
}

// 启动服务端
async function runServer() {
  const argv = await yargs(hideBin(process.argv))
    .option("http", {
      type: "boolean",
      description: "使用 Streamable HTTP 传输而不是 stdio",
      default: false
    })
    .option("port", {
      type: "number",
      description: "HTTP 传输使用的端口",
      default: 3000
    })
    .help().argv;

  if (argv.http) {
    // 创建一个全局的无状态Server实例
    const sbwszServer = createSbwszServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // 设置为undefined表示无状态模式
    });
    
    // 连接传输和服务端
    await sbwszServer.connect(transport);
    
    const httpServer = createServer(
      async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        const url = parse(req.url ?? "", true);

        // 统一端点
        if (url.pathname === "/mcp") {
          if (req.method === "POST") {
            // 获取请求体
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(Buffer.from(chunk));
            }
            const body = Buffer.concat(chunks).toString();
            let jsonBody;
            
            try {
              jsonBody = JSON.parse(body);
            } catch (e) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify(createErrorResponse("Invalid JSON")));
              return;
            }
            
            try {
              // 在无状态模式下，直接处理请求
              await transport.handleRequest(req, res, jsonBody);
            } catch (error) {
              console.error("处理请求时出错:", error);
              if (!res.headersSent) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify(createErrorResponse("内部服务端错误")));
              }
            }
            return;
          } else {
            // 无状态模式不支持GET/DELETE方法，直接返回405
            res.writeHead(405, {
              "Content-Type": "application/json",
              "Allow": "POST"
            });
            res.end(JSON.stringify(createErrorResponse("Method Not Allowed")));
            return;
          }
        } else {
          // 任何其他路径都返回404
          res.writeHead(404, "Not Found");
          res.end(JSON.stringify(createErrorResponse("Not Found")));
          return;
        }
      }
    );

    httpServer.listen(argv.port, () => {
      console.error(
        `SBWSZ MCP 服务端监听中 http://localhost:${argv.port} (无状态 Streamable HTTP模式)`
      );
      console.error(
        `Streamable HTTP 端点: http://localhost:${argv.port}/mcp`
      );
    });
  } else {
    // Standard stdio mode
    const server = createSbwszServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("SBWSZ MCP 服务端在 stdio 上运行");
  }
}

runServer().catch((error) => {
  console.error("启动 SBWSZ 服务端时发生致命错误:", error);
  process.exit(1);
});
