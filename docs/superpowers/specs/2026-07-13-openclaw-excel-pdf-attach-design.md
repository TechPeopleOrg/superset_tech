# OpenClaw chat: Excel & PDF attachments — design

**Date:** 2026-07-13
**Area:** `superset-frontend/plugins/plugin-chart-echarts/src/OpenClawAI` (base chat, not the MCP variant)

## Goal

Extend file attachments in the OpenClaw chat from `.txt`/`.md` to also accept
**Excel** (`.xlsx`, `.xls`) and **PDF**. Both are binary, so they are parsed to
plain text on the client and injected into the system prompt as context — the
same mechanism already used for txt/md.

## Current state

In `OpenClawChat.tsx`:
- `handleFileSelect` validates the file is txt/md, then reads it via `file.text()`
  and stores `{ name, content }` in `attachedFile`.
- On send, an attached file becomes a `system` message: `Пользователь прикрепил
  файл "<name>". Используй его содержимое как контекст:\n\n<content>`.
- The `accept` attribute and tooltip advertise `.txt, .md`.
- No size limits.

## Design

### New module: `fileParsers.ts`

All parsing moves out of the component into one module with a single public
function:

```ts
parseAttachment(file: File): Promise<{ name: string; content: string }>
```

It dispatches by file type:
- **txt / md** → `file.text()` (unchanged behavior)
- **xlsx / xls** → `XLSX.read()` (SheetJS, already a project dependency), then
  `XLSX.utils.sheet_to_csv` per sheet, each prefixed with `### Лист: <name>`
- **pdf** → `pdfjs-dist`, **lazy-loaded** via `await import()` so it never enters
  the main bundle; extract text per page, each prefixed with `[Стр. N]`

Unknown types throw an error the component surfaces as a warning.

### Limits (in `fileParsers.ts`, exported constants)

1. **File size** — `MAX_FILE_BYTES = 10 * 1024 * 1024` (10 MB). Files larger are
   rejected before parsing; the component shows a warning.
2. **Text size** — `MAX_CHARS = 100_000`. After parsing, longer output is
   truncated and marked with `\n\n[...текст обрезан, файл слишком большой]`.

### Component changes (`OpenClawChat.tsx`)

- `handleFileSelect` delegates to `parseAttachment`, catches errors → warning.
- `accept` attribute: `.txt,.md,.xlsx,.xls,.pdf` plus their MIME types.
- Tooltip text updated to list the new formats.
- Size check either in the component (before calling parse) or inside
  `parseAttachment` — chosen: inside `parseAttachment`, so the limit lives with
  the parsing logic and is covered by its tests.

### Dependency

Add `pdfjs-dist` to `superset-frontend/package.json`. `xlsx` is already present.
pdf.js needs a worker; use the bundled worker entry compatible with the project's
webpack setup (verified during implementation).

## Testing

`fileParsers.test.ts` covers:
- txt and md read through unchanged
- xlsx parsed to per-sheet CSV with the `### Лист:` header
- oversized file rejected
- oversized text truncated with the marker

PDF parsing is exercised behind the lazy import; if mocking pdf.js in jsdom is
impractical, that path is verified manually in the running app and the unit tests
focus on the dispatch + limit logic.

## Out of scope

- Server-side parsing (kept fully client-side).
- Multiple files at once (still one attachment, as today).
- Images / vision, docx, other formats.
