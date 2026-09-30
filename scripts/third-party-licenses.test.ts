import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ALLOWED_LICENSES,
  collectLicenses,
  disallowedLicenses,
  OUTPUT_FILE,
  readPackageLicense,
  renderLicenses,
} from './third-party-licenses.mjs';

const root = resolve(import.meta.dirname, '..');

describe('THIRD_PARTY_LICENSES.md', () => {
  const licenses = collectLicenses(root);

  it('covers the shipped dependencies, including the bundled fonts', () => {
    const names = licenses.map((entry) => entry.name);
    for (const name of ['@milkdown/crepe', 'codemirror', 'react', 'katex', 'dompurify', 'zod']) {
      expect(names).toContain(name);
    }
    expect(licenses.filter((entry) => entry.name.startsWith('@fontsource-variable/'))).toEqual(
      expect.arrayContaining([expect.objectContaining({ license: 'OFL-1.1' })]),
    );
    // Development tooling is not shipped and therefore not listed.
    expect(names).not.toContain('vitest');
    expect(names).not.toContain('electron-builder');
  });

  it('only contains allowed, permissive licenses', () => {
    expect(disallowedLicenses(licenses)).toEqual([]);
  });

  it('is up to date (run `npm run licenses` after changing dependencies)', () => {
    const committed = readFileSync(join(root, OUTPUT_FILE), 'utf8').replace(/\r\n/g, '\n');
    expect(committed).toBe(renderLicenses(licenses));
  });
});

describe('license collection helpers', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mpp-licenses-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function fakePackage(
    path: string,
    pkg: Record<string, unknown>,
    files: Record<string, string> = {},
  ): string {
    const packageDir = join(dir, path);
    mkdirSync(packageDir, { recursive: true });
    const name = path.split('/').at(-1);
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name, version: '1.2.3', ...pkg }));
    for (const [file, content] of Object.entries(files)) writeFileSync(join(packageDir, file), content);
    return packageDir;
  }

  it('reads the license file and normalises line endings', () => {
    const info = readPackageLicense(
      fakePackage('a', { license: 'ISC' }, { 'LICENSE.md': 'ISC text\r\n\r\n' }),
    );
    expect(info).toEqual({ name: 'a', version: '1.2.3', license: 'ISC', text: 'ISC text' });
  });

  it('understands the legacy { type } license form', () => {
    expect(readPackageLicense(fakePackage('b', { license: { type: 'MIT' } }, { COPYING: 'x' })).license).toBe(
      'MIT',
    );
    expect(readPackageLicense(fakePackage('c', {}, { LICENCE: 'x' })).license).toBe('UNKNOWN');
  });

  it('builds the MIT text from the author when a MIT package has no license file', () => {
    const fromString = readPackageLicense(
      fakePackage('d', { license: 'MIT', author: 'Jane Doe <j@example.com>' }),
    );
    expect(fromString.text).toContain('Copyright (c) Jane Doe\n');
    const fromObject = readPackageLicense(fakePackage('e', { license: 'MIT', author: { name: 'Max' } }));
    expect(fromObject.text).toContain('Copyright (c) Max\n');
    const anonymous = readPackageLicense(fakePackage('f', { license: 'MIT' }));
    expect(anonymous.text).toContain('Copyright (c) the f authors\n');
  });

  it('refuses a non-MIT package without a license file', () => {
    expect(() => readPackageLicense(fakePackage('g', { license: 'Apache-2.0' }))).toThrow(
      'g@1.2.3 (Apache-2.0) ships no license file',
    );
  });

  it('flags licenses that are not on the allowlist', () => {
    const entry = (license: string) => ({ name: license, version: '1', license, text: license });
    expect(ALLOWED_LICENSES.has('MIT')).toBe(true);
    expect(
      disallowedLicenses([entry('MIT'), entry('GPL-3.0'), entry('UNKNOWN')]).map((e) => e.license),
    ).toEqual(['GPL-3.0', 'UNKNOWN']);
  });

  it('prints identical license texts once and escapes code fences', () => {
    const output = renderLicenses([
      { name: 'x', version: '1.0.0', license: 'MIT', text: 'same' },
      { name: 'y', version: '2.0.0', license: 'MIT', text: 'same' },
      { name: 'z', version: '1.0.0', license: 'ISC', text: 'has ``` fence' },
    ]);
    expect(output).toContain('## MIT: `x@1.0.0`, `y@2.0.0`');
    expect(output.match(/^same$/gm)).toHaveLength(1);
    expect(output).toContain("has ''' fence");
    expect(output).toContain('| MIT | 2 |\n| ISC | 1 |');
    expect(output).toContain('3 packages:');
  });

  it('skips dev-only and not-installed packages of the lockfile', () => {
    fakePackage('node_modules/zeta', { license: 'MIT' }, { LICENSE: 'zeta' });
    fakePackage('node_modules/prod', { license: 'MIT' }, { LICENSE: 'prod' });
    fakePackage(
      'node_modules/zeta/node_modules/prod',
      { license: 'MIT', version: '0.1.0' },
      { LICENSE: 'old' },
    );
    fakePackage('node_modules/tool', { license: 'GPL-3.0' }, { LICENSE: 'gpl' });
    writeFileSync(
      join(dir, 'package-lock.json'),
      JSON.stringify({
        packages: {
          '': {},
          'node_modules/zeta': {},
          'node_modules/prod': {},
          'node_modules/zeta/node_modules/prod': {},
          'node_modules/tool': { dev: true },
          'node_modules/other-os-binary': { optional: true },
        },
      }),
    );
    expect(collectLicenses(dir).map((entry) => `${entry.name}@${entry.version}`)).toEqual([
      'prod@0.1.0',
      'prod@1.2.3',
      'zeta@1.2.3',
    ]);
  });
});
