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
| `xschem.followXschemrcPdkSource` | `false` | **Opt-in.** Follows an `xschemrc`'s `source …/libs.tech/xschem/xschemrc` line to add that PDK's library directory. Deliberately reaches outside the workspace, so it is gated three ways (below). |
| `xschem.includeWorkspaceFolders` | `false` | When enabled, adds only the schematic's own workspace folder to the webview's allowed roots (relative `../` sub-block refs). Off by default to keep the read scope minimal. |
| `xschem.resolveDebug` | `false` | Logs each resolution attempt and skipped path to the webview console. |

## Following a PDK `source` line (opt-in)

A repo's `xschemrc` typically pulls in its PDK rather than listing the PDK's symbols itself:

```tcl
set ::env(PDK) ihp-sg13g2
source $env(PDK_ROOT)/$env(PDK)/libs.tech/xschem/xschemrc
```

`xschem.autoDetectXschemrc` deliberately **skips** `source` lines, because they point outside the
workspace. Enabling `xschem.followXschemrcPdkSource` follows them, adding
`$PDK_ROOT/$PDK/libs.tech/xschem` as a search root so PDK devices resolve with no manual path entry.

Because this is the one place the extension reaches out of tree, it is gated three ways:

1. **Opt-in** — off by default; `xschem.libraryPaths` remains the explicit alternative.
2. **Open-PDK allowlist** — the `…/<pdk>/libs.tech/xschem` segment of the *resolved* path must match
   `sky130*`, `gf180mcu*`, `ihp-sg13g2`, or `sg13g2`. Gating on the resolved path (not on
   `set ::env(PDK)`) means an rc cannot claim an open PDK name and then resolve somewhere else.
   Any other PDK — a proprietary foundry kit — is refused even when the directory exists.
3. **Fully-resolved and existing** — an unset variable is a refusal, never a partial path. Without
   this, an unset `PDK_ROOT` would collapse the expression to `/ihp-sg13g2/libs.tech/xschem`, an
   absolute path at the filesystem root. The directory must also actually exist.

Only the PDK's `libs.tech/xschem` directory is added — never `$PDK_ROOT` itself.

## Building from source

`./build-from-source.sh` rebuilds `dist/assets/` from the real TypeScript sources rather than
hand-editing the minified bundle. The viewer's WebAssembly is checked into the upstream repo, so
this needs only Node and a Vite build — no emscripten toolchain.

It clones [`TinyTapeout/xschem-viewer`](https://github.com/TinyTapeout/xschem-viewer) at a pinned
commit, applies [`patches/xschem-viewer/*.patch`](patches/xschem-viewer/), installs a vite config
that emits un-hashed asset names, and builds:

- `0001-configurable-library-search-roots.patch` — the resolver, as readable TypeScript. This is
  also the patch offered upstream (see [docs/UPSTREAMING.md](docs/UPSTREAMING.md)).
- `0002-bundled-local-libraries.patch` — repoints the library map at the bundled, per-PDK
  namespaced `xschem_lib/<pdk>/` directories.

It **stages only** by default and reports a per-file diff against the committed bundle; `--install`
is required to overwrite `dist/assets`. A rebuild reproduces `wacl.wasm` and `index.css`
byte-identically, and the resulting `index.js` passes the same resolver suite as the shipped bundle.

## Implementation

Two built files carry the fork's changes (`dist/assets/index.js` is reproducible from source via
the pipeline above; `dist/extension.cjs` is still maintained as built output):

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
- **`test/config.test.cjs`** — `xExpand`/`xLibDirs`/`xParseAppends`/`xParsePdkSource`: variable
  expansion, named-folder token, `xschemrc`-append parsing, out-of-workspace gating,
  non-existent-path skipping, and the PDK-source gates (open PDK followed; proprietary PDK refused
  *while its directory exists*, proving the allowlist rather than absence is doing the work; unset
  variable refused; opt-in respected).
- **`test/manifest.test.cjs`** — manifest settings/defaults, both bundles parse, the patches are
  intact, the IHP remap is complete, bundled IHP symbols retain their Apache-2.0 headers, the
  open-PDK allowlist contains no foundry name, and every test fixture has a parseable xschem
  version header.

The resolver test extracts the method by **regex**, not a literal signature, so it validates the
committed bundle and a `build-from-source.sh` rebuild equally (the minifier renames identifiers on
every build).

### Render verification

`npm test` covers resolution logic; it does not prove the WASM viewer paints. `npm run test:smoke`
(`test/smoke/render-smoke.mjs`, plus the `Render smoke` CI workflow) drives the real viewer in
headless Chromium against a schematic referencing bundled IHP/SKY130/stock symbols and asserts no
uncaught page errors, that every referenced symbol resolved, and that the `<svg>` became visible
with real geometry and a non-degenerate bounding box. It needs Playwright and `openssl`, so it is
kept **out of `npm test`** — that suite stays dependency-free — and runs in its own workflow.

Two things the harness must get right, both learned the hard way:

- **It serves over HTTPS, not HTTP.** The resolver's first branch is
  `path.startsWith('https://') -> fetch(path)`, which is how the *top-level* schematic loads — at
  that moment `baseURL` is still unset, so no later fallback applies. In the webview the file is
  always an `https:` vscode-resource URL. An HTTP harness therefore fails with a misleading
  "File not found" against a code path that cannot occur in production. A self-signed cert is
  generated per run and the browser launched with `ignoreHTTPSErrors`.
- **It waits for the `<svg>` to become *visible*, not merely to exist.** The viewer renders to SVG
  and holds it at `visibility: hidden` until the render completes, so visibility is the done signal.

Current result: **7/7 symbols resolved, 97 SVG shapes, bbox 1180×291, 0 page errors.** The check is
mutation-tested — hiding one bundled symbol makes it exit non-zero and name the missing symbol.
(`tcleval failed:` console lines are expected noise: symbols carry ngspice `gm`/`id`/`vgs`
annotations that only evaluate against a live simulation.)

The earlier manual end-to-end check (bio-afe SRMC drawings) resolved **19/19** symbols vs **8/19**
on the upstream resolver.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
