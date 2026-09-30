import { describe, expect, it } from 'vitest';
import { rawCssModule, readRepoFile, readThemeCss } from './raw-css';

describe('raw-css test helpers', () => {
  it('reads theme stylesheets and repository files', () => {
    expect(readThemeCss('tokens.css')).toContain(':root');
    expect(rawCssModule('elements.css').default).toContain('.mpp-document');
    expect(readRepoFile('package.json')).toContain('"name"');
  });

  it('rejects paths outside the repository and unexpected names', () => {
    expect(() => readRepoFile('/etc/passwd')).toThrow(/relative/);
    expect(() => readRepoFile('src/../../secret')).toThrow(/relative/);
    expect(() => readThemeCss('../tokens.css')).toThrow(/Unexpected stylesheet/);
  });
});
