import type { JSX } from 'react';
import { useUi } from '@renderer/store/ui';
import { AboutContent } from './AboutContent';
import { Modal } from './common/Modal';

/** Help → About MarkDown++. */
export function AboutDialog(): JSX.Element {
  const close = (): void => useUi.getState().closeDialog();
  return (
    <Modal
      title="About MarkDown++"
      hideTitle
      onClose={close}
      className="about-dialog"
      initialFocus=".modal-footer .button-primary"
    >
      <AboutContent />
      <div className="modal-footer">
        <button type="button" className="button button-primary" onClick={close}>
          Close
        </button>
      </div>
    </Modal>
  );
}
