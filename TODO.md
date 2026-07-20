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

## Planned improvements

- [ ] **Publish to the VS Code Marketplace / Open VSX.** The release workflow already builds the VSIX
      and can push to Open VSX with an `OVSX_TOKEN` secret. Marketplace additionally needs a
      registered Azure DevOps publisher named `NooriDan` and a `VSCE_PAT` secret + a `vsce publish`
      step.
- [ ] **Build from real source instead of patching the minified bundle.** Fork the upstream
      TypeScript viewer, apply the resolver change there, and rebuild — easier to maintain/upstream.
- [ ] **Upstream the resolver fix** to `barakhoffer/vscode-xschem-viewer` as a PR.
- [ ] **Follow PDK `source` lines in `xschemrc`** (opt-in) to auto-resolve `$PDK_ROOT/$PDK/libs.tech/xschem`
      for **open** PDKs, keeping non-open PDKs excluded.
- [ ] **Bundle more IHP libraries on demand** (`sg13g2_tests` galleries), kept out for now to stay lean.
- [ ] **Headless render smoke test** in CI (drive the WASM viewer in a headless browser, not just the
      resolver logic).
- [ ] **Studio UI viewer port** — apply the same search-root resolver to the SpiceXplorer UI viewer.
      *(Deferred at owner's request.)*

## Known limitations

- [ ] **Config-schema registration needs a full window reload** after (re)install.
- [ ] **No headless render verification.** Correctness is validated via the resolver/config/manifest
      tests; the actual WASM webview render is not exercised (see planned smoke test).
- [ ] **`${workspaceFolder}` bare semantics.** In a multi-root workspace it resolves to the
      schematic's innermost containing folder; `${workspaceFolder:NAME}` is the unambiguous form.
- [ ] **`includeWorkspaceFolders` is off by default**, so relative `../` sub-block refs above the
      schematic's folder need the setting on (or the target dir in `xschem.libraryPaths`).
