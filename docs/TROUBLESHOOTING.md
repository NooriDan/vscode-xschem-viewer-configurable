# Troubleshooting

Your schematic shows blank boxes, missing devices, or nothing at all. This walks from the cheapest
checks to the specific failure modes. For setting up paths in the first place, see
[CONFIGURATION.md](CONFIGURATION.md).

---

## Start here

1. **Reload the window.** *Developer: Reload Window* from the Command Palette. Required after every
   (re)install — without it the new version's settings schema isn't registered, so your `xschem.*`
   settings are silently ignored.
2. **Reopen the schematic tab.** Search roots are computed when the editor opens; a settings change
   doesn't affect an already-open tab.
3. **Did you change an environment variable?** *Reload Window is not enough* — the extension host
   inherits its environment from the running VS Code process. **Fully quit and relaunch.**
4. **Two `.sch` editors fighting?** If the upstream `barakh.vscode-xschem-viewer` is also installed,
   uninstall it.
5. **Does the `.sch` open as plain text, with no Xschem editor at all?** The folder is probably in
   **Restricted Mode** — the extension doesn't declare untrusted-workspace support, so VS Code keeps
   it disabled and the custom editor never registers. Look for the shield icon in the status bar and
   choose *Trust the authors of this folder*.

---

## Turn on diagnostics

```jsonc
{ "xschem.resolveDebug": true }
```

Then reopen the schematic. **The output goes to two different consoles** — this catches people out:

| What | Where to look |
|---|---|
| Resolution attempts: `'ref' <- bundled …`, `'ref' <- libraryPath …`, `NOT FOUND …` | Command Palette → **Developer: Open Webview Developer Tools** |
| Skipped/refused paths: bad `libraryPaths` entry, refused PDK `source` | **Help ▸ Toggle Developer Tools**, or Output panel → **Log (Extension Host)** |

*Help ▸ Toggle Developer Tools* shows the **editor's** console, not the webview's. If you look there
for the resolver's per-symbol lines you'll see nothing and conclude logging is broken.

### Reading the resolver log

A successful resolution names the branch that satisfied it:

```
[xschem-viewer] 'devices/title.sym' <- bundled xschem_lib/devices/title.sym
[xschem-viewer] 'mylib/foo.sym' <- libraryPath https://file+.vscode-resource…/mylib/foo.sym
[xschem-viewer] '/abs/path/foo.sym' <- abs root https://file+.vscode-resource…/foo.sym
```

A failure lists the roots that were searched — **this is the key diagnostic**:

```
[xschem-viewer] NOT FOUND 'sg13g2_pr/sg13_lv_nmos.sym' — tried libraryPaths []
```

