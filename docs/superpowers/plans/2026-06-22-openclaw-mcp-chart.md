# OpenClaw AI Chart (MCP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new chart plugin `OpenClawAIMcp` (a copy of `OpenClawAI`) whose OpenClaw chat agent reaches Superset data through the built-in MCP server, via a frontend orchestration loop.

**Architecture:** OpenClaw supports function calling but not MCP, so a frontend loop drives it: pass MCP tools to OpenClaw → execute its `tool_calls` against Superset MCP (`:5008/mcp`) → feed results back → repeat (capped) → fake-stream the final answer. Orchestration lives in pure, dependency-injected TS modules (`mcp/`, `openclaw/`, `orchestrator/`) so the UI stays thin and the loop is unit-testable. The original `OpenClawAI` plugin is never modified.

**Tech Stack:** TypeScript, React, `@superset-ui/core`/`@superset-ui/chart-controls`, antd, Jest + React Testing Library (frontend); Python/Flask + FastMCP/Starlette (server config).

## Global Constraints

- Do NOT modify the existing `OpenClawAI` plugin — `OpenClawAIMcp` is a self-contained copy.
- New plugin: folder `src/OpenClawAIMcp/`, VizType `openclaw_ai_mcp`, gallery name "OpenClaw AI Chart (MCP)".
- No `any` types; TypeScript only (no `.js`); functional components with hooks.
- Tests: Jest + React Testing Library; use `test()` not `describe()`; no Enzyme.
- All new files carry the Apache Software Foundation license header (the 18-line ASF header used across the repo). Python files use the `#` header form; TS files use the `/** ... */` form.
- Frontend orchestration logic must be pure and dependency-injected (no React, no global fetch reference inside logic modules — inject `fetch`/deps) so it can later move to a backend without UI changes.
- MCP discovery mode A: Tool Search disabled; `tools/list` returns all tools; pass them all to OpenClaw.
- Streaming mode A: request with `stream: false`; final answer fake-streamed per character.
- Tool-call loop hard cap: default 5 rounds.
- MCP auth: server in dev mode (`MCP_AUTH_ENABLED=False`); code carries an optional `Authorization: Bearer <token>` slot.
- MCP reachability variant B: browser calls `:5008` directly; CORS on MCP + CSP `connect-src` entry both required.
- Run `pre-commit run` on staged files before each commit; CI requires it.

---

## File Structure

Frontend (all under `superset-frontend/plugins/plugin-chart-echarts/src/OpenClawAIMcp/`):

| File | Responsibility |
|------|----------------|
| `types.ts` | FormData type + defaults, incl. MCP fields |
| `buildQuery.ts` | Query context (copy, unchanged) |
| `controlPanel.tsx` | Controls incl. `mcp_enabled`, `mcp_url`, `mcp_token` |
| `transformProps.ts` | Map formData → component props (camelCase), incl. MCP fields |
| `openclaw/OpenClawApi.ts` | Wrapper over `/v1/chat/completions` with `tools` support |
| `mcp/toolAdapter.ts` | Pure conversions MCP tool ⇄ OpenAI tool / tool-result message |
| `mcp/McpClient.ts` | JSON-RPC over HTTP: initialize → session id → listTools → callTool |
| `orchestrator/runChatLoop.ts` | Pure loop: messages + deps → answer; round cap |
| `OpenClawChat.tsx` | UI only; builds deps, calls `runChatLoop`, fake-streams answer |
| `index.ts` | Plugin class + metadata registration |
| `images/thumbnail.png` | Copied asset |

Registration (modify):

- `superset-frontend/packages/superset-ui-core/src/chart/types/VizType.ts`
- `superset-frontend/plugins/plugin-chart-echarts/src/index.ts`
- `superset-frontend/src/visualizations/presets/MainPreset.ts`

Server config (modify):

- `superset/mcp_service/server.py` (`_build_starlette_middleware`) — add CORS
- `superset/config.py` — CSP `connect-src` MCP origin
- `docs/admin_docs/configuration/mcp-server.mdx` — document dev-contour flags (optional doc touch folded into the server task)

Tests:

- `.../OpenClawAIMcp/mcp/toolAdapter.test.ts`
- `.../OpenClawAIMcp/mcp/McpClient.test.ts`
- `.../OpenClawAIMcp/orchestrator/runChatLoop.test.ts`

---

## Task 1: Scaffold the plugin copy (no MCP yet)

Goal: a working clone of `OpenClawAI` registered as `openclaw_ai_mcp`, behaving exactly like the original. This isolates the "copy + register" risk before any MCP logic.

**Files:**
- Create: `superset-frontend/plugins/plugin-chart-echarts/src/OpenClawAIMcp/types.ts`
- Create: `.../OpenClawAIMcp/buildQuery.ts`
- Create: `.../OpenClawAIMcp/controlPanel.tsx`
- Create: `.../OpenClawAIMcp/transformProps.ts`
- Create: `.../OpenClawAIMcp/OpenClawChat.tsx`
- Create: `.../OpenClawAIMcp/index.ts`
- Create: `.../OpenClawAIMcp/images/thumbnail.png` (copy of original)
- Modify: `superset-frontend/packages/superset-ui-core/src/chart/types/VizType.ts`
- Modify: `superset-frontend/plugins/plugin-chart-echarts/src/index.ts`
- Modify: `superset-frontend/src/visualizations/presets/MainPreset.ts`

**Interfaces:**
- Produces: `EchartsOpenClawAIMcpChartPlugin` (default export of `index.ts`); `VizType.OpenClawAiMcp = 'openclaw_ai_mcp'`; `OpenClawAIMcpFormData`, `OpenClawModel`, `DEFAULT_FORM_DATA` from `types.ts`.

- [ ] **Step 1: Copy the source tree**

```bash
cd superset-frontend/plugins/plugin-chart-echarts/src
cp -R OpenClawAI OpenClawAIMcp
```

- [ ] **Step 2: Rename the plugin class and metadata in `index.ts`**

Edit `OpenClawAIMcp/index.ts` — rename the class and update metadata:

