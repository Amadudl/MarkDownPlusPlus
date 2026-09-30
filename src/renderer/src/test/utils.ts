import { DEFAULT_SETTINGS, applySettingsPatch, type SettingsPatch } from '@shared/settings';
import { clearAdapters } from '@renderer/store/adapters';
import { INITIAL_DOCUMENTS_STATE, useDocuments } from '@renderer/store/documents';
import { useSettings } from '@renderer/store/settings';
import { initialUiState, useUi } from '@renderer/store/ui';
import { installFakeApi, type FakeApi } from './fakeApi';
import { fakeAdapters } from './fakeEditor';

/** Resets every store and installs a fresh fake API. */
export function resetApp(files: Parameters<typeof installFakeApi>[0] = []): FakeApi {
  useDocuments.setState({ ...INITIAL_DOCUMENTS_STATE });
  useUi.setState({ ...initialUiState(), platform: 'linux', prefersDark: true });
  useSettings.setState({ settings: DEFAULT_SETTINGS, loaded: false });
  clearAdapters();
  fakeAdapters.clear();
  document.body.className = '';
  document.title = '';
  return installFakeApi(files);
}

/** Applies a settings patch directly to the store and the fake API state. */
export function setSettings(api: FakeApi, patch: SettingsPatch): void {
  const settings = applySettingsPatch(useSettings.getState().settings, patch);
  api.state.settings = settings;
  useSettings.setState({ settings, loaded: true });
}

/** Resolves after pending promise callbacks (microtasks and a macrotask) ran. */
export async function flush(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
