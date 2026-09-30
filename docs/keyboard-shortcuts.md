# Keyboard shortcuts

Every shortcut in MarkDown++ is defined once, in
[`src/shared/shortcuts.ts`](../src/shared/shortcuts.ts). The main process handles every
key press of a window before the page sees it (`before-input-event`,
[`src/main/keyboard.ts`](../src/main/keyboard.ts)): a key that matches a shortcut runs
its command exactly once, so the editors' own key bindings never handle it a second time.
Holding a key repeats only Undo, Redo, zoom and tab switching. The native application menu shows the same keys as accelerators, and so do
the command palette, the toolbar tooltips and **Help → Keyboard Shortcuts** (`⌘/` on
macOS, `Ctrl+/` on Windows and Linux), so this page, the menu and the app always agree on
the keys. Standard system shortcuts (copy, paste, select all, quit, hide, minimise, …)
stay with the operating system's menu roles. The action names
below are the command palette's; the native menu may use a shorter label (for example
**File → New** for _New Document_).

Shortcuts work in both **Visual mode (WYSIWYG)** and **Markdown mode (source)** unless
noted otherwise. On macOS, `⌘` is Command, `⌥` is Option, `⇧` is Shift and `⌃` is
Control.

A few shortcuts differ per platform because macOS reserves the key for a standard menu
role or system shortcut. These overrides live in `MAC_SHORTCUT_OVERRIDES` in the same
file: **Find and Replace** is `⌘⌥F` on macOS, because `⌘H` hides the app there
(**MarkDown++ → Hide MarkDown++**), and **Inline Code** is `` ⌃` `` on macOS, because
`` ⌘` `` switches between the app's windows there.

> [!TIP]
> You never have to remember a shortcut: open the **command palette** with `⌘⇧P` /
> `Ctrl+Shift+P`, type a few letters of any command and press `Enter`.

## File

| Action         | macOS | Windows / Linux | Command id       |
| -------------- | ----- | --------------- | ---------------- |
| New Document   | `⌘N`  | `Ctrl+N`        | `file.new`       |
| Open…          | `⌘O`  | `Ctrl+O`        | `file.open`      |
| Save           | `⌘S`  | `Ctrl+S`        | `file.save`      |
| Save As…       | `⌘⇧S` | `Ctrl+Shift+S`  | `file.saveAs`    |
| Save All       | `⌘⌥S` | `Ctrl+Alt+S`    | `file.saveAll`   |
| Close Tab      | `⌘W`  | `Ctrl+W`        | `file.close`     |
| Export as PDF… | `⌘⇧E` | `Ctrl+Shift+E`  | `file.exportPdf` |

## Edit

| Action           | macOS | Windows / Linux | Command id     |
| ---------------- | ----- | --------------- | -------------- |
| Undo             | `⌘Z`  | `Ctrl+Z`        | `edit.undo`    |
| Redo             | `⌘⇧Z` | `Ctrl+Shift+Z`  | `edit.redo`    |
| Find             | `⌘F`  | `Ctrl+F`        | `edit.find`    |
| Find and Replace | `⌘⌥F` | `Ctrl+H`        | `edit.replace` |

## View

| Action                        | macOS   | Windows / Linux  | Command id             |
| ----------------------------- | ------- | ---------------- | ---------------------- |
| Toggle Visual / Markdown Mode | `⌘E`    | `Ctrl+E`         | `view.toggleMode`      |
| Command Palette               | `⌘⇧P`   | `Ctrl+Shift+P`   | `view.commandPalette`  |
| Zoom In                       | `⌘=`    | `Ctrl+=`         | `view.zoomIn`          |
| Zoom Out                      | `⌘-`    | `Ctrl+-`         | `view.zoomOut`         |
| Reset Zoom                    | `⌘0`    | `Ctrl+0`         | `view.zoomReset`       |
| Toggle Focus Mode             | `⌘⇧F`   | `Ctrl+Shift+F`   | `view.toggleFocusMode` |
| Toggle Outline                | `⌘⇧O`   | `Ctrl+Shift+O`   | `view.toggleOutline`   |
| Next Tab                      | `⌃Tab`  | `Ctrl+Tab`       | `view.nextTab`         |
| Previous Tab                  | `⌃⇧Tab` | `Ctrl+Shift+Tab` | `view.previousTab`     |

## Format

| Action        | macOS    | Windows / Linux | Command id             |
| ------------- | -------- | --------------- | ---------------------- |
| Bold          | `⌘B`     | `Ctrl+B`        | `format.bold`          |
| Italic        | `⌘I`     | `Ctrl+I`        | `format.italic`        |
| Strikethrough | `⌘⇧X`    | `Ctrl+Shift+X`  | `format.strikethrough` |
| Inline Code   | `` ⌃` `` | `` Ctrl+` ``    | `format.inlineCode`    |
| Link          | `⌘K`     | `Ctrl+K`        | `format.link`          |
| Heading 1     | `⌘1`     | `Ctrl+1`        | `format.heading1`      |
| Heading 2     | `⌘2`     | `Ctrl+2`        | `format.heading2`      |
| Heading 3     | `⌘3`     | `Ctrl+3`        | `format.heading3`      |
| Paragraph     | `⌘⌥0`    | `Ctrl+Alt+0`    | `format.paragraph`     |
| Bulleted List | `⌘⇧8`    | `Ctrl+Shift+8`  | `format.bulletList`    |
| Numbered List | `⌘⇧7`    | `Ctrl+Shift+7`  | `format.orderedList`   |
| Task List     | `⌘⇧9`    | `Ctrl+Shift+9`  | `format.taskList`      |
| Quote         | `⌘⇧B`    | `Ctrl+Shift+B`  | `format.blockquote`    |
| Code Block    | `⌘⌥C`    | `Ctrl+Alt+C`    | `format.codeBlock`     |
| Table         | `⌘⌥T`    | `Ctrl+Alt+T`    | `format.table`         |

## Settings

| Action        | macOS | Windows / Linux | Command id      |
| ------------- | ----- | --------------- | --------------- |
| Open Settings | `⌘,`  | `Ctrl+,`        | `settings.open` |

## Help

| Action             | macOS | Windows / Linux | Command id       |
| ------------------ | ----- | --------------- | ---------------- |
| Keyboard Shortcuts | `⌘/`  | `Ctrl+/`        | `help.shortcuts` |

## Editor shortcuts without a menu entry

These shortcuts are handled by the editors themselves.

| Action                                       | macOS              | Windows / Linux         | Mode   |
| -------------------------------------------- | ------------------ | ----------------------- | ------ |
| Open the slash menu (on an empty line)       | `/`                | `/`                     | Visual |
| Next / previous search match (find bar open) | `Enter` / `⇧Enter` | `Enter` / `Shift+Enter` | Both   |
| Close the find bar, palette or dialog        | `Esc`              | `Esc`                   | Both   |
| Indent / outdent list item                   | `Tab` / `⇧Tab`     | `Tab` / `Shift+Tab`     | Both   |
| Select all                                   | `⌘A`               | `Ctrl+A`                | Both   |

## Changing the list

Shortcuts are part of the shared contract. To add or change one, edit
`src/shared/shortcuts.ts` (`SHORTCUTS`, plus `MAC_SHORTCUT_OVERRIDES` when the key
collides with a macOS menu role such as `⌘H`, `⌘M` or `⌘Q`), update this page (it mirrors
that file 1:1) and follow
[How to add a command](../AGENTS.md#how-to-add-a-command) in `AGENTS.md`.