```ts
import { Behavior } from '@superset-ui/core';
import { t } from '@apache-superset/core/translation';
import buildQuery from './buildQuery';
import controlPanel from './controlPanel';
import transformProps from './transformProps';
import thumbnail from './images/thumbnail.png';
import { OpenClawAIMcpChartProps, OpenClawAIMcpFormData } from './types';
import { EchartsChartPlugin } from '../types';

export default class EchartsOpenClawAIMcpChartPlugin extends EchartsChartPlugin<
  OpenClawAIMcpFormData,
  OpenClawAIMcpChartProps
> {
  constructor() {
    super({
      buildQuery,
      controlPanel,
      loadChart: () => import('./OpenClawChat'),
      metadata: {
        behaviors: [
          Behavior.InteractiveChart,
          Behavior.DrillToDetail,
          Behavior.DrillBy,
        ],
        category: t('AI'),
        credits: ['https://docs.openclaw.ai'],
        description: t('OpenClaw AI Chat with Superset MCP data access'),
        exampleGallery: [],
        name: t('OpenClaw AI Chart (MCP)'),
        tags: [t('AI'), t('Featured'), t('Web')],
        thumbnail,
      },
      transformProps,
    });
  }
}
```

- [ ] **Step 3: Rename exported types in `types.ts`**

In `OpenClawAIMcp/types.ts` rename `OpenClawAIFormData` → `OpenClawAIMcpFormData` and `OpenClawAIChartProps` → `OpenClawAIMcpChartProps` (keep all existing fields and `DEFAULT_FORM_DATA` as-is for now). Update the interface body reference accordingly:

```ts
export type OpenClawAIMcpFormData = QueryFormData & {
  base_url?: string;
  api_key?: string;
  model?: OpenClawModel;
  system_prompt?: string;
  temperature?: number;
  speed_text?: number;
};

export interface OpenClawAIMcpChartProps
  extends BaseChartProps<OpenClawAIMcpFormData> {
  formData: OpenClawAIMcpFormData;
}
```

- [ ] **Step 4: Update type references in `transformProps.ts`**

In `OpenClawAIMcp/transformProps.ts` change the import and the `chartProps` type to the renamed types (`OpenClawAIMcpChartProps`, `OpenClawAIMcpFormData`). No logic change yet.

- [ ] **Step 5: Register the VizType enum**

In `superset-frontend/packages/superset-ui-core/src/chart/types/VizType.ts`, directly after the line `OpenClawAi = 'openclaw_ai',` (line 28) add:

```ts
  OpenClawAiMcp = 'openclaw_ai_mcp',
```

- [ ] **Step 6: Export the plugin from the echarts package index**

In `superset-frontend/plugins/plugin-chart-echarts/src/index.ts`, directly after line 48 (`export { default as EchartsOpenClawAIChartPlugin } from './OpenClawAI';`) add:

```ts
export { default as EchartsOpenClawAIMcpChartPlugin } from './OpenClawAIMcp';
```

- [ ] **Step 7: Register in MainPreset**

In `superset-frontend/src/visualizations/presets/MainPreset.ts`:

After the import line `EchartsOpenClawAIChartPlugin,` (line 74) add:

```ts
  EchartsOpenClawAIMcpChartPlugin,
```

After the existing `new EchartsOpenClawAIChartPlugin().configure({ key: VizType.OpenClawAi })` block (lines 131-133) add:

```ts
        new EchartsOpenClawAIMcpChartPlugin().configure({
          key: VizType.OpenClawAiMcp,
        }),
```

- [ ] **Step 8: Type-check and lint the changed files**

Run: `cd superset-frontend && npx tsc --noEmit -p plugins/plugin-chart-echarts/tsconfig.json`
Expected: no errors referencing `OpenClawAIMcp`.

Run: `cd superset-frontend && npx eslint plugins/plugin-chart-echarts/src/OpenClawAIMcp src/visualizations/presets/MainPreset.ts`
Expected: clean (warnings about pre-existing patterns in the copy are acceptable; no errors).

- [ ] **Step 9: Commit**

```bash
git add superset-frontend/plugins/plugin-chart-echarts/src/OpenClawAIMcp \
        superset-frontend/packages/superset-ui-core/src/chart/types/VizType.ts \
        superset-frontend/plugins/plugin-chart-echarts/src/index.ts \
        superset-frontend/src/visualizations/presets/MainPreset.ts
git commit -m "feat(plugin-chart-echarts): scaffold OpenClawAIMcp as a copy of OpenClawAI"
```

---

## Task 2: toolAdapter — pure format conversions

Goal: the only place that knows both the MCP tool shape and the OpenAI tool shape. Pure functions, fully tested first.

**Files:**
- Create: `.../OpenClawAIMcp/mcp/toolAdapter.ts`
- Test: `.../OpenClawAIMcp/mcp/toolAdapter.test.ts`

**Interfaces:**
- Produces:
  - `interface McpTool { name: string; description?: string; inputSchema: Record<string, unknown>; }`
  - `interface OpenAITool { type: 'function'; function: { name: string; description?: string; parameters: Record<string, unknown>; }; }`
  - `interface ChatToolCall { id: string; type: 'function'; function: { name: string; arguments: string }; }`
  - `interface ChatMessage { role: 'system'|'user'|'assistant'|'tool'; content: string | null; tool_calls?: ChatToolCall[]; tool_call_id?: string; }`
  - `mcpToolsToOpenAI(tools: McpTool[]): OpenAITool[]`
  - `toolResultToMessage(toolCallId: string, result: unknown): ChatMessage`
  - `parseToolArguments(raw: string): Record<string, unknown>` (safe JSON parse; `{}` on empty/invalid)

- [ ] **Step 1: Write the failing test**

Create `mcp/toolAdapter.test.ts` (ASF header omitted here for brevity — include it):

