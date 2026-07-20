# Xschem Viewer (Configurable)

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

## Install

**From the prebuilt VSIX** (in this repo):

```bash
code --install-extension xschem-viewer-configurable-1.1.1.vsix --force
```

Then run **Developer: Reload Window** (Command Palette). Reloading is required after any
(re)install for the new version and its settings schema to activate.

## Settings

| Setting | Default | Description |
|---|---|---|
| `xschem.libraryPaths` | `[]` | `XSCHEM_LIBRARY_PATH`-style search roots. A ref `foo/bar.sym` is looked up as `<root>/foo/bar.sym`. Supports `${env:VAR}`, `~`, `${workspaceFolder:NAME}`, and bare `${workspaceFolder}`. Non-existent entries are skipped. |
| `xschem.autoDetectXschemrc` | `true` | Walk up from the schematic to the workspace root, adding any directory that contains an `xschemrc` as a search root. Resolves in-repo `shared/…` and sibling blocks with no configuration. |
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

## Build the VSIX from source

Requires `node` and `zip`:

```bash
./build-vsix.sh
```

This regenerates `xschem-viewer-configurable-<version>.vsix` from the tree.

## Attribution & license

- Original extension © Barak Hoffer — [barakhoffer/vscode-xschem-viewer](https://github.com/barakhoffer/vscode-xschem-viewer)
- Embedded viewer: [TinyTapeout/xschem-viewer](https://github.com/TinyTapeout/xschem-viewer)
- This is a **modified** distribution; the changes are described in [FEATURE.md](FEATURE.md).

Licensed under the Apache License 2.0 — see [LICENSE.txt](LICENSE.txt).
