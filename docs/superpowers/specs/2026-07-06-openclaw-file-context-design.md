# OpenClaw chat: attach a text file (e.g. spec) into the model context

## Goal

Let a user attach a single text file (`.txt` / `.md`) — for example a
requirements document ("ТЗ") — to the OpenClaw AI chat so that its content is
included in the context sent to the model. The file is **not stored anywhere**:
its content lives only in React state and is inlined into every request while
attached.

This applies to the `OpenClawAI` chart plugin (chart name "OpenClaw AI Chart"),
file `superset-frontend/plugins/plugin-chart-echarts/src/OpenClawAI/OpenClawChat.tsx`
— the plugin that actually renders on the page. (Not `OpenClawAIMcp`.)

## Requirements (confirmed)

- **One file at a time.** Attaching a new file replaces the previous one.
- **Formats:** `.txt` and `.md` only. Non-text files are rejected with a warning
  and not attached.
- **No persistence:** content is read in the browser via `File.text()` and kept
  in component state only. No upload, no file-storage service.
- **Attached to the whole conversation:** while a file is attached, its content
  is included in **every** request to the model (not just the next message),
  until the user detaches it or clears the chat.
- **No size limit:** the user is responsible for size. If the context overflows,
  the existing API error handling in `sendMessage` surfaces the error.
- **Detachable:** the user can remove the attached file at any time.

## Data flow

1. A paperclip button next to the input triggers a hidden
   `<input type="file" accept=".txt,.md,text/plain,text/markdown">`.
2. On file selection:
   - Validate: if the name does not end in `.txt`/`.md` (and MIME is not a text
     type), show a warning ("Поддерживаются только файлы .txt и .md") and do not
     attach.
   - Otherwise read content with `await file.text()` and store
     `attachedFile = { name, content }` in state.
3. A chip below the chat header shows the attached file name with an ✕ button to
   detach (`setAttachedFile(null)`).
4. In `sendMessage`, when building `history`, if a file is attached, insert an
   extra system message right after the base `systemPrompt`:

   ```ts
   {
     role: 'system',
     content:
       `Пользователь прикрепил файл "${attachedFile.name}". ` +
       `Используй его содержимое как контекст:\n\n${attachedFile.content}`,
   }
   ```

   This guarantees the file content is sent on every request while attached.
5. `handleClearChat` also resets `attachedFile` to `null`.

## State

New state in the component:

```ts
const [attachedFile, setAttachedFile] =
  useState<{ name: string; content: string } | null>(null);
```

Plus a `useRef` for the hidden `<input>` element (to trigger it from the
paperclip button and to reset its `value` after selection so re-selecting the
same file fires `onChange`).

## UI

- Paperclip button (`PaperClipOutlined` from `@ant-design/icons`) in the input
  row, left of the send button. Disabled while loading/streaming.
- Attachment chip (antd `Tag` with a close icon, or a small styled row) showing
  the file name; visible only when a file is attached.
- Warning for rejected files: antd `message.warning(...)` (or `App.useApp`
  message), non-blocking toast.

## Out of scope (YAGNI)

- No server upload / file-storage integration.
- No PDF / DOCX / binary parsing.
- No multiple files.
- No explicit size limit.
- No persistence across page reloads.

## Edge cases

- **Empty file:** chip shows the name, content is empty; an empty context block
  is sent — harmless.
- **Non-text file selected:** rejected with a warning, nothing attached.
- **Same file re-selected after detach:** reset the input's `value` on change so
  the browser fires `onChange` again for an identical path.
- **Context overflow from a huge file:** not prevented; the existing error
  branch in `sendMessage` shows the API error.

## Affected code

- Only `OpenClawAI/OpenClawChat.tsx`:
  - new state + input ref
  - `handleFileSelect` reader/validator
  - `handleDetachFile`
  - paperclip button + hidden input + attachment chip in JSX
  - one extra system message in the `history` array in `sendMessage`
  - reset `attachedFile` in `handleClearChat`
