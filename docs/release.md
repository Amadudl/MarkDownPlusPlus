# Release process

MarkDown++ releases are built, packaged and published by GitHub Actions
([`.github/workflows/release.yml`](../.github/workflows/release.yml)) when a version tag
is pushed. This page is for maintainers.

## Versioning

MarkDown++ follows [Semantic Versioning 2.0](https://semver.org/):

| Change                                                                                                                              | Bump    |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Incompatible change to user data (settings format without migration, theme JSON format), removal of a feature or supported platform | `MAJOR` |
| New feature, new setting, new theme presets, new platform                                                                           | `MINOR` |
| Bug fix, security fix, performance improvement, documentation                                                                       | `PATCH` |

Pre-releases use a suffix such as `1.1.0-beta.1`. The version lives in `package.json`
only; the app reads it at runtime. When the persisted settings shape changes, increment
`SETTINGS_VERSION` in `src/shared/settings.ts` and add a migration.

## Changelog

[`CHANGELOG.md`](../CHANGELOG.md) follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Every user-visible change adds a line under **Unreleased** in the same PR, in one of the
sections _Added_, _Changed_, _Deprecated_, _Removed_, _Fixed_, _Security_.

## Cutting a release

1. Make sure `main` is green in CI and all changes for the release are merged.
2. Create a release branch or work on `main` locally:
   ```bash
   git switch main && git pull
   npm ci
   npm run verify
   ```
3. Bump the version without creating a tag:
   ```bash
   npm version 1.1.0 --no-git-tag-version
   ```
4. In `CHANGELOG.md`, rename **Unreleased** to `[1.1.0] - YYYY-MM-DD`, add a new empty
   **Unreleased** section and update the comparison links at the bottom.
5. Commit and open a PR titled `chore(release): 1.1.0`. After it is merged:
   ```bash
   git switch main && git pull
   git tag -a v1.1.0 -m "MarkDown++ 1.1.0"
   git push origin v1.1.0
   ```
6. The **Release** workflow runs:
   - **verify** — lint, format check, type-check and unit tests with coverage; checks that
     the tag matches the `package.json` version;
   - **draft-release** — creates one **draft** GitHub release for the tag (so the parallel
     packaging jobs cannot each create their own draft and split the artifacts);
   - **package** — on macOS, Windows and Linux in parallel: `npm ci`, `npm run build` and
     `npx electron-builder --publish always`. electron-builder uploads all artifacts to the
     draft release, and each package gets a build provenance attestation;
   - **checksums** — downloads all release files and attaches `SHA256SUMS.txt`.
7. Open the draft release on GitHub, paste the changelog section as release notes, check
   that all artifacts are present (see the table below), download and smoke-test at least
   one build per OS, then **publish** the release.

| OS      | Artifacts                                                          |
| ------- | ------------------------------------------------------------------ |
| macOS   | `dmg` and `zip` for `x64` and `arm64`                              |
| Windows | `-setup.exe` (NSIS) and `-portable.exe` for `x64` and `arm64`      |
| Linux   | `AppImage`, `deb`, `tar.gz` for `x64` and `arm64`; `rpm` for `x64` |

A release can also be started manually with **Actions → Release → Run workflow**; the tag
check is skipped in that case, and artifacts are attached to a draft release for the
current `package.json` version. No draft is created up front for manual runs, so check
afterwards that exactly one draft release holds all artifacts.

## Code signing and notarisation

The official releases are **not** signed with commercial certificates: the project stays
free of paid accounts. Trust comes from public builds instead — the workflow attaches a
[build provenance attestation](https://docs.github.com/actions/security-for-github-actions/using-artifact-attestations)
to every package and a `SHA256SUMS.txt` to every release (see
[verifying a download](installation.md#unsigned-builds-and-verifying-a-download)); macOS
builds are signed ad hoc so they run on Apple silicon. Users see Gatekeeper / SmartScreen
warnings once, documented in [installation.md](installation.md).

Signing remains **optional** for forks or future use: the workflow only uses credentials
whose repository secrets exist.

Configure the secrets under **Settings → Secrets and variables → Actions**:

| Secret                        | Platform | Purpose                                                                                    |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `CSC_LINK`                    | macOS    | Base64-encoded `.p12` of a _Developer ID Application_ certificate (or an HTTPS URL to it). |
| `CSC_KEY_PASSWORD`            | macOS    | Password of that `.p12`.                                                                   |
| `APPLE_ID`                    | macOS    | Apple ID used for notarisation.                                                            |
| `APPLE_APP_SPECIFIC_PASSWORD` | macOS    | [App-specific password](https://support.apple.com/102654) of that Apple ID.                |
| `APPLE_TEAM_ID`               | macOS    | 10-character Apple Developer Team ID.                                                      |
| `WIN_CSC_LINK`                | Windows  | Base64-encoded `.pfx` code-signing certificate (or an HTTPS URL to it).                    |
| `WIN_CSC_KEY_PASSWORD`        | Windows  | Password of that `.pfx`.                                                                   |

Behaviour:

- **macOS signing** is enabled when `CSC_LINK` is set. The app is signed with the hardened
  runtime and the minimal entitlements in
  [`build/entitlements.mac.plist`](../build/entitlements.mac.plist): only `allow-jit`,
  which V8 needs for its `MAP_JIT` code pages. `allow-unsigned-executable-memory` is
  deliberately not granted.
- **Notarisation** runs automatically when signing is enabled _and_ `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` are all set; otherwise it is skipped.
  electron-builder also supports App Store Connect API keys (`APPLE_API_KEY`,
  `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`), which Apple recommends; to use them, export
  those variables in the workflow's macOS signing step instead.
- **Windows signing** is enabled when `WIN_CSC_LINK` is set. Cloud signing services (for
  example Azure Trusted Signing) can be configured through electron-builder's
  `win.azureSignOptions` instead.

To create the base64 value of a certificate: `base64 -i certificate.p12 | pbcopy` (macOS)
or `[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx"))` (PowerShell).

Secrets are passed only through the environment of the single packaging step of the
matching OS (never through `$GITHUB_ENV`), so no other step or third-party action can
read them, and they are never printed. The packaging job runs `npm ci --ignore-scripts`,
so no dependency install script runs in the job that handles the secrets. All actions
are pinned to full commit SHAs (updated by hand, see
[Updating dependencies](development.md#updating-dependencies)).
Forks do not receive secrets, so release builds from forks are always unsigned.

## Hardening that ships with every build

`electron-builder.yml` flips these [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)
at package time:

| Fuse                                    | Value | Effect                                                          |
| --------------------------------------- | ----- | --------------------------------------------------------------- |
| `runAsNode`                             | off   | `ELECTRON_RUN_AS_NODE` cannot turn the app into a Node runtime. |
| `enableCookieEncryption`                | on    | Cookies on disk are encrypted with the OS keychain.             |
| `enableNodeOptionsEnvironmentVariable`  | off   | `NODE_OPTIONS` is ignored.                                      |
| `enableNodeCliInspectArguments`         | off   | `--inspect` and friends are ignored.                            |
| `enableEmbeddedAsarIntegrityValidation` | on    | The `app.asar` archive is integrity-checked (macOS, Windows).   |
| `onlyLoadAppFromAsar`                   | on    | Code is loaded only from the verified `app.asar`.               |
| `grantFileProtocolExtraPrivileges`      | off   | `file://` gets no extra privileges (the app uses `mpp-app://`). |

## After the release

- Check that the **latest release** badge in the README points to the new version.
- Close the milestone, if any, and announce the release.
- If a release is broken, mark it as a pre-release or delete it and ship a patch release;
  never re-use a version number or move a published tag.
