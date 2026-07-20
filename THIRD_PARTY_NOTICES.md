# Third-Party Notices

This extension is a modified distribution and bundles third-party material. The authoritative
license terms for each file are in that file's own header; this file is a summary.

## Base extension

- **vscode-xschem-viewer** © Barak Hoffer — <https://github.com/barakhoffer/vscode-xschem-viewer>.
  Licensed under Apache-2.0 (see [LICENSE.txt](LICENSE.txt)). This repository is a fork with the
  changes described in [FEATURE.md](FEATURE.md).

## Embedded viewer

- **xschem-viewer** by Tiny Tapeout — <https://github.com/TinyTapeout/xschem-viewer> — is bundled
  in compiled form under `dist/assets/` (`index.js`, `wacl.js`, `wacl.wasm`) and `dist/tcl/`. It
  packages **xschem** by Stefan Schippers (<https://xschem.sourceforge.io>) compiled to WebAssembly.

## Bundled symbol libraries (`dist/xschem_lib/`)

These XSchem symbol libraries are redistributed so schematics render without external files:

- **`devices/`** — xschem's stock device symbols (Stefan Schippers), as included by the upstream
  extension. See the file headers for terms.
- **`sky130_fd_pr/`, `sky130_stdcells/`, `sky130_tests/`** — SkyWater SKY130 XSchem symbols, as
  included by the upstream extension (Apache-2.0; see file headers).
- **`sg13g2_pr/`, `sg13g2_stdcells/`** — IHP SG13G2 XSchem symbols, **added by this fork** from
  the IHP Open PDK — <https://github.com/IHP-GmbH/IHP-Open-PDK>. © 2024 IHP PDK Authors, licensed
  under **Apache-2.0**. Only the `.sym`/`.sch` symbol-graphics files are bundled; no device models
  or foundry-confidential material is included.

No proprietary or NDA-restricted PDK material is bundled. Non-open PDKs remain opt-in via the
`xschem.libraryPaths` setting and are never redistributed here.
