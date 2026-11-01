# Security policy

MarkDown++ opens documents from anywhere — downloads, e-mail attachments, cloned
repositories. We treat every document as untrusted input and take security reports
seriously.

## Supported versions

| Version | Supported                     |
| ------- | ----------------------------- |
| 1.0.x   | ✅ security fixes             |
| < 1.0   | ❌ pre-release, not supported |

Security fixes are released as patch versions of the latest minor release. Please always
update to the latest release.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public issues, discussions or
pull requests.**

Report them privately through GitHub's
[private vulnerability reporting](https://github.com/Amadudl/MarkDownPlusPlus/security/advisories/new)
(**Security → Advisories → Report a vulnerability**). Please include:

- the MarkDown++ version, operating system and distribution (installer / portable);
- a description of the issue and its impact;
- step-by-step reproduction instructions, ideally with a minimal Markdown document or
  theme file that triggers it;
- any suggested mitigation.

What to expect:

| Step                             | Target                                      |
| -------------------------------- | ------------------------------------------- |
| Acknowledgement of your report   | within 3 business days                      |
| Initial assessment and severity  | within 10 business days                     |
| Fix for critical / high severity | as fast as possible, usually within 30 days |

We will keep you informed, credit you in the advisory and release notes (unless you
prefer to stay anonymous) and coordinate the disclosure date with you. Please give us a
reasonable amount of time to release a fix before any public disclosure.

## Scope

In scope: the MarkDown++ application (main process, preload, renderer), its build and
release pipeline, and the packaged artifacts published on the releases page.

Out of scope: vulnerabilities in Electron, Chromium or other dependencies that are
already public and fixed upstream (please just open an issue asking for an update),
attacks that require an already compromised machine or physical access, and social
engineering.

## Security model

MarkDown++ is designed so that **opening a malicious document cannot run code or read
arbitrary files** (a document can only _display_ local image files, see
[Content](#content)). The key measures, and their limits, are:

### Process isolation

- The renderer runs with `sandbox: true`, `contextIsolation: true`,
  `nodeIntegration: false` and without `webviewTag`. It has **no Node.js access**.
- The preload exposes one narrow, typed API (`window.mpp`, defined by `MppApi` in
  `src/shared/types.ts`) through `contextBridge`. It never passes raw Electron objects to
  the page.
- DevTools are disabled in packaged builds.
- MarkDown++ never disables the Chromium sandbox itself. If it was started with
  `--no-sandbox` (for example by the AppImage launcher on systems without unprivileged
  user namespaces), it warns the user at startup and recommends the `.deb`/`.rpm` package.

### IPC

- Every channel name is defined once in `src/shared/ipc.ts`.
- Every handler in the main process verifies that the sender is the application's own
  frame and validates **all** arguments with zod before calling a service.
- File paths must be absolute. The main process enforces this file-access policy
  (`FileService`, `PathRegistry` and `SessionStore` in `src/main/services/`):
  - **Reading, writing, watching and reveal-in-folder require a granted path**, whatever
    the file's extension. Reads accept UTF-8 text files up to 50 MB only; the type and size
    checks and the read use one open file handle, so the checks apply to the file that is
    read.
  - **Grants** come from user actions only: a file picked in an open or save dialog, a
    file the OS asks MarkDown++ to open (command line, second instance, macOS
    `open-file`), a Markdown/text file dropped onto the window (the path comes from the
    dropped file itself, not from page script, and symlinks are resolved before the
    check), the recent-files list (written only by the main process) and the documents
    of the session file as it was found at startup.
  - **The session file cannot grant new files.** Saving a session keeps only paths that
    are already granted, and loading grants only documents recorded before any window
    was created.
  - Limits: grants last until the app quits and apply to all windows, so a compromised
    renderer could read and overwrite files you granted during that run, but no other
    files.

### Content

- A strict **Content Security Policy**: `default-src 'self'`, `script-src 'self'`, no
  `unsafe-eval`, images only from `'self' data: blob: mpp-file: https:`. `https:` is
  always allowed by the CSP (a page's CSP cannot change without a reload); the
  _Load remote images_ setting (off by default) is enforced by the app's image resolver
  (`resolveImageSrc` in `src/shared/file-url.ts`), which replaces remote images with a
  placeholder, and, as a second layer, by the main process, which cancels every remote
  image request of the app session while the setting is off (`src/main/remoteImages.ts`).
- **Raw HTML inside Markdown is never executed.** Exported HTML is sanitised with
  DOMPurify; the PDF and image exporters render in a hidden, sandboxed window with
  JavaScript disabled.
- Local images are served through the `mpp-file:` protocol, which only serves regular
  files with an image extension (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`,
  `.avif`, `.bmp`, `.ico`) of at most 50 MB, checked and read through one open file
  handle. A document cannot make the app read local files of any other type through it,
  but it can reference **any** image file on your local disks, not only images next to the
  document. On Windows, images on network
  (UNC) paths are only loaded from servers that host a file you opened, and device
  paths never, so a document cannot make the app connect to (and send your Windows
  credentials to) an arbitrary server.
- The bundled UI is served through the `mpp-app:` protocol instead of `file://`.
- Navigation and new windows are blocked. Links open in the OS browser only for
  allowlisted schemes (`https:`, `http:`, `mailto:`). `mailto:` links are reduced to their
  recipients and the `to`, `cc`, `bcc`, `subject` and `body` fields, so a document link
  cannot ask the mail client to attach a local file (`attach=`).
- All permission requests (camera, microphone, geolocation, notifications, …) are denied.
- Theme files are pure data validated against schemas; they cannot contain CSS or code.

### Packaging

- [Electron fuses](docs/release.md#hardening-that-ships-with-every-build) disable
  `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and `--inspect`, enforce ASAR integrity
  validation and loading the app only from the ASAR archive.
- macOS builds use the hardened runtime with a single entitlement (`allow-jit`).
- Dependencies are pinned in `package-lock.json`, GitHub Actions are pinned to full
  commit SHAs, both are updated deliberately and reviewed by the maintainers, `npm audit`
  must report no vulnerabilities, and the code is scanned with CodeQL
  on every push to `main`, every pull request to `main` and weekly.
- Release signing credentials are scoped to the single packaging step that needs them,
  and the release packaging job installs dependencies without lifecycle scripts.

### Updates

The update function (`src/main/services/updateService.ts`, user guide:
[Updates](docs/user-guide.md#updates)) is the only network access MarkDown++ makes on
its own. It is implemented without third-party code, on Electron's `net` module and
Node's `crypto`.

- **What is contacted:** the check sends one `GET` to
  `https://api.github.com/repos/Amadudl/MarkDownPlusPlus/releases/latest` (aborted after
  10 s without data from the server and after 30 s in total, at most 2 MB,
  `User-Agent: MarkDownPlusPlus/<version>`). GitHub sees your IP address and the app
  version, as with any download. No telemetry, identifiers or document data are sent.
  The requests use a separate in-memory session without cookies or credentials.
- **When:** once per launch, a few seconds after startup, unless
  **Settings → General → Check for updates at startup** (`general.checkForUpdatesOnStartup`)
  is off, and whenever you choose **Help → Check for Updates**. Development builds never
  check in the background.
- **What is downloaded:** only files of the release the main process fetched itself; the
  renderer passes no URL, only the version it was shown. Release data is validated with
  zod; download URLs must be exactly
  `https://github.com/Amadudl/MarkDownPlusPlus/releases/download/<tag>/<file>`. Every
  redirect is checked before it is followed against an allowlist (default deny) of
  `https:` hosts: `github.com`, `release-assets.githubusercontent.com` and
  `objects.githubusercontent.com`. `SHA256SUMS.txt` (at most 64 KB) must arrive within
  30 s in total. Packages are limited to the size GitHub reports for the file (at most
  600 MB) and abort after 30 s without data; there is no total time limit for them, so
  slow connections still finish. The download is paused while more than 4 MB wait to be
  written to disk, so memory use stays bounded.
- **Where:** setups and disk images are written to `updates` in the app's own user data
  folder (not the shared `%TEMP%`/`$TMPDIR`), with exclusive creation (`wx`) and mode
  `0600`. Every write is continued until all bytes are on disk. Verified setups and disk
  images left over by earlier runs are deleted at the next start; only files whose name
  exactly matches the updater's pattern (`tmp_<16 hex>_MarkDownPlusPlus-<version>-<package>`)
  are touched. An AppImage update is written next to the AppImage, so it can be renamed
  over it.
- **Verification:** before anything is opened or executed, the SHA-256 checksum of the
  downloaded file, read back from disk after it was closed, must match the entry for that
  file in the `SHA256SUMS.txt` of the same release. A mismatch, a missing entry or an
  incomplete download deletes the file. A Windows setup or an AppImage waits for the app
  to quit; it is hashed again right before it is started or renamed, and a file that
  changed or vanished in the meantime is deleted and never used. This protects against
  corrupted and tampered downloads from the storage hosts; it does not protect against a
  compromised GitHub repository or release (the checksum file comes from the same
  release), which is why the releases also carry build provenance attestations you can
  verify by hand. Files downloaded by the updater carry no Mark-of-the-Web (Windows) or
  quarantine flag (macOS), so SmartScreen and Gatekeeper do not check them again when
  they are opened; trust rests on the `SHA256SUMS.txt` of the same release.
- **Installing:** a Windows NSIS installation runs the verified setup with
  `/S --updated --force-run` only after the app has quit through the normal close flow.
  That quit always asks about every unsaved document, even when
  `general.confirmOnClose` is off (the close request carries the reason `update`);
  keeping a document open cancels the install, deletes the download and the update
  notice says so. macOS opens the verified disk image; you replace the app yourself. A
  Linux AppImage is replaced atomically (written next to it, then made executable and
  renamed over it) only after the same close flow, and relaunched. It counts as an
  AppImage only when `APPIMAGE` is set **and** the running executable lies inside the
  AppImage mount `APPDIR`; both variables are inherited by child processes, so a
  `.deb`/`.tar.gz` copy started from a terminal of another AppImage app never touches
  that app's file. Portable builds and `.deb`/`.rpm`/`.tar.gz` installations only open
  the release page through the external URL allowlist.
- **Test hook:** `MPP_UPDATE_API_URL` replaces the API URL only in unpackaged builds and
  only with a loopback address (E2E tests); packaged builds ignore it.

### Data

- MarkDown++ does not collect telemetry. Apart from the [update check](#updates), which
  you can turn off, it makes no network requests on its own. The only other network
  access is loading remote images in documents, which is **off by
  default** (`rendering.loadRemoteImages`): a remote image would tell its server when,
  from which IP address and with which browser version you opened a document (a
  tracking pixel). Enable it only if you trust the documents you open. The setting is
  enforced by the image resolver and, as a second layer, by the main process, which
  cancels remote image requests while it is off.
- Settings and session data are stored locally (see
  [installation.md](docs/installation.md#where-settings-are-stored)).