```ts
import {
  mcpToolsToOpenAI,
  toolResultToMessage,
  parseToolArguments,
  McpTool,
} from './toolAdapter';

test('mcpToolsToOpenAI maps name, description and schema', () => {
  const tools: McpTool[] = [
    { name: 'list_datasets', description: 'List', inputSchema: { type: 'object' } },
  ];
  expect(mcpToolsToOpenAI(tools)).toEqual([
    {
      type: 'function',
      function: {
        name: 'list_datasets',
        description: 'List',
        parameters: { type: 'object' },
      },
    },
  ]);
});

test('mcpToolsToOpenAI falls back to empty object schema when missing', () => {
  const tools: McpTool[] = [{ name: 't', inputSchema: undefined as never }];
  expect(mcpToolsToOpenAI(tools)[0].function.parameters).toEqual({
    type: 'object',
    properties: {},
  });
});

test('toolResultToMessage serializes result into a tool message', () => {
  const msg = toolResultToMessage('call_1', { rows: 3 });
  expect(msg).toEqual({
    role: 'tool',
    tool_call_id: 'call_1',
    content: '{"rows":3}',
  });
});

test('toolResultToMessage stringifies primitive results', () => {
  expect(toolResultToMessage('c', 'hello').content).toBe('hello');
});

test('parseToolArguments returns {} for empty or invalid JSON', () => {
  expect(parseToolArguments('')).toEqual({});
  expect(parseToolArguments('not json')).toEqual({});
  expect(parseToolArguments('{"a":1}')).toEqual({ a: 1 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd superset-frontend && npx jest plugins/plugin-chart-echarts/src/OpenClawAIMcp/mcp/toolAdapter.test.ts`
Expected: FAIL — cannot find module `./toolAdapter`.

- [ ] **Step 3: Write minimal implementation**

Create `mcp/toolAdapter.ts` (include ASF header):

```ts
export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
}

export function mcpToolsToOpenAI(tools: McpTool[]): OpenAITool[] {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      parameters: tool.inputSchema ?? { type: 'object', properties: {} },
    },
  }));
}

export function toolResultToMessage(
  toolCallId: string,
  result: unknown,
): ChatMessage {
  const content =
    typeof result === 'string' ? result : JSON.stringify(result);
  return { role: 'tool', tool_call_id: toolCallId, content };
}

export function parseToolArguments(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd superset-frontend && npx jest plugins/plugin-chart-echarts/src/OpenClawAIMcp/mcp/toolAdapter.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add superset-frontend/plugins/plugin-chart-echarts/src/OpenClawAIMcp/mcp/toolAdapter.ts \
        superset-frontend/plugins/plugin-chart-echarts/src/OpenClawAIMcp/mcp/toolAdapter.test.ts
git commit -m "feat(plugin-chart-echarts): add MCP/OpenAI tool adapter for OpenClawAIMcp"
```

---

## Task 3: McpClient — JSON-RPC over HTTP with session handling

Goal: encapsulate the stateful MCP protocol. The streamable-http transport returns an `Mcp-Session-Id` header on initialize that must be echoed on later requests. `fetch` is injected for testing.

**Files:**
- Create: `.../OpenClawAIMcp/mcp/McpClient.ts`
- Test: `.../OpenClawAIMcp/mcp/McpClient.test.ts`

**Interfaces:**
- Consumes: `McpTool` from `./toolAdapter`.
- Produces:
  - `class McpClient` with constructor `(opts: { url: string; token?: string; fetchImpl?: typeof fetch })`
  - `initialize(): Promise<void>`
  - `listTools(): Promise<McpTool[]>`
  - `callTool(name: string, args: Record<string, unknown>): Promise<unknown>`
  - `class McpError extends Error` (thrown on transport/RPC errors)

- [ ] **Step 1: Write the failing test**

Create `mcp/McpClient.test.ts` (include ASF header). It mocks `fetch` to assert headers and parse JSON-RPC:

```ts
import { McpClient, McpError } from './McpClient';

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

test('initialize stores session id from response header', async () => {
  const fetchImpl = jest
    .fn()
    .mockResolvedValue(
      jsonResponse(
        { jsonrpc: '2.0', id: 1, result: { capabilities: {} } },
        { 'mcp-session-id': 'sess-123' },
      ),
    );
  const client = new McpClient({ url: 'http://h:5008/mcp', fetchImpl });
  await client.initialize();
  // next call must carry the session id
  fetchImpl.mockResolvedValue(
    jsonResponse({ jsonrpc: '2.0', id: 2, result: { tools: [] } }),
  );
  await client.listTools();
  const lastCall = fetchImpl.mock.calls[fetchImpl.mock.calls.length - 1];
  const headers = lastCall[1].headers as Record<string, string>;
  expect(headers['Mcp-Session-Id']).toBe('sess-123');
});

test('listTools returns the tools array from result', async () => {
  const fetchImpl = jest
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({ jsonrpc: '2.0', id: 1, result: {} }, { 'mcp-session-id': 's' }),
    )
    .mockResolvedValueOnce(
      jsonResponse({
        jsonrpc: '2.0',
        id: 2,
        result: { tools: [{ name: 'list_datasets', inputSchema: { type: 'object' } }] },
      }),
    );
  const client = new McpClient({ url: 'http://h/mcp', fetchImpl });
  await client.initialize();
  const tools = await client.listTools();
  expect(tools[0].name).toBe('list_datasets');
});

test('callTool returns structuredContent/content from result', async () => {
  const fetchImpl = jest
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({ jsonrpc: '2.0', id: 1, result: {} }, { 'mcp-session-id': 's' }),
    )
    .mockResolvedValueOnce(
      jsonResponse({
        jsonrpc: '2.0',
        id: 2,
        result: { content: [{ type: 'text', text: '{"rows":2}' }] },
      }),
    );
  const client = new McpClient({ url: 'http://h/mcp', fetchImpl });
  await client.initialize();
  const out = await client.callTool('list_datasets', {});
  expect(out).toEqual('{"rows":2}');
});

test('sends Authorization header when token provided', async () => {
  const fetchImpl = jest
    .fn()
    .mockResolvedValue(
      jsonResponse({ jsonrpc: '2.0', id: 1, result: {} }, { 'mcp-session-id': 's' }),
    );
  const client = new McpClient({ url: 'http://h/mcp', token: 'tok', fetchImpl });
  await client.initialize();
  const headers = fetchImpl.mock.calls[0][1].headers as Record<string, string>;
  expect(headers.Authorization).toBe('Bearer tok');
});

test('throws McpError on JSON-RPC error payload', async () => {
  const fetchImpl = jest
    .fn()
    .mockResolvedValue(
      jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'boom' } }),
    );
  const client = new McpClient({ url: 'http://h/mcp', fetchImpl });
  await expect(client.initialize()).rejects.toBeInstanceOf(McpError);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd superset-frontend && npx jest plugins/plugin-chart-echarts/src/OpenClawAIMcp/mcp/McpClient.test.ts`
