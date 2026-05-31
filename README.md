# @cynosure-mcp/qr-code

MCP server for generating QR codes and reading QR codes from image files or base64 image data.

## Installation

```bash
npx @cynosure-mcp/qr-code
```

Or install globally:

```bash
npm install -g @cynosure-mcp/qr-code
qr-code
```

## Tools

| Tool               | Description                                                |
| ------------------ | ---------------------------------------------------------- |
| `generate_qr_code` | Generate a QR code as PNG or SVG and save it to disk       |
| `read_qr_code`     | Decode a QR code from an image path or base64 image string |

## Configuration

| Variable             | Required | Description                                                                        |
| -------------------- | -------- | ---------------------------------------------------------------------------------- |
| `QR_CODE_OUTPUT_DIR` | No       | Directory for generated QR code files. Defaults to a system temporary directory.   |

## MCP Config

```json
{
  "mcpServers": {
    "qr-code": {
      "command": "npx",
      "args": ["@cynosure-mcp/qr-code"]
    }
  }
}
```

## License

MIT
