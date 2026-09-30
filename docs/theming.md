# Theming

MarkDown++ is styled by **three independent layers**. You can combine any UI theme with
any code theme and any element style, and every layer can be duplicated, edited,
exported and imported as JSON.

| Layer             | Controls                                                                                                                                                                                   | Setting                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **UI theme**      | Colours of the application chrome (window, tabs, toolbar, sidebars, dialogs) and of the editor surface, including element colours such as links, headings, quotes, tables and inline code. | `appearance.uiTheme` (or `lightTheme` / `darkTheme` with _Follow system_) |
| **Code theme**    | Syntax colours of fenced code blocks in Visual mode, of the whole Markdown mode editor and of exported code.                                                                               | `rendering.codeTheme`                                                     |
| **Element style** | Typography and the _shape_ of every rendered Markdown element: headings, quotes, code blocks, inline code, tables, lists, links, horizontal rules and images.                              | `rendering.elementStyle`                                                  |

The same layers are applied to Visual mode and to [HTML/PDF export](user-guide.md#export-to-html-and-pdf),
so an export looks exactly like the editor.

- [Choosing themes](#choosing-themes)
- [Built-in UI themes](#built-in-ui-themes)
- [Built-in code themes](#built-in-code-themes)
- [Built-in element styles](#built-in-element-styles)
- [Custom themes](#custom-themes)
- [JSON format](#json-format)
- [Importing and exporting](#importing-and-exporting)
- [How themes are applied](#how-themes-are-applied)
- [Contributing a preset](#contributing-a-preset)

## Choosing themes

Open **Settings** (`⌘,` / `Ctrl+,`):

- **Appearance** — pick a colour scheme. With **Follow system appearance** enabled (the default),
  MarkDown++ uses your _light theme_ while the OS is in light mode and your _dark theme_
  in dark mode, and switches live when the OS changes. Clicking a card stores it for its
  own appearance (badges _Used in light mode_ / _Used in dark mode_); if that is not the
  current appearance, a notice says so and **Use it now** turns _Follow system
  appearance_ off and applies the scheme right away.
- **Code Blocks** — pick a code theme. The default, **Auto (match UI theme)**, chooses a code theme that
  matches the active UI theme (see the _Auto pairing_ column below); custom UI themes fall
  back to One Dark Pro (`one-dark-pro`) (dark) or GitHub Light (`github-light`) (light).
- **Markdown Elements** — pick an element style and fine-tune it.

## Built-in UI themes

21 colour schemes. Every scheme is tuned so that body text, muted text and accent
labels reach WCAG AA contrast.

| Name                | Id                    | Kind  | Auto pairing (code theme)                       |
| ------------------- | --------------------- | ----- | ----------------------------------------------- |
| Midnight            | `midnight`            | dark  | Tokyo Night (`tokyo-night`)                     |
| Daylight            | `daylight`            | light | GitHub Light (`github-light`)                   |
| Graphite            | `graphite`            | dark  | VS Code Dark Modern (`vscode-dark-modern`)      |
| Paper               | `paper`               | light | One Light (`one-light`)                         |
| Sepia               | `sepia`               | light | Solarized Light (`solarized-light`)             |
| Nord                | `nord`                | dark  | Nord (`nord`)                                   |
| Dracula             | `dracula`             | dark  | Dracula (`dracula`)                             |
| One Dark            | `one-dark`            | dark  | One Dark Pro (`one-dark-pro`)                   |
| Solarized Dark      | `solarized-dark`      | dark  | Solarized Dark (`solarized-dark`)               |
| Solarized Light     | `solarized-light`     | light | Solarized Light (`solarized-light`)             |
| Gruvbox Dark        | `gruvbox-dark`        | dark  | Gruvbox Dark (`gruvbox-dark`)                   |
| Gruvbox Light       | `gruvbox-light`       | light | Gruvbox Light (`gruvbox-light`)                 |
| Tokyo Night         | `tokyo-night`         | dark  | Tokyo Night (`tokyo-night`)                     |
| Catppuccin Mocha    | `catppuccin-mocha`    | dark  | Catppuccin Mocha (`catppuccin-mocha`)           |
| Catppuccin Latte    | `catppuccin-latte`    | light | Catppuccin Latte (`catppuccin-latte`)           |
| Rosé Pine           | `rose-pine`           | dark  | Rosé Pine (`rose-pine`)                         |
| Monokai             | `monokai`             | dark  | Monokai (`monokai`)                             |
| GitHub Dark         | `github-dark`         | dark  | GitHub Dark (`github-dark`)                     |
| GitHub Light        | `github-light`        | light | GitHub Light (`github-light`)                   |
| High Contrast Dark  | `high-contrast-dark`  | dark  | High Contrast (`high-contrast`)                 |
| High Contrast Light | `high-contrast-light` | light | Visual Studio Classic (`visual-studio-classic`) |

## Built-in code themes

34 syntax themes, many of them styled after classic IDEs and editors. They are
_inspired by_ the originals: colours are reproduced as faithfully as the shared token
model allows.

> [!NOTE]
> Theme and product names such as Visual Studio Code, IntelliJ, Xcode, Eclipse,
> Notepad++, Sublime Text, GitHub, Monokai, Dracula, Nord, Solarized, Gruvbox, Catppuccin,
> Tokyo Night or Rosé Pine are used only to describe which colour scheme a preset follows.
> They belong to their respective owners; MarkDown++ is not affiliated with or endorsed by
> them. The presets are MarkDown++'s own data files — no theme files, code or assets of
> those products are included.

![A TypeScript code block in the Monokai code theme with the Monokai UI theme and the Technical element style: window frame, line numbers and language picker](images/code-themes.png)

| Name                  | Id                      | Kind  | Description                                                                                     |
| --------------------- | ----------------------- | ----- | ----------------------------------------------------------------------------------------------- |
| VS Code Dark Modern   | `vscode-dark-modern`    | dark  | Inspired by the default dark theme of Visual Studio Code (Dark Modern / Dark+ syntax)           |
| VS Code Light Modern  | `vscode-light-modern`   | light | Inspired by the default light theme of Visual Studio Code (Light Modern / Light+ syntax)        |
| Visual Studio Classic | `visual-studio-classic` | light | Inspired by the timeless Visual Studio light editor: blue keywords, green comments, red strings |
| Monokai               | `monokai`               | dark  | Classic Monokai palette                                                                         |
| Monokai Pro           | `monokai-pro`           | dark  | Inspired by the refined Monokai Pro palette (Filter: default)                                   |
| Dracula               | `dracula`               | dark  | Classic Dracula palette                                                                         |
| One Dark Pro          | `one-dark-pro`          | dark  | Inspired by the One Dark palette popularised by the Atom editor                                 |
| One Light             | `one-light`             | light | Inspired by the One Light palette popularised by the Atom editor                                |
| Solarized Dark        | `solarized-dark`        | dark  | Ethan Schoonover's precision colours, dark variant                                              |
| Solarized Light       | `solarized-light`       | light | Ethan Schoonover's precision colours, light variant                                             |
| GitHub Light          | `github-light`          | light | Inspired by the syntax colours of GitHub's light code view                                      |
| GitHub Dark           | `github-dark`           | dark  | Inspired by the syntax colours of GitHub's dark code view                                       |
| Nord                  | `nord`                  | dark  | The arctic, north-bluish Nord palette                                                           |
| Gruvbox Dark          | `gruvbox-dark`          | dark  | The retro groove Gruvbox palette, dark variant                                                  |
| Gruvbox Light         | `gruvbox-light`         | light | The retro groove Gruvbox palette, light variant                                                 |
| IntelliJ Darcula      | `intellij-darcula`      | dark  | Inspired by the Darcula scheme of JetBrains IDEs                                                |
| IntelliJ Light        | `intellij-light`        | light | Inspired by the default light scheme of JetBrains IDEs                                          |
| Xcode Light           | `xcode-light`           | light | Inspired by the default light theme of Apple Xcode                                              |
| Xcode Dark            | `xcode-dark`            | dark  | Inspired by the default dark theme of Apple Xcode                                               |
| Eclipse Classic       | `eclipse-classic`       | light | Inspired by the classic Eclipse IDE Java editor colours                                         |
| Notepad++             | `notepad-plus-plus`     | light | Inspired by the default style configuration of Notepad++                                        |
| Sublime Mariana       | `sublime-mariana`       | dark  | Inspired by the default Mariana colour scheme of Sublime Text                                   |
| Tokyo Night           | `tokyo-night`           | dark  | The Tokyo Night palette: neon lights of downtown Tokyo at night                                 |
| Catppuccin Mocha      | `catppuccin-mocha`      | dark  | Soothing pastel Catppuccin palette, Mocha flavour                                               |
| Catppuccin Latte      | `catppuccin-latte`      | light | Soothing pastel Catppuccin palette, Latte flavour                                               |
| Night Owl             | `night-owl`             | dark  | Sarah Drasner's Night Owl palette, tuned for late-night coding                                  |
| Material Palenight    | `material-palenight`    | dark  | The Palenight variant of the Material theme                                                     |
| Ayu Light             | `ayu-light`             | light | The bright variant of the simple, elegant Ayu palette                                           |
| Ayu Mirage            | `ayu-mirage`            | dark  | The mirage variant of the simple, elegant Ayu palette                                           |
| Cobalt2               | `cobalt2`               | dark  | Wes Bos' vivid blue Cobalt2 palette                                                             |
| Rosé Pine             | `rose-pine`             | dark  | All natural pine, faux fur and a bit of soho vibes                                              |
| Zenburn               | `zenburn`               | dark  | The low-contrast Zenburn palette, easy on the eyes                                              |
| Tomorrow Night        | `tomorrow-night`        | dark  | Chris Kempson's Tomorrow Night palette                                                          |
| High Contrast         | `high-contrast`         | dark  | Maximum legibility on a pure black background                                                   |

## Built-in element styles

11 element styles. Each one defines typography and a variant for every Markdown
element.

![Settings → Markdown Elements: the element style presets, each previewed as a miniature document](images/element-styles.png)

| Name       | Id           | Description                                                                                |
| ---------- | ------------ | ------------------------------------------------------------------------------------------ |
| Modern     | `modern`     | Clean Inter typography, generous spacing, card quotes and floating code blocks.            |
| GitHub     | `github`     | The familiar look of READMEs and docs rendered on GitHub.                                  |
| Academic   | `academic`   | A LaTeX-like paper: old-style serif body, restrained headings and booktabs tables.         |
| Minimal    | `minimal`    | Quiet, Notion-like pages that stay out of the way of your words.                           |
| Typewriter | `typewriter` | Monospace everything, dashed rules and small caps: a manuscript straight off the platen.   |
| Editorial  | `editorial`  | Magazine layout with large, tightly set serif headings, pull quotes and ornamental rules.  |
| Compact    | `compact`    | Dense technical documentation: small type, wide pages and tight tables.                    |
| Book       | `book`       | A printed book: serif text, centred small-caps headings and ornamental breaks.             |
| Technical  | `technical`  | Engineering docs: window-style code with language badges, grid tables and callouts.        |
| Playful    | `playful`    | Rounded, friendly and colourful: heavy gradient headings, bubbly code and card tables.     |
| Classic    | `classic`    | A word-processor document: Arial body, Georgia headings, Courier code and bordered tables. |

## Custom themes

Built-in presets are read-only. To customise one:

1. **UI and code themes:** select the preset in **Settings → Appearance** or **Settings →
   Code Blocks** and click **Duplicate**. Give the copy a name and edit any colour. The
   editor warns you when a text colour becomes hard to read (low contrast).
2. **Element styles:** in **Settings → Markdown Elements**, use **Duplicate** or simply
   change any value under _Fine tuning_ — your first edit of a built-in preset creates a
   custom copy. A live preview shows the result.
3. Changes apply live. Custom themes are stored in `settings.json`
   (`appearance.customUiThemes`, `rendering.customCodeThemes`,
   `rendering.customElementStyles`, up to 100 of each).

You can also **delete** custom themes, and **export** / **import** them as JSON files to
back them up or share them (see [below](#importing-and-exporting)).

## JSON format

Themes are plain JSON validated against the zod schemas in
[`src/shared/theme-model.ts`](../src/shared/theme-model.ts). The rules common to all
three layers:

- `id` — unique, lowercase kebab-case (`^[a-z0-9][a-z0-9-]*$`), 1 – 64 characters. It
  must not collide with a built-in id.
- `name` — display name, 1 – 64 characters.
- Colours are hex strings: `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` (the last two digits
  are the alpha channel, e.g. `#7c6cf233` for 20 % opacity).
- Every property shown in the examples below is **required** unless marked optional.
  Unknown properties are ignored.

### UI theme

`kind` is `"light"` or `"dark"`; it decides which slot the theme fits with _Follow system_
and which code theme _Auto_ picks for it.

```json
{
  "id": "custom-my-midnight",
  "name": "My Midnight",
  "kind": "dark",
  "colors": {
    "background": "#0e1016",
    "surface": "#13161e",
    "surfaceElevated": "#1a1e29",
    "surfaceSunken": "#0a0c11",
    "border": "#232734",
    "borderStrong": "#343a4b",
    "text": "#e5e7ee",
    "textMuted": "#9ba2b6",
    "textFaint": "#6a7186",
    "accent": "#e0569b",
    "accentHover": "#ea6ba9",
    "accentText": "#ffffff",
    "selection": "#7c6cf24d",
    "focusRing": "#9d91ff",
    "danger": "#f26d7d",
    "warning": "#f0b35a",
    "success": "#4fd1a1",
    "editorBackground": "#11131a",
    "editorText": "#d9dce6",
    "link": "#a89cff",
    "heading": "#f3f4f8",
    "quoteBar": "#e0569b",
    "quoteBackground": "#7c6cf214",
    "tableBorder": "#262a37",
    "tableHeaderBackground": "#181b25",
    "tableStripe": "#ffffff06",
    "inlineCodeBackground": "#7c6cf21f",
    "inlineCodeText": "#c9c1ff",
    "mark": "#f0b35a47"
  }
}
```

| Colour key                                              | Used for                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `background`                                            | Window background behind all panels.                                         |
| `surface`                                               | Panels: tab bar, toolbar, sidebars, status bar.                              |
| `surfaceElevated`                                       | Popovers, menus, dialogs, the command palette, the active tab.               |
| `surfaceSunken`                                         | Inputs and recessed areas.                                                   |
| `border` / `borderStrong`                               | Hairlines between areas / emphasised borders and dividers.                   |
| `text` / `textMuted` / `textFaint`                      | Primary, secondary and tertiary text.                                        |
| `accent` / `accentHover` / `accentText`                 | Primary buttons, the active mode, highlights / hover state / text on accent. |
| `selection`                                             | Text selection (use alpha).                                                  |
| `focusRing`                                             | Keyboard focus outlines.                                                     |
| `danger` / `warning` / `success`                        | Status colours in banners, toasts and badges.                                |
| `editorBackground` / `editorText`                       | The document surface and its body text.                                      |
| `link`                                                  | Links in documents.                                                          |
| `heading`                                               | Headings (when the element style uses `"color": "heading"`).                 |
| `quoteBar` / `quoteBackground`                          | Blockquote accent bar and background.                                        |
| `tableBorder` / `tableHeaderBackground` / `tableStripe` | Table borders, header row, striped rows.                                     |
| `inlineCodeBackground` / `inlineCodeText`               | Inline `code`.                                                               |
| `mark`                                                  | Search match highlight.                                                      |

### Code theme

`description` (optional, max. 200 characters, default `""`), `italicComments` (optional,
default `true`) and `boldKeywords` (optional, default `false`) may be omitted.

```json
{
  "id": "custom-my-dark-modern",
  "name": "My Dark Modern",
  "kind": "dark",
  "description": "VS Code Dark Modern with bold keywords",
  "colors": {
    "background": "#1f1f1f",
    "foreground": "#cccccc",
    "gutterBackground": "#1f1f1f",
    "gutterForeground": "#6e7681",
    "lineHighlight": "#ffffff0a",
    "selection": "#264f78",
    "cursor": "#aeafad",
    "border": "#2b2b2b",
    "comment": "#6a9955",
    "keyword": "#569cd6",
    "controlKeyword": "#c586c0",
    "operator": "#d4d4d4",
    "punctuation": "#cccccc",
    "string": "#ce9178",
    "number": "#b5cea8",
    "boolean": "#569cd6",
    "constant": "#4fc1ff",
    "variable": "#9cdcfe",
    "property": "#9cdcfe",
    "function": "#dcdcaa",
    "type": "#4ec9b0",
    "className": "#4ec9b0",
    "tag": "#569cd6",
    "attribute": "#9cdcfe",
    "regexp": "#d16969",
    "escape": "#d7ba7d",
    "heading": "#569cd6",
    "emphasis": "#d4d4d4",
    "strong": "#d4d4d4",
    "link": "#4fc1ff",
    "quote": "#6a9955",
    "meta": "#9b9b9b",
    "invalid": "#f44747"
  },
  "italicComments": true,
  "boldKeywords": true
}
```

| Colour key                                           | Used for                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `background` / `foreground`                          | Code block and Markdown mode background / default text.      |
| `gutterBackground` / `gutterForeground`              | Line number gutter.                                          |
| `lineHighlight` / `selection` / `cursor`             | Active line, selection, caret (Markdown mode).               |
| `border`                                             | Code block border (for bordered and window variants).        |
| `comment`                                            | Comments.                                                    |
| `keyword` / `controlKeyword`                         | Keywords (`const`, `class`) / control flow (`if`, `return`). |
| `operator` / `punctuation`                           | Operators / brackets, commas, semicolons.                    |
| `string` / `number` / `boolean` / `constant`         | Literals.                                                    |
| `variable` / `property` / `function`                 | Identifiers.                                                 |
| `type` / `className`                                 | Type names / class names.                                    |
| `tag` / `attribute`                                  | HTML/XML tags and attributes.                                |
| `regexp` / `escape`                                  | Regular expressions / escape sequences.                      |
| `heading` / `emphasis` / `strong` / `link` / `quote` | Markdown syntax in Markdown mode.                            |
| `meta`                                               | Meta information: front matter, preprocessor, decorators.    |
| `invalid`                                            | Invalid or deprecated tokens.                                |

### Element style

`description` is optional (max. 200 characters, default `""`).

```json
{
  "id": "custom-my-modern",
  "name": "My Modern",
  "description": "Modern with a window-style code frame",
  "typography": {
    "bodyFont": "'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    "headingFont": "'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    "monoFont": "'JetBrains Mono Variable', 'JetBrains Mono', 'Cascadia Code', 'Fira Code', Menlo, Consolas, monospace",
    "baseFontSize": 16,
    "lineHeight": 1.7,
    "paragraphSpacing": 1,
    "contentWidth": 780
  },
  "headings": {
    "scale": [2.25, 1.75, 1.375, 1.15, 1, 0.875],
    "weight": 700,
    "letterSpacing": -0.02,
    "color": "heading",
    "underline": "none",
    "uppercaseSmall": false
  },
  "blockquote": {
    "variant": "card",
    "italic": false
  },
  "codeBlock": {
    "variant": "window",
    "radius": 12,
    "showLanguage": true,
    "lineNumbers": false,
    "fontSize": 0.875
  },
  "inlineCode": {
    "variant": "pill"
  },
  "table": {
    "variant": "striped",
    "compact": false
  },
  "list": {
    "bullet": "disc",
    "spacing": 0.35
  },
  "link": {
    "variant": "accent"
  },
  "horizontalRule": {
    "variant": "fade"
  },
  "image": {
    "radius": 12,
    "shadow": true,
    "centered": true
  }
}
```

| Property                                           | Values                                            | Meaning                                                                      |
| -------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `typography.bodyFont` / `headingFont` / `monoFont` | CSS font list (max. 300 characters)               | Fonts for text, headings and code. _Inter_ and _JetBrains Mono_ are bundled. |
| `typography.baseFontSize`                          | `10` – `32` (px)                                  | Body font size.                                                              |
| `typography.lineHeight`                            | `1` – `2.6`                                       | Body line height.                                                            |
| `typography.paragraphSpacing`                      | `0` – `3` (em)                                    | Space between blocks.                                                        |
| `typography.contentWidth`                          | `480` – `2400` (px)                               | Maximum width of the text column.                                            |
| `headings.scale`                                   | six numbers, `0.6` – `4` each                     | Font-size multipliers for `h1` … `h6`.                                       |
| `headings.weight`                                  | `300` – `900`                                     | Font weight.                                                                 |
| `headings.letterSpacing`                           | `-0.1` – `0.3` (em)                               | Tracking.                                                                    |
| `headings.color`                                   | `heading`, `accent`, `text`                       | Which UI theme colour headings use.                                          |
| `headings.underline`                               | `none`, `h1`, `h1-h2`                             | Rule under the top-level headings.                                           |
| `headings.uppercaseSmall`                          | boolean                                           | Render `h5`/`h6` in small caps-style uppercase.                              |
| `blockquote.variant`                               | `bar`, `card`, `quote-mark`, `minimal`, `callout` | Shape of quotes.                                                             |
| `blockquote.italic`                                | boolean                                           | Italic quote text.                                                           |
| `codeBlock.variant`                                | `flat`, `bordered`, `shadow`, `window`            | Frame of code blocks (`window` adds a title bar with traffic lights).        |
| `codeBlock.radius`                                 | `0` – `24` (px)                                   | Corner radius.                                                               |
| `codeBlock.showLanguage`                           | boolean                                           | Show the language label.                                                     |
| `codeBlock.lineNumbers`                            | boolean                                           | Show line numbers in code blocks.                                            |
| `codeBlock.fontSize`                               | `0.6` – `1.4` (em)                                | Code font size relative to body text.                                        |
| `inlineCode.variant`                               | `pill`, `outlined`, `plain`, `underline`          | Look of inline code.                                                         |
| `table.variant`                                    | `grid`, `striped`, `minimal`, `bordered`, `card`  | Look of tables.                                                              |
| `table.compact`                                    | boolean                                           | Reduced cell padding.                                                        |
| `list.bullet`                                      | `disc`, `circle`, `square`, `dash`, `arrow`       | Bullet marker.                                                               |
| `list.spacing`                                     | `0` – `2` (em)                                    | Space between list items.                                                    |
| `link.variant`                                     | `underline`, `hover`, `accent`, `dotted`          | Link decoration.                                                             |
| `horizontalRule.variant`                           | `line`, `dashed`, `dotted`, `fade`, `ornament`    | Look of `---`.                                                               |
| `image.radius`                                     | `0` – `32` (px)                                   | Image corner radius.                                                         |
| `image.shadow` / `image.centered`                  | boolean                                           | Drop shadow / centre images.                                                 |

## Importing and exporting

**Export**: select a theme in **Settings** and click **Export JSON**. MarkDown++ saves a
pretty-printed `.json` file that wraps the theme in a small, versioned envelope:

```json
{
  "format": "markdownplusplus-theme",
  "version": 1,
  "kind": "ui",
  "theme": { "id": "custom-my-midnight", "name": "My Midnight", "kind": "dark", "colors": { "…": "…" } }
}
```

| Field     | Meaning                                                                              |
| --------- | ------------------------------------------------------------------------------------ |
| `format`  | Always `"markdownplusplus-theme"`.                                                   |
| `version` | Envelope version, currently `1`. Files from a newer MarkDown++ version are rejected. |
| `kind`    | The layer: `"ui"` (UI theme), `"code"` (code theme) or `"elements"` (element style). |
| `theme`   | The theme object, exactly as described in [JSON format](#json-format).               |

**Import**: click **Import JSON…** and choose a `.json` file. The imported theme is
added to your custom themes and activated. MarkDown++ accepts both the
envelope above and a **bare theme object** (the layer is then detected from its keys).
The file is validated against the schema before anything changes; invalid files are
rejected with a message naming the offending properties (for example
`colors.accent: Expected a hex colour such as #1e1e1e`). Files larger than 256 KB are
rejected.

Themes created in the app get ids of the form `custom-<name>` (with `-2`, `-3`, …
appended when needed), so they never collide with built-in presets. An imported theme
keeps its `id` unless that id is already taken; then it gets a unique `custom-…` id.

Because themes are plain data, sharing a theme is as simple as sharing its JSON file. A
theme can never contain code or CSS — only the values described above.

## How themes are applied

The renderer's theme engine resolves the active trio from the settings and converts every
value into a CSS custom property on the document root:

| Source                                                | CSS custom property          |
| ----------------------------------------------------- | ---------------------------- |
| `uiTheme.colors.surfaceElevated`                      | `--mpp-ui-surface-elevated`  |
| `codeTheme.colors.controlKeyword`                     | `--mpp-code-control-keyword` |
| element style values (e.g. `typography.baseFontSize`) | `--mpp-el-*`                 |

Element-style variants become data attributes (for example `data-mpp-quote="card"`).
All element CSS targets the `.mpp-document` container, which wraps both the live Visual
mode editor and exported HTML. See [architecture](architecture.md#theming).

## Contributing a preset

New presets are welcome. See
[How to add a theme preset](../CONTRIBUTING.md#adding-a-theme-preset) in the contributing
guide: presets must pass the schema, keep WCAG AA contrast for text, and credit the
original palette in `description` when they are inspired by one.
