import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SANDBOX_WARNING_FILE, sandboxWarningDialog, warnIfSandboxDisabled } from './sandboxWarning';

let dir: string;
let stateFile: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mpp-sandbox-'));
  stateFile = join(dir, SANDBOX_WARNING_FILE);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function answer(response: number, checkboxChecked = false) {
  return vi.fn(() => Promise.resolve({ response, checkboxChecked }));
}

describe('sandboxWarningDialog', () => {
  it('explains the AppImage cause and recommends the system packages', () => {
    const options = sandboxWarningDialog(true);
    expect(options.buttons).toEqual(['Continue', 'Quit']);
    expect(options.cancelId).toBe(0);
    expect(options.detail).toContain('AppImage launcher');
    expect(options.detail).toContain('.deb or .rpm');
    expect(options.checkboxLabel).toBe("Don't show this again");
  });

  it('names the command-line option otherwise', () => {
    expect(sandboxWarningDialog(false).detail).toContain('--no-sandbox option');
  });
});

describe('warnIfSandboxDisabled', () => {
  it('does nothing while the sandbox is active', async () => {
    const showMessageBox = answer(0);
    await expect(
      warnIfSandboxDisabled({ sandboxDisabled: false, isAppImage: true, stateFile, showMessageBox }),
    ).resolves.toBe('not-needed');
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it('warns and continues without remembering the choice', async () => {
    const showMessageBox = answer(0);
    await expect(
      warnIfSandboxDisabled({ sandboxDisabled: true, isAppImage: false, stateFile, showMessageBox }),
    ).resolves.toBe('continue');
    expect(showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' }));
    await expect(readFile(stateFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('reports quit when the user chooses Quit', async () => {
    await expect(
      warnIfSandboxDisabled({
        sandboxDisabled: true,
        isAppImage: true,
        stateFile,
        showMessageBox: answer(1),
      }),
    ).resolves.toBe('quit');
  });

  it('remembers "Don\'t show this again" and stays silent afterwards', async () => {
    await expect(
      warnIfSandboxDisabled({
        sandboxDisabled: true,
        isAppImage: true,
        stateFile,
        showMessageBox: answer(0, true),
      }),
    ).resolves.toBe('continue');
    expect(JSON.parse(await readFile(stateFile, 'utf8'))).toEqual({ version: 1, dismissed: true });
    const again = answer(0);
    await expect(
      warnIfSandboxDisabled({ sandboxDisabled: true, isAppImage: true, stateFile, showMessageBox: again }),
    ).resolves.toBe('dismissed');
    expect(again).not.toHaveBeenCalled();
  });

  it('ignores a malformed or undismissed state file', async () => {
    for (const content of ['{"version":1,"dismissed":false}', '{"dismissed":"yes"}', 'not json']) {
      await writeFile(stateFile, content);
      const showMessageBox = answer(0);
      await expect(
        warnIfSandboxDisabled({ sandboxDisabled: true, isAppImage: false, stateFile, showMessageBox }),
      ).resolves.toBe('continue');
      expect(showMessageBox).toHaveBeenCalledOnce();
    }
  });

  it('still continues when the choice cannot be saved', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const unwritable = join(dir, 'missing-folder', SANDBOX_WARNING_FILE);
      await expect(
        warnIfSandboxDisabled({
          sandboxDisabled: true,
          isAppImage: false,
          stateFile: unwritable,
          showMessageBox: answer(0, true),
        }),
      ).resolves.toBe('continue');
      expect(warn).toHaveBeenCalledWith('Could not remember the sandbox warning choice:', expect.any(Error));
    } finally {
      warn.mockRestore();
    }
  });
});