Expected: FAIL — cannot find module `./McpClient`.

- [ ] **Step 3: Write minimal implementation**

Create `mcp/McpClient.ts` (include ASF header):

```ts
import { McpTool } from './toolAdapter';

export class McpError extends Error {}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

const PROTOCOL_VERSION = '2025-06-18';

export class McpClient {
  private url: string;

  private token?: string;

  private fetchImpl: typeof fetch;

  private sessionId: string | null = null;

  private nextId = 1;

  constructor(opts: { url: string; token?: string; fetchImpl?: typeof fetch }) {
    this.url = opts.url;
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    return headers;
  }

  private async rpc(
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const id = this.nextId;
    this.nextId += 1;
    const response = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    const sid = response.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;
    if (!response.ok) {
      throw new McpError(`MCP HTTP ${response.status}`);
    }
    const body = JSON.parse(await response.text()) as JsonRpcResponse;
    if (body.error) {
      throw new McpError(body.error.message);
    }
    return body.result ?? {};
  }

  async initialize(): Promise<void> {
    await this.rpc('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'openclaw-ai-mcp-chart', version: '1.0.0' },
    });
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.rpc('tools/list', {});
    return (result.tools as McpTool[]) ?? [];
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const result = await this.rpc('tools/call', { name, arguments: args });
    if (result.structuredContent !== undefined) {
      return result.structuredContent;
    }
    const content = result.content as
      | { type: string; text?: string }[]
      | undefined;
    if (content && content.length > 0 && content[0].text !== undefined) {
      return content[0].text;
    }
    return result;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd superset-frontend && npx jest plugins/plugin-chart-echarts/src/OpenClawAIMcp/mcp/McpClient.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add superset-frontend/plugins/plugin-chart-echarts/src/OpenClawAIMcp/mcp/McpClient.ts \
        superset-frontend/plugins/plugin-chart-echarts/src/OpenClawAIMcp/mcp/McpClient.test.ts
git commit -m "feat(plugin-chart-echarts): add MCP JSON-RPC client for OpenClawAIMcp"
```

---

## Task 4: OpenClawApi — chat wrapper with tools

Goal: a thin, injectable wrapper over `/v1/chat/completions` that supports the `tools` parameter and returns the first choice's message.

**Files:**
- Create: `.../OpenClawAIMcp/openclaw/OpenClawApi.ts`
- Test: `.../OpenClawAIMcp/openclaw/OpenClawApi.test.ts`

**Interfaces:**
- Consumes: `ChatMessage`, `ChatToolCall`, `OpenAITool` from `../mcp/toolAdapter`.
- Produces:
  - `interface ChatChoiceMessage { role: 'assistant'; content: string | null; tool_calls?: ChatToolCall[]; }`
  - `type CallOpenClaw = (req: { messages: ChatMessage[]; tools?: OpenAITool[]; model: string; temperature: number; }) => Promise<ChatChoiceMessage>`
  - `createOpenClawApi(opts: { baseUrl: string; apiKey: string; fetchImpl?: typeof fetch }): CallOpenClaw`
  - `class OpenClawError extends Error`

- [ ] **Step 1: Write the failing test**

Create `openclaw/OpenClawApi.test.ts` (include ASF header):

```ts
import { createOpenClawApi, OpenClawError } from './OpenClawApi';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

test('posts to /v1/chat/completions with bearer key and returns message', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(
    jsonResponse({
      choices: [{ message: { role: 'assistant', content: 'hi' } }],
    }),
  );
  const call = createOpenClawApi({
    baseUrl: 'https://oc/openclaw/',
    apiKey: 'k',
    fetchImpl,
  });
  const msg = await call({
    messages: [{ role: 'user', content: 'hello' }],
    model: 'openclaw/data-analyst',
    temperature: 1,
  });
  expect(msg.content).toBe('hi');
  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe('https://oc/openclaw/v1/chat/completions');
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
  expect(JSON.parse(init.body as string).stream).toBe(false);
});

test('passes tools and returns tool_calls', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(
    jsonResponse({
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              { id: 'c1', type: 'function', function: { name: 't', arguments: '{}' } },
            ],
          },
        },
      ],
    }),
  );
  const call = createOpenClawApi({ baseUrl: 'https://oc/', apiKey: 'k', fetchImpl });
  const msg = await call({
    messages: [],
    tools: [{ type: 'function', function: { name: 't', parameters: {} } }],
    model: 'm',
    temperature: 0,
  });
  expect(msg.tool_calls?.[0].function.name).toBe('t');
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body as string).tools).toHaveLength(1);
});

test('throws OpenClawError with server message on non-ok', async () => {
  const fetchImpl = jest
    .fn()
    .mockResolvedValue(jsonResponse({ error: { message: 'bad key' } }, false, 401));
  const call = createOpenClawApi({ baseUrl: 'https://oc/', apiKey: 'k', fetchImpl });
  await expect(
    call({ messages: [], model: 'm', temperature: 0 }),
  ).rejects.toThrow('bad key');
  await expect(
    call({ messages: [], model: 'm', temperature: 0 }),
  ).rejects.toBeInstanceOf(OpenClawError);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd superset-frontend && npx jest plugins/plugin-chart-echarts/src/OpenClawAIMcp/openclaw/OpenClawApi.test.ts`
Expected: FAIL — cannot find module `./OpenClawApi`.

- [ ] **Step 3: Write minimal implementation**

Create `openclaw/OpenClawApi.ts` (include ASF header):

