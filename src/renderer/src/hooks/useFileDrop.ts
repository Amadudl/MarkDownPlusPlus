import { useEffect } from 'react';
import { openPath } from '@renderer/commands/documentActions';
import { getApi } from '@renderer/platform/api';
import { isMarkdownFileName } from '@renderer/platform/paths';
import { useUi } from '@renderer/store/ui';

function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false;
}

/** Opens the markdown files among dropped files; returns the number of rejected files. */
export async function openDroppedFiles(files: readonly File[]): Promise<number> {
  const api = getApi();
  let rejected = 0;
  for (const file of files) {
    if (!isMarkdownFileName(file.name)) {
      rejected += 1;
      continue;
    }
    const path = api.file.pathForDroppedFile(file);
    if (path === '') rejected += 1;
    else await openPath(path);
  }
  if (rejected > 0) {
    useUi
      .getState()
      .pushToast(
        'warning',
        rejected === 1 ? 'One file is not a markdown file.' : `${rejected} files are not markdown files.`,
      );
  }
  return rejected;
}

/**
 * Lets the user drop markdown files anywhere on the window. Shows the drop
 * overlay while files are dragged over it.
 */
export function useFileDrop(target: Window = window): void {
  useEffect(() => {
    let depth = 0;
    const ui = useUi.getState;
    const onEnter = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth += 1;
      ui().setDropActive(true);
    };
    const onOver = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) ui().setDropActive(false);
    };
    const onDrop = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth = 0;
      ui().setDropActive(false);
      void openDroppedFiles(Array.from(event.dataTransfer?.files ?? []));
    };
    target.addEventListener('dragenter', onEnter);
    target.addEventListener('dragover', onOver);
    target.addEventListener('dragleave', onLeave);
    target.addEventListener('drop', onDrop);
    return () => {
      target.removeEventListener('dragenter', onEnter);
      target.removeEventListener('dragover', onOver);
      target.removeEventListener('dragleave', onLeave);
      target.removeEventListener('drop', onDrop);
    };
  }, [target]);
}
