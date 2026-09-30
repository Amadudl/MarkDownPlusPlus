# Welcome to MarkDown++

MarkDown++ is a fast, distraction-free Markdown editor. You write in a **visual editor** that looks like the finished document, and you can flip to the **raw Markdown** at any time — nothing is ever lost in between.

> This document is a playground. Edit anything you like: it is not saved unless you press **Save**.

## The mode switch

At the top right of the window you find the switch between **Visual** and **Markdown**.

- **Visual** — edit formatted text directly, like in a word processor.
- **Markdown** — edit the plain source with syntax highlighting.
- Press `Ctrl+E` (`⌘E` on macOS) to toggle between both views.

Both views edit the same document. Switch as often as you like — your cursor position is the only thing that stays behind.

## Writing in the visual editor

### The slash menu

Type `/` at the start of an empty line to open the **slash menu**. Keep typing to filter — `/table`, `/code`, `/quote`, `/task` — and press `Enter` to insert the block.

### Drag handle

Hover over a block and a small **handle** appears on the left. Drag it to move the block, or click the **+** next to it to insert a new block below with the slash menu. (Content inside tables and quotes has no handle of its own — move the whole table or quote instead.)

### Markdown shortcuts

You can type Markdown and it turns into formatting as you go:

| You type         | You get         |
| ---------------- | --------------- |
| `# ` … `###### ` | Headings 1 – 6  |
| `**bold**`       | **bold**        |
| `*italic*`       | _italic_        |
| `~~strike~~`     | ~~strike~~      |
| `` `code` ``     | `code`          |
| `- ` or `* `     | Bulleted list   |
| `1. `            | Numbered list   |
| `- [ ] `         | Task list       |
| `> `             | Quote           |
| ` ``` `          | Code block      |
| `---`            | Horizontal rule |

### The toolbar

The formatting toolbar below the tabs works in **both** modes: bold, italic, strikethrough, inline code, links, headings, lists, task lists, quotes, code blocks, tables and horizontal rules. Hover a button to see its shortcut. Hide it with the toolbar button in the top-right corner (next to the search icon) if you prefer a cleaner window.

## Task lists

- [x] Open MarkDown++
- [x] Read the introduction
- [ ] Try the slash menu with `/`
- [ ] Switch to the Markdown view and back
- [ ] Pick a colour scheme you love

Click a checkbox to tick it off.

## Tables

| Feature             | Visual | Markdown |
| ------------------- | :----: | :------: |
| Live formatting     |   ✓    |    —     |
| Syntax highlighting |   ✓    |    ✓     |
| Find & replace      |   ✓    |    ✓     |
| Tables & task lists |   ✓    |    ✓     |

In the visual editor, click into a table to add or remove rows and columns and to change the column alignment.

## Code blocks

Fenced code blocks are highlighted for well over a hundred languages. Write the language after the opening fence:

```ts
interface Note {
  title: string;
  tags: readonly string[];
}

export function summarize(note: Note): string {
  const tags = note.tags.length > 0 ? note.tags.join(', ') : 'untagged';
  return `${note.title} (${tags})`;
}
```

```python
def fibonacci(n: int) -> list[int]:
    """Return the first n Fibonacci numbers."""
    sequence = [0, 1]
    while len(sequence) < n:
        sequence.append(sequence[-1] + sequence[-2])
    return sequence[:n]
```

```bash
# Build a portable version of MarkDown++
npm ci && npm run package
```

In the visual editor you can change the language of a block with the picker in its top corner.

## Math

Inline math such as $E = mc^2$ and display math are rendered with KaTeX:

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$

## Images and links

Links look like [this one](https://github.com/Amadudl/MarkDownPlusPlus). Images can be local files next to your document (`![Diagram](./images/diagram.png)`) or remote URLs. Remote images are **off by default** for your privacy (a remote image tells its server when you opened the document); turn on _Load remote images_ in **Settings → General** if you trust your documents.

---

## Make it yours

Open **Settings** with the gear icon or `Ctrl+,` (`⌘,` on macOS).

- **Appearance** — choose from many colour schemes, let MarkDown++ follow your system's light and dark mode, or duplicate a scheme and tune every single colour. Themes can be exported and imported as JSON.
- **Code Blocks** — pick a syntax theme inspired by classic IDE themes, or let it match your colour scheme automatically.
- **Markdown Elements** — decide how headings, quotes, code blocks, tables, lists, links, rules and images look. Every preset can be fine-tuned.
- **Editor** — default mode, fonts, line numbers, word wrap, spell checking, auto save and more.

## Keyboard shortcuts

| Action                   | Windows / Linux  | macOS        |
| ------------------------ | ---------------- | ------------ |
| Command palette          | `Ctrl+Shift+P`   | `⌘⇧P`        |
| Toggle Visual / Markdown | `Ctrl+E`         | `⌘E`         |
| New / Open / Save        | `Ctrl+N / O / S` | `⌘N / O / S` |
| Find / Replace           | `Ctrl+F / H`     | `⌘F / ⌘⌥F`   |
| Bold / Italic / Link     | `Ctrl+B / I / K` | `⌘B / I / K` |
| Headings 1 – 3           | `Ctrl+1 … 3`     | `⌘1 … 3`     |
| Outline                  | `Ctrl+Shift+O`   | `⌘⇧O`        |
| Focus mode               | `Ctrl+Shift+F`   | `⌘⇧F`        |
| Zoom in / out / reset    | `Ctrl+= / - / 0` | `⌘= / - / 0` |
| All shortcuts            | `Ctrl+/`         | `⌘/`         |

The **command palette** gives you every command and your recent files in one searchable list — you never have to remember a shortcut.

## More helpful features

- **Tabs** — open as many files as you like. Drag tabs to reorder them, middle-click to close, double-click the empty tab bar for a new document. When there are more tabs than fit, scroll the tab bar with the mouse wheel or pick any document from the **All open documents** menu.
- **Outline** — a table of contents of your headings; click one to jump there.
- **Focus mode** — hides everything except your text.
- **Drag & drop** — drop `.md` files onto the window to open them.
- **Export** — save a document as a self-contained HTML page or a PDF that looks exactly like the editor.
- **Safe with your files** — line endings and byte-order marks are preserved, files changed by other programs are detected, and MarkDown++ asks before closing unsaved work.
- **Front matter** — a YAML block at the top of a file (`---` … `---`) is kept exactly as written; Visual mode shows it read-only above the document, and you edit it in Markdown mode.

Happy writing!
