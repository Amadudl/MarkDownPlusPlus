import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUILTIN_CODE_THEMES,
  BUILTIN_ELEMENT_STYLES,
  BUILTIN_UI_THEMES,
  serializeThemeExport,
} from '@renderer/themes';
import { FAKE_APP_INFO, type FakeApi } from '@renderer/test/fakeApi';
import { resetApp, setSettings } from '@renderer/test/utils';
import { useSettings } from '@renderer/store/settings';
import { useUi } from '@renderer/store/ui';
import { importThemeFile, MAX_THEME_FILE_BYTES } from './ImportThemeButton';
import { SETTINGS_SECTIONS, SettingsDialog } from './SettingsDialog';

const settings = (): ReturnType<typeof useSettings.getState>['settings'] => useSettings.getState().settings;

function openSection(id: (typeof SETTINGS_SECTIONS)[number]['id']): void {
  act(() => useUi.getState().openDialog('settings', id));
}

describe('SettingsDialog', () => {
  let api: FakeApi;
  beforeEach(() => {
    api = resetApp();
    useUi.setState({ appInfo: FAKE_APP_INFO });
  });

  it('navigates sections with the sidebar and arrow keys', async () => {
    const user = userEvent.setup();
    openSection('appearance');
    render(<SettingsDialog />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(SETTINGS_SECTIONS.map((section) => section.label));
    expect(tabs[0]).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'Appearance' })).toBeInTheDocument();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('tab', { name: 'Code Blocks' })).toHaveFocus();
    expect(useUi.getState().settingsSection).toBe('code');
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(useUi.getState().settingsSection).toBe('about');
    await user.keyboard('{ArrowDown}');
    expect(useUi.getState().settingsSection).toBe('appearance');
    await user.keyboard('{ArrowRight}');
    expect(useUi.getState().settingsSection).toBe('appearance');
    await user.click(screen.getByRole('tab', { name: 'About' }));
    expect(screen.getByText(/open-source software under the MIT License/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(useUi.getState().dialog).toBeNull();
  });

  it('opens every section scrolled to its top', async () => {
    const user = userEvent.setup();
    openSection('appearance');
    render(<SettingsDialog />);
    screen.getByRole('tabpanel').scrollTop = 480;
    await user.click(screen.getByRole('tab', { name: 'Code Blocks' }));
    expect(screen.getByRole('tabpanel', { name: 'Code Blocks' }).scrollTop).toBe(0);
  });

  it('resets to defaults after confirmation', async () => {
    const user = userEvent.setup();
    setSettings(api, { editor: { tabSize: 6 } });
    openSection('general');
    render(<SettingsDialog />);
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await vi.waitFor(() => expect(settings().editor.tabSize).toBe(2));
    expect(useUi.getState().toasts.at(-1)?.message).toBe('Settings were reset to their defaults.');
    vi.mocked(api.settings.reset).mockRejectedValueOnce(new Error('x'));
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await vi.waitFor(() => expect(useUi.getState().toasts.at(-1)?.message).toBe('Could not reset settings.'));
  });

  it('edits editor settings', async () => {
    const user = userEvent.setup();
    openSection('editor');
    render(<SettingsDialog />);
    await user.click(screen.getByRole('radio', { name: 'Markdown' }));
    await user.click(screen.getByRole('switch', { name: 'Line numbers' }));
    await user.click(screen.getByRole('switch', { name: 'Word wrap' }));
    await user.click(screen.getByRole('switch', { name: 'Spell checking' }));
    await user.click(screen.getByRole('switch', { name: 'Restore session' }));
    await user.selectOptions(screen.getByLabelText('Line endings of new files'), 'crlf');
    expect(screen.getByRole('combobox', { name: 'Source font' })).toHaveDisplayValue(
      'JetBrains Mono (bundled)',
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Source font' }), 'Custom…');
    const font = screen.getByRole('textbox', { name: 'Custom source font' });
    await user.clear(font);
    await user.type(font, 'Fira Code{Enter}');
    const size = screen.getByRole('spinbutton', { name: 'Source font size' });
    await user.clear(size);
    await user.type(size, '18{Enter}');
    const tab = screen.getByRole('spinbutton', { name: 'Tab size' });
    await user.clear(tab);
    await user.type(tab, '4{Enter}');
    expect(screen.queryByRole('spinbutton', { name: 'Auto save delay' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Auto save'), 'afterDelay');
    const delay = await screen.findByRole('spinbutton', { name: 'Auto save delay' });
    await user.clear(delay);
    await user.type(delay, '2000{Enter}');
    await vi.waitFor(() =>
      expect(settings().editor).toMatchObject({
        defaultMode: 'source',
        sourceLineNumbers: false,
        wordWrap: false,
        spellcheck: false,
        restoreSession: false,
        newLineEnding: 'crlf',
        sourceFontFamily: 'Fira Code',
        sourceFontSize: 18,
        tabSize: 4,
        autoSave: 'afterDelay',
        autoSaveDelayMs: 2000,
      }),
    );
  });

  it('edits general settings', async () => {
    const user = userEvent.setup();
    openSection('general');
    render(<SettingsDialog />);
    for (const name of [
      'Confirm before closing unsaved documents',
      'Show welcome screen',
      'Show status bar',
      'Load remote images',
    ]) {
      await user.click(screen.getByRole('switch', { name }));
    }
    await vi.waitFor(() => {
      expect(settings().general).toMatchObject({
        confirmOnClose: false,
        showWelcome: false,
        showStatusBar: false,
      });
      // Remote images are off by default; the switch turns them on.
      expect(settings().rendering.loadRemoteImages).toBe(true);
    });
  });

  it('edits appearance: system following, pickers, zoom and gallery', async () => {
    const user = userEvent.setup();
    openSection('appearance');
    render(<SettingsDialog />);
    const light = BUILTIN_UI_THEMES.filter((theme) => theme.kind === 'light');
    const dark = BUILTIN_UI_THEMES.filter((theme) => theme.kind === 'dark');
    const darkGallery = screen.getByRole('region', { name: 'Dark schemes' });
    expect(within(darkGallery).getAllByRole('button')).toHaveLength(dark.length);
    await user.click(
      within(screen.getByRole('region', { name: 'Light schemes' })).getByRole('button', {
        name: new RegExp(light[1]!.name),
      }),
    );
    await vi.waitFor(() => expect(settings().appearance.lightTheme).toBe(light[1]!.id));
    expect(
      screen.getByRole('button', { name: new RegExp(`${light[1]!.name} \\(light\\), Used in light mode`) }),
    ).toHaveAttribute('aria-pressed', 'true');
    await user.selectOptions(screen.getByLabelText('Dark scheme'), dark[1]!.id);
    await user.selectOptions(screen.getByLabelText('Light scheme'), light[0]!.id);
    await vi.waitFor(() =>
      expect(settings().appearance).toMatchObject({ darkTheme: dark[1]!.id, lightTheme: light[0]!.id }),
    );
    await user.click(screen.getByRole('switch', { name: 'Follow system appearance' }));
    await user.selectOptions(await screen.findByLabelText('Colour scheme'), light[0]!.id);
    await vi.waitFor(() =>
      expect(settings().appearance).toMatchObject({ followSystem: false, uiTheme: light[0]!.id }),
    );
    expect(
      screen.getByRole('button', { name: new RegExp(`${light[0]!.name} \\(light\\), Active`) }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider', { name: 'Zoom slider' }), { target: { value: '150' } });
    await vi.waitFor(() => expect(settings().appearance.zoom).toBe(1.5));
    expect(screen.getByText(/Built-in schemes are read-only/)).toBeInTheDocument();
  });

  it('explains picks for the other appearance and offers to use them now', async () => {
    const user = userEvent.setup();
    const light = BUILTIN_UI_THEMES.filter((theme) => theme.kind === 'light');
    const dark = BUILTIN_UI_THEMES.filter((theme) => theme.kind === 'dark');
    act(() => useUi.getState().setPrefersDark(false));
    openSection('appearance');
    const { unmount } = render(<SettingsDialog />);
    // The gallery for the current (light) appearance comes first.
    const galleries = screen.getAllByRole('region', { name: /schemes$/ });
    expect(galleries.map((region) => region.getAttribute('aria-label'))).toEqual([
      'Light schemes',
      'Dark schemes',
    ]);
    const darkGallery = screen.getByRole('region', { name: 'Dark schemes' });
    await user.click(within(darkGallery).getByRole('button', { name: new RegExp(`^${dark[1]!.name} `) }));
    await vi.waitFor(() => expect(settings().appearance.darkTheme).toBe(dark[1]!.id));
    expect(within(darkGallery).getByRole('status')).toHaveTextContent(
      `${dark[1]!.name} will be used when your system is in dark mode.`,
    );
    // A pick for the current appearance applies immediately and needs no notice.
    const lightGallery = screen.getByRole('region', { name: 'Light schemes' });
    await user.click(within(lightGallery).getByRole('button', { name: new RegExp(`^${light[1]!.name} `) }));
    await vi.waitFor(() => expect(settings().appearance.lightTheme).toBe(light[1]!.id));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await user.click(within(darkGallery).getByRole('button', { name: new RegExp(`^${dark[0]!.name} `) }));
    await user.click(await within(darkGallery).findByRole('button', { name: 'Use it now' }));
    await vi.waitFor(() =>
      expect(settings().appearance).toMatchObject({ followSystem: false, uiTheme: dark[0]!.id }),
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    unmount();
    act(() => useUi.getState().setPrefersDark(true));
    render(<SettingsDialog />);
    expect(
      screen.getAllByRole('region', { name: /schemes$/ }).map((region) => region.getAttribute('aria-label')),
    ).toEqual(['Dark schemes', 'Light schemes']);
  });

  it('duplicates, edits, exports and deletes a custom colour scheme', async () => {
    const user = userEvent.setup();
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    setSettings(api, { appearance: { followSystem: false, uiTheme: 'midnight' } });
    openSection('appearance');
    render(<SettingsDialog />);
    await user.click(screen.getByRole('button', { name: 'Duplicate' }));
    await screen.findByRole('textbox', { name: 'Theme name' });
    const custom = settings().appearance.customUiThemes[0]!;
    expect(settings().appearance.uiTheme).toBe(custom.id);
    const name = screen.getByRole('textbox', { name: 'Theme name' });
    await user.clear(name);
    await user.type(name, 'My Night{Enter}');
    await vi.waitFor(() => expect(settings().appearance.customUiThemes[0]?.name).toBe('My Night'));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Theme kind' }), 'light');
    await vi.waitFor(() => expect(settings().appearance.customUiThemes[0]?.kind).toBe('light'));
    const text = screen.getByRole('textbox', { name: 'Text' });
    await user.clear(text);
    await user.type(text, custom.colors.background);
    await vi.waitFor(() =>
      expect(settings().appearance.customUiThemes[0]?.colors.text).toBe(custom.colors.background),
    );
    expect(screen.getAllByRole('note').some((note) => note.textContent.includes('Contrast 1.00:1'))).toBe(
      true,
    );
    await user.click(screen.getByRole('button', { name: 'Export JSON' }));
    expect(click).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete theme' }));
    await user.click(screen.getByRole('button', { name: 'Delete “My Night”' }));
    await vi.waitFor(() => expect(settings().appearance.customUiThemes).toEqual([]));
    click.mockRestore();
  });

  it('manages code themes: auto, gallery, flags and custom editor', async () => {
    const user = userEvent.setup();
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    openSection('code');
    render(<SettingsDialog />);
    expect(screen.getByRole('button', { name: 'Auto (match UI theme)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('(matched to your colour scheme)', { exact: false })).toBeInTheDocument();
    const target = BUILTIN_CODE_THEMES.find((theme) => theme.kind === 'light')!;
    const card = screen.getByRole('button', { name: `${target.name} (light)` });
    expect(card.querySelector('.tok-keyword')).not.toBeNull();
    expect(
      card.querySelector<HTMLElement>('.code-preview')!.style.getPropertyValue('--mpp-code-background'),
    ).toBe(target.colors.background);
    await user.click(card);
    await vi.waitFor(() => expect(settings().rendering.codeTheme).toBe(target.id));
    expect(screen.queryByText('(matched to your colour scheme)', { exact: false })).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Bold keywords' }));
    await vi.waitFor(() => expect(settings().rendering.customCodeThemes).toHaveLength(1));
    expect(screen.getByRole('button', { name: /\(light\)/, pressed: true })).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Italic comments' }));
    const keyword = await screen.findByRole('textbox', { name: 'Keyword' });
    await user.clear(keyword);
    await user.type(keyword, '#ff0000');
    await vi.waitFor(() => expect(settings().rendering.customCodeThemes[0]?.colors.keyword).toBe('#ff0000'));
    await user.click(screen.getByRole('button', { name: 'Duplicate' }));
    await vi.waitFor(() => expect(settings().rendering.customCodeThemes).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: 'Export JSON' }));
    expect(click).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Delete theme' }));
    await user.click(screen.getByRole('button', { name: /^Delete “/ }));
    await vi.waitFor(() => expect(settings().rendering.codeTheme).toBe('auto'));
    await user.click(screen.getByRole('button', { name: 'Auto (match UI theme)' }));
    click.mockRestore();
  });

  it('manages element styles: presets, preview, tuning and custom copies', async () => {
    const user = userEvent.setup();
    openSection('elements');
    render(<SettingsDialog />);
    const preview = screen.getByRole('region', { name: 'Live preview' });
    expect(preview.querySelector('article.mpp-document')).not.toBeNull();
    const presets = within(screen.getByRole('region', { name: 'Presets' })).getAllByRole('button');
    await user.click(presets[1]!);
    await vi.waitFor(() => expect(settings().rendering.elementStyle).not.toBe('modern'));
    expect(screen.getByText(/first edit creates a custom copy/)).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Compact table rows' }));
    await vi.waitFor(() => expect(settings().rendering.customElementStyles).toHaveLength(1));
    const name = await screen.findByRole('textbox', { name: 'Style name' });
    await user.clear(name);
    await user.type(name, 'Tuned{Enter}');
    await vi.waitFor(() => expect(settings().rendering.customElementStyles[0]?.name).toBe('Tuned'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete “Tuned”' }));
    await vi.waitFor(() => expect(settings().rendering.customElementStyles).toEqual([]));
    await user.click(screen.getByRole('button', { name: 'Duplicate' }));
    await vi.waitFor(() => expect(settings().rendering.customElementStyles).toHaveLength(1));
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await user.click(screen.getByRole('button', { name: 'Export JSON' }));
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
    const link = preview.querySelector('a')!;
    expect(fireEvent.click(link)).toBe(false);
  });

  it('falls back to generated descriptions for custom themes without one', () => {
    const code = { ...BUILTIN_CODE_THEMES[0]!, id: 'custom-plain', name: 'Plain Code', description: '' };
    const style = { ...BUILTIN_ELEMENT_STYLES[0]!, id: 'custom-style', name: 'Plain Style', description: '' };
    setSettings(api, { rendering: { customCodeThemes: [code], customElementStyles: [style] } });
    openSection('code');
    const { unmount } = render(<SettingsDialog />);
    expect(screen.getByRole('button', { name: /Plain Code/ })).toHaveAttribute('title', 'Plain Code');
    unmount();
    openSection('elements');
    render(<SettingsDialog />);
    expect(screen.getByRole('button', { name: 'Plain Style' })).toHaveTextContent('quotes');
  });

  it('imports theme files and rejects invalid or oversized ones', async () => {
    const user = userEvent.setup();
    openSection('appearance');
    render(<SettingsDialog />);
    const input = screen.getByLabelText('Theme file');
    const clickInput = vi.spyOn(input, 'click');
    await user.click(screen.getByRole('button', { name: /Import JSON/ }));
    expect(clickInput).toHaveBeenCalled();
    const theme = { ...BUILTIN_UI_THEMES[0]!, id: 'imported-one', name: 'Imported' };
    await user.upload(
      input,
      new File([serializeThemeExport(theme)], 'theme.json', { type: 'application/json' }),
    );
    await vi.waitFor(() =>
      expect(useUi.getState().toasts.at(-1)?.message).toBe('Colour scheme “Imported” imported.'),
    );
    expect(settings().appearance.customUiThemes.map((item) => item.id)).toContain('imported-one');
    fireEvent.change(input, { target: { files: [] } });
    await expect(importThemeFile(new File(['{'], 'bad.json'))).resolves.toBe(false);
    expect(useUi.getState().toasts.at(-1)?.message).toBe('Could not import bad.json');
    const huge = new File(['x'], 'huge.json');
    Object.defineProperty(huge, 'size', { value: MAX_THEME_FILE_BYTES + 1 });
    await expect(importThemeFile(huge)).resolves.toBe(false);
    expect(useUi.getState().toasts.at(-1)?.message).toBe('Theme file is too large.');
  });
});
