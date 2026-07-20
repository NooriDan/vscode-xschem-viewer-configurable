# Contributing

Thanks for your interest in improving **Xschem Viewer (Configurable)**!

## Project layout

- `dist/extension.cjs` — the VS Code extension host (reads settings, wires the webview).
- `dist/assets/` — the bundled [Tiny Tapeout xschem-viewer](https://github.com/TinyTapeout/xschem-viewer)
  (xschem compiled to WASM). The symbol resolver lives in `index.js`.
- `dist/xschem_lib/` — bundled symbol libraries, namespaced per PDK (`sky130/`, `ihp-sg13g2/`) plus
  generic `devices/`, `stdcells/`, `mips_cpu/`.
- `patches/xschem-viewer/` — the resolver as readable TypeScript patches against upstream, plus the
  vite config used to rebuild. Applied by `build-from-source.sh`.
- `scripts/` — optional helpers (`fetch-ihp-testlibs.sh`).
- `test/` — dependency-free Node tests + fixtures. `test/smoke/` is the Playwright render test
  (**not** part of `npm test`).
- `docs/` — configuration, troubleshooting, and upstreaming guides.
- `packaging/`, `build-vsix.sh` — VSIX packaging.
- `.github/workflows/` — `ci.yml` (tests + VSIX), `smoke.yml` (headless render), `release.yml`.

See [FEATURE.md](FEATURE.md) for how symbol resolution and each setting work, and [TODO.md](TODO.md)
for planned work.

> The `dist/assets/*` viewer is a built artifact, but it is **reproducible**: `./build-from-source.sh`
> clones the pinned upstream, applies `patches/xschem-viewer/*.patch`, and rebuilds. Prefer editing
> the patch over hand-editing the minified bundle. `dist/extension.cjs` is still maintained directly
> as built output — porting it back to TypeScript is a tracked TODO.

## Development

No dependencies are required to run the tests:

```bash
npm test          # resolver + config + manifest/integrity checks
./build-vsix.sh   # build the installable VSIX (needs node + zip)
```

### Debugging without installing

Press <kbd>F5</kbd> (or *Run and Debug* → **Run Extension (Development Host)**) to launch a second
VS Code window running the extension straight from this folder. `.vscode/launch.json` also has
configurations that open the test fixtures or the smoke-test schematic directly.

Breakpoints in `dist/extension.cjs` hit in that window. The viewer itself runs in the webview —
inspect it with *Developer: Open Webview Developer Tools* and turn on `xschem.resolveDebug`. Note
the two log destinations described in [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md#turn-on-diagnostics).

### Changing the resolver

Edit `patches/xschem-viewer/0001-configurable-library-search-roots.patch`, then:

```bash
./build-from-source.sh              # build + diff against the committed bundle (stages only)
./build-from-source.sh --install    # overwrite dist/assets, then run npm test
npm run test:smoke                  # ALWAYS verify a real render after --install
```

`npm test` checks resolution logic, not that the WASM viewer still paints — so a bundle swap needs
the smoke test (or a manual open) before committing.

### Rendering verification

```bash
npm i --no-save playwright && npx playwright install chromium
npm run test:smoke                  # --headed --keep-open to watch it
```

Needs `openssl`: the harness serves over HTTPS because the resolver loads the top-level schematic via
its `https://` branch.

Install a local build:

```bash
code --install-extension xschem-viewer-configurable-<version>.vsix --force
# then: Command Palette -> "Developer: Reload Window"
```

## Pull requests

1. Branch off `main`.
2. Keep changes covered by `test/` — add a case for any resolver/config behavior you touch. CI runs
   the suite on Node 18/20/22 and builds the VSIX.
3. Update `CHANGELOG.md`, and `FEATURE.md`/`TODO.md`/`README.md` when behavior or scope changes.
4. If you bundle third-party symbols/data, confirm the license permits redistribution and record it
   in `THIRD_PARTY_NOTICES.md` (this project only bundles permissively-licensed, non-NDA material).

## Releasing (maintainers)

Bump the version in `package.json`, update `CHANGELOG.md`, then tag:

```bash
git tag v<version> && git push origin v<version>
```

The `release` workflow tests, builds the VSIX, and attaches it to a GitHub Release.

### Publishing to the registries (optional)

The same workflow also publishes to the extension registries when the matching repo secret is set
(Settings → Secrets and variables → Actions). No `az`/CLI is needed locally.

- **`VSCE_PAT`** → VS Code Marketplace. Requires a Marketplace publisher named `NooriDan`
  (create at <https://marketplace.visualstudio.com/manage>) and an Azure DevOps Personal Access Token
  with **Marketplace: Manage** scope and **All accessible organizations**
  (create at `https://dev.azure.com/<org>/_usersSettings/tokens`).
- **`OVSX_TOKEN`** → Open VSX. Sign in at <https://open-vsx.org>, accept the Eclipse publisher
  agreement, and create an access token.

With a secret set, publishing happens on any pushed `v*` tag **or** a manual **Run workflow**
(dispatch) — so after adding the secret you can publish the current `package.json` version without
re-tagging. Registries reject a version that already exists; bump the version to re-publish.

## License

By contributing you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE.txt).
