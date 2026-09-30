import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_SETTINGS } from '@shared/settings';
import { applyTheme, resolveTheme } from '@renderer/themes';
import { App } from './App';
import { applyPlatformClass, detectPlatform } from './platform/platform';
import { systemPrefersDark } from './store/ui';
import './styles/index.css';

/** Mounts the application into `#root` after painting the default theme (no flash of unstyled chrome). */
export function mount(container: HTMLElement | null = document.getElementById('root')): void {
  if (container === null) throw new Error('Missing #root element');
  applyPlatformClass(detectPlatform());
  applyTheme(document.documentElement, resolveTheme(DEFAULT_SETTINGS, systemPrefersDark()));
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

mount();
