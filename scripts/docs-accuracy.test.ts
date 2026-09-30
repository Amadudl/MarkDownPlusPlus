/**
 * Regression guards for the end-user and security documentation: every claim checked
 * here was wrong once (slash-menu keywords, task-list input rule, the Replace shortcut on
 * macOS, the Content Security Policy, the file-access policy, …). The tests compare the
 * documents with the source of truth in the code instead of with hard-coded copies, so a
 * code change that invalidates a document fails here.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CommandId, isCommandId } from '../src/shared/commands';
import { formatAccelerator, shortcutFor } from '../src/shared/shortcuts';
import { FileService, MARKDOWN_EXTENSIONS } from '../src/main/services/fileService';
import { imageMimeType, isPermittedImagePath } from '../src/main/services/localImages';
import { PathRegistry } from '../src/main/services/pathRegistry';

const root = resolve(import.meta.dirname, '..');

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

const WELCOME = 'src/renderer/src/content/welcome.md';
const USER_DOCS = [WELCOME, 'docs/user-guide.md', 'docs/tutorial.md', 'README.md', 'CHANGELOG.md'];

/** Labels of Crepe's default slash-menu items (the app does not override them). */
function crepeSlashLabels(): string[] {
  const config = read('node_modules/@milkdown/crepe/src/feature/block-edit/menu/config.ts');
  return [...config.matchAll(/\?\?\s*'([^']+)'/g)].map((match) => match[1] ?? '');
}

/** Mirrors Crepe's slash-menu filter (`label.toLowerCase().includes(filter)`). */
function slashMenuMatches(filter: string): string[] {
  return crepeSlashLabels().filter((label) => label.toLowerCase().includes(filter.toLowerCase()));
}

