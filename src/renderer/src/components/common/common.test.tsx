import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Bold } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from './IconButton';
import { CommandId } from '@shared/commands';
import { Kbd, ShortcutKbd } from './Kbd';
import { LogoMark } from './LogoMark';
import { Modal } from './Modal';

describe('IconButton', () => {
  it('exposes label, tooltip, shortcut and pressed state', async () => {
    const onClick = vi.fn();
    render(
      <IconButton label="Bold" icon={Bold} shortcut="Ctrl+B" pressed onClick={onClick} className="extra" />,
    );
    const button = screen.getByRole('button', { name: 'Bold' });
    expect(button).toHaveAttribute('data-tooltip', 'Bold');
    expect(button).toHaveAttribute('data-shortcut', 'Ctrl+B');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveClass('icon-button', 'extra');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalled();
  });

  it('omits optional attributes', () => {
    render(<IconButton label="Plain" icon={Bold} />);
    const button = screen.getByRole('button', { name: 'Plain' });
    expect(button).not.toHaveAttribute('data-shortcut');
    expect(button).not.toHaveAttribute('aria-pressed');
    expect(button.className).toBe('icon-button');
  });
});

describe('Kbd and LogoMark', () => {
  it('render', () => {
    render(
      <>
        <Kbd>⌘K</Kbd>
        <ShortcutKbd command={CommandId.FileNew} platform="win32" />
        <ShortcutKbd command={CommandId.FileCloseAll} platform="win32" />
        <LogoMark size={20} />
      </>,
    );
    expect(document.querySelectorAll('kbd')).toHaveLength(2);
    expect(screen.getByText('Ctrl+N')).toBeInTheDocument();
    expect(screen.getByText('⌘K').tagName).toBe('KBD');
    expect(screen.getByRole('img', { name: 'MarkDown++ logo' })).toHaveAttribute('width', '20');
  });
});

describe('Modal', () => {
  it('focuses the first control, traps Tab and restores focus on close', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(
      <Modal title="Dialog" onClose={onClose}>
        <button type="button">First</button>
        <button type="button">Last</button>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Dialog' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('honours initialFocus, hidden titles and backdrop clicks', async () => {
    const onClose = vi.fn();
    render(
      <Modal title="Hidden" hideTitle onClose={onClose} initialFocus=".target" className="custom">
        <button type="button">Other</button>
        <input className="target" aria-label="Target" />
      </Modal>,
    );
    expect(screen.getByRole('textbox', { name: 'Target' })).toHaveFocus();
    expect(screen.getByText('Hidden')).toHaveClass('visually-hidden');
    expect(screen.getByRole('dialog')).toHaveClass('modal', 'custom');
    await userEvent.click(screen.getByRole('button', { name: 'Other' }));
    expect(onClose).not.toHaveBeenCalled();
    const backdrop = screen.getByRole('dialog').parentElement!;
    await userEvent.pointer({ keys: '[MouseLeft]', target: backdrop });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not restore focus to non-HTML elements', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('tabindex', '0');
    document.body.append(svg);
    svg.focus();
    const { unmount } = render(
      <Modal title="Svg" onClose={() => undefined}>
        <button type="button">Inside</button>
      </Modal>,
    );
    unmount();
    expect(document.activeElement).not.toBe(svg);
    svg.remove();
  });

  it('falls back to the dialog itself without focusable content and ignores other keys', async () => {
    const onClose = vi.fn();
    render(
      <Modal title="Empty" onClose={onClose} initialFocus=".missing">
        <p>Nothing to focus</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveFocus();
    await userEvent.keyboard('{Tab}');
    await userEvent.keyboard('a');
    expect(dialog).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
  });
});