```ts
import { ChatMessage, ChatToolCall, OpenAITool } from '../mcp/toolAdapter';

export class OpenClawError extends Error {}

export interface ChatChoiceMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: ChatToolCall[];
}

export type CallOpenClaw = (req: {
  messages: ChatMessage[];
  tools?: OpenAITool[];
  model: string;
  temperature: number;
}) => Promise<ChatChoiceMessage>;

interface OpenClawResponse {
  choices?: { message?: ChatChoiceMessage }[];
  error?: { message?: string };
}

export function createOpenClawApi(opts: {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): CallOpenClaw {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const endpoint = `${opts.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;

  return async req => {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        temperature: req.temperature,
        stream: false,
        ...(req.tools ? { tools: req.tools, tool_choice: 'auto' } : {}),
      }),
    });

    const body = (await response.json()) as OpenClawResponse;
    if (!response.ok) {
      throw new OpenClawError(body?.error?.message ?? `HTTP ${response.status}`);
    }
    const message = body.choices?.[0]?.message;
    if (!message) {
      throw new OpenClawError('OpenClaw returned no message');
    }
    return message;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd superset-frontend && npx jest plugins/plugin-chart-echarts/src/OpenClawAIMcp/openclaw/OpenClawApi.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add superset-frontend/plugins/plugin-chart-echarts/src/OpenClawAIMcp/openclaw/OpenClawApi.ts \
        superset-frontend/plugins/plugin-chart-echarts/src/OpenClawAIMcp/openclaw/OpenClawApi.test.ts
git commit -m "feat(plugin-chart-echarts): add OpenClaw chat API wrapper with tools for OpenClawAIMcp"
```

---

## Task 5: runChatLoop — the orchestrator

Goal: the pure loop tying OpenClaw and MCP together with a round cap. No network — all deps injected.

**Files:**
- Create: `.../OpenClawAIMcp/orchestrator/runChatLoop.ts`
- Test: `.../OpenClawAIMcp/orchestrator/runChatLoop.test.ts`

**Interfaces:**
- Consumes: `ChatMessage`, `OpenAITool`, `parseToolArguments`, `toolResultToMessage` from `../mcp/toolAdapter`; `CallOpenClaw` from `../openclaw/OpenClawApi`.
- Produces:
  - `interface RunChatLoopDeps { callOpenClaw: CallOpenClaw; listTools: () => Promise<OpenAITool[]>; callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>; model: string; temperature: number; }`
  - `interface RunChatLoopResult { answer: string; rounds: number; }`
  - `async function runChatLoop(input: { messages: ChatMessage[]; deps: RunChatLoopDeps; maxRounds?: number }): Promise<RunChatLoopResult>`
  - Exported constant `DEFAULT_MAX_ROUNDS = 5`
  - Exported constant `MAX_ROUNDS_MESSAGE` (the user-facing cap message, Russian)

- [ ] **Step 1: Write the failing test**

Create `orchestrator/runChatLoop.test.ts` (include ASF header):

```ts
import {
  runChatLoop,
  DEFAULT_MAX_ROUNDS,
  MAX_ROUNDS_MESSAGE,
  RunChatLoopDeps,
} from './runChatLoop';

function makeDeps(overrides: Partial<RunChatLoopDeps> = {}): RunChatLoopDeps {
  return {
    callOpenClaw: jest.fn(),
    listTools: jest.fn().mockResolvedValue([]),
    callTool: jest.fn(),
    model: 'm',
    temperature: 1,
    ...overrides,
  };
}

test('returns answer directly when no tool calls', async () => {
  const deps = makeDeps({
    callOpenClaw: jest
      .fn()
      .mockResolvedValue({ role: 'assistant', content: 'final', tool_calls: undefined }),
  });
  const res = await runChatLoop({ messages: [{ role: 'user', content: 'hi' }], deps });
  expect(res.answer).toBe('final');
  expect(res.rounds).toBe(1);
});

test('executes a tool call then returns the follow-up answer', async () => {
  const callOpenClaw = jest
    .fn()
    .mockResolvedValueOnce({
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'list_datasets', arguments: '{}' } },
      ],
    })
    .mockResolvedValueOnce({ role: 'assistant', content: 'done', tool_calls: undefined });
  const callTool = jest.fn().mockResolvedValue({ rows: 1 });
  const deps = makeDeps({ callOpenClaw, callTool });
  const res = await runChatLoop({ messages: [{ role: 'user', content: 'q' }], deps });
  expect(callTool).toHaveBeenCalledWith('list_datasets', {});
  expect(res.answer).toBe('done');
  expect(res.rounds).toBe(2);
});

test('stops with cap message when maxRounds exceeded', async () => {
  const callOpenClaw = jest.fn().mockResolvedValue({
    role: 'assistant',
    content: null,
    tool_calls: [
      { id: 'c', type: 'function', function: { name: 't', arguments: '{}' } },
    ],
  });
  const deps = makeDeps({ callOpenClaw, callTool: jest.fn().mockResolvedValue({}) });
  const res = await runChatLoop({ messages: [], deps, maxRounds: 2 });
  expect(res.rounds).toBe(2);
  expect(res.answer).toBe(MAX_ROUNDS_MESSAGE);
});

test('a failing tool feeds the error back as a tool message and continues', async () => {
  const callOpenClaw = jest
    .fn()
    .mockResolvedValueOnce({
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'bad', arguments: '{}' } },
      ],
    })
    .mockResolvedValueOnce({ role: 'assistant', content: 'recovered', tool_calls: undefined });
  const callTool = jest.fn().mockRejectedValue(new Error('tool blew up'));
  const deps = makeDeps({ callOpenClaw, callTool });
  const res = await runChatLoop({ messages: [], deps });
  expect(res.answer).toBe('recovered');
  // second OpenClaw call must include a tool message carrying the error text
  const secondCallMessages = (callOpenClaw.mock.calls[1][0].messages) as {
    role: string;
    content: string | null;
  }[];
  const toolMsg = secondCallMessages.find(m => m.role === 'tool');
  expect(toolMsg?.content).toContain('tool blew up');
});

