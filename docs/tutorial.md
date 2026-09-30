# Tutorial: your first document

This tutorial takes about ten minutes. You will write a small project note, format it in
**Visual mode (WYSIWYG)**, look at the source in **Markdown mode (source)**, make the
editor look the way you like and export the result as a PDF.

You need MarkDown++ installed — see [installation](installation.md). Shortcuts are shown
as _macOS / Windows and Linux_.

## 1. Create a document

1. Start MarkDown++. The welcome screen offers **New document**, **Open file…**, **Open
   the tutorial** (an interactive tour document) and your recent files.
2. Click **New document** or press `⌘N` / `Ctrl+N`. A new, empty tab appears.
3. Press `⌘S` / `Ctrl+S`, pick a folder and save the file as `project-notes.md`.

Saving early is a good habit: relative image paths are resolved against the document's
folder, and autosave (if you enable it) only works for saved documents.

## 2. Write with Markdown shortcuts

Make sure the mode switch in the title bar shows **Visual**. Type the following, pressing
`Enter` at the end of each line:

1. `# Project Apollo` followed by a space — the text becomes a large heading as soon as
   you type the space after `#`.
2. `A short note about **what we are building** and *why*.` — bold and italic appear as
   soon as you close the markers.
3. `## Goals` — a second-level heading.
4. `- ` (dash, space) starts a bulleted list. Type three goals, then press `Enter` twice
   to leave the list.

You just wrote Markdown without ever seeing a `#` or `**` stay on screen.

## 3. Use the slash menu

1. On a new, empty line type `/`. The **slash menu** opens.
2. Type `task` and press `Enter` to choose **Task List**. A task list appears.
3. Add two tasks: `Write the proposal` and `Book the meeting room`.
4. Click the checkbox of the first task to tick it off.

Now insert a table:

1. On an empty line type `/table` and press `Enter`.
2. Fill in the header row with `Milestone` and `Date`, press `Tab` to move between cells,
   and add a row with `Kick-off` and `2026-10-01`.
3. Use the handle above a column to add another column or change its alignment.

## 4. Add code and math

1. On an empty line, type ` ``` ` (three backticks) and press `Enter`. A code block appears.
2. Choose **TypeScript** in the language picker at the top of the block and type:

   ```ts
   const launch = (date: Date): string => `Launch on ${date.toDateString()}`;
   ```

3. Below the code block, on an empty line, type `/math` and press `Enter`. Enter
   `E = mc^2` — the formula is rendered with KaTeX. (Inline math works too: type
   `$a^2 + b^2 = c^2$` inside a paragraph.)

## 5. Rearrange blocks

Hover over the **Goals** heading. A handle appears to its left. Drag it below the table:
the heading moves, and nothing else changes.

## 6. Switch to Markdown mode

Press `⌘E` / `Ctrl+E` or click **Markdown** in the mode switch. You now see the Markdown
source of the same document. This excerpt shows how it starts:

<!-- prettier-ignore -->
```markdown
# Project Apollo

A short note about **what we are building** and *why*.
```

Further down follow your goals list, the task list (`- [x] Write the proposal`,
`- [ ] Book the meeting room`), the table, the code block, the math block and the
**Goals** heading you moved below the table.

Edit something here, for example change `Apollo` to `Artemis`, and press `⌘E` /
`Ctrl+E` again. Your change is there in Visual mode too — both modes edit the same
Markdown text.

> [!NOTE]
> Visual mode writes Markdown in one consistent style: emphasis written as `_why_` and
> strong text written as `__bold__` (for example in a file from another editor) are saved
> as `*why*` and `**bold**` once you edit the document in Visual mode. The content is
> identical; see
> [how switching preserves your content](user-guide.md#how-switching-preserves-your-content).

## 7. Find and replace

1. Press `⌘⌥F` / `Ctrl+H` (**Edit → Replace…**). On macOS `⌘H` hides the app, so Find
   and Replace uses `⌘⌥F` there.
2. Search for `meeting` and replace it with `workshop`.
3. Click **Replace all**, then press `Esc`.

## 8. Navigate with the outline and the command palette

- Press `⌘⇧O` / `Ctrl+Shift+O` to show the **outline** and click a heading to jump to it.
- Press `⌘⇧P` / `Ctrl+Shift+P` to open the **command palette**, type `focus` and press
  `Enter` to enter **focus mode**. Press `⌘⇧F` / `Ctrl+Shift+F` to leave it again.

## 9. Make it yours

1. Press `⌘,` / `Ctrl+,` to open **Settings**.
2. Under **Appearance**, pick a colour scheme such as _Nord_ or _Catppuccin Latte_, or keep
   _Follow system_ on and choose one light and one dark theme. A scheme for the other
   appearance is stored for later; the notice above the gallery offers **Use it now** if
   you want to see it right away.
3. Under **Code Blocks**, pick a theme you know from your IDE — _IntelliJ Darcula_,
   _VS Code Dark Modern_, _Monokai_, _Notepad++_ …
4. Under **Markdown Elements**, try _Academic_ or _Typewriter_ and watch headings, quotes,
   tables and code blocks change.
5. Want more control? Duplicate any preset and adjust every colour and property. See the
   [theming guide](theming.md).

## 10. Export

Press `⌘⇧E` / `Ctrl+Shift+E` (**File → Export as PDF…**), choose a location and open the
PDF: it looks exactly like your editor. **File → Export as HTML…** creates a single,
self-contained web page instead.

## Where to go next

- The [user guide](user-guide.md) covers every feature and setting.
- The [keyboard shortcuts](keyboard-shortcuts.md) page lists all shortcuts.
- The [theming guide](theming.md) explains how to create and share your own themes.
