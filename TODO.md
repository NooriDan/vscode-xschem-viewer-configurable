# TODO

Planned improvements and known limitations. See [FEATURE.md](FEATURE.md) for current behavior and
[CHANGELOG.md](CHANGELOG.md) for released changes.

## Done

- [x] **Bundle IHP SG13G2 by default** — renders with no configuration (1.2.0).
- [x] **Absolute symbol references** — resolve under a configured root; out-of-root refs refused (1.2.0).
- [x] **Parse `xschemrc` contents** — in-workspace `append XSCHEM_LIBRARY_PATH` lines; `$env`/`source`
      and out-of-tree paths stay opt-in (1.2.0, hardened in 1.2.1).
- [x] **Per-PDK namespacing** — bundled libraries under `xschem_lib/<pdk>/` (1.2.2).
- [x] **Portable test suite** — `npm test`, no deps (1.2.0+).
- [x] **CI** — GitHub Actions on Node 18/20/22 + VSIX build (1.2.0).
- [x] **Standalone identity** — own publisher/id, unique `viewType` + command ids; no clobber with
      upstream (1.3.0).
- [x] **User-visible warning** for a missing explicit `xschem.libraryPaths` entry (1.3.0).
- [x] **Release automation** — tag `v*` builds the VSIX and publishes a GitHub Release; optional
      Open VSX publish when an `OVSX_TOKEN` secret is set (1.3.0).
- [x] **Build from real source instead of patching the minified bundle** — `./build-from-source.sh`
      clones the pinned upstream viewer, applies `patches/xschem-viewer/*.patch`, and rebuilds. The
      viewer's WASM is checked into upstream, so no emscripten toolchain is needed. Stages and diffs
      by default; `--install` required to overwrite (1.4.0).
- [x] **Follow PDK `source` lines in `xschemrc`** (opt-in) — `xschem.followXschemrcPdkSource`
      auto-resolves `$PDK_ROOT/$PDK/libs.tech/xschem` for **open** PDKs, refusing non-open ones
      (1.4.0).
- [x] **Bundle more IHP libraries on demand** — `scripts/fetch-ihp-testlibs.sh` fetches the
      `sg13g2_tests` galleries when wanted; git-ignored and excluded from the VSIX so the default
      install stays lean (1.4.0).
- [x] **Headless render smoke test** — `npm run test:smoke` + the `Render smoke` workflow drive the
      real WASM viewer in headless Chromium and assert the SVG actually renders. **Verified green**:
      8/8 symbols resolved (IHP nmos+pmos, SKY130 nfet, stock devices, `code_shown`), 110 SVG
      shapes, bbox 1180×513, 0 page errors — and mutation-tested (hiding one bundled symbol makes
      it exit 1) (1.4.0).
- [x] **xschem-faithful property tokenization** — an unescaped `"` toggles quote parity rather than
      delimiting the value, so a property carrying inner quotes (an ngspice comment in a
      `code_shown` block) no longer aborts the entire file into a blank canvas. Local patch 0003;
      guarded by `test/parser.test.cjs`, which asserts exact parsed values plus a whole-corpus parse
      invariant and runs in the required Node matrix (1.4.0).

## Planned improvements

- [ ] **Publish to the VS Code Marketplace / Open VSX.** The release workflow already builds the VSIX
      and can push to Open VSX with an `OVSX_TOKEN` secret. Marketplace additionally needs a
      registered Azure DevOps publisher named `NooriDan` and a `VSCE_PAT` secret + a `vsce publish`
      step.
- [ ] **Open the upstream PRs.** [docs/UPSTREAMING.md](docs/UPSTREAMING.md) has the ready-to-submit
      resolver patch and PR text. The change splits across two repos: the resolver belongs to
      `TinyTapeout/xschem-viewer` (`src/model/LibraryLoader.ts`), the host settings to
      `barakhoffer/vscode-xschem-viewer` (`src/extension.ts`). **Nothing has been pushed** — opening
      them is a deliberate decision, and PR 2 still needs the host logic ported back to TypeScript.
- [ ] **Promote the render smoke test to a required check.** It passes locally and is
      mutation-tested, but has not yet run on GitHub-hosted runners. It lives in its own workflow so
      an infrastructure flake cannot block the resolver matrix; make it required once it has a track
      record there.
- [ ] **Port `dist/extension.cjs` to source too.** `build-from-source.sh` covers the viewer bundle;
      the extension host is still maintained as built output. Upstream's `src/extension.ts` is the
      natural base, and doing this is a prerequisite for upstream PR 2.
- [ ] **Studio UI viewer port** — apply the same search-root resolver to the SpiceXplorer UI viewer.
      *(Deferred at owner's request.)*

## Known limitations

- [ ] **One bundled symbol does not parse.** `ihp-sg13g2/sg13g2_stdcells/sg13g2_a221oi_1.sym` emits
      `G {}` *before* its `v {xschem …}` header, and the grammar only accepts the version block as
      the very first element, so the symbol renders blank. Pre-existing and unrelated to
      tokenization — it fails identically on the pre-0003 grammar. It is the sole entry in
      `test/parser.test.cjs`'s known-bad allowlist. Fixing it means relaxing `Start` to let the
      version block appear among the object definitions, then re-running the corpus sweep.
- [ ] **Two tokenization behaviours are faithful to xschem but lossy**, and are pinned by tests
      rather than fixed: an unescaped `}` ends the record even inside a quoted value (so a
      hand-edited file with `a="p}q"` fails to parse), and a value with **odd** quote parity
      swallows the rest of its line, silently dropping any later `name=value` pairs on it. Real
      xschem does both. Making the first degrade to a partial render needs top-level error
      tolerance in the grammar, which is a larger change than patch 0003.
- [ ] **`dist/assets/index.js` is not byte-reproducible.** `patches/xschem-viewer/vite.config.js`
      injects `new Date().toISOString()` as `__BUILD_TIME__`, so a rebuild always differs from the
      committed bundle by that one string. `build-from-source.sh` normalizes it when comparing, but
      true determinism would mean deriving the stamp from the pinned upstream commit date.
- [ ] **Config-schema registration needs a full window reload** after (re)install.
- [ ] **The smoke test needs `openssl` and a Playwright browser.** It serves over HTTPS because the
      resolver's top-level load is `path.startsWith('https://') -> fetch(path)`; an HTTP harness
      exercises a path that cannot occur in the webview and fails misleadingly. Cert generation
      shells out to `openssl`.
- [ ] **`${workspaceFolder}` bare semantics.** In a multi-root workspace it resolves to the
      schematic's innermost containing folder; `${workspaceFolder:NAME}` is the unambiguous form.
- [ ] **`includeWorkspaceFolders` is off by default**, so relative `../` sub-block refs above the
      schematic's folder need the setting on (or the target dir in `xschem.libraryPaths`).
- [ ] **`followXschemrcPdkSource` trusts the PDK directory once allowlisted.** The gate is the
      open-PDK name in the *resolved* path plus existence; it does not `realpath`-contain the result
      the way the in-workspace `append` gate does, because the feature is out-of-tree by definition.
      A symlink you created yourself, named after an open PDK, would be followed. Opt-in for exactly
      this reason.
