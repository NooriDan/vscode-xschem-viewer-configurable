# Features

Tracks what this fork adds on top of upstream `barakh.vscode-xschem-viewer@1.0.1` and how it
works. Planned work and bugs live in [TODO.md](TODO.md).

## Summary

Configurable library search paths for the in-editor XSchem viewer, so symbols outside the
schematic's own folder (PDK devices, shared block libraries, sibling blocks) resolve and render.

## Symbol resolution order

When the viewer needs a referenced symbol/schematic `P` (e.g. `sg13g2_pr/sg13_lv_nmos.sym`), it
tries, in order, and uses the first that returns a file:

1. **`https://…`** — direct fetch (unchanged from upstream).
2. **Bundled library prefixes** — the extension's built-in map (`devices/`, `sky130_*`, …).
   *Changed:* on a miss/blocked fetch it now **falls through** instead of aborting.
3. **Configured search roots** — each root in `xschem.libraryPaths` (plus auto-detected
   `xschemrc` directories) is tried as `<root>/P`. *(new)*
4. **Schematic-relative** — resolved against the opened schematic's directory (upstream fallback).
5. **Bare-name fallback** — a name with no `/` is retried as `devices/<name>`.

Every fetch is guarded, so a CSP-blocked or missing candidate becomes a miss and falls through
rather than throwing.

## Settings

| Setting | Default | Behavior |
|---|---|---|
| `xschem.libraryPaths` | `[]` | Ordered `XSCHEM_LIBRARY_PATH`-style roots. Variables: `${env:VAR}`, `~`, `${workspaceFolder:NAME}` (named multi-root folder), bare `${workspaceFolder}` (schematic's own/innermost folder). Relative entries resolve against the schematic's workspace folder. Entries that aren't existing directories are skipped (logged under `resolveDebug`). |
| `xschem.autoDetectXschemrc` | `true` | Walks up from the schematic's directory to the workspace root and adds every directory containing an `xschemrc` file (mirrors xschem's `append XSCHEM_LIBRARY_PATH [file dirname [info script]]`). |
| `xschem.includeWorkspaceFolders` | `false` | When enabled, adds only the schematic's own workspace folder to the webview's allowed roots (relative `../` sub-block refs). Off by default to keep the read scope minimal. |
| `xschem.resolveDebug` | `false` | Logs each resolution attempt and skipped path to the webview console. |

## Implementation

Two built files are patched (the upstream TypeScript source is not vendored):

- **`dist/assets/index.js`** — the Tiny Tapeout viewer bundle. The `fetchContent` resolver in
  its library manager is rewritten per the order above and reads
  `window.XSCHEM_EXTRA_LIBRARY_ROOTS` at fetch time.
- **`dist/extension.cjs`** — the VS Code extension host. It reads the settings, expands
  variables, computes the search roots (config + auto-detected `xschemrc`), adds those
  directories (and optionally the schematic's own workspace folder) to the webview
  `localResourceRoots`, and injects the roots + debug flag into the webview HTML via a
  nonce'd inline script.
- **`package.json`** — declares the four settings; version bumped to `1.1.x`.

## Verification

- **Resolver:** driven end-to-end against a real IHP/analog schematic set (the bio-afe SRMC
  drawings) with `fetch` mapped to the real filesystem and the GitHub CSP block simulated.
  Result: **19/19** referenced symbols resolve, vs **8/19** with the upstream resolver
  (upstream fails exactly the `sg13g2_pr/*`, `shared/*`, and sibling-block refs).
- **Config helpers:** `xExpand`/`xLibDirs` unit-tested (variable expansion, named-folder token,
  non-existent-path skipping, defaults). All green.
- Not covered: a headless webview render test (the WASM viewer is not exercised in CI).

## Changelog

- **1.1.1** — `${workspaceFolder:NAME}` support; non-existent library paths skipped instead of
  silently added; `includeWorkspaceFolders` default → `false` and scoped to the schematic's own
  folder; corrected docs/example for `${workspaceFolder}` multi-root semantics.
- **1.1.0** — initial configurable-library-path fork over upstream 1.0.1.
