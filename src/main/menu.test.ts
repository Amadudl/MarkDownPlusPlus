import { describe, expect, it, vi } from 'vitest';
import { CommandId, type CommandIdValue } from '../shared/commands';
import { shortcutsFor } from '../shared/shortcuts';
import type { RecentFile } from '../shared/types';

const electron = vi.hoisted(() => ({
  Menu: { buildFromTemplate: vi.fn((template: unknown) => ({ template })), setApplicationMenu: vi.fn() },
}));
vi.mock('electron', () => electron);

const { buildMenuTemplate, installApplicationMenu, ISSUES_URL } = await import('./menu');

type Item = Electron.MenuItemConstructorOptions;

function build(platform: NodeJS.Platform, recentFiles: readonly RecentFile[] = [], isPackaged = true) {
  const sendCommand = vi.fn<(command: CommandIdValue, arg?: string) => void>();
  const openExternal = vi.fn<(url: string) => void>();
  const template = buildMenuTemplate({
    appName: 'MarkDown++',
    platform,
    isPackaged,
    recentFiles,
    sendCommand,
    openExternal,
  });
  return { template, sendCommand, openExternal };
}

function items(menu: Item | undefined): Item[] {
  return (menu?.submenu ?? []) as Item[];
}

function flatten(template: readonly Item[]): Item[] {
  return template.flatMap((item) => [item, ...flatten(items(item))]);
}

function byLabel(template: readonly Item[], label: string): Item {
  const found = flatten(template).find((item) => item.label === label);
  if (!found) throw new Error(`No menu item labelled ${label}`);
  return found;
}

function click(item: Item): void {
  (item.click as () => void)();
}

describe('buildMenuTemplate', () => {
  it('has the macOS structure with app and window menus', () => {
    const { template } = build('darwin');
    expect(template.map((menu) => menu.label ?? menu.role)).toEqual([
      'MarkDown++',
      'File',
      'Edit',
      'Format',
      'View',
      'windowMenu',
      'Help',
    ]);
    const appMenu = items(template[0]);
    expect(appMenu.map((item) => item.label ?? item.role ?? item.type)).toEqual([
      'About MarkDown++',
      'separator',
      'Settings…',
      'separator',
      'services',
      'separator',
      'hide',
      'hideOthers',
      'unhide',
      'separator',
      'quit',
    ]);
    expect(flatten(template).some((item) => item.label === 'Exit')).toBe(false);
    expect(byLabel(template, 'Reveal in Finder')).toBeDefined();
    expect(flatten(template).some((item) => item.role === 'pasteAndMatchStyle')).toBe(true);
  });

  it('has Settings and Exit in the File menu and About in Help on Windows/Linux', () => {
    for (const platform of ['win32', 'linux'] as const) {
      const { template } = build(platform);
      expect(template.map((menu) => menu.label)).toEqual(['&File', '&Edit', 'F&ormat', '&View', '&Help']);
      const file = items(template[0]).map((item) => item.label ?? item.type);
      expect(file.slice(-3)).toEqual(['Settings…', 'separator', 'Exit']);
      expect(items(template.at(-1)).at(-1)?.label).toBe('About MarkDown++');
      expect(byLabel(template, 'Reveal in Folder')).toBeDefined();
    }
  });

  it('sends every command item with its macOS accelerator', () => {
    const { template, sendCommand } = build('darwin');
    const commandItems = flatten(template).filter((item) => item.click && item.label !== 'Report an Issue…');
    for (const item of commandItems) {
      sendCommand.mockClear();
      click(item);
      expect(sendCommand).toHaveBeenCalledTimes(1);
      const [command] = sendCommand.mock.calls[0] ?? [];
      if (
        command !== undefined &&
        command !== CommandId.FileOpenRecent &&
        command !== CommandId.FileClearRecent
      ) {
        expect(item.accelerator).toBe(shortcutsFor('darwin')[command]);
      }
    }
    const sent = new Set(
      commandItems.map((item) => {
        sendCommand.mockClear();
        click(item);
        return sendCommand.mock.calls[0]?.[0];
      }),
    );
    for (const id of Object.values(CommandId)) {
      if (id === CommandId.FileOpenRecent || id === CommandId.FileClearRecent) continue;
      expect(sent.has(id), id).toBe(true);
    }
  });

  it('binds Replace… to Cmd+Option+F on macOS and Ctrl+H elsewhere', () => {
    expect(byLabel(build('darwin').template, 'Replace…').accelerator).toBe('Cmd+Alt+F');
    expect(byLabel(build('win32').template, 'Replace…').accelerator).toBe('CmdOrCtrl+H');
    expect(byLabel(build('linux').template, 'Replace…').accelerator).toBe('CmdOrCtrl+H');
  });

  it('lists recent files and sends their path', () => {
    const recent = [
      { path: '/docs/a.md', openedAt: 2 },
      { path: '/docs/R&D.md', openedAt: 1 },
    ];
    const mac = build('darwin', recent);
    const openRecent = items(byLabel(mac.template, 'Open Recent'));
    expect(openRecent.map((item) => item.label ?? item.type)).toEqual([
      '/docs/a.md',
      '/docs/R&D.md',
      'separator',
      'Clear Recent',
    ]);
    click(openRecent[1]!);
    expect(mac.sendCommand).toHaveBeenCalledWith(CommandId.FileOpenRecent, '/docs/R&D.md');
    const clear = openRecent[3]!;
    expect(clear.enabled).toBe(true);
    click(clear);
    expect(mac.sendCommand).toHaveBeenLastCalledWith(CommandId.FileClearRecent);

    const win = build('win32', recent);
    expect(items(byLabel(win.template, 'Open Recent'))[1]?.label).toBe('/docs/R&&D.md');
  });

  it('shows a disabled placeholder without recent files', () => {
    const { template } = build('linux');
    const openRecent = items(byLabel(template, 'Open Recent'));
    expect(openRecent[0]).toEqual({ label: 'No Recent Files', enabled: false });
    expect(openRecent.at(-1)?.enabled).toBe(false);
  });

  it('offers DevTools only in development', () => {
    expect(flatten(build('darwin', [], true).template).some((item) => item.role === 'toggleDevTools')).toBe(
      false,
    );
    expect(flatten(build('darwin', [], false).template).some((item) => item.role === 'toggleDevTools')).toBe(
      true,
    );
  });

  it('opens the issue tracker externally', () => {
    const { template, openExternal } = build('linux');
    click(byLabel(template, 'Report an Issue…'));
    expect(openExternal).toHaveBeenCalledWith(ISSUES_URL);
    expect(ISSUES_URL).toBe('https://github.com/Amadudl/MarkDownPlusPlus/issues');
  });
});

describe('installApplicationMenu', () => {
  it('builds and installs the menu', () => {
    installApplicationMenu({
      appName: 'MarkDown++',
      platform: 'linux',
      isPackaged: true,
      recentFiles: [],
      sendCommand: vi.fn(),
      openExternal: vi.fn(),
    });
    expect(electron.Menu.buildFromTemplate).toHaveBeenCalled();
    expect(electron.Menu.setApplicationMenu).toHaveBeenCalledWith({ template: expect.any(Array) });
  });
});
