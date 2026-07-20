# Features

Tracks what this fork adds on top of upstream `barakh.vscode-xschem-viewer@1.0.1` and how it
works. Planned work and bugs live in [TODO.md](TODO.md).

## Summary

Configurable library search paths for the in-editor XSchem viewer, so symbols outside the
schematic's own folder (PDK devices, shared block libraries, sibling blocks) resolve and render.
The **SkyWater SKY130** and **IHP SG13G2** device libraries are bundled and render with no
configuration.

## Symbol resolution order

When the viewer needs a referenced symbol/schematic `P` (e.g. `sg13g2_pr/sg13_lv_nmos.sym`), it
tries, in order, and uses the first that returns a file:

1. **`https://…`** — direct fetch (unchanged from upstream).
2. **Absolute refs** (`P` starts with `/`) — if `P` falls under a configured library root, it is
   mapped to that root's webview URI. Absolute refs outside every configured root are refused. *(new)*
3. **Bundled library prefixes** — the extension's built-in map (`devices/`, `sky130_*`, `sg13g2_*`,
   …). *Changed:* on a miss/blocked fetch it now **falls through** instead of aborting; the
   `sg13g2_*` (IHP) entries now point at the bundled library instead of a CSP-blocked GitHub URL.
4. **Configured search roots** — each root in `xschem.libraryPaths` (plus auto-detected
   `xschemrc` directories) is tried as `<root>/P`. *(new)*
5. **Schematic-relative** — resolved against the opened schematic's directory (upstream fallback).
6. **Bare-name fallback** — a name with no `/` is retried as `devices/<name>`.

Every fetch is guarded, so a CSP-blocked or missing candidate becomes a miss and falls through
rather than throwing.

## Settings

| Setting | Default | Behavior |
|---|---|---|
| `xschem.libraryPaths` | `[]` | Ordered `XSCHEM_LIBRARY_PATH`-style roots. Variables: `${env:VAR}`, `~`, `${workspaceFolder:NAME}` (named multi-root folder), bare `${workspaceFolder}` (schematic's own/innermost folder). Relative entries resolve against the schematic's workspace folder. Entries that aren't existing directories are skipped (logged under `resolveDebug`). |
| `xschem.autoDetectXschemrc` | `true` | Walks up from the schematic's directory to the workspace root and adds every directory containing an `xschemrc` file. It also parses that file's `append XSCHEM_LIBRARY_PATH` lines, resolving the `[file dirname [info script]]` idiom to the rc's directory. Lines using `$env(...)` or `source` (i.e. a foundry/PDK `xschemrc` that may point out of tree) are skipped, and parsed roots are only added if they exist and lie inside the workspace — so out-of-tree PDKs stay opt-in via `xschem.libraryPaths`. |
| `xschem.includeWorkspaceFolders` | `false` | When enabled, adds only the schematic's own workspace folder to the webview's allowed roots (relative `../` sub-block refs). Off by default to keep the read scope minimal. |
| `xschem.resolveDebug` | `false` | Logs each resolution attempt and skipped path to the webview console. |

## Implementation

Two built files are patched (the upstream TypeScript source is not vendored):

- **`dist/assets/index.js`** — the Tiny Tapeout viewer bundle. The `fetchContent` resolver in
  its library manager is rewritten per the order above and reads `window.XSCHEM_EXTRA_LIBRARY_ROOTS`
  (search roots) and `window.XSCHEM_ROOT_MAP` (`{fs, uri}` pairs, for absolute refs) at fetch time.
  The bundled library map's `sg13g2_*` entries are repointed from the GitHub URL to `xschem_lib/`.
- **`dist/xschem_lib/`** — bundled symbol libraries; each PDK is namespaced under its own
  `xschem_lib/<pdk>/` subdir (`sky130/`, `ihp-sg13g2/`) so PDK libraries never share a directory,
  with the library map's `url` pointing at the subdir. Generic/stock libs (`devices/`, `stdcells/`,
  `mips_cpu/`) stay at the top level. The IHP SG13G2 libraries (`ihp-sg13g2/sg13g2_pr`,
  `ihp-sg13g2/sg13g2_stdcells`) are added by this fork.
- **`dist/extension.cjs`** — the VS Code extension host. It reads the settings, expands variables,
  computes the search roots (config + auto-detected/parsed `xschemrc`), adds those directories
  (and optionally the schematic's own workspace folder) to the webview `localResourceRoots`, and
  injects the roots, the absolute-ref root map, and the debug flag into the webview HTML via a
  nonce'd inline script.
- **`package.json`** — declares the four settings; version bumped to `1.2.x`.

## Verification

A committed, dependency-free test suite (`npm test`) runs on Node 18/20/22 in CI and also builds
the VSIX. It extracts the **shipped** resolver and config helpers and drives them against the
bundled libraries and fixtures:

- **`test/resolver.test.cjs`** — the real `fetchContent`, `fetch` mapped to the filesystem and the
  GitHub CSP block simulated: bundled sky130/IHP/devices resolve, configured-root and
  schematic-relative refs resolve, an absolute ref under a configured root resolves, and unknown /
  out-of-root absolute refs are refused.
- **`test/config.test.cjs`** — `xExpand`/`xLibDirs`/`xParseAppends`: variable expansion,
  named-folder token, `xschemrc`-append parsing, out-of-workspace gating, non-existent-path skipping.
- **`test/manifest.test.cjs`** — manifest settings/defaults, both bundles parse, the patches are
  intact, the IHP remap is complete, and bundled IHP symbols retain their Apache-2.0 headers.

Not covered: a headless webview render test (the WASM viewer itself is not exercised in CI). The
earlier manual end-to-end check (bio-afe SRMC drawings) resolved **19/19** symbols vs **8/19** on
the upstream resolver.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
