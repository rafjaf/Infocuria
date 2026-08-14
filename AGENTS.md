# Better Infocuria agent guide

## Browser testing

- Test the extension in the user's existing Chrome profile with Chrome DevTools MCP. Better Infocuria is already installed there.
- Prefer the Chrome DevTools MCP tools (`list_pages`, `select_page`, `new_page`, `take_snapshot`, `click`, `wait_for`, `evaluate_script`, `list_console_messages`, and `take_screenshot`) over launching a separate managed browser.
- Do not infer that the extension is absent from `globalThis.BetterInfocuria` in `evaluate_script`: Chrome content scripts run in an isolated JavaScript world. Verify the page DOM instead, especially `#infocuria-helper`.
- The helper is only created after a judgment is selected and `#panel-document-preview` is visible. On a search-results page, click the judgment result before waiting for `Better Infocuria`.
- Preserve the user's unrelated tabs and browser state. Do not close tabs, inspect credentials, or expose cookies.

## Chrome DevTools MCP connection

- Start with `list_pages`. If the Infocuria page is not open, create it with `new_page`; otherwise select the existing page.
- The working local setup uses the official `chrome-devtools-mcp` server with Chrome's auto-connect mechanism. Chrome must have remote debugging enabled at `chrome://inspect/#remote-debugging`.
- Auto-connect discovers Chrome from:

```text
~/Library/Application Support/Google/Chrome/DevToolsActivePort
```

  The file contains the port on the first line (currently 9222) and the browser WebSocket path on the second.
- Prefer `--autoConnect` for this profile. A request to `http://127.0.0.1:9222/json/*` may return 404 even while the `DevToolsActivePort` WebSocket endpoint works.
- If MCP reports `Could not find DevToolsActivePort`, check whether the file exists before changing browser setup. The server wraps file-read and WebSocket-connect failures in the same message. If the file is present, the likely problem is sandbox denial of the localhost WebSocket; rerun the MCP client with the required localhost/host permission.
- If Chrome DevTools MCP tools are not in the current tool inventory, say so early. Adding or configuring an MCP server does not make its tools appear inside an already-running agent session; a new session may be required.

## Local verification

There is no package-level test runner. After changing JavaScript, run syntax and whitespace checks:

```sh
for source_file in index.js src/*.js popup.js; do node --check "$source_file" || exit 1; done
git diff --check
```

Keep unrelated worktree changes intact.
