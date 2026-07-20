# Xschem Viewer (Configurable)

[![CI](https://github.com/NooriDan/vscode-xschem-viewer-configurable/actions/workflows/ci.yml/badge.svg)](https://github.com/NooriDan/vscode-xschem-viewer-configurable/actions/workflows/ci.yml)
[![Release](https://github.com/NooriDan/vscode-xschem-viewer-configurable/actions/workflows/release.yml/badge.svg)](https://github.com/NooriDan/vscode-xschem-viewer-configurable/releases)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE.txt)

A fork of [`barakh.vscode-xschem-viewer`](https://github.com/barakhoffer/vscode-xschem-viewer)
that adds **configurable XSchem library search paths**, so schematics render even when their
symbols live in a PDK, a shared block library, or sibling folders — not just next to the `.sch`.

The extension renders `.sch` / `.sym` files inside VS Code using the
[xschem-viewer](https://github.com/TinyTapeout/xschem-viewer) (xschem compiled to WASM) by
Tiny Tapeout. See [FEATURE.md](FEATURE.md) for how resolution works and [TODO.md](TODO.md) for
planned work and known limitations.

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

## Settings

| Setting | Default | Description |
|---|---|---|
| `xschem.libraryPaths` | `[]` | `XSCHEM_LIBRARY_PATH`-style search roots. A ref `foo/bar.sym` is looked up as `<root>/foo/bar.sym`. Supports `${env:VAR}`, `~`, `${workspaceFolder:NAME}`, and bare `${workspaceFolder}`. Non-existent entries are skipped. |
| `xschem.autoDetectXschemrc` | `true` | Walk up from the schematic to the workspace root, adding any directory that contains an `xschemrc` as a search root. Resolves in-repo `shared/…` and sibling blocks with no configuration. |
| `xschem.followXschemrcPdkSource` | `false` | **Opt-in.** Follow an `xschemrc`'s `source …/libs.tech/xschem/xschemrc` line to add that PDK's library directory (see [below](#following-a-pdk-source-line)). Only **open** PDKs are followed. |
| `xschem.includeWorkspaceFolders` | `false` | When on, also expose the schematic's **own** workspace folder (for relative `../` refs). Off keeps the webview's read scope minimal. |
| `xschem.resolveDebug` | `false` | Log every symbol-resolution attempt to the webview Dev Tools console (*Help ▸ Toggle Developer Tools*). |

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

## Build the VSIX from source

Requires `node` and `zip`:

```bash
./build-vsix.sh
```

This regenerates `xschem-viewer-configurable-<version>.vsix` from the tree.

## Rebuild the viewer from TypeScript source

`dist/assets/index.js` is not hand-edited — it is reproducible from the upstream TypeScript sources.
The viewer's WebAssembly is checked into upstream's repo, so this needs only Node (no emscripten):

```bash
./build-from-source.sh              # clone pinned upstream, patch, build, diff — stages only
./build-from-source.sh --install    # overwrite dist/assets, then run npm test
```

The resolver change lives as a readable patch in [`patches/xschem-viewer/`](patches/xschem-viewer/)
— the same patch offered upstream (see [docs/UPSTREAMING.md](docs/UPSTREAMING.md)).

## Optional: IHP test galleries

IHP's `sg13g2_tests` example schematics aren't bundled, to keep the install lean. Fetch them when
you need them (git-ignored, and excluded from the VSIX):

```bash
npm run fetch:ihp-tests             # or: scripts/fetch-ihp-testlibs.sh --remove
```

## Tests

Node-only, no dependencies. They extract the shipped resolver and config helpers and drive them
against the bundled libraries and fixtures (see [FEATURE.md](FEATURE.md#verification)):

```bash
npm test
```

- `test/resolver.test.cjs` — symbol resolution (bundled sky130/IHP/devices, configured roots,
  schematic-relative, absolute refs, and refusals).
- `test/config.test.cjs` — variable expansion, library-dir resolution, `xschemrc`-append parsing,
  and the open-PDK `source`-following gates.
- `test/manifest.test.cjs` — manifest, bundle integrity, that the patches are intact, and that every
  fixture is valid xschem.

CI runs the suite on Node 18/20/22 and builds the VSIX on every push/PR
(`.github/workflows/ci.yml`).

### Render smoke test

`npm test` proves symbols *resolve*; it does not prove the viewer *draws*. The smoke test drives the
real WASM viewer in headless Chromium and checks the canvas actually has pixels:

```bash
npm i --no-save playwright && npx playwright install --with-deps chromium
npm run test:smoke
```

It renders `test/smoke/fixtures/smoke.sch` (IHP SG13G2 nmos+pmos, SKY130 nfet, stock devices) and
asserts every symbol resolved and the SVG actually drew — currently 7/7 symbols, 97 shapes. A
screenshot is written to `test/smoke/render-smoke.png`.

Needs a Playwright browser and `openssl` (the harness serves over HTTPS, because the resolver loads
the top-level schematic via its `https://` branch). Kept out of `npm test`, which stays
dependency-free, and runs in its own workflow (`.github/workflows/smoke.yml`).

## Attribution & license

- Original extension © Barak Hoffer — [barakhoffer/vscode-xschem-viewer](https://github.com/barakhoffer/vscode-xschem-viewer)
- Embedded viewer: [TinyTapeout/xschem-viewer](https://github.com/TinyTapeout/xschem-viewer)
- Bundled symbol libraries (SKY130, IHP SG13G2, xschem devices): see
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- This is a **modified** distribution; the changes are described in [FEATURE.md](FEATURE.md). It is
  an independent fork and is **not affiliated with or endorsed by** the upstream authors.

Modifications © 2026 NooriDan. Licensed under the Apache License 2.0 — see [LICENSE.txt](LICENSE.txt).
Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
