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
  Chromium and asserts every symbol resolves and the SVG actually drew (7/7 symbols, 97 shapes,
  0 page errors; mutation-tested). Serves over HTTPS, because the resolver loads the top-level
  schematic through its `https://` branch while `baseURL` is still unset — an HTTP harness fails
  against a path that cannot occur in the webview. Kept out of `npm test`, which stays
  dependency-free.
- **`scripts/fetch-ihp-testlibs.sh`** (`npm run fetch:ihp-tests`) — fetches IHP's `sg13g2_tests`
  galleries on demand. Git-ignored and excluded from the VSIX, so the default install stays lean;
  the shipped library map already routes `sg13g2_test*` at them.
- **`docs/UPSTREAMING.md`** — ready-to-submit resolver patch and PR text. Nothing has been pushed;
  opening the PRs remains a human decision.
- **`docs/CONFIGURATION.md`** — where settings actually go (all five are `window`-scoped, so
  per-folder settings in a multi-root workspace are ignored — hence `${workspaceFolder:NAME}`),
  variable expansion, how `PDK_ROOT` reaches the extension host, worked recipes, search-order
  precedence, and Remote-SSH/WSL/dev-container notes.
- **`docs/TROUBLESHOOTING.md`** — symptom-first guide covering every way resolution can fail, how to
  read the debug log, and Workspace Trust.
- **`.vscode/`** — `launch.json` (F5 runs an Extension Development Host, plus configs that open the
  test fixtures directly) and workspace `settings.json` (`xschemrc` → Tcl, search/watcher excludes
  for the ~7k bundled symbol files).
- A **Commands** section in the README: the two editor-title buttons shell out to a local `xschem`
  binary and currently fail silently if it isn't installed — previously undocumented.

### Changed
- **`xschem.includeWorkspaceFolders` no longer falls back to exposing every workspace folder.** When
  a schematic sits outside all of them there is no "own" folder, and the previous fallback added
  *all* of them — contradicting the documented contract ("only the schematic's own workspace folder,
  never sibling roots") in exactly the case a user would least expect it. The schematic's own
  directory remains a root regardless; anything wider is now explicit via `xschem.libraryPaths`.

### Fixed
- Test fixtures `proj/altlib/widget.sym` and `proj/quotedlib/widget.sym` were missing the required
  `file_version=` field and failed to parse when opened in the viewer. A new dependency-free
  manifest check now asserts every fixture has a well-formed xschem version header.
- `build-vsix.sh` did not exclude `node_modules`, so packaging after any `npm i` silently shipped
  dependencies inside the VSIX. (Surfaced by installing Playwright for the smoke test.)
- `xschem.resolveDebug`'s description pointed users at *Help ▸ Toggle Developer Tools* for the
  resolver's output, but those lines are emitted **inside the webview** and need
  *Developer: Open Webview Developer Tools*. Anyone debugging "symbol not found" would have looked
  in the wrong console and seen nothing. Both sinks are now documented.
- `THIRD_PARTY_NOTICES.md` deferred all licensing to per-file headers, but the 116 bundled
  `xschem_lib/devices/` symbols are **GPL-2.0-or-later** (not Apache-2.0 like the extension), and
  many other bundled symbols carry no header at all. Licenses are now stated per group explicitly.
- Doc accuracy pass: `build-vsix.sh` also needs `rsync` and `build-from-source.sh` needs `git`;
  `npm run fetch:ihp-tests --remove` never passed the flag (needs `--`); CI runs on PRs and pushes
  to `main`, not "every push"; FEATURE.md claimed four settings at version "1.2.x"; "every fetch is
  guarded" excluded the deliberately-unguarded top-level `https://` branch.
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