An **empty `[]`** means no search roots were configured *at all* — your settings never took effect.
Jump to ["My `libraryPaths` seems ignored"](#my-librarypaths-seems-ignored). If the list is
non-empty but your directory isn't in it, the entry was skipped — see the next section.

---

## Symptom → cause

| Symptom | Likely cause |
|---|---|
| `NOT FOUND … tried libraryPaths []` | Settings not applied — no reload, wrong settings scope, or per-folder settings in a multi-root workspace |
| Warning toast: *"library path not found, skipping …"* | The path doesn't exist — typo, or a variable expanded to nothing |
| Roots listed, but not the one you added | Entry isn't an existing directory, or it's a per-folder setting being ignored |
| PDK symbols missing, everything else fine | PDK not on any search root; `followXschemrcPdkSource` off, refused, or `PDK_ROOT` unset |
| `../something.sym` fails, same-folder works | `includeWorkspaceFolders` is off (default) |
| `C {/abs/…}` fails | Absolute ref outside every configured root — refused by design |
| Nothing renders, blank pane | Not a resolution problem — see [Nothing renders at all](#nothing-renders-at-all) |
| `tcleval failed: …` in the console | **Harmless.** ngspice `gm`/`id`/`vgs` annotations that only evaluate against a live simulation |

---

## Specific failure modes

### My `libraryPaths` seems ignored

In order of likelihood:

1. **No window reload after install.** The settings schema registers at activation.
2. **Per-folder settings in a multi-root workspace.** `xschem.*` settings are `window`-scoped, so a
   folder's `.vscode/settings.json` is **ignored**. Move them into the `.code-workspace` file's
   `"settings"` block. See [CONFIGURATION.md](CONFIGURATION.md#where-do-these-settings-go).
3. **The path doesn't exist.** Only real directories become search roots. You'll get a one-time
   warning toast naming the entry, and a `libraryPaths entry not found, skipping:` line in the
   extension host log.
4. **A variable expanded to nothing.** `${env:PDK_ROOT}/…` with `PDK_ROOT` unset becomes `/…`, which
   won't exist. Confirm with the log — the skip message prints the *expanded* path, so an unset
   variable is obvious.
5. **It points at the wrong level.** Entries are **directories** that a reference is appended to:
   `sg13g2_pr/foo.sym` is looked up as `<root>/sg13g2_pr/foo.sym`. So the root is
   `…/libs.tech/xschem`, **not** `…/libs.tech/xschem/sg13g2_pr`.

### `${env:PDK_ROOT}` is empty even though my shell has it

The extension host inherits the environment of however VS Code was **launched**:

- Started from a terminal (`code .`) → inherits your shell env. ✅
- Started from a desktop icon/dock → inherits the desktop session env, which has usually **not**
  sourced `.bashrc`/`.zshrc`. ❌

`terminal.integrated.env.*` does **not** affect the extension host. Either relaunch VS Code from a
terminal that has the variable, or sidestep it entirely with an absolute path:

```jsonc
{ "xschem.libraryPaths": ["/opt/pdks/ihp-sg13g2/libs.tech/xschem"] }
```

### My PDK isn't picked up from `xschemrc`

`xschem.autoDetectXschemrc` (on by default) deliberately **skips `source` lines and `$env(...)`
appends** — those point outside the workspace, and out-of-tree access stays opt-in.

To follow a PDK `source` line, enable it explicitly:

```jsonc
{ "xschem.followXschemrcPdkSource": true }
```

If it's on and still not working, check the extension host log for the refusal reason:

- `xschemrc PDK source has an unset variable, skipping: …`
  → `PDK_ROOT` (or `PDK`) isn't set. A partial expansion is refused rather than trusted, because an
  empty `PDK_ROOT` would otherwise produce an absolute path at the filesystem root.
- `xschemrc PDK source not on the open-PDK allowlist, skipping: … (pdk=…)`
  → The resolved `…/<pdk>/libs.tech/xschem` segment isn't an open PDK. Only `sky130*`, `gf180mcu*`,
  `ihp-sg13g2` and `sg13g2` are followed. **This is intentional** — for a proprietary/foundry PDK,
  name the path explicitly in `xschem.libraryPaths` instead. That path is never allowlisted.
- No message at all → no `xschemrc` with a `source …libs.tech/xschem…` line was found walking up
  from the schematic to the workspace root.

Also note the directory must exist, and only `…/libs.tech/xschem` is added — never `$PDK_ROOT`.

### `includeWorkspaceFolders` is on but nothing changed

It exposes the schematic's **own** workspace folder. If the `.sch` was opened from outside every
folder in the window (e.g. straight from disk while an unrelated project is open), there is no
owning folder and the setting adds nothing. Add the directory to `xschem.libraryPaths` instead.

### A sub-block one directory up won't resolve

`xschem.includeWorkspaceFolders` is `false` by default, keeping the webview's read scope minimal.
Relative `../` references above the schematic's own folder need either:

```jsonc
{ "xschem.includeWorkspaceFolders": true }
```

or the specific target directory listed in `xschem.libraryPaths` (narrower, and preferable if you
only need one or two).

### An absolute symbol reference is refused

`C {/home/me/lib/foo.sym}` resolves **only** if that path falls under a directory you already
configured. This is deliberate: it stops a schematic from making the webview read arbitrary files.
Add the containing directory to `xschem.libraryPaths` and it will resolve.

### I get an old/wrong version of a PDK symbol

Bundled libraries are searched **before** your configured roots, so a `sky130_fd_pr/*` or `sg13g2_*`
symbol present in the bundle wins even if you also point at your own PDK install. Symbols the bundle
*lacks* still fall through to your roots. See
[search order](CONFIGURATION.md#search-order-and-precedence).

### `sg13g2_tests/…` doesn't resolve

IHP's example galleries aren't bundled, to keep the install lean. Fetch them on demand:

```bash
npm run fetch:ihp-tests      # undo: scripts/fetch-ihp-testlibs.sh --remove
```

### Nothing renders at all

Not a resolution problem if you see no `[xschem-viewer]` lines whatsoever.

1. Open the webview console (*Developer: Open Webview Developer Tools*) and look for a WASM load
   failure or a script error.
2. Confirm the file parses as xschem. A `.sch`/`.sym` must begin with a full version header —
   `v {xschem version=3.4.6 file_version=1.2}`. Missing `file_version=` fails with
   `SyntaxError: Expected "file_version=" … but "}" found`.
3. Verify the install is intact: `npm test` in a clone checks bundle integrity, and
   `npm run test:smoke` renders a known-good schematic headlessly.

---

## Reporting a bug

Please include:

- Extension version (*Extensions* view) and VS Code version (*Help ▸ About*)
- Local vs Remote-SSH / WSL / dev container
- The relevant `xschem.*` settings and **where** they're set (user / workspace / `.code-workspace`)
- With `resolveDebug` on: the `NOT FOUND … tried libraryPaths […]` line **and** any extension-host
  skip/refusal lines
- The failing symbol reference as it appears in the `.sch`

→ [Open an issue](https://github.com/NooriDan/vscode-xschem-viewer-configurable/issues)
