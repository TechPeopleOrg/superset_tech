# OpenClaw AI Chart (MCP) — Design

Date: 2026-06-22
Status: Approved (pending final spec review)

## Goal

Create a new chart plugin `OpenClawAIMcp` — a copy of the existing `OpenClawAI`
plugin — in which the OpenClaw chat agent can access Superset data through
Superset's built-in MCP server.

The existing `OpenClawAI` plugin MUST NOT be modified. The new plugin is a
self-contained copy plus an MCP orchestration layer.

## Context & constraints (established facts)

- **OpenClaw** is an external service (`https://openclaw.techpeople.ru/openclaw/`),
  not in this repo. It exposes an OpenAI-compatible API at
  `/v1/chat/completions`.
- OpenClaw **supports function calling** (standard `tools` in request →
  `tool_calls` in response) but **does NOT support acting as an MCP client**.
  Therefore the LLM↔MCP orchestration loop must live on our side.
- Superset's **built-in MCP server** runs as a separate process
  (`superset mcp run`, default `:5008/mcp`), speaks JSON-RPC over HTTP, and
  exposes tools (`list_datasets`, `execute_sql`, `get_chart_data`, etc.).
- Orchestration lives on the **frontend** (inside the plugin), structured into
  pure, dependency-injected modules so it is testable and can later move to a
  backend proxy without touching the UI.

## Decisions (from brainstorming)

| Topic | Decision |
|-------|----------|
| Orchestrator location | Frontend, layered pure modules + dependency injection |
| Original plugin | Do NOT modify — work on a copy named `OpenClawAIMcp` |
| MCP reachability (CORS) | Variant B: MCP stays on `:5008`, browser calls it directly; configure CORS + CSP |
| MCP auth | Dev mode on server (`MCP_AUTH_ENABLED=False`, `MCP_DEV_USERNAME=admin`); code carries an optional `Authorization: Bearer <token>` slot for future JWT |
| Tool discovery | Variant A: disable Tool Search (`MCP_TOOL_SEARCH_CONFIG.enabled=False`), `tools/list` returns everything, pass all tools to OpenClaw. Structure must allow later switch to Tool Search (variant B) without breaking layers |
| Streaming | Variant A: `stream: false`, fake per-character typing of the final answer (same as current plugin) |
| Tool-call loop safety | Hard cap on rounds (default 5) with an indicator "выполняю запрос к данным…" while looping |
| MCP settings storage | Variant A: chart controls (`mcp_enabled`, `mcp_url`, `mcp_token`) alongside existing controls |
| Plugin name | `OpenClawAIMcp`, VizType `openclaw_ai_mcp`, gallery name "OpenClaw AI Chart (MCP)" |

## Out of scope (YAGNI)

- Real SSE streaming
- Real JWT issuance / propagation flow (only a code slot is reserved)
- Tool Search mode (variant B) for discovery
- Backend proxy orchestration
- Any change to the original `OpenClawAI` plugin

## Data flow

```
Browser (chart) ──fetch──> OpenClaw /v1/chat/completions   (tools[] = MCP tools)
        │  <── tool_calls ──┘
        └──fetch JSON-RPC──> Superset MCP :5008/mcp         (tools/call)
        │  <── tool results ──┘
        └── repeat loop (max N rounds) ──> final answer ──> fake-stream into UI
```

When `mcp_enabled = false`, the MCP layer is bypassed entirely and the plugin
behaves like the original (plain chat).

## File structure

```
superset-frontend/plugins/plugin-chart-echarts/src/OpenClawAIMcp/
├── index.ts              plugin registration (VizType openclaw_ai_mcp)
├── OpenClawChat.tsx      UI only; collects deps and calls runChatLoop
├── controlPanel.tsx      copy + new controls: mcp_enabled, mcp_url, mcp_token
├── transformProps.ts     copy + passes mcp fields through
├── buildQuery.ts         copy, unchanged
├── types.ts              copy + mcp fields in FormData
├── images/thumbnail.png  copy
├── mcp/
│   ├── McpClient.ts          JSON-RPC over HTTP: initialize→session→listTools→callTool
│   ├── McpClient.test.ts
│   ├── toolAdapter.ts        MCP tool ⇄ OpenAI tools[] / tool result (pure functions)
│   └── toolAdapter.test.ts
├── orchestrator/
│   ├── runChatLoop.ts        pure fn (messages, deps) → answer; loop + round cap
│   └── runChatLoop.test.ts
└── openclaw/
    └── OpenClawApi.ts        wrapper over /v1/chat/completions with tools support
```

Registration points to duplicate for the copy:

- `superset-frontend/packages/superset-ui-core/src/chart/types/VizType.ts` — add `OpenClawAiMcp = 'openclaw_ai_mcp'`
- `superset-frontend/plugins/plugin-chart-echarts/src/index.ts` — export `EchartsOpenClawAIMcpChartPlugin`
- `superset-frontend/src/visualizations/presets/MainPreset.ts` — import + `configure({ key: VizType.OpenClawAiMcp })`

## Module contracts

