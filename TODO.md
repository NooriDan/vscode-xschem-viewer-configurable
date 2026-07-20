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
      WASM viewer in headless Chromium (1.4.0). *See the caveat below — it has not had a green run
      on real CI hardware yet.*

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
- [ ] **Validate the render smoke test on CI.** It is written and its static-server half is verified,
      but no browser was available in the authoring environment, so the Playwright half has never
      actually run. Expect to iterate on selectors/timing during its first CI runs. It lives in its
      own workflow so a failure cannot block the resolver matrix; promote it to a required check
      once it has a track record.
- [ ] **Port `dist/extension.cjs` to source too.** `build-from-source.sh` covers the viewer bundle;
      the extension host is still maintained as built output. Upstream's `src/extension.ts` is the
      natural base, and doing this is a prerequisite for upstream PR 2.
- [ ] **Studio UI viewer port** — apply the same search-root resolver to the SpiceXplorer UI viewer.
      *(Deferred at owner's request.)*

## Known limitations

- [ ] **Config-schema registration needs a full window reload** after (re)install.
- [ ] **Render verification is not yet proven in CI** — see the smoke-test item above. Until it has
      a green run, correctness is still effectively validated by the resolver/config/manifest tests
      plus manual checks.
- [ ] **`${workspaceFolder}` bare semantics.** In a multi-root workspace it resolves to the
      schematic's innermost containing folder; `${workspaceFolder:NAME}` is the unambiguous form.
- [ ] **`includeWorkspaceFolders` is off by default**, so relative `../` sub-block refs above the
      schematic's folder need the setting on (or the target dir in `xschem.libraryPaths`).
- [ ] **`followXschemrcPdkSource` trusts the PDK directory once allowlisted.** The gate is the
      open-PDK name in the *resolved* path plus existence; it does not `realpath`-contain the result
      the way the in-workspace `append` gate does, because the feature is out-of-tree by definition.
      A symlink you created yourself, named after an open PDK, would be followed. Opt-in for exactly
      this reason.