/** Strips the Markdown code span around a table cell (`` `⌘B` `` or ``` `` ⌘` `` ```). */
function codeSpan(cell: string): string {
  const trimmed = cell.trim();
  const double = /^``\s(.*)\s``$/.exec(trimmed);
  if (double?.[1] !== undefined) return double[1];
  const single = /^`([^`]*)`$/.exec(trimmed);
  return single?.[1] ?? trimmed;
}

/** Rows of every Markdown table in `markdown`, as trimmed cells (delimiter rows excluded). */
function tableRows(markdown: string): string[][] {
  return markdown
    .split('\n')
    .filter((line) => line.startsWith('|') && !/^\|[\s:|-]+\|$/.test(line))
    .map((line) =>
      line
        .slice(1, -1)
        .split(/(?<!\\)\|/)
        .map((cell) => cell.trim()),
    );
}

const macReplace = formatAccelerator(shortcutFor(CommandId.EditReplace, 'darwin') ?? '', 'darwin');
const winReplace = formatAccelerator(shortcutFor(CommandId.EditReplace, 'win32') ?? '', 'win32');

describe('slash menu keywords', () => {
  it('reads the labels of the installed Crepe version', () => {
    expect(crepeSlashLabels()).toEqual(expect.arrayContaining(['Task List', 'Table', 'Code', 'Math']));
  });

  it('only documents `/keyword` examples that match a slash-menu item', () => {
    for (const file of USER_DOCS) {
      const examples = [...read(file).matchAll(/`\/([a-z]+)`/g)].map((match) => match[1] ?? '');
      for (const example of examples)
        expect(slashMenuMatches(example), `${file}: /${example}`).not.toEqual([]);
    }
  });

  it('uses a keyword that finds the task list in the tutorial', () => {
    const tutorial = read('docs/tutorial.md');
    const keyword = /Type `([a-z]+)` and press `Enter` to choose \*\*Task List\*\*/.exec(tutorial)?.[1];
    expect(keyword).toBeDefined();
    expect(slashMenuMatches(keyword ?? '')).toContain('Task List');
    expect(slashMenuMatches('todo')).toEqual([]);
  });
});

describe('task list input rule', () => {
  it('never claims that `[ ] ` alone on a plain line creates a task list', () => {
    for (const file of USER_DOCS) {
      const text = read(file).replace(/\s+/g, ' ');
      for (const match of text.matchAll(/`\[ \] `/g)) {
        const context = text.slice(match.index, match.index + 60);
        expect(context, `${file}: ${context}`).toMatch(
          /^`\[ \] ` at the start of (an existing )?(a )?list item/,
        );
      }
    }
  });

  it('documents `- [ ] ` in the welcome table', () => {
    const row = tableRows(read(WELCOME)).find((cells) => cells[1] === 'Task list');
    expect(row?.[0]).toBe('`- [ ] `');
  });
});

describe('drag handle and toolbar toggle', () => {
  it('describes the + button, not a block-actions menu', () => {
    const welcome = read(WELCOME);
    expect(welcome).not.toMatch(/block actions|turning a paragraph into a heading/);
    expect(welcome).toContain('click the **+** next to it to insert a new block below with the slash menu');
  });

  it('does not mention a toolbar chevron', () => {
    for (const file of [WELCOME, 'docs/user-guide.md']) {
      const text = read(file);
      expect(text, file).not.toMatch(/chevron/i);
      expect(text, file).not.toContain('⌄');
    }
  });

  it('points to the title-bar toggle that TopBar renders next to the command palette', () => {
    const topBar = read('src/renderer/src/components/TopBar.tsx');
    expect(topBar).toContain("'Hide formatting toolbar'");
    expect(topBar.indexOf('PanelTopClose')).toBeLessThan(topBar.indexOf('label="Command palette"'));
    expect(read(WELCOME)).toContain(
      'Hide it with the toolbar button in the top-right corner (next to the search icon)',
    );
  });
});

describe('keyboard shortcuts', () => {
  it('keeps docs/keyboard-shortcuts.md in sync with the effective shortcut tables', () => {
    const rows = tableRows(read('docs/keyboard-shortcuts.md')).filter(
      (cells) => cells.length === 4 && isCommandId(codeSpan(cells[3] ?? '')),
    );
    expect(rows.length).toBeGreaterThan(30);
    for (const [action, mac, win, id] of rows) {
      const command = codeSpan(id ?? '');
      if (!isCommandId(command)) throw new Error(command);
      const macAccelerator = shortcutFor(command, 'darwin');
      const winAccelerator = shortcutFor(command, 'win32');
      expect(codeSpan(mac ?? ''), `${action ?? ''} (macOS)`).toBe(
        macAccelerator === undefined ? '—' : formatAccelerator(macAccelerator, 'darwin'),
      );
      expect(codeSpan(win ?? ''), `${action ?? ''} (Windows / Linux)`).toBe(
        winAccelerator === undefined ? '—' : formatAccelerator(winAccelerator, 'win32'),
      );
    }
  });

  it('documents the platform-specific Find and Replace shortcut everywhere', () => {
    expect(macReplace).toBe('⌘⌥F');
    expect(winReplace).toBe('Ctrl+H');
    expect(read('docs/tutorial.md')).toContain(`Press \`${macReplace}\` / \`${winReplace}\``);
    expect(read('docs/user-guide.md')).toContain(
      `find and replace with \`${macReplace}\` / \`${winReplace}\``,
    );
    const welcomeRow = tableRows(read(WELCOME)).find((cells) => cells[0] === 'Find / Replace');
    expect(welcomeRow).toEqual(['Find / Replace', '`Ctrl+F / H`', `\`⌘F / ${macReplace}\``]);
    for (const file of USER_DOCS) expect(read(file), file).not.toMatch(/`⌘H` \/ `Ctrl\+H`|⌘F \/ H`/);
  });
});

describe('Visual mode serialisation in the tutorial', () => {
  it('shows emphasis with the marker the serializer writes', () => {
    const fidelity = read('src/renderer/src/editor/wysiwyg/markdown-fidelity.ts');
    expect(fidelity).toMatch(/emphasis: '\*'/);
    expect(fidelity).toMatch(/strong: '\*'/);
    const tutorial = read('docs/tutorial.md');
    expect(tutorial).toContain('A short note about **what we are building** and *why*.');
    expect(tutorial).toContain('are saved\n> as `*why*` and `**bold**`');
    expect(tutorial).not.toMatch(/exactly the same document/);
    expect(tutorial).toContain('This excerpt shows how it starts');
  });
});

describe('user guide', () => {
  it('lists every extension the file service opens', () => {
    const guide = read('docs/user-guide.md');
    const paragraph =
      /MarkDown\+\+ opens Markdown and text files with the extensions ([^.]+(?:\.[a-z]+[^.]*)+?)\. The/.exec(
        guide.replace(/\n/g, ' '),
      )?.[1];
    expect(paragraph).toBeDefined();
    const documented = [...(paragraph ?? '').matchAll(/`(\.[a-z]+)`/g)].map((match) => match[1]);
    expect(documented).toEqual([...MARKDOWN_EXTENSIONS]);
    expect(guide).toContain('**50 MB**');
    expect(guide).toMatch(/binary files/);
  });

  it('names exactly the extensions registered with the OS', () => {
    const builder = read('electron-builder.yml');
    const registered = /fileAssociations:\n\s+- ext: \[([^\]]+)\]/.exec(builder)?.[1]?.split(/,\s*/) ?? [];
    expect(registered.length).toBeGreaterThan(0);
    const sentence = /Only (.+?) are registered with the operating system/.exec(
      read('docs/user-guide.md').replace(/\n/g, ' '),
    )?.[1];
    const documented = [...(sentence ?? '').matchAll(/`\.([a-z]+)`/g)].map((match) => match[1]);
    expect(documented).toEqual(registered);
  });

  it('describes every status bar item in the order StatusBar renders them', () => {
    const statusBar = read('src/renderer/src/components/StatusBar.tsx');
    const guide = read('docs/user-guide.md').replace(/\n/g, ' ');
    const row = /\|\s*\*\*Status bar\*\*\s*\|([^|]+)\|/.exec(guide)?.[1] ?? '';
    const items: readonly [doc: string, code: string][] = [
      ['the mode', "'Visual' : 'Markdown'"],
      ['the word count', ' words</span>'],
      ['the character count', ' characters\n'],
      ['_n min read_', '{formatReadingTime('],
      ['the line ending', 'doc.lineEnding.toUpperCase()}\n'],
      ['_UTF-8 BOM_', "'UTF-8 BOM'"],
      ['the zoom level', '{zoomLabel}\n'],
      ['the save state', '<SaveState'],
    ];
    let previousDoc = -1;
    let previousCode = -1;
    for (const [doc, code] of items) {
      const docIndex = row.indexOf(doc);
      const codeIndex = statusBar.indexOf(code);
      expect(docIndex, doc).toBeGreaterThan(previousDoc);
      expect(codeIndex, code).toBeGreaterThan(previousCode);
      previousDoc = docIndex;
      previousCode = codeIndex;
    }
    expect(statusBar).toContain('without spaces');
    expect(statusBar).toContain('const position = `Ln ${cursor.line}, Col ${cursor.column}`');
    expect(statusBar).toMatch(/if \(mode === 'wysiwyg'\) return selection;/);
    expect(statusBar).toContain("'characters'} selected");
    expect(statusBar).not.toContain('Block ');
    expect(row).toContain('_Ln x, Col y_');
    expect(row).toContain('_(n characters selected)_');
    expect(row).toContain('in Visual mode only the selection size');
    expect(row).not.toContain('_Block n_');
    for (const state of ['Saved', 'Unsaved', 'Not saved yet']) {
      expect(statusBar).toContain(state);
      expect(row).toContain(`_${state}_`);
    }
    expect(row).toContain('hover it for the count without spaces and the number of lines');
  });
});

describe('platform-specific menu paths', () => {
  it('names the macOS app menu for About wherever Help → About is mentioned', () => {
    for (const file of ['docs/installation.md', 'SUPPORT.md']) {
      const text = read(file).replace(/\s+/g, ' ');
      expect(text, file).toMatch(/Help → About MarkDown\+\+\*\* on Windows and Linux/);
      expect(text, file).toContain('**MarkDown++ → About MarkDown++** on macOS');
    }
    const menu = read('src/main/menu.ts');
    expect(menu).toMatch(/command\(`About \$\{context\.appName\}`, CommandId\.HelpAbout\)/);
    expect(menu).toMatch(/\.\.\.\(mac \? \[\] : \[separator, command\(`About/);
  });

  it('does not claim installers never use a portable data folder', () => {
    const installation = read('docs/installation.md');
    expect(installation).not.toMatch(/Always use the standard per-user location/);
    expect(installation).toMatch(
      /unless a `MarkDownPlusPlus-data` folder exists next to the installed executable/,
    );
    expect(read('src/main/paths.ts')).toMatch(/dirname\(appImage \?\? environment\.execPath\)/);
  });
});

