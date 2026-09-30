# Installation

MarkDown++ runs on **macOS** (Apple silicon and Intel), **Windows** (x64 and arm64) and
**Linux** (x64 and arm64). Every release ships both an **installer** and a **portable**
build for each platform. All files are attached to the
[GitHub release](https://github.com/Amadudl/MarkDownPlusPlus/releases/latest).

- [Unsigned builds and verifying a download](#unsigned-builds-and-verifying-a-download)
- [Which file do I need?](#which-file-do-i-need)
- [macOS](#macos)
- [Windows](#windows)
- [Linux](#linux)
- [Portable mode and the data folder](#portable-mode-and-the-data-folder)
- [Where settings are stored](#where-settings-are-stored)
- [Uninstalling](#uninstalling)
- [Building from source](#building-from-source)

## Unsigned builds and verifying a download

MarkDown++ is free, open-source software, built entirely in public: every release file is
produced by the [Release workflow](../.github/workflows/release.yml) on GitHub's servers
from the tagged source code — nobody uploads binaries by hand. The project deliberately
does **not** buy commercial code-signing certificates (Apple Developer Program, Windows
code-signing CAs), so macOS and Windows show a one-time warning on first launch; how to
confirm it is described per OS below. This is normal for community-built open-source apps
and entirely legal.

Instead of a paid certificate, every release gives you two free ways to check that a file
is genuine and unmodified:

1. **Checksums.** Each release has a `SHA256SUMS.txt`. Compare it with the checksum of
   your download:

   ```bash
   # macOS / Linux, in the folder with the download and SHA256SUMS.txt
   shasum -a 256 --ignore-missing -c SHA256SUMS.txt
   ```

   ```powershell
   # Windows PowerShell: compare the output with the line in SHA256SUMS.txt
   Get-FileHash .\MarkDownPlusPlus-<version>-win-x64-setup.exe -Algorithm SHA256
   ```

2. **Build provenance attestation** (recommended). GitHub records, with a keyless
   [Sigstore](https://www.sigstore.dev/) signature, which workflow, repository and commit
   built each file. With the [GitHub CLI](https://cli.github.com/):

   ```bash
   gh attestation verify MarkDownPlusPlus-<version>-mac-arm64.dmg --repo Amadudl/MarkDownPlusPlus
   ```

   A successful check proves the file was built by this repository's release workflow and
   has not been changed since. Attestations exist for releases from 1.0.3 on.

You can also [build MarkDown++ from source](#building-from-source) yourself.

## Which file do I need?

Artifact names follow the pattern `MarkDownPlusPlus-<version>-<os>-<arch>[-suffix].<ext>`.

| Platform                          | Architecture            | Installer                | Portable                                           |
| --------------------------------- | ----------------------- | ------------------------ | -------------------------------------------------- |
| macOS                             | `arm64` (Apple silicon) | `…-mac-arm64.dmg`        | `…-mac-arm64.zip`                                  |
| macOS                             | `x64` (Intel)           | `…-mac-x64.dmg`          | `…-mac-x64.zip`                                    |
| Windows                           | `x64`, `arm64`          | `…-win-<arch>-setup.exe` | `…-win-<arch>-portable.exe`                        |
| Linux (Debian, Ubuntu, Mint, …)   | `x64`, `arm64`          | `…-linux-<arch>.deb`     | `…-linux-<arch>.AppImage`, `…-linux-<arch>.tar.gz` |
| Linux (Fedora, RHEL, openSUSE, …) | `x64`                   | `…-linux-x86_64.rpm`     | `…-linux-<arch>.AppImage`, `…-linux-<arch>.tar.gz` |

> [!NOTE]
> Linux package formats use their native architecture names, so the exact suffix can be
> `amd64` / `x86_64` / `x64` or `arm64` / `aarch64` depending on the format.

Not sure which architecture you have?

- **macOS:** Apple menu → **About This Mac**. "Chip: Apple M…" means `arm64`; "Processor: Intel" means `x64`.
- **Windows:** **Settings → System → About → System type**.
- **Linux:** run `uname -m` (`x86_64` = x64, `aarch64` = arm64).

## macOS

### Installer (`.dmg`)

1. Open the downloaded `.dmg`.
2. Drag **MarkDown++** into the **Applications** folder.
3. Eject the disk image and start MarkDown++ from Launchpad, Spotlight or Applications.

### Portable (`.zip`)

Unzip the archive and run `MarkDown++.app` from wherever you like (for example a USB
drive). No installation is required. See
[portable mode](#portable-mode-and-the-data-folder) for where settings are stored.

### First launch (Gatekeeper)

The macOS builds are not notarised by Apple (see
[unsigned builds](#unsigned-builds-and-verifying-a-download)), so the first launch shows
_"Apple could not verify "MarkDown++" is free of malware"_. To allow it once:

1. Try to open **MarkDown++** and close the warning with **Done**.
2. Open **System Settings → Privacy & Security**, scroll down to the message about
   MarkDown++ and click **Open Anyway**, then confirm with your password or Touch ID.

On macOS 14 and older, Control-click (or right-click) the app in Finder, choose **Open**
and confirm with **Open** instead.

Alternatively, after checking the download, remove the quarantine flag your browser added
(this only affects this app):

```bash
xattr -dr com.apple.quarantine "/Applications/MarkDown++.app"
```

Only do this for files from the official
[releases page](https://github.com/Amadudl/MarkDownPlusPlus/releases).

## Windows

### Installer (`-setup.exe`)

1. Run `MarkDownPlusPlus-<version>-win-<arch>-setup.exe`.
2. Accept the license, choose the installation folder (per-user by default, no
   administrator rights required) and finish the wizard.
3. The installer creates a Start menu entry and a desktop shortcut and registers
   MarkDown++ as an editor for `.md`, `.markdown`, `.mdown`, `.mkd` and `.mkdn` files.

To make MarkDown++ the default app for Markdown files, right-click any `.md` file →
**Open with → Choose another app**, select **MarkDown++** and tick **Always use this app**.

### Portable (`-portable.exe`)

Run `MarkDownPlusPlus-<version>-win-<arch>-portable.exe` directly — nothing is installed.
The portable build always stores its data in a `MarkDownPlusPlus-data` folder next to
the `.exe` (see [portable mode](#portable-mode-and-the-data-folder)).

### First launch (SmartScreen)

The Windows builds are not signed with a commercial certificate (see
[unsigned builds](#unsigned-builds-and-verifying-a-download)), so Microsoft Defender
SmartScreen may show _"Windows protected your PC"_ for the installer or the portable
`.exe`. Click **More info** and then **Run anyway**. Your browser may also ask whether to
keep the download — choose **Keep**. Only do this for files from the official releases
page.

## Linux

### Debian / Ubuntu (`.deb`)

```bash
sudo apt install ./MarkDownPlusPlus-<version>-linux-<arch>.deb
```

### Fedora / RHEL / openSUSE (`.rpm`)

```bash
sudo dnf install ./MarkDownPlusPlus-<version>-linux-x86_64.rpm     # Fedora, RHEL
sudo zypper install ./MarkDownPlusPlus-<version>-linux-x86_64.rpm  # openSUSE
```

Both packages install a desktop entry (category _Office / Text Editor_) and register the
`text/markdown` MIME type. Start the app from your application launcher or with
`markdownplusplus`.

### AppImage (portable)

```bash
chmod +x MarkDownPlusPlus-<version>-linux-<arch>.AppImage
./MarkDownPlusPlus-<version>-linux-<arch>.AppImage
```

AppImages need FUSE 2. On Ubuntu 22.04 and newer install it with
`sudo apt install libfuse2` (`libfuse2t64` on Ubuntu 24.04).

### tar.gz (portable)

```bash
tar -xzf MarkDownPlusPlus-<version>-linux-<arch>.tar.gz
cd MarkDownPlusPlus-<version>-linux-<arch>   # folder name may differ slightly
./markdownplusplus
```

### Sandbox note

MarkDown++ is built to run with the Chromium sandbox enabled. On distributions that
restrict unprivileged user namespaces (for example Ubuntu 24.04 with AppArmor), the `.deb`
and `.rpm` packages work out of the box because they install the sandbox helper with the
required permissions. If the tar.gz build refuses to start with a sandbox error, install
the `.deb`/`.rpm` package instead — do **not** run MarkDown++ with `--no-sandbox`.

> [!WARNING]
> The AppImage launcher (`AppRun`, generated by electron-builder) checks whether
> unprivileged user namespaces are available and, if they are not, starts the app with
> `--no-sandbox` so that it does not crash. On such systems, prefer the `.deb` / `.rpm`
> package, which keeps the sandbox enabled.

Whenever MarkDown++ detects that it runs without the sandbox, it shows a warning at
startup with **Continue** and **Quit**. Tick **Don't show this again** to silence it
(stored as `sandbox-warning.json` in the data folder; delete that file to get the warning
back). To keep using the AppImage with the sandbox, allow unprivileged user namespaces,
for example with an AppArmor profile for the AppImage or, system-wide and less strict,
`sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`.

## Portable mode and the data folder

MarkDown++ stores settings, the recent-files list, the session (open tabs) and window
state in a **data folder**. In portable mode that folder is called
**`MarkDownPlusPlus-data`** and lives next to the application, so you can carry
MarkDown++ and all of its settings on a USB drive.

| Build                   | Portable mode                                                                                                                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows `-portable.exe` | **Always on.** Data is stored in `MarkDownPlusPlus-data` next to the `.exe`; the folder is created automatically.                                                                                                                                  |
| Linux AppImage          | **Opt-in.** Create an empty `MarkDownPlusPlus-data` folder next to the `.AppImage` file.                                                                                                                                                           |
| Linux tar.gz            | **Opt-in.** Create an empty `MarkDownPlusPlus-data` folder next to the `markdownplusplus` executable.                                                                                                                                              |
| macOS zip / dmg         | Uses the standard per-user location. Portable mode would need a `MarkDownPlusPlus-data` folder inside the app bundle (`MarkDown++.app/Contents/MacOS/`), which breaks the bundle's signature, so it is not supported.                              |
| Installers              | Use the standard per-user location, unless a `MarkDownPlusPlus-data` folder exists next to the installed executable (Windows NSIS `MarkDown++.exe`, deb/rpm `markdownplusplus`); then that folder is used, exactly as for the opt-in builds above. |

The About page shows whether the app runs in portable mode: **Help → About MarkDown++** on
Windows and Linux, **MarkDown++ → About MarkDown++** on macOS, or **Settings → About** on
any platform.
To move from an installed copy to a portable one, copy the files from the per-user
location below into the `MarkDownPlusPlus-data` folder.

## Where settings are stored

Outside portable mode, data lives in Electron's standard per-user directory:

| OS      | Location                                                         |
| ------- | ---------------------------------------------------------------- |
| macOS   | `~/Library/Application Support/MarkDown++/`                      |
| Windows | `%APPDATA%\MarkDown++\`                                          |
| Linux   | `$XDG_CONFIG_HOME/MarkDown++/` (usually `~/.config/MarkDown++/`) |

| File                   | Contents                                                                   |
| ---------------------- | -------------------------------------------------------------------------- |
| `settings.json`        | All [settings](user-guide.md#settings-reference), including custom themes. |
| `recent-files.json`    | The recent-files list.                                                     |
| `session.json`         | The tabs to restore on the next start.                                     |
| `window-state.json`    | Window size, position and maximised state.                                 |
| `sandbox-warning.json` | Only present after "Don't show this again" in the sandbox warning.         |

The folder also contains Chromium's cache. Deleting the folder resets MarkDown++ to its
defaults. Your documents are never stored there.

## Uninstalling

| Build             | How to uninstall                                                            |
| ----------------- | --------------------------------------------------------------------------- |
| macOS             | Quit MarkDown++ and move `MarkDown++.app` to the Bin.                       |
| Windows installer | **Settings → Apps → Installed apps → MarkDown++ → Uninstall**.              |
| Windows portable  | Delete the `.exe` and its `MarkDownPlusPlus-data` folder.                   |
| Debian / Ubuntu   | `sudo apt remove markdownplusplus`                                          |
| Fedora / RHEL     | `sudo dnf remove markdownplusplus`                                          |
| AppImage / tar.gz | Delete the file or folder (and its `MarkDownPlusPlus-data` folder, if any). |

Uninstalling keeps your settings on purpose, so a reinstall picks up where you left off.
To remove them too, delete the folder listed in
[Where settings are stored](#where-settings-are-stored).

## Building from source

You need [Node.js](https://nodejs.org/) **22.12 or newer** (the exact version is in
`.nvmrc`) and Git. Building Linux `.rpm` packages additionally requires `rpmbuild`
(`sudo apt install rpm` on Debian/Ubuntu).

```bash
git clone https://github.com/Amadudl/MarkDownPlusPlus.git
cd MarkDownPlusPlus
npm ci
npm run package          # installer + portable build for the current OS
```

Artifacts are written to `release/`. Platform-specific variants are
`npm run package:mac`, `npm run package:win` and `npm run package:linux`. Local builds
are not code-signed. See [development.md](development.md#packaging-locally) for details.
