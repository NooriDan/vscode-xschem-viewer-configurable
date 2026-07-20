# Xschem Viewer (Configurable)

[![CI](https://github.com/NooriDan/vscode-xschem-viewer-configurable/actions/workflows/ci.yml/badge.svg)](https://github.com/NooriDan/vscode-xschem-viewer-configurable/actions/workflows/ci.yml)
[![Release](https://github.com/NooriDan/vscode-xschem-viewer-configurable/actions/workflows/release.yml/badge.svg)](https://github.com/NooriDan/vscode-xschem-viewer-configurable/releases)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE.txt)

A fork of [`barakh.vscode-xschem-viewer`](https://github.com/barakhoffer/vscode-xschem-viewer)
that adds **configurable XSchem library search paths**, so schematics render even when their
symbols live in a PDK, a shared block library, or sibling folders — not just next to the `.sch`.

The extension renders `.sch` / `.sym` files inside VS Code using the
[xschem-viewer](https://github.com/TinyTapeout/xschem-viewer) (xschem compiled to WASM) by
Tiny Tapeout.

### Documentation

| | |
|---|---|
| **[Configuration guide](docs/CONFIGURATION.md)** | Where settings go, variables, `PDK_ROOT`, worked recipes, multi-root, Remote/WSL/containers |
| **[Troubleshooting](docs/TROUBLESHOOTING.md)** | "Symbol not found", reading the debug log, every failure mode |
| [FEATURE.md](FEATURE.md) | How resolution works internally; the implementation |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Project layout, development, releasing |
| [TODO.md](TODO.md) | Planned work and known limitations |
| [CHANGELOG.md](CHANGELOG.md) | Release history |

## Why this fork

The upstream viewer resolves symbols through a **hard-coded** library map plus a
schematic-relative fallback, and the webview's Content-Security-Policy blocks cross-origin
fetches. In practice that means:

- **PDK devices don't render** — e.g. `sg13g2_pr/*` is mapped to a `raw.githubusercontent.com`
  URL that the webview CSP blocks, so it silently fails.
- **Sub-blocks outside the schematic's folder don't render** — a `shared/…` library or a
  sibling-block symbol one directory up is unreachable.

This fork adds real search-path configuration (an `XSCHEM_LIBRARY_PATH`-style list), auto-detects
in-repo `xschemrc` roots, and only widens the webview's file access to the directories you
actually point it at.

## Bundled PDKs (render with zero config)

- **SkyWater SKY130** — `sky130_fd_pr/*`, `sky130_stdcells/*` (from upstream).
- **IHP SG13G2** — `sg13g2_pr/*`, `sg13g2_stdcells/*` (added by this fork). Previously these only
  loaded from GitHub, which the webview CSP blocks; they are now bundled and resolve offline.
- xschem stock `devices/*`.

Other PDKs and private libraries are opt-in via `xschem.libraryPaths` (see below). See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled-content attribution.

## Install

Download the latest `.vsix` from the
[**Releases**](https://github.com/NooriDan/vscode-xschem-viewer-configurable/releases) page (or use
the copy committed in this repo), then:

```bash
code --install-extension xschem-viewer-configurable-<version>.vsix --force
```

Then run **Developer: Reload Window** (Command Palette). Reloading is required after any
(re)install for the new version and its settings schema to activate.

> This is a standalone extension (id `NooriDan.xschem-viewer-configurable`). If you have the
> upstream `barakh.vscode-xschem-viewer` installed, uninstall it to avoid two editors for `.sch`.

> **Schematics opening as plain text?** The extension does not declare untrusted-workspace support,
> so it stays disabled in **Restricted Mode** and the Xschem editor never registers. Check the
> status bar for a shield icon and choose *Trust the authors of this folder*.
> See [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Settings

| Setting | Default | Description |
|---|---|---|
| `xschem.libraryPaths` | `[]` | `XSCHEM_LIBRARY_PATH`-style search roots. A ref `foo/bar.sym` is looked up as `<root>/foo/bar.sym`. Supports `${env:VAR}`, `~`, `${workspaceFolder:NAME}`, and bare `${workspaceFolder}`. Non-existent entries are skipped. |
| `xschem.autoDetectXschemrc` | `true` | Walk up from the schematic to the workspace root, adding any directory that contains an `xschemrc` as a search root. Resolves in-repo `shared/…` and sibling blocks with no configuration. |
| `xschem.followXschemrcPdkSource` | `false` | **Opt-in.** Follow an `xschemrc`'s `source …/libs.tech/xschem/xschemrc` line to add that PDK's library directory (see [below](#following-a-pdk-source-line)). Only **open** PDKs are followed. |
| `xschem.includeWorkspaceFolders` | `false` | When on, also expose the schematic's **own** workspace folder (for relative `../` refs). Off keeps the webview's read scope minimal. |
| `xschem.resolveDebug` | `false` | Log every symbol-resolution attempt. Output splits across **two** consoles — resolver attempts go to the webview (*Developer: Open Webview Developer Tools*), skipped/refused paths to the extension host (*Help ▸ Toggle Developer Tools*). See [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md#turn-on-diagnostics). |

📖 **Where do these go, and how do variables/environment work?** See the
**[Configuration guide](docs/CONFIGURATION.md)** — settings scopes (note: per-folder settings do
*not* apply in multi-root workspaces), variable expansion, how `PDK_ROOT` reaches the extension,
worked recipes, and Remote-SSH/WSL/container notes.

> **Applying a change:** settings are read when a schematic tab is **opened** — there is no live
> config listener. After editing any `xschem.*` setting, close and reopen the schematic tab
> (switching away and back is not enough; the webview is retained). After installing or updating the
> extension, run *Developer: Reload Window*. After changing an environment variable, fully quit and
> relaunch VS Code.

### Example

For a multi-root workspace with a `platform` folder and an IHP PDK:

```jsonc
"xschem.libraryPaths": [
  "${env:PDK_ROOT}/ihp-sg13g2/libs.tech/xschem",
  "${workspaceFolder:platform}/docker/xschem_library"
]
```

Absolute paths are always unambiguous:

```jsonc
"xschem.libraryPaths": [
  "/opt/pdks/ihp-sg13g2/libs.tech/xschem"
]
```

> Note on `${workspaceFolder}`: in a multi-root workspace, bare `${workspaceFolder}` resolves to
> the opened schematic's **own** (innermost) folder — e.g. a submodule root, not the meta-root.
> Use `${workspaceFolder:NAME}` when you need a specific named folder.

### Following a PDK `source` line

Most repos don't list PDK symbols in their `xschemrc` — they pull the PDK in:

```tcl
set ::env(PDK) ihp-sg13g2
source $env(PDK_ROOT)/$env(PDK)/libs.tech/xschem/xschemrc
```

That line points **outside** your workspace, so it is skipped by default. Turn on
`xschem.followXschemrcPdkSource` to follow it and pick up `$PDK_ROOT/$PDK/libs.tech/xschem`
automatically, instead of listing the path yourself in `xschem.libraryPaths`:

```jsonc
"xschem.followXschemrcPdkSource": true
```

Three gates apply, because this is the one place the extension reads out of tree:

1. It's **opt-in** — off unless you enable it.
2. Only **open** PDKs are followed: the `…/<pdk>/libs.tech/xschem` segment of the *resolved* path
   must be `sky130*`, `gf180mcu*`, `ihp-sg13g2`, or `sg13g2`. A proprietary foundry kit is refused
   even if it's installed. Gating on the resolved path means an `xschemrc` can't claim an open PDK
   name and then resolve elsewhere.
3. Every variable must expand — an unset `PDK_ROOT` is a refusal, not a path rooted at `/` — and the
   directory must exist.

Only the PDK's `libs.tech/xschem` directory is exposed to the webview, never `$PDK_ROOT` itself.
Enable `xschem.resolveDebug` to see what was followed or refused.

## Commands

Two toolbar buttons appear on the editor title bar for `.sch` files. Both shell out to a **local
`xschem` installation** on your `PATH` — they are not provided by the viewer:

| Button | Command | Runs |
|---|---|---|
| ▶ | *Run Xschem Simulation* | `xschem -x -n -S -q <file>` |
| ✏ | *Open in Xschem* | `xschem <file>` |

> If `xschem` isn't installed, these currently fail **silently** — no error is surfaced. Rendering
> inside VS Code does not need `xschem` installed; only these two buttons do.

## Optional: IHP test galleries

IHP's `sg13g2_tests` example schematics aren't bundled, to keep the install lean. Fetch them when
you need them (git-ignored, and excluded from the VSIX):

```bash
npm run fetch:ihp-tests                      # fetch
scripts/fetch-ihp-testlibs.sh --remove       # undo  (via npm: npm run fetch:ihp-tests -- --remove)
```

## Development

Building, testing, rebuilding the viewer from TypeScript source, and releasing are covered in
**[CONTRIBUTING.md](CONTRIBUTING.md)**. In short:

```bash
npm test                  # dependency-free: resolver + config + manifest/integrity
npm run test:smoke        # headless render check (needs playwright + openssl)
./build-vsix.sh           # package the VSIX          (needs node, zip, rsync)
./build-from-source.sh    # rebuild dist/assets from upstream TS (needs node, npm, git)
```

CI runs the suite on Node 18/20/22 and builds the VSIX on every pull request and every push to
`main` (`.github/workflows/ci.yml`); `smoke.yml` runs the headless render check.

## Attribution & license

- Original extension © Barak Hoffer — [barakhoffer/vscode-xschem-viewer](https://github.com/barakhoffer/vscode-xschem-viewer)
- Embedded viewer: [TinyTapeout/xschem-viewer](https://github.com/TinyTapeout/xschem-viewer)
- Bundled symbol libraries (SKY130, IHP SG13G2, xschem devices): see
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- This is a **modified** distribution; the changes are described in [FEATURE.md](FEATURE.md). It is
  an independent fork and is **not affiliated with or endorsed by** the upstream authors.

Modifications © 2026 NooriDan. Licensed under the Apache License 2.0 — see [LICENSE.txt](LICENSE.txt).
Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
