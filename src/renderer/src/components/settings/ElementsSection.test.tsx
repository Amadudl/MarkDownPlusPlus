import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApp } from '@renderer/test/utils';
import { ElementsSection, revealPreviewTarget } from './ElementsSection';

function rect(top: number): DOMRect {
  return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) };
}

describe('revealPreviewTarget', () => {
  let preview: HTMLDivElement;
  let group: HTMLFieldSetElement;
  let control: HTMLInputElement;

  beforeEach(() => {
    preview = document.createElement('div');
    preview.innerHTML = '<p>intro</p><table><tbody><tr><td>cell</td></tr></tbody></table>';
    group = document.createElement('fieldset');
    group.dataset.previewTarget = 'table';
    control = document.createElement('input');
    group.append(control);
    document.body.append(preview, group);
    vi.spyOn(preview, 'getBoundingClientRect').mockReturnValue(rect(100));
    vi.spyOn(preview.querySelector('table')!, 'getBoundingClientRect').mockReturnValue(rect(400));
  });

  it('scrolls only the preview so the edited element is visible', () => {
    preview.scrollTop = 20;
    revealPreviewTarget(preview, control);
    expect(preview.scrollTop).toBe(20 + 300 - 12);
  });

  it('never scrolls above the start of the preview', () => {
    vi.spyOn(preview.querySelector('table')!, 'getBoundingClientRect').mockReturnValue(rect(90));
    revealPreviewTarget(preview, control);
    expect(preview.scrollTop).toBe(0);
  });

  it('ignores controls without a target and targets missing from the preview', () => {
    preview.scrollTop = 5;
    const loose = document.createElement('button');
    document.body.append(loose);
    revealPreviewTarget(preview, loose);
    revealPreviewTarget(preview, window);
    revealPreviewTarget(null, control);
    group.dataset.previewTarget = 'hr';
    revealPreviewTarget(preview, control);
    expect(preview.scrollTop).toBe(5);
  });
});

describe('ElementsSection', () => {
  beforeEach(() => {
    resetApp();
  });

  it('keeps the preview next to the tuning controls and follows the focused group', () => {
    render(<ElementsSection />);
    const previewBlock = screen.getByRole('region', { name: 'Live preview' });
    const tuning = screen.getByRole('region', { name: 'Fine tuning' });
    expect(previewBlock).toHaveClass('element-preview-block');
    expect(previewBlock.parentElement).toBe(tuning.parentElement);
    const preview = previewBlock.querySelector<HTMLElement>('.element-preview')!;
    const table = preview.querySelector('table')!;
    vi.spyOn(preview, 'getBoundingClientRect').mockReturnValue(rect(0));
    vi.spyOn(table, 'getBoundingClientRect').mockReturnValue(rect(640));
    fireEvent.focus(screen.getByRole('combobox', { name: 'Table style' }));
    expect(preview.scrollTop).toBe(628);
  });
});
