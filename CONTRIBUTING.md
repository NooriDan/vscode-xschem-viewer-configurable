# Contributing

Thanks for your interest in improving **Xschem Viewer (Configurable)**!

## Project layout

- `dist/extension.cjs` — the VS Code extension host (reads settings, wires the webview).
- `dist/assets/` — the bundled [Tiny Tapeout xschem-viewer](https://github.com/TinyTapeout/xschem-viewer)
  (xschem compiled to WASM). The symbol resolver lives in `index.js`.
- `dist/xschem_lib/` — bundled symbol libraries, namespaced per PDK (`sky130/`, `ihp-sg13g2/`) plus
  generic `devices/`, `stdcells/`, `mips_cpu/`.
- `test/` — dependency-free Node tests + fixtures.
- `packaging/`, `build-vsix.sh` — VSIX packaging.

See [FEATURE.md](FEATURE.md) for how symbol resolution and each setting work, and [TODO.md](TODO.md)
for planned work.

> Note: the `dist/assets/*` viewer is a **built artifact** (the upstream TypeScript/WASM source is
> not vendored here). Resolver changes are currently applied to that bundle directly; rebuilding
> from source is a tracked TODO.

## Development

No dependencies are required to run the tests:

```bash
npm test          # resolver + config + manifest/integrity checks
./build-vsix.sh   # build the installable VSIX (needs node + zip)
```

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

The `release` workflow builds the VSIX and attaches it to a GitHub Release.

## License

By contributing you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE.txt).
