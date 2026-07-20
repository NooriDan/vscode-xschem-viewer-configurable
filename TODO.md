# TODO

Planned improvements and known bugs/limitations. See [FEATURE.md](FEATURE.md) for current behavior.

## Done

- [x] **Bundle IHP SG13G2 by default** — `sg13g2_pr/*` and `sg13g2_stdcells/*` are bundled and the
      library map points at them; they render with no configuration (1.2.0).
- [x] **Absolute symbol references** — `C {/abs/foo.sym}` resolves when it falls under a configured
      library root; out-of-root absolute refs are refused (1.2.0).
- [x] **Parse `xschemrc` contents** — `autoDetectXschemrc` now parses in-workspace
      `append XSCHEM_LIBRARY_PATH` lines (the `[file dirname [info script]]` idiom). *Note:* it
      deliberately does **not** follow `source $PDK_ROOT/.../xschemrc` or `$env(...)` appends — those
      out-of-tree PDK roots stay opt-in via `xschem.libraryPaths` for NDA safety (1.2.0).
- [x] **Portable test suite** — `npm test` (resolver + config + manifest/integrity), no deps, with
      fixtures (1.2.0).
- [x] **CI** — GitHub Actions runs the suite on Node 18/20/22 and builds the VSIX on every push/PR
      (`.github/workflows/ci.yml`, 1.2.0).

## Planned improvements

- [ ] **Apply the same fix to the Studio UI viewer.** The SpiceXplorer UI likely embeds the same
      Tiny Tapeout viewer and has the identical hard-coded-library / CSP problem; port the
      search-root resolver there.
- [ ] **Build from real source instead of patching the minified bundle.** Fork the upstream
      TypeScript, apply the change there, and rebuild — cleaner to maintain and upstream.
- [ ] **Upstream the feature** to `barakhoffer/vscode-xschem-viewer` as a PR.
- [ ] **Bundle more IHP libraries on demand** — `sg13g2_tests` and example galleries are not
      bundled (kept lean); add if users want to browse them in-editor.
- [ ] **Follow PDK `source` lines in `xschemrc`** (opt-in setting) to auto-resolve
      `$PDK_ROOT/$PDK/libs.tech/xschem` for **open** PDKs, while keeping NDA PDKs excluded.
- [ ] **User-visible warning** (not just a `resolveDebug` log) when an explicit
      `xschem.libraryPaths` entry doesn't exist, to catch typos.
- [ ] **Headless render smoke test** in CI (exercise the WASM viewer, not just the resolver logic).
- [ ] **Publish VSIX to a GitHub Release** on tag (the CI already builds/attaches the artifact).

## Known bugs / limitations

- [ ] **Same id/publisher as upstream** (`barakh.vscode-xschem-viewer`). A future Marketplace
      update to the original could clobber this local build. The bumped version prevents
      auto-downgrade for now; a clean rename (new publisher + `viewType`) would remove the risk but
      requires uninstalling the original.
- [ ] **Config-schema registration needs a full window reload** after (re)install.
- [ ] **No headless render verification.** Correctness is validated via the resolver/config/manifest
      tests; the actual WASM webview render is not exercised (see planned smoke test).
- [ ] **`${workspaceFolder}` bare semantics.** In a multi-root workspace it resolves to the
      schematic's innermost containing folder; `${workspaceFolder:NAME}` is the unambiguous form.
- [ ] **`includeWorkspaceFolders` is off by default**, so relative `../` sub-block refs that climb
      above the schematic's folder need the setting on (or the target dir in `xschem.libraryPaths`).
