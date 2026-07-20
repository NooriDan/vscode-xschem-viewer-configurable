# TODO

Planned improvements and known bugs/limitations. See [FEATURE.md](FEATURE.md) for current behavior.

## Planned improvements

- [ ] **Apply the same fix to the Studio UI viewer.** The SpiceXplorer UI likely embeds the same
      Tiny Tapeout viewer and has the identical hard-coded-library / CSP problem; port the
      search-root resolver there.
- [ ] **Build from real source instead of patching the minified bundle.** Currently
      `dist/assets/index.js` and `dist/extension.cjs` are patched as built artifacts. Fork the
      upstream TypeScript, apply the change there, and rebuild — cleaner to maintain and
      upstream.
- [ ] **Upstream the feature** to `barakhoffer/vscode-xschem-viewer` as a PR.
- [ ] **Parse `xschemrc` contents**, not just its location. Today `autoDetectXschemrc` adds the
      directory of any `xschemrc`; it does not read the file's `XSCHEM_LIBRARY_PATH` appends or
      the PDK `xschemrc` it sources, so PDK roots still need an explicit `xschem.libraryPaths`
      entry. Optionally resolve `$PDK_ROOT/$PDK/libs.tech/xschem` from a detected `xschemrc`.
- [ ] **Portable test suite.** The current resolver/config tests reference absolute local paths
      (a specific PDK + schematic set). Add self-contained fixtures so tests run anywhere / in CI.
- [ ] **Absolute symbol references.** `C {/abs/path/foo.sym}` is not handled by the search-root
      logic; decide whether to map absolute refs through `localResourceRoots`.
- [ ] **User-visible warning** (not just a debug log) when an explicit `xschem.libraryPaths`
      entry doesn't exist, to catch typos without turning on `resolveDebug`.
- [ ] **CI** to rebuild the VSIX and attach it to a GitHub Release on tag.

## Known bugs / limitations

- [ ] **Same id/publisher as upstream** (`barakh.vscode-xschem-viewer`). A future Marketplace
      update to the original could clobber this local build. The bumped version (`1.1.x` >
      `1.0.1`) prevents auto-downgrade for now; a clean rename (new publisher + `viewType`) would
      remove the risk but requires uninstalling the original.
- [ ] **Config-schema registration needs a full window reload** after (re)install — a soft
      settings refresh may not pick up the new schema.
- [ ] **No headless render verification.** Correctness is validated via a Node harness driving the
      real resolver logic and config helpers; the actual WASM webview render is not exercised.
- [ ] **`${workspaceFolder}` bare semantics.** In a multi-root workspace it resolves to the
      schematic's innermost containing folder, which can surprise users expecting the meta-root.
      Documented; `${workspaceFolder:NAME}` is the unambiguous alternative.
- [ ] **`includeWorkspaceFolders` is off by default**, so relative `../` sub-block refs that climb
      above the schematic's folder need the setting turned on (or the target dir added to
      `xschem.libraryPaths`).
