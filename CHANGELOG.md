# Changelog

All notable changes to **Xschem Viewer (Configurable)** are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## [1.5.0]

### Added
- **Hierarchy navigation.** Descending into a sub-schematic was already possible (click a component);
  there was no way back. Adds ↑/↓ editor-title buttons, <kbd>Alt</kbd>+<kbd>Left</kbd> /
  <kbd>Alt</kbd>+<kbd>Right</kbd> keybindings, and matching command-palette entries.

  Up is a stack pop, not a parent lookup — a `.sym` may be instantiated in arbitrarily many parents,
  so the descend stack is the only well-defined "up", and it is what xschem itself walks. That stack
  already existed: upstream's root component navigates via `history.pushState`/`popstate`, so this
  wires a small injected script to that history rather than adding parallel state. Buttons are gated
  on context keys reported by the webview, per editor tab, and cleared when no Xschem editor is
  active so one tab's stack never advertises itself on another's toolbar. The script guards on its
  own depth as well as the context key, because `history.back()` at depth 0 would walk the webview
  iframe off the app into a blank document.

- **`test/navigation.test.cjs`** — drives the injected script against a fake `window`/`history` that
  models the one contract it depends on (pushState truncates forward history). Dependency-free, so it
  runs in the required Node 18/20/22 matrix. It caught a real bug during development: the pushState
  wrapper updated its state but never reported it, so ↑ stayed hidden until the *next* navigation.

- The **render smoke test** now also drives a real descend (clicking the component) and a real ascend
  (posting the message the title button posts), and asserts the parent redraws. New `sub.sym` /
  `sub.sch` fixtures give `smoke.sch` one component with a child schematic. Mutation-tested both
  ways: breaking `up` fails the smoke test, and clobbering the app's history state fails the unit
  test while the smoke test stays green — the app's `?file=` fallback hides it, which is precisely
  why that assertion lives in the unit suite.

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
  Chromium and asserts every symbol resolves and the SVG actually drew (8/8 symbols, 110 shapes,
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
- **The shipped viewer bundle advances across upstream `ddd97ca..4a2bc83`** (2024-12-11 → 2025-12-14).
  The committed bundle had drifted a year behind the pinned `UPSTREAM_REF` — which is why the
  tokenization error text above names a character class the pinned grammar no longer emits — so
  rebuilding it picks up seven upstream commits along with the local patches: a Firefox rendering
  fix, Spectre netlist parsing, resilience for invalid parser input, a fix for invalid width/height
  console warnings, and a vite 6 / vitest 4 toolchain bump. Blast radius is limited to the parser
  and `SVGRenderer.ts`; the resolver contract and `wacl.wasm` are unchanged.
- `build-from-source.sh` now runs `npm run build:parser` before `npm run build`. Upstream checks
  `src/parser/xschem-parser.ts` into the repo and `build` is `vite build` alone, so **any** grammar
  patch was silently inert without this step.
- **`npm test` now covers property tokenization** via a new dependency-free `test/parser.test.cjs`.
  It lifts the generated peggy parser out of the shipped `dist/assets/index.js` with `node:vm` (a
  plain `import()` dies on `document is not defined`) and asserts exact parsed **values** — inner
  quotes, the `;` separator, the backslash fold at n=1/2/4/6, and that every bundled library file
  parses bar the known-bad allowlist. Mutation-tested: 15 of its 20 assertions fail against the
  pre-fix bundle.
- The render smoke fixture instantiates `devices/code_shown.sym` carrying a bare-inner-quote value,
  exercising the tokenization fix through the real WASM bundle end-to-end. Note this is a belt, not
  the guard: at the pinned ref the *unpatched* grammar truncates that value rather than throwing,
  and the smoke assertions are value-blind — `test/parser.test.cjs` is what actually fails on a
  regression.
- **`xschem.includeWorkspaceFolders` no longer falls back to exposing every workspace folder.** When
  a schematic sits outside all of them there is no "own" folder, and the previous fallback added
  *all* of them — contradicting the documented contract ("only the schematic's own workspace folder,
  never sibling roots") in exactly the case a user would least expect it. The schematic's own
  directory remains a root regardless; anything wider is now explicit via `xschem.libraryPaths`.

### Fixed
- **Property values with bare inner quotes no longer break a schematic.** A value such as
  `value="… defined by "let" to … defined by "set" …"` (an ngspice comment inside a `code_shown`
  block) aborted the *entire* file with `SyntaxError: Expected "=", "}", … but "\"" found`, leaving
  a blank canvas. The grammar modelled a value as one quoted span *or* one bare token; real xschem
  treats an unescaped `"` as a **parity toggle** (`token.c:438` `get_tok_value()`) and ends the value
  only at the first `SPACE()` char reached while unquoted — so a value is a *concatenation* of
  alternating quoted and bare runs. `patches/xschem-viewer/0003-xschem-faithful-property-tokenization.patch`
  reimplements that faithfully, including the non-linear two-pass backslash fold
  (`save.c:3260` `load_ascii_string()` unescapes, then `get_tok_value()` re-escapes on the result)
  and `;` as a pair separator.

  Measured across a 3369-file local corpus — this repo's 1103 bundled library files plus
  locally-installed open PDKs and private project schematics, so the total is **not reproducible
  from this repo alone**: **42 parse failures → 2**, 40 newly parsed, **0 newly broken**, with each
  newly-parsing file's output spot-compared against real xschem V3.4.5. The reproducible part is
  asserted by `npm test`: all 1103 bundled library files parse except one known-bad file
  (`sg13g2_a221oi_1.sym`, which puts `G {}` before its `v {xschem …}` header — a record-ordering
  issue unrelated to tokenization, tracked in TODO.md).

  Two behaviours here are deliberately xschem-faithful rather than lenient, and are pinned by tests:
  an unescaped `}` still ends the record even inside quotes, and a value with **odd** quote parity
  swallows the rest of the line (later `name=value` pairs on it are silently lost).
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
