/**
 * Preload script (sandboxed, context-isolated). Exposes the typed `window.mpp`
 * API and nothing else; see `createMppApi` for the implementation.
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { createMppApi } from './createApi';

contextBridge.exposeInMainWorld('mpp', createMppApi(ipcRenderer, webUtils));
