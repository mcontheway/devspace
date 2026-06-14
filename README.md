# pi-on-mcp

Expose Pi's local coding tools through a Streamable HTTP MCP server.

This project is for connecting MCP-capable hosts such as ChatGPT or Claude to a
local development machine. The host calls MCP tools directly; work is not
delegated to a separate local agent loop.

## Current Tools

- `server_info`
- `read_file`
- `write_file`
- `edit_file`
- `grep_files`
- `find_files`
- `list_directory`
- `run_shell`

## Run Locally

```bash
npm install --include=dev
npm run typecheck
npm run build

PI_ON_MCP_TOKEN="change-me" \
PI_ON_MCP_ALLOWED_ROOTS="/home/waishnav/personal,/home/waishnav/work" \
npm run dev
```

The MCP endpoint is:

```text
http://127.0.0.1:8080/mcp
```

Send `Authorization: Bearer <PI_ON_MCP_TOKEN>` when `PI_ON_MCP_TOKEN` is set.

## Cloudflare Tunnel

Point a Cloudflare Tunnel hostname at the local server:

```text
http://127.0.0.1:8080
```

Then configure the remote MCP client with:

```text
https://your-tunnel-hostname.example.com/mcp
```

## Security Notes

This server exposes local filesystem and shell capabilities. Treat it like
remote code execution on this machine.

- Always use `PI_ON_MCP_TOKEN` outside purely local smoke tests.
- Keep `PI_ON_MCP_ALLOWED_ROOTS` narrow.
- Put Cloudflare Access or equivalent in front of the tunnel before exposing it.
- `run_shell` can escape filesystem allowlists by design; shell access relies on
  authentication and client trust, not path containment.
