import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { resetApp } from '@renderer/test/utils';

vi.mock('@renderer/editor/EditorHost', () => import('@renderer/test/fakeEditor'));

describe('main entry', () => {
  it('applies the default theme and mounts the app into #root', async () => {
    resetApp();
    document.body.innerHTML = '<div id="root"></div>';
    const { mount } = await import('./main');
    expect(document.documentElement.getAttribute('data-mpp-ui-theme')).toBeTruthy();
    expect(document.body.className).toMatch(/platform-/);
    expect(await screen.findByRole('heading', { name: 'MarkDown++' })).toBeInTheDocument();
    expect(() => mount(null)).toThrow('Missing #root element');
  });
});
