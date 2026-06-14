# pi-on-mcp

Expose Pi's local coding tools through a Streamable HTTP MCP server.

This project is for connecting MCP-capable hosts such as ChatGPT or Claude to a
local development machine. The host calls MCP tools directly; work is not
delegated to a separate local agent loop.

## Current Tools

- `open_workspace`
- `read_file`
- `write_file`
- `edit_file`
- `grep_files`
- `find_files`
- `list_directory`
- `run_shell`

Set `PI_ON_MCP_TOOL_MODE=minimal` to disable `grep_files`, `find_files`, and
`list_directory`. In that mode, the server instructs clients to use `run_shell`
with command-line tools such as `grep`, `rg`, `find`, `ls`, and `tree` for
search and directory inspection.

Server-level workflow guidance is exposed through MCP initialize instructions,
not a dedicated info tool.

## Persistent Result Payloads

Tool result payloads are persisted in a global SQLite database under
`~/.local/share/pi-on-mcp/pi-on-mcp.sqlite`, or under `PI_ON_MCP_STATE_DIR` when
that variable is set. This lets UI cards such as edit/write diff viewers reload
historical payloads after the MCP server process restarts.

Workspace IDs remain live-session identifiers; after a restart, open the
workspace again for new file, edit, search, or shell tool calls.

## Workspace Flow

Call `open_workspace` before using the coding tools:

```json
{
  "path": "/home/waishnav/personal/pi-on-mcp"
}
```

The result includes a `workspaceId`. Use that `workspaceId` for subsequent
calls:

```json
{
  "workspaceId": "ws_...",
  "path": "README.md"
}
```

The server automatically loads `AGENTS.md` files for the workspace root and for
directories reached by later file, list, search, edit, write, or shell calls.
Tool responses include whether each discovered `AGENTS.md` was newly loaded or
already loaded in that workspace.

## Run Locally

```bash
npm install --include=dev
npm run typecheck
npm run build

PI_ON_MCP_TOKEN="change-me" \
PI_ON_MCP_ALLOWED_ROOTS="/home/waishnav/personal,/home/waishnav/work" \
PI_ON_MCP_ALLOWED_HOSTS="localhost,127.0.0.1,agent.gitcms.blog" \
PI_ON_MCP_PUBLIC_BASE_URL="https://agent.gitcms.blog" \
PI_ON_MCP_TOOL_MODE="full" \
npm run dev
```

The MCP endpoint is:

```text
http://127.0.0.1:7676/mcp
```

Send `Authorization: Bearer <PI_ON_MCP_TOKEN>` when `PI_ON_MCP_TOKEN` is set.

## Cloudflare Tunnel

Point a Cloudflare Tunnel hostname at the local server:

```text
http://127.0.0.1:7676
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
- If you expose the server through a tunnel, add the tunnel hostname to `PI_ON_MCP_ALLOWED_HOSTS`.
- Put Cloudflare Access or equivalent in front of the tunnel before exposing it.
- `run_shell` can escape filesystem allowlists by design; shell access relies on
  authentication and client trust, not path containment.