describe('architecture and security documentation', () => {
  it('lists every shared contract module', () => {
    const architecture = read('docs/architecture.md');
    const shared = readdirSync(join(root, 'src/shared')).filter(
      (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
    );
    for (const name of shared) expect(architecture, name).toContain(`| \`${name}\``);
  });

  it('does not describe a keybinding matcher in the renderer or an offscreen PDF window', () => {
    const architecture = read('docs/architecture.md');
    expect(architecture).not.toMatch(/keybinding matcher|offscreen/);
    expect(existsSync(join(root, 'src/main/keyboard.ts'))).toBe(true);
    const exporter = read('src/main/services/exporter.ts');
    expect(exporter).toMatch(/show: false/);
    expect(exporter).toMatch(/javascript: false/);
    expect(exporter).not.toMatch(/offscreen: true/);
  });

  it('documents the img-src directive exactly as the CSP builds it', () => {
    const security = read('src/main/security.ts');
    const directive = /`(img-src [^`$]+)\$\{devSources\}`/.exec(security)?.[1]?.trim();
    expect(directive).toBe("img-src 'self' data: blob: mpp-file: https:");
    const sources = (directive ?? '').replace('img-src ', '');
    for (const file of ['docs/architecture.md', 'SECURITY.md']) {
      const text = read(file).replace(/\s+/g, ' ');
      expect(text, file).toContain(`\`${sources}\``);
      expect(text, file).not.toMatch(/when remote images are enabled/);
      expect(text, file).toMatch(
        /enforced (in app logic )?by (the app's image resolver )?\(?`?resolveImageSrc/,
      );
    }
  });

  it('describes the file-access policy that FileService enforces', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mpp-docs-'));
    try {
      const file = join(dir, 'note.md');
      writeFileSync(file, '# Note\n');
      const registry = new PathRegistry();
      const files = new FileService(registry);
      // A Markdown extension alone grants nothing: reads need a grant, and reading grants nothing.
      await expect(files.read(file)).rejects.toMatchObject({ code: 'not-allowed' });
      expect(registry.has(file)).toBe(false);
      registry.add(file);
      await expect(files.read(file)).resolves.toMatchObject({ content: '# Note\n' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    for (const doc of ['docs/architecture.md', 'SECURITY.md', 'src/main/services/pathRegistry.ts']) {
      const text = read(doc).replace(/\s+/g, ' ').replace(/ \* /g, ' ');
      expect(text, doc).not.toMatch(
        /can never overwrite arbitrary files|plus paths restored from the session file|without (a|prior) grant/,
      );
      expect(text, doc).toMatch(/[Rr]eading, writing, watching and reveal(ing|-in-folder)/);
      expect(text, doc).toMatch(/session file \**(as it was )?found at startup/);
    }
    for (const doc of ['docs/architecture.md', 'SECURITY.md']) {
      expect(read(doc).replace(/\s+/g, ' '), doc).toMatch(
        /[Ss]av(ing a session|e`) keeps only (already granted paths|paths that are already granted)/,
      );
    }
  });

  it('states where mpp-file may load images from', () => {
    expect(imageMimeType('/etc/passwd')).toBeNull();
    expect(isPermittedImagePath('/Users/someone/elsewhere/photo.png', { platform: 'darwin' })).toBe(true);
    expect(isPermittedImagePath('\\\\evil\\share\\a.png', { platform: 'win32' })).toBe(false);
    expect(
      isPermittedImagePath('\\\\files\\share\\a.png', {
        platform: 'win32',
        allowUncHost: (host) => host === 'files',
      }),
    ).toBe(true);
    expect(isPermittedImagePath('\\\\?\\C:\\a.png', { platform: 'win32', allowUncHost: () => true })).toBe(
      false,
    );
    const security = read('SECURITY.md').replace(/\s+/g, ' ');
    expect(security).toContain('it can reference **any** image file on your local disks');
    expect(security).toContain('only loaded from servers that host a file you opened');
    const architecture = read('docs/architecture.md').replace(/\s+/g, ' ');
    expect(architecture).toContain("It is not limited to the document's folder");
    expect(architecture).toContain('only served for servers that host a granted file');
  });
});

describe('README', () => {
  it('only references images and relative links that exist', () => {
    const readme = read('README.md');
    const targets = [...readme.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)]
      .map((match) => match[1] ?? '')
      .filter((target) => !/^(?:[a-z]+:|#)/i.test(target))
      .map((target) => target.split('#')[0] ?? '');
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets)
      expect(existsSync(join(root, dirname('README.md'), target)), target).toBe(true);
  });
});
