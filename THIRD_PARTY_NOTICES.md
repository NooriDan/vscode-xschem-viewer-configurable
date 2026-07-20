# Third-Party Notices

This extension is a modified distribution and bundles third-party material. Where a file carries a
license header, that header is authoritative. **Many bundled symbol files carry no header** — those
are governed by the license of the upstream repository they came from, named per group below.

> **Note:** the extension's own code is Apache-2.0, but the bundled `xschem_lib/devices/` symbols
> are **GPL-2.0-or-later**. They are data files (symbol graphics) redistributed unmodified alongside
> — not linked into — the extension. If you redistribute this extension or build on it, the GPL
> terms apply to those files.

## Base extension

- **vscode-xschem-viewer** © Barak Hoffer — <https://github.com/barakhoffer/vscode-xschem-viewer>.
  Licensed under Apache-2.0 (see [LICENSE.txt](LICENSE.txt)). This repository is a fork with the
  changes described in [FEATURE.md](FEATURE.md).

## Embedded viewer

- **xschem-viewer** by Tiny Tapeout — <https://github.com/TinyTapeout/xschem-viewer> — is bundled
  in compiled form under `dist/assets/` (`index.js`, `index.css`, `wacl.js`, `wacl.wasm`) and `dist/tcl/`. It
  packages **xschem** by Stefan Schippers (<https://xschem.sourceforge.io>) compiled to WebAssembly.

## Bundled symbol libraries (`dist/xschem_lib/`)

These XSchem symbol libraries are redistributed so schematics render without external files. Each
PDK is kept in its own `xschem_lib/<pdk>/` subdirectory to avoid namespace mixing; generic/stock
libraries stay at the top level:

- **`devices/`** — xschem's stock device symbols © 1998–2024 Stefan Frederik Schippers, from
  <https://github.com/StefanSchippers/xschem>. **GPL-2.0-or-later** — all 116 files carry the GNU GPL
  v2-or-later header.
- **`stdcells/`, `mips_cpu/`, `sky130/`** (`sky130_fd_pr/`, `sky130_stdcells/`, `sky130_tests/`) —
  SKY130 and generic/example libraries from
  <https://github.com/StefanSchippers/xschem_sky130>, as included by the upstream extension.
  **Apache-2.0**; files without an inline header are covered by that repository's license.
- **`ihp-sg13g2/`** (`sg13g2_pr/`, `sg13g2_stdcells/`) — IHP SG13G2 XSchem symbols, **added by this
  fork** from the IHP Open PDK — <https://github.com/IHP-GmbH/IHP-Open-PDK>. © 2024 IHP PDK Authors,
  licensed under **Apache-2.0**. Only the `.sym`/`.sch` symbol-graphics files are bundled; no device
  models or foundry-confidential material is included.

### Fetched on demand (not redistributed)

`scripts/fetch-ihp-testlibs.sh` can download IHP's `sg13g2_tests` example galleries into
`dist/xschem_lib/ihp-sg13g2/` for local use. Those files are **not** part of this repository or the
published VSIX — they are git-ignored and excluded from the packaged extension. They come from the
IHP Open PDK (© IHP PDK Authors, Apache-2.0) and only `.sym`/`.sch` symbol graphics are copied.

No proprietary or NDA-restricted PDK material is bundled. Non-open PDKs remain opt-in via the
`xschem.libraryPaths` setting and are never redistributed here. The opt-in
`xschem.followXschemrcPdkSource` setting only ever *reads* an already-installed open PDK from disk
and refuses non-open PDK paths; it redistributes nothing.