### `mcp/McpClient.ts`
Encapsulates the stateful MCP protocol (initialize → session id → calls).

```ts
interface McpTool { name: string; description?: string; inputSchema: object; }

class McpClient {
  constructor(opts: { url: string; token?: string; fetchImpl?: typeof fetch });
  initialize(): Promise<void>;                         // MCP handshake; stores session id
  listTools(): Promise<McpTool[]>;                     // tools/list
  callTool(name: string, args: object): Promise<unknown>; // tools/call
}
```

- Manages `Mcp-Session-Id` header across calls.
- Sends `Authorization: Bearer <token>` only if a token is configured (JWT slot).
- `fetchImpl` injectable for tests.

### `openclaw/OpenClawApi.ts`
Wrapper over the chat endpoint with tool support.

```ts
type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

interface OpenClawApi {
  chat(req: {
    messages: ChatMessage[];
    tools?: OpenAITool[];
    model: string;
    temperature: number;
  }): Promise<ChatChoice>;
}
```

### `mcp/toolAdapter.ts`
Pure conversion functions (no network, no state):

- `mcpToolsToOpenAI(tools: McpTool[]): OpenAITool[]`
- `toolResultToMessage(toolCallId: string, result: unknown): ChatMessage`

### `orchestrator/runChatLoop.ts`
The heart — pure function with dependency injection.

```ts
runChatLoop(input: {
  messages: ChatMessage[];
  deps: {
    callOpenClaw: OpenClawApi['chat'];
    listTools: () => Promise<OpenAITool[]>;
    callTool: (name: string, args: object) => Promise<unknown>;
  };
  maxRounds?: number; // default 5
}): Promise<{ answer: string; rounds: number; toolCalls: { name: string; args: object }[] }>;
```

Loop: send request → if `tool_calls`, run each via `callTool`, append results as
`tool` messages, repeat → if a plain answer, return it → if `maxRounds` exceeded,
stop with a clear message. Fully testable with mocks, no network.

### `OpenClawChat.tsx`
Thin UI. Builds the `deps` object from props (constructs `McpClient`,
`OpenClawApi`), calls `runChatLoop`, shows the "выполняю запрос к данным…"
indicator during the loop, fake-streams the final answer character by character.

## Server configuration (variant B)

### 1. MCP flags in `superset_config.py`
```python
MCP_AUTH_ENABLED = False
MCP_DEV_USERNAME = "admin"
MCP_TOOL_SEARCH_CONFIG = {"enabled": False}   # tools/list returns all (variant A)
MCP_RBAC_ENABLED = False                       # test contour; all tools run as admin
```

### 2. CORS on the MCP server
MCP is a separate FastMCP process. It must answer cross-origin requests from the
Superset domain: handle preflight `OPTIONS`, allow request headers
`Authorization`, `Content-Type`, `Mcp-Session-Id`, and **expose** `Mcp-Session-Id`
in responses (the client needs to read it).

**Technical unknown:** exact CORS configuration point in
`superset/mcp_service/server.py`. If FastMCP exposes no built-in CORS option,
add middleware. This is the one item to investigate before implementation; the
plan must flag it as "research first."

### 3. CSP `connect-src` in `superset/config.py`
Add the MCP origin (e.g. `http://<host>:5008`) to **both** `TALISMAN_CONFIG` and
`TALISMAN_DEV_CONFIG` `connect-src` lists, next to the existing
`openclaw.techpeople.ru` entry. Without this the browser blocks the fetch before
CORS even applies.

## Error handling

Every error becomes a friendly chat message; nothing crashes.

| Condition | Behavior |
|-----------|----------|
| MCP unreachable / CORS / 401 | "Не удалось подключиться к данным Superset (MCP). Проверьте настройки." + detail to console |
| Tool returns an error | Return it as a `tool` message with the error text; the agent decides what to do |
| `maxRounds` exceeded | "Агент не уложился в лимит обращений к данным." |
| OpenClaw returns neither answer nor tool_calls | Friendly fallback message |
| `mcp_enabled = false` | Plugin behaves like the original (plain chat); MCP layer untouched |

## Testing

Jest + React Testing Library. Per CLAUDE.md: unit tests preferred, use `test()`
not `describe()`, no `any`, TypeScript only.

- `toolAdapter.test.ts` — format conversions (pure functions)
- `McpClient.test.ts` — JSON-RPC: handshake, session id, callTool, error paths (mock fetch)
- `runChatLoop.test.ts` — main suite: no tool_calls; single round; multiple rounds; round cap; tool error. All via injected mocks, no network
- UI kept thin — minimal tests

## Notes for future evolution (not in scope now)

- Switching discovery to Tool Search (variant B): only `listTools` provider
  changes; orchestrator and UI stay the same.
- Moving orchestration to a backend proxy: move `mcp/`, `orchestrator/`,
  `openclaw/` modules server-side; UI calls one endpoint instead. This is the
  payoff of the layered design.
- Hiding the OpenClaw API key and using real JWT: replace the reserved token slot
  with a real provider; no structural change.
