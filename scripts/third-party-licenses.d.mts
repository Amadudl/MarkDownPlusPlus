/** Type declarations for `third-party-licenses.mjs` (see that file for documentation). */
export interface PackageLicense {
  readonly name: string;
  readonly version: string;
  /** SPDX expression from package.json. */
  readonly license: string;
  /** Full license text. */
  readonly text: string;
}

export const ALLOWED_LICENSES: ReadonlySet<string>;
export const OUTPUT_FILE: string;
export function readPackageLicense(dir: string): PackageLicense;
export function collectLicenses(root: string): PackageLicense[];
export function disallowedLicenses(licenses: readonly PackageLicense[]): PackageLicense[];
export function renderLicenses(licenses: readonly PackageLicense[]): string;
