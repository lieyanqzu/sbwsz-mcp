# Academy Ruins (sbwsz.com) MCP Server

English | [中文](../README.md)

A server based on [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) for interacting with the [Academy Ruins - SBWSZ](https://sbwsz.com/) API. Provides a set of tools for querying Magic: The Gathering card Chinese information.

[![smithery badge](https://smithery.ai/badge/@lieyanqzu/sbwsz-mcp)](https://smithery.ai/server/@lieyanqzu/sbwsz-mcp)

<a href="https://glama.ai/mcp/servers/@lieyanqzu/sbwsz-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@lieyanqzu/sbwsz-mcp/badge" />
</a>

## API Documentation

This server is based on the public API of Academy Ruins. You can view the complete API documentation at:

- [Academy Ruins API Documentation](https://new.sbwsz.com/api/v1/docs)

## Use Case

![Use Case](../README/use_case_en.png)

## Features

- **get_card_by_set_and_number**  
  Get a single card by set code and collector number.
- **search_cards**  
  Search cards using a query string, with support for pagination and sorting. Supports complex query syntax, such as `t:creature c:r` (red creatures) or `pow>=5 or mv<2` (power greater than or equal to 5 or mana value less than 2).
- **get_sets**  
  Get information about all card sets.
- **get_set**  
  Get detailed information about a single set.
- **get_set_cards**  
  Get all cards from a specific set, with support for pagination and sorting.
- **hzls**  
  Creates a composite image by arranging Chinese Magic card name sections to spell out the input sentence.

## Usage

### Using NPM Package

```bash
# Global installation
npm install -g sbwsz-mcp-server

# Or run directly (recommended)
npx sbwsz-mcp-server
```

### Local Development

```bash
# Clone the project
git clone <repository-url>
cd sbwsz-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Run STDIO mode
npm run start:stdio

# Run HTTP mode
npm run start:http
```

### Running Modes

The server supports two running modes:

#### STDIO Mode (Default)
For direct integration with MCP clients like Claude Desktop:

```bash
npm run start:stdio
```

#### HTTP Mode
For container deployment or HTTP client access:

```bash
npm run start:http
```

The HTTP server will start on port 8081 with endpoint `http://localhost:8081/mcp`

### Integration with Claude Desktop

Add configuration to `claude_desktop_config.json`:

#### Using NPX (Recommended)
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

#### Using Local Build
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

### Docker Deployment

```bash
# Build image
docker build -t sbwsz-mcp .

# Run STDIO mode (for integration)
docker run -i --rm sbwsz-mcp

# Run HTTP mode (for service)
docker run -p 8081:8081 sbwsz-mcp
```

### Cross-Platform Support

The project uses `cross-env` to ensure proper environment variable setting across all platforms:

- **Windows**: `npm run start:http` or `npm run start:stdio`
- **macOS/Linux**: `npm run start:http` or `npm run start:stdio`
- **Docker**: Automatically uses HTTP mode 