test('DEFAULT_MAX_ROUNDS is 5', () => {
  expect(DEFAULT_MAX_ROUNDS).toBe(5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd superset-frontend && npx jest plugins/plugin-chart-echarts/src/OpenClawAIMcp/orchestrator/runChatLoop.test.ts`
Expected: FAIL — cannot find module `./runChatLoop`.

- [ ] **Step 3: Write minimal implementation**

Create `orchestrator/runChatLoop.ts` (include ASF header):

```ts
import {
  ChatMessage,
  OpenAITool,
  parseToolArguments,
  toolResultToMessage,
} from '../mcp/toolAdapter';
import { CallOpenClaw } from '../openclaw/OpenClawApi';

export const DEFAULT_MAX_ROUNDS = 5;
export const MAX_ROUNDS_MESSAGE =
  'Агент не уложился в лимит обращений к данным. Попробуйте переформулировать вопрос.';

export interface RunChatLoopDeps {
  callOpenClaw: CallOpenClaw;
  listTools: () => Promise<OpenAITool[]>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  model: string;
  temperature: number;
}

export interface RunChatLoopResult {
  answer: string;
  rounds: number;
}

export async function runChatLoop(input: {
  messages: ChatMessage[];
  deps: RunChatLoopDeps;
  maxRounds?: number;
}): Promise<RunChatLoopResult> {
  const { deps } = input;
  const maxRounds = input.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const tools = await deps.listTools();
  const messages: ChatMessage[] = [...input.messages];

  let rounds = 0;
  while (rounds < maxRounds) {
    rounds += 1;
    const message = await deps.callOpenClaw({
      messages,
      tools: tools.length > 0 ? tools : undefined,
      model: deps.model,
      temperature: deps.temperature,
    });

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return { answer: message.content ?? '', rounds };
    }

    messages.push({
      role: 'assistant',
      content: message.content,
      tool_calls: message.tool_calls,
    });

    // Execute each requested tool, feeding results (or errors) back.
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(
      message.tool_calls.map(async call => {
        const args = parseToolArguments(call.function.arguments);
        try {
          const result = await deps.callTool(call.function.name, args);
          messages.push(toolResultToMessage(call.id, result));
        } catch (err) {
          const text = err instanceof Error ? err.message : String(err);
          messages.push(toolResultToMessage(call.id, `ERROR: ${text}`));
        }
      }),
    );
  }

  return { answer: MAX_ROUNDS_MESSAGE, rounds };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd superset-frontend && npx jest plugins/plugin-chart-echarts/src/OpenClawAIMcp/orchestrator/runChatLoop.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add superset-frontend/plugins/plugin-chart-echarts/src/OpenClawAIMcp/orchestrator/runChatLoop.ts \
        superset-frontend/plugins/plugin-chart-echarts/src/OpenClawAIMcp/orchestrator/runChatLoop.test.ts
git commit -m "feat(plugin-chart-echarts): add OpenClaw↔MCP orchestration loop for OpenClawAIMcp"
```

---

## Task 6: Controls + transformProps for MCP settings

Goal: expose `mcp_enabled`, `mcp_url`, `mcp_token` in the chart control panel and thread them to component props.

**Files:**
- Modify: `.../OpenClawAIMcp/types.ts`
- Modify: `.../OpenClawAIMcp/controlPanel.tsx`
- Modify: `.../OpenClawAIMcp/transformProps.ts`

**Interfaces:**
- Produces (added to `OpenClawAIMcpFormData`): `mcp_enabled?: boolean; mcp_url?: string; mcp_token?: string;`
- Produces (added to `OpenClawChatComponentProps` in `transformProps.ts`): `mcpEnabled: boolean; mcpUrl: string; mcpToken: string;`

- [ ] **Step 1: Extend the FormData type and defaults**

In `OpenClawAIMcp/types.ts` add the three fields to `OpenClawAIMcpFormData` and to `DEFAULT_FORM_DATA`:

```ts
export type OpenClawAIMcpFormData = QueryFormData & {
  base_url?: string;
  api_key?: string;
  model?: OpenClawModel;
  system_prompt?: string;
  temperature?: number;
  speed_text?: number;
  mcp_enabled?: boolean;
  mcp_url?: string;
  mcp_token?: string;
};
```

Add to `DEFAULT_FORM_DATA`:

```ts
  mcp_enabled: false,
  mcp_url: 'http://localhost:5008/mcp',
  mcp_token: '',
```

- [ ] **Step 2: Add controls to the panel**

In `OpenClawAIMcp/controlPanel.tsx`, add a new section after the `Chart Options` section (inside `controlPanelSections`):

```ts
    {
      label: t('Superset MCP'),
      expanded: true,
      controlSetRows: [
        [
          {
            name: 'mcp_enabled',
            config: {
              type: 'CheckboxControl',
              label: t('Enable Superset MCP data access'),
              renderTrigger: true,
              default: false,
              description: t(
                'When enabled, the agent can call Superset MCP tools to read data.',
              ),
            },
          },
        ],
        [
          {
            name: 'mcp_url',
            config: {
              type: 'TextControl',
              label: t('MCP URL'),
              renderTrigger: true,
              default: 'http://localhost:5008/mcp',
              description: t('Full URL of the Superset MCP endpoint (…/mcp).'),
            },
          },
        ],
        [
          {
            name: 'mcp_token',
            config: {
              type: 'TextControl',
              label: t('MCP token (optional)'),
              renderTrigger: true,
              default: '',
              description: t(
                'Bearer token for the MCP server. Leave empty in dev mode.',
              ),
            },
          },
        ],
      ],
    },
```

- [ ] **Step 3: Thread fields through transformProps**

In `OpenClawAIMcp/transformProps.ts`, extend `OpenClawChatComponentProps` with:

```ts
  mcpEnabled: boolean;
  mcpUrl: string;
  mcpToken: string;
```

and in the `componentProps` object add:

```ts
    mcpEnabled: Boolean(merged.mcp_enabled),
    mcpUrl: (merged.mcp_url as string) ?? 'http://localhost:5008/mcp',
    mcpToken: (merged.mcp_token as string) ?? '',
```

- [ ] **Step 4: Type-check**

Run: `cd superset-frontend && npx tsc --noEmit -p plugins/plugin-chart-echarts/tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add superset-frontend/plugins/plugin-chart-echarts/src/OpenClawAIMcp/types.ts \
        superset-frontend/plugins/plugin-chart-echarts/src/OpenClawAIMcp/controlPanel.tsx \
        superset-frontend/plugins/plugin-chart-echarts/src/OpenClawAIMcp/transformProps.ts
git commit -m "feat(plugin-chart-echarts): add MCP settings controls to OpenClawAIMcp"
```

---

## Task 7: Wire the UI to the orchestrator

Goal: `OpenClawChat.tsx` builds deps from props and calls `runChatLoop` when MCP is enabled; otherwise keeps the original plain-chat path. Keep the existing fake-stream and error UI.

**Files:**
- Modify: `.../OpenClawAIMcp/OpenClawChat.tsx`

**Interfaces:**
- Consumes: `runChatLoop`, `RunChatLoopDeps` from `./orchestrator/runChatLoop`; `McpClient` from `./mcp/McpClient`; `mcpToolsToOpenAI` from `./mcp/toolAdapter`; `createOpenClawApi` from `./openclaw/OpenClawApi`; component props incl. `mcpEnabled`, `mcpUrl`, `mcpToken`.

- [ ] **Step 1: Add MCP props to the component signature**

In `OpenClawChat.tsx`, destructure the new props alongside the existing ones:

```ts
  const {
    width,
    height,
    baseUrl,
    model,
    systemPrompt,
    temperature,
    speedText,
    mcpEnabled,
    mcpUrl,
    mcpToken,
    // @ts-ignore
    formData,
  } = props;
```

- [ ] **Step 2: Add the imports**

At the top of `OpenClawChat.tsx`:

```ts
import { runChatLoop } from './orchestrator/runChatLoop';
import { McpClient } from './mcp/McpClient';
import { mcpToolsToOpenAI } from './mcp/toolAdapter';
import { createOpenClawApi } from './openclaw/OpenClawApi';
```

- [ ] **Step 3: Replace the body of `sendMessage` with an MCP-aware path**

Keep the existing `userMessage`/`history` construction and `setIsLoading(true)`. Replace the network block (the `fetch(endpoint, …)` try/catch) with:

```ts
    try {
      let answer: string;

      if (mcpEnabled) {
        const callOpenClaw = createOpenClawApi({ baseUrl, apiKey });
        const mcpClient = new McpClient({
          url: mcpUrl,
          token: mcpToken || undefined,
        });
        await mcpClient.initialize();

        const deps = {
          callOpenClaw,
          listTools: async () =>
            mcpToolsToOpenAI(await mcpClient.listTools()),
          callTool: (name: string, args: Record<string, unknown>) =>
            mcpClient.callTool(name, args),
          model,
          temperature,
        };

        const result = await runChatLoop({ messages: history, deps });
        answer = result.answer;
      } else {
        const callOpenClaw = createOpenClawApi({ baseUrl, apiKey });
        const message = await callOpenClaw({
          messages: history,
          model,
          temperature,
        });
        answer = message.content ?? '';
      }

      streamAnswer(answer);
    } catch (err) {
      const detail =
        err instanceof Error
          ? err.message
          : 'Не удалось подключиться к данным Superset (MCP). Проверьте настройки.';
      setMessages(prev => [
        ...prev,
        {
          id: `${Date.now()}-e`,
          role: 'assistant',
          content: detail,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
```

Note: `history` already includes the system prompt and prior turns; `apiKey` comes from `formData` as in the original. The `endpoint` constant and the old inline `fetch` are removed (now inside `OpenClawApi`).

- [ ] **Step 4: Update the loading indicator text while MCP runs**

Where the component renders the loading spinner (`<Spin tip="Думаю над ответом..." />`), change the tip to reflect MCP work when enabled:

```tsx
          <Spin tip={mcpEnabled ? 'Выполняю запрос к данным…' : 'Думаю над ответом...'} />
```

- [ ] **Step 5: Type-check and lint**

Run: `cd superset-frontend && npx tsc --noEmit -p plugins/plugin-chart-echarts/tsconfig.json`
Expected: no errors.

Run: `cd superset-frontend && npx eslint plugins/plugin-chart-echarts/src/OpenClawAIMcp/OpenClawChat.tsx`
Expected: no errors.

- [ ] **Step 6: Run the full plugin test suite**

Run: `cd superset-frontend && npx jest plugins/plugin-chart-echarts/src/OpenClawAIMcp`
Expected: PASS (toolAdapter, McpClient, OpenClawApi, runChatLoop suites).

- [ ] **Step 7: Commit**

```bash
git add superset-frontend/plugins/plugin-chart-echarts/src/OpenClawAIMcp/OpenClawChat.tsx
git commit -m "feat(plugin-chart-echarts): wire OpenClawAIMcp UI to the MCP orchestration loop"
```

---

## Task 8: Server-side CORS + CSP + dev flags

Goal: make the MCP server reachable from the browser (variant B). Add CORS to the MCP Starlette middleware, allow the MCP origin in CSP, and document the dev-contour flags.

**Files:**
- Modify: `superset/mcp_service/server.py` (`_build_starlette_middleware`, ~lines 727-771)
- Modify: `superset/config.py` (CSP `connect-src` in both `TALISMAN_CONFIG` ~line 2234 and `TALISMAN_DEV_CONFIG` ~line 2282)
- Modify: `docs/admin_docs/configuration/mcp-server.mdx` (add a short "Browser-based clients (dev)" note)

**Interfaces:**
- Produces: a new config key `MCP_CORS_ALLOWED_ORIGINS` (list of origins) read inside `_build_starlette_middleware`, default `["*"]` for the dev contour.

- [ ] **Step 1: Add the CORS middleware to the MCP server**

In `superset/mcp_service/server.py`, inside `_build_starlette_middleware`, change the imports and the returned list. Replace the existing `return [...]` block (lines 765-771) with:

```python
    from starlette.middleware.cors import CORSMiddleware

    allowed_origins = flask_app.config.get("MCP_CORS_ALLOWED_ORIGINS", ["*"])

    return [
        StarletteMiddleware(
            CORSMiddleware,
            allow_origins=allowed_origins,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=[
                "Authorization",
                "Content-Type",
                "Mcp-Session-Id",
            ],
            expose_headers=["Mcp-Session-Id"],
        ),
        StarletteMiddleware(
            BrowserHelloMiddleware,
            auth_enabled=auth_enabled,
            page_config=page_config,
        ),
    ]
```

(CORS middleware is listed first so it wraps the preflight before the hello-page middleware.)

- [ ] **Step 2: Document the default in mcp_config.py**

In `superset/mcp_service/mcp_config.py`, add (near the other MCP defaults) so the key has a documented default:

```python
# Origins allowed to call the MCP server from a browser (CORS). Variant for
# browser-based MCP clients. Use specific origins in production; "*" only for
# trusted dev contours.
MCP_CORS_ALLOWED_ORIGINS = ["*"]
```

- [ ] **Step 3: Add the MCP origin to CSP `connect-src` (both blocks)**

In `superset/config.py`, in the `TALISMAN_CONFIG` `connect-src` list (after `"https://openclaw.techpeople.ru",` at line 2234) add:

```python
            "http://localhost:5008",
```

Add the identical line in the `TALISMAN_DEV_CONFIG` `connect-src` list (after line 2282).

- [ ] **Step 4: Document the dev-contour flags**

In `docs/admin_docs/configuration/mcp-server.mdx`, under "Development Mode (No Auth)", append a short note:

```markdown
#### Browser-based clients (dev contour)

To call the MCP server directly from a browser (e.g., an in-app chart), enable CORS and allow the Superset origin:

\`\`\`python
# superset_config.py
MCP_AUTH_ENABLED = False
MCP_DEV_USERNAME = "admin"
MCP_TOOL_SEARCH_CONFIG = {"enabled": False}
MCP_RBAC_ENABLED = False
MCP_CORS_ALLOWED_ORIGINS = ["http://localhost:8088"]  # your Superset origin
\`\`\`

Also add the MCP origin (e.g. \`http://localhost:5008\`) to Superset's CSP \`connect-src\`.
```

- [ ] **Step 5: Run pre-commit on the changed Python/docs files**

```bash
git add superset/mcp_service/server.py superset/mcp_service/mcp_config.py \
        superset/config.py docs/admin_docs/configuration/mcp-server.mdx
pre-commit run --files superset/mcp_service/server.py superset/mcp_service/mcp_config.py superset/config.py docs/admin_docs/configuration/mcp-server.mdx
```

Expected: hooks pass (or auto-fix; if auto-fixed, `git add` again and re-run).

- [ ] **Step 6: Sanity-check the CORS preflight (manual, requires a running MCP server)**

Start the MCP server in another terminal:

```bash
superset mcp run --host 127.0.0.1 --port 5008
```

Then:

```bash
curl -i -X OPTIONS http://localhost:5008/mcp \
  -H 'Origin: http://localhost:8088' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,mcp-session-id'
```

Expected: `200`/`204` with `access-control-allow-origin` reflecting the origin and `access-control-allow-headers` including `mcp-session-id`.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(mcp): enable CORS for browser MCP clients and allow origin in CSP"
```

---

## Task 9: Manual end-to-end verification

Goal: confirm the chart actually reaches Superset data through MCP on the dev contour. No code; a documented runbook + a verification note.

**Files:**
- Create: `docs/superpowers/plans/2026-06-22-openclaw-mcp-chart-verification.md` (capture results)

- [ ] **Step 1: Configure the dev contour**

In `superset_config.py` ensure:

```python
MCP_AUTH_ENABLED = False
MCP_DEV_USERNAME = "admin"
MCP_TOOL_SEARCH_CONFIG = {"enabled": False}
MCP_RBAC_ENABLED = False
MCP_CORS_ALLOWED_ORIGINS = ["http://localhost:8088"]
```

- [ ] **Step 2: Build the frontend and start both servers**

```bash
cd superset-frontend && npm run build   # or `npm run dev` on :9000
superset run -h 0.0.0.0 -p 8088
superset mcp run --host 127.0.0.1 --port 5008
```

- [ ] **Step 3: Create the chart**

In Superset, create a new chart, pick "OpenClaw AI Chart (MCP)", set Base URL + API Key, toggle "Enable Superset MCP data access", set MCP URL to `http://localhost:5008/mcp`, save to a dashboard.

- [ ] **Step 4: Exercise it**

Ask the agent a data question (e.g. "Сколько у нас датасетов?" or "Покажи список датасетов"). In browser DevTools → Network, confirm:
- POST to `…/v1/chat/completions` containing a `tools` array
- POST(s) to `http://localhost:5008/mcp` (initialize + tools/list + tools/call)
- a final assistant answer rendered in the chat

- [ ] **Step 5: Record results**

Write outcomes (success/failure, screenshots or Network excerpts) into the verification doc. If something fails, capture the exact error and stop for triage (use systematic-debugging).

- [ ] **Step 6: Commit the verification note**

```bash
git add docs/superpowers/plans/2026-06-22-openclaw-mcp-chart-verification.md
git commit -m "docs: record OpenClawAIMcp MCP end-to-end verification"
```

---

## Self-Review

**Spec coverage:**
- Copy plugin, no original change → Task 1 ✓
- File structure (mcp/, openclaw/, orchestrator/) → Tasks 2-5 ✓
- Module contracts (McpClient, OpenClawApi, toolAdapter, runChatLoop) → Tasks 2-5 ✓ (signatures match across tasks)
- Controls mcp_enabled/mcp_url/mcp_token → Task 6 ✓
- UI thin, fake-stream, indicator, mcp_enabled bypass → Task 7 ✓
- Server CORS + CSP + dev flags + Tool Search off → Task 8 ✓
- Error handling (MCP unreachable, tool error, round cap, no message, disabled) → Tasks 4,5,7 ✓
- Tests (toolAdapter, McpClient, runChatLoop) + OpenClawApi tests → Tasks 2-5 ✓
- Round cap default 5 → Task 5 ✓
- Optional Bearer token slot → Tasks 3,6,7 ✓
- Registration points → Task 1 ✓

**Placeholder scan:** No TBD/TODO; all code steps contain full code; error handling is concrete (specific messages, not "handle errors").

**Type consistency:** `ChatMessage`/`ChatToolCall`/`OpenAITool`/`McpTool` defined in Task 2 and reused verbatim in Tasks 3-5; `CallOpenClaw` defined in Task 4 and consumed in Task 5; `RunChatLoopDeps` fields (`callOpenClaw`, `listTools`, `callTool`, `model`, `temperature`) consistent between Task 5 definition and Task 7 construction; control names (`mcp_enabled`/`mcp_url`/`mcp_token`) consistent between Task 6 and Task 7 props (`mcpEnabled`/`mcpUrl`/`mcpToken`).

Notes:
- `npx tsc -p plugins/plugin-chart-echarts/tsconfig.json` path assumes that tsconfig exists; if the package uses a different build/type-check command, substitute the repo's standard (`npm run type` from the package dir). Verify at execution time.
- Task 8 Step 1 assumes `CORSMiddleware` from Starlette is available (it ships with Starlette, a FastMCP dependency). Confirm import resolves when the MCP server starts.
