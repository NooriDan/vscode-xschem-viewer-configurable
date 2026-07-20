# Changelog

All notable changes to **Xschem Viewer (Configurable)** are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## [1.4.0]

### Added
- **`xschem.followXschemrcPdkSource`** (default `false`) — opt-in following of an `xschemrc`'s
  `source $env(PDK_ROOT)/$env(PDK)/libs.tech/xschem/xschemrc` line, so an **open** PDK's symbols
  resolve without a manual `xschem.libraryPaths` entry. Gated three ways: opt-in, an open-PDK
  allowlist checked against the *resolved* path segment (`sky130*`, `gf180mcu*`, `ihp-sg13g2`,
  `sg13g2`) so a proprietary kit is refused even when present, and a full-expansion requirement so
  an unset `PDK_ROOT` is a refusal rather than a path rooted at `/`. Independent of
  `xschem.autoDetectXschemrc`, which still only ever adds in-workspace directories.
- **`./build-from-source.sh`** — rebuilds `dist/assets/` from the upstream TypeScript sources
  (pinned commit + `patches/xschem-viewer/*.patch`) instead of hand-patching the minified bundle.
  Stages and diffs by default; `--install` is required to overwrite the shipped assets. A rebuild
  reproduces `wacl.wasm` and `index.css` byte-identically and passes the full resolver suite.
- **`npm run test:smoke`** + a `Render smoke` CI workflow — drives the real WASM viewer in headless
  Chromium and asserts symbols resolve and the canvas is actually drawn. Kept out of `npm test`,
  which stays dependency-free.
- **`scripts/fetch-ihp-testlibs.sh`** (`npm run fetch:ihp-tests`) — fetches IHP's `sg13g2_tests`
  galleries on demand. Git-ignored and excluded from the VSIX, so the default install stays lean;
  the shipped library map already routes `sg13g2_test*` at them.
- **`docs/UPSTREAMING.md`** — ready-to-submit resolver patch and PR text. Nothing has been pushed;
  opening the PRs remains a human decision.

### Fixed
- Test fixtures `proj/altlib/widget.sym` and `proj/quotedlib/widget.sym` were missing the required
  `file_version=` field and failed to parse when opened in the viewer. A new dependency-free
  manifest check now asserts every fixture has a well-formed xschem version header.
- The resolver test extracted `fetchContent` by literal signature (`async fetchContent(i){`), which
  silently stops matching after any rebuild renames the parameter. It now matches by regex and
  resolves minified helper identifiers through a scope proxy, so it validates the committed bundle
  and a from-source rebuild alike.

## [1.3.0]

First independent open-source release under the `NooriDan.xschem-viewer-configurable` identity
(previously carried the upstream `barakh.vscode-xschem-viewer` publisher/ids).

### Changed
- **Standalone identity:** new publisher (`NooriDan`), extension id (`xschem-viewer-configurable`),
  custom-editor `viewType` (`xschemViewerConfigurable.editor`) and command ids
  (`xschemViewerConfigurable.*`), so it no longer collides with the upstream extension. User-facing
  settings stay under the intuitive `xschem.*` namespace.

### Added
- A one-time warning when an explicit `xschem.libraryPaths` entry doesn't resolve to a directory
  (catches typos without turning on `xschem.resolveDebug`).
- Release automation: tagging `v*` builds the VSIX and publishes a GitHub Release.
- `CHANGELOG.md`, `CONTRIBUTING.md`, issue template, and README badges.

## [1.2.2]
- Namespace bundled PDK libraries under per-PDK subdirectories (`xschem_lib/sky130/`,
  `xschem_lib/ihp-sg13g2/`) so PDK namespaces never share a directory. Schematic references
  (`sg13g2_pr/…`, `sky130_fd_pr/…`) are unchanged. Resolver test now extracts the real map (no drift).

## [1.2.1]
- Harden the `xschemrc`-append gate (adversarial review): no-workspace case falls back to the rc's
  own directory instead of ungating; containment check resolves symlinks; parser accepts the
  `[file dirname [file normalize [info script]]]` and quoted-append idioms.

## [1.2.0]
- **Bundle IHP SG13G2** device symbols and route `sg13g2_*` to the bundle so IHP renders offline
  with zero config (was blocked by the webview CSP fetching from GitHub).
- Absolute-symbol-reference support (`C {/abs/foo.sym}`) for refs under a configured library root.
- `autoDetectXschemrc` parses in-workspace `append XSCHEM_LIBRARY_PATH` lines.
- Committed, dependency-free test suite (`npm test`) + GitHub Actions CI; `THIRD_PARTY_NOTICES`.

## [1.1.1]
- `${workspaceFolder:NAME}` support; non-existent library paths skipped; `includeWorkspaceFolders`
  defaults to `false` and is scoped to the schematic's own workspace folder.

## [1.1.0]
- Initial configurable-library-path fork over upstream `barakh.vscode-xschem-viewer@1.0.1`:
  configurable `xschem.libraryPaths`, `xschem.autoDetectXschemrc`, and a resolver that falls through
  to configured search roots instead of a hard-coded, CSP-blocked GitHub library map.
