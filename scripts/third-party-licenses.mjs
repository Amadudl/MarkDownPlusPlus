// Generates THIRD_PARTY_LICENSES.md: the license texts of every package that ships inside
// MarkDown++ (all non-dev entries of package-lock.json). Permissive licenses such as MIT,
// BSD, ISC, Apache-2.0 and the SIL Open Font License require that their text travels with
// every copy of the software, so the file is committed, bundled into the app and linked
// from the About dialog. Run `npm run licenses` after changing dependencies;
// scripts/third-party-licenses.test.ts fails when the file is out of date or when a
// dependency uses a license that is not on the allowlist below.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** SPDX expressions that may ship in the app (all permissive, no copyleft obligations). */
export const ALLOWED_LICENSES = new Set([
  'MIT',
  'ISC',
  '0BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'OFL-1.1',
  'CC0-1.0',
  'Unlicense',
  'BlueOak-1.0.0',
  '(MPL-2.0 OR Apache-2.0)',
]);

/** The output file, relative to the repository root. */
export const OUTPUT_FILE = 'THIRD_PARTY_LICENSES.md';

const LICENSE_FILE = /^(licen[cs]e|copying|ofl)([.-].*)?$/i;

/**
 * Standard MIT text, used for the rare MIT package that does not publish its license file
 * (the copyright line is built from the package's author field).
 */
const MIT_TEMPLATE = `MIT License

Copyright (c) {{holder}}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

/**
 * @typedef {object} PackageLicense
 * @property {string} name
 * @property {string} version
 * @property {string} license SPDX expression from package.json
 * @property {string} text full license text
 */

/** @param {unknown} value @returns {string} */
function licenseOf(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'type' in value && typeof value.type === 'string')
    return value.type;
  return 'UNKNOWN';
}

/** @param {unknown} author @returns {string} */
function authorName(author) {
  if (typeof author === 'string') return author.replace(/\s*[<(].*$/, '').trim();
  if (author && typeof author === 'object' && 'name' in author && typeof author.name === 'string') {
    return author.name;
  }
  return '';
}

/**
 * Reads the license of one installed package.
 * @param {string} dir absolute package directory
 * @returns {PackageLicense}
 */
export function readPackageLicense(dir) {
  /** @type {Record<string, unknown>} */
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const name = String(pkg.name);
  const version = String(pkg.version);
  const license = licenseOf(pkg.license);
  const file = readdirSync(dir).find((entry) => LICENSE_FILE.test(entry));
  let text;
  if (file !== undefined) text = readFileSync(join(dir, file), 'utf8');
  else if (license === 'MIT') {
    const holder = authorName(pkg.author) || `the ${name} authors`;
    text = MIT_TEMPLATE.replace('{{holder}}', holder);
  } else {
    throw new Error(`${name}@${version} (${license}) ships no license file`);
  }
  return { name, version, license, text: text.replace(/\r\n?/g, '\n').trim() };
}

/**
 * Lists every package installed for production (non-dev entries of package-lock.json that
 * exist on disk; optional platform-specific packages of other systems are skipped).
 * @param {string} root repository root
 * @returns {PackageLicense[]} sorted by name and version
 */
export function collectLicenses(root) {
  /** @type {{ packages: Record<string, { dev?: boolean }> }} */
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const seen = new Map();
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (key === '' || entry.dev === true) continue;
    const dir = join(root, key);
    if (!existsSync(join(dir, 'package.json'))) continue;
    const info = readPackageLicense(dir);
    seen.set(`${info.name}@${info.version}`, info);
  }
  return [...seen.values()].sort((a, b) =>
    a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name),
  );
}

/**
 * Returns the packages whose license is not in {@link ALLOWED_LICENSES}.
 * @param {readonly PackageLicense[]} licenses
 * @returns {PackageLicense[]}
 */
export function disallowedLicenses(licenses) {
  return licenses.filter((entry) => !ALLOWED_LICENSES.has(entry.license));
}

/**
 * Renders the Markdown document; identical license texts are printed once with the list
 * of packages that use them.
 * @param {readonly PackageLicense[]} licenses
 * @returns {string}
 */
export function renderLicenses(licenses) {
  /** @type {Map<string, PackageLicense[]>} */
  const byText = new Map();
  for (const entry of licenses) byText.set(entry.text, [...(byText.get(entry.text) ?? []), entry]);
  const counts = new Map();
  for (const entry of licenses) counts.set(entry.license, (counts.get(entry.license) ?? 0) + 1);
  const summary = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([license, count]) => `| ${license} | ${count} |`);
  const sections = [...byText.entries()].map(([text, packages]) => {
    const names = packages.map((entry) => `\`${entry.name}@${entry.version}\``).join(', ');
    return `## ${packages[0]?.license ?? ''}: ${names}\n\n\`\`\`text\n${text.replace(/```/g, "'''")}\n\`\`\``;
  });
  return [
    '# Third-party licenses',
    '',
    'MarkDown++ is released under the [MIT License](LICENSE). It bundles the open-source',
    'packages listed below; their licenses require that the following notices accompany every',
    'copy of the application. Electron and Chromium ship their own notices inside the app',
    '(`LICENSE.electron.txt` and `LICENSES.chromium.html`).',
    '',
    'This file is generated by `npm run licenses` (`scripts/third-party-licenses.mjs`); do not',
    'edit it by hand.',
    '',
    `${licenses.length} packages:`,
    '',
    '| License | Packages |',
    '| --- | --- |',
    ...summary,
    '',
    ...sections.flatMap((section) => [section, '']),
  ].join('\n');
}

// Command-line entry point (`npm run licenses`).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(import.meta.dirname, '..');
  const licenses = collectLicenses(root);
  const bad = disallowedLicenses(licenses);
  if (bad.length > 0) {
    console.error('Dependencies with licenses that are not allowed:');
    for (const entry of bad) console.error(`  ${entry.name}@${entry.version}: ${entry.license}`);
    process.exit(1);
  }
  writeFileSync(join(root, OUTPUT_FILE), renderLicenses(licenses));
  console.warn(`Wrote ${OUTPUT_FILE} (${licenses.length} packages).`);
}
