# Configuration guide

How to configure **Xschem Viewer (Configurable)** in VS Code, with worked examples for the common
real-world layouts. For what each setting means at a glance see the
[README settings table](../README.md#settings); for how resolution works internally see
[FEATURE.md](../FEATURE.md). If something isn't rendering, go to
[TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

## Do you need any configuration at all?

Often not. These render with **zero config**:

| Reference | Why it works |
|---|---|
| `devices/*`, `stdcells/*`, `mips_cpu/*` | xschem stock libraries, bundled |
| `sky130_fd_pr/*`, `sky130_stdcells/*` | SKY130 bundled |
| `sg13g2_pr/*`, `sg13g2_stdcells/*` | IHP SG13G2 bundled |
| A symbol sitting **next to** the `.sch` | schematic-relative fallback |
| An in-repo `shared/…` reachable from an `xschemrc` | `xschem.autoDetectXschemrc` is on by default |

You need configuration when symbols live **outside** the schematic's folder and outside the bundle —
an installed PDK, a shared block library in another repo, or a sibling folder above the schematic.

---

## Where do these settings go?

All five settings are **`window`-scoped**. That has a concrete consequence worth knowing up front:

> **Per-folder settings do not apply.** In a multi-root workspace, putting `xschem.*` in an
> individual folder's `.vscode/settings.json` has **no effect**. The extension reads its
> configuration once per window, not per file. This is exactly why `${workspaceFolder:NAME}` exists —
> it lets one workspace-level setting reach into a specific named folder.

| Where | File | Applies to | Use it for |
|---|---|---|---|
| **User** | `settings.json` via *Preferences: Open User Settings (JSON)* | every window | your machine's PDK install path |
| **Workspace (single folder)** | `<project>/.vscode/settings.json` | that folder | project-specific library paths, committed to the repo |
| **Workspace (multi-root)** | the `.code-workspace` file's `"settings"` block | the whole workspace | ✅ **the right place for multi-root** |
| ~~Folder (multi-root)~~ | `<folder>/.vscode/settings.json` | ❌ ignored for `xschem.*` | — |

### Single-folder project

`<project>/.vscode/settings.json` — commit this so the whole team gets it:

```jsonc
{
  "xschem.libraryPaths": [
    "${env:PDK_ROOT}/ihp-sg13g2/libs.tech/xschem",
    "${workspaceFolder}/shared/xschem_library"
  ]
}
```

### Multi-root workspace

In `my-chip.code-workspace`. Note the settings live in the workspace file, **not** in each folder:

```jsonc
{
  "folders": [
    { "path": "analog-blocks" },
    { "path": "platform", "name": "platform" },
    { "path": "docs" }
  ],
  "settings": {
    "xschem.libraryPaths": [
      "${env:PDK_ROOT}/ihp-sg13g2/libs.tech/xschem",
      "${workspaceFolder:platform}/docker/xschem_library"
    ]
  }
}
```

`${workspaceFolder:platform}` targets the folder whose `name` is `platform`. Prefer the **named**
form in multi-root workspaces — bare `${workspaceFolder}` is ambiguous there (see below).

---

## Variable expansion

The extension does its **own** expansion — this is not VS Code's built-in variable substitution,
which does not apply to arbitrary extension settings. Supported inside `xschem.libraryPaths`:

| Token | Expands to |
|---|---|
| `${env:VAR}` | environment variable `VAR` (empty string if unset) |
| `${VAR}` | same, shorthand |
| `~` (leading) | your home directory |
| `${workspaceFolder:NAME}` | the multi-root folder named `NAME` — **unambiguous, preferred** |
| `${workspaceFolder}` | the opened schematic's **own** workspace folder |

Two behaviors to know:

- **Bare `${workspaceFolder}` in a multi-root workspace** resolves to the *innermost* folder
  containing the schematic — e.g. a submodule root, not the meta-root. Use the named form when you
  mean a specific folder.
- **An unset variable collapses to an empty string**, so `${env:NOPE}/libs` becomes `/libs`. That
  path won't exist, so it's skipped — and you'll get a one-time warning naming the entry. Turn on
  `xschem.resolveDebug` to see it logged.

Relative entries resolve against the schematic's workspace folder; absolute paths are used verbatim.

---

## Environment variables: how `PDK_ROOT` actually reaches the extension

This trips people up more than anything else. `${env:PDK_ROOT}` and
`xschem.followXschemrcPdkSource` both read the **extension host process's** environment, which is
inherited from however VS Code itself was started.

- **Launched from a terminal** (`code .`) — inherits that shell's environment, including your
  `.bashrc`/`.zshrc` exports. ✅
- **Launched from a desktop icon / dock / Start menu** — inherits the *desktop session*
  environment, which usually has **not** sourced your shell rc files. `${env:PDK_ROOT}` will be
  empty even though it works fine in your terminal. ❌

Two more gotchas:

- **`terminal.integrated.env.*` does not help.** That only affects integrated *terminals*, never the
  extension host.
- **"Developer: Reload Window" does not pick up environment changes.** The extension host inherits
  its environment from the already-running main process. After changing an environment variable you
  must **fully quit and relaunch** VS Code.

### If you can't rely on the environment

Just hardcode the path — always unambiguous, and immune to all of the above:

```jsonc
{
  "xschem.libraryPaths": ["/opt/pdks/ihp-sg13g2/libs.tech/xschem"]
}
```

To check what the extension actually sees, enable `xschem.resolveDebug` and read the log
(*Help ▸ Toggle Developer Tools*); a path that expanded to nothing shows up as a skipped entry.

---

## Recipes

### A project repo plus an installed open PDK

The most common setup. Your repo's `xschemrc` pulls in the PDK:

```tcl
set ::env(PDK) ihp-sg13g2
source $env(PDK_ROOT)/$env(PDK)/libs.tech/xschem/xschemrc
```

**Option A — follow the `source` line automatically** (opt-in; open PDKs only):

```jsonc
{ "xschem.followXschemrcPdkSource": true }
```

**Option B — name the path explicitly** (works for any PDK, open or not):

```jsonc
{ "xschem.libraryPaths": ["${env:PDK_ROOT}/ihp-sg13g2/libs.tech/xschem"] }
```

Use Option B for a proprietary/foundry PDK — Option A deliberately refuses those.

### Sub-blocks in a sibling folder

A schematic at `blocks/amp/amp.sch` referencing `../filters/lpf.sym`:

```jsonc
{ "xschem.includeWorkspaceFolders": true }
```

This exposes the schematic's **own** workspace folder (never sibling roots of a multi-root
workspace), letting relative `../` references resolve. It's off by default to keep the webview's
read scope minimal. If you'd rather stay narrow, list the specific directory in
`xschem.libraryPaths` instead.

### A shared block library in another repo

```jsonc
{
  "xschem.libraryPaths": [
    "${workspaceFolder:platform}/docker/xschem_library",
    "~/work/common-analog/xschem"
  ]
}
```

### Turning off `xschemrc` auto-detection

If auto-detection picks up directories you'd rather control by hand:

```jsonc
{
  "xschem.autoDetectXschemrc": false,
  "xschem.libraryPaths": ["/abs/path/one", "/abs/path/two"]
}
```

---

## Search order and precedence

A reference like `sg13g2_pr/sg13_lv_nmos.sym` is tried in this order, first hit wins:

1. `https://…` — fetched directly.
2. **Absolute refs** (`C {/abs/foo.sym}`) — only if the path falls under a configured root;
   otherwise refused.
3. **Bundled libraries** — `devices/`, `sky130_*`, `sg13g2_*`, `stdcells/`, `mips_cpu/`.
4. **Your search roots** — `xschem.libraryPaths` in order, then auto-detected `xschemrc`
   directories (walking up from the schematic), then any followed open-PDK directory.
5. **Schematic-relative** — next to the `.sch`.
6. **Bare name** — a name with no `/` is retried as `devices/<name>`.

> ⚠️ **Bundled libraries win over your own copies.** Because step 3 precedes step 4, a
> `sky130_fd_pr/*` or `sg13g2_*` symbol that exists in the bundle resolves from the bundle even if
> you also list your PDK in `xschem.libraryPaths`. Symbols the bundle *lacks* still fall through to
> your roots. If you need your PDK's exact symbol revision for those prefixes, be aware the bundled
> copy takes precedence.

---

## Remote-SSH, WSL, and dev containers

The extension runs on the **remote/container** side, so every path is a path *there*, and the
environment is the remote one:

- Set `xschem.libraryPaths` in **Remote** settings, or in the workspace file, not in your local user
  settings — local paths won't exist remotely.
- A non-interactive SSH session often does **not** source `.bashrc`, so `${env:PDK_ROOT}` may be
  empty even though it's set when you log in normally. Prefer absolute paths, or set the variable
  somewhere the remote extension host will see it.
- For dev containers, put it in `containerEnv` in `devcontainer.json` so the extension host inherits
  it:

  ```jsonc
  {
    "containerEnv": { "PDK_ROOT": "/opt/pdks" },
    "customizations": {
      "vscode": {
        "settings": {
          "xschem.libraryPaths": ["/opt/pdks/ihp-sg13g2/libs.tech/xschem"]
        }
      }
    }
  }
  ```

---

## What the webview is allowed to read

The viewer runs in a sandboxed webview that can only read directories the extension explicitly hands
it. Those are, and only are:

- the extension's own bundled `dist/assets`, `dist/xschem_lib`, `dist/tcl`
- the opened schematic's directory
- every existing directory resolved from `xschem.libraryPaths`
- auto-detected `xschemrc` directories (in-workspace only)
- a followed open-PDK `libs.tech/xschem` directory, if `followXschemrcPdkSource` is on
- the schematic's own workspace folder, only if `includeWorkspaceFolders` is on

Everything else is unreachable: an absolute symbol reference outside every configured root is
refused rather than fetched. Widening the scope is always an explicit act on your part — which is
why `includeWorkspaceFolders` and `followXschemrcPdkSource` both default to off.

---

## Applying changes

| Change | What's needed |
|---|---|
| Edited an `xschem.*` setting | Close and reopen the schematic tab |
| Installed/updated the extension | **Developer: Reload Window** (required for the settings schema) |
| Changed an environment variable | **Fully quit and relaunch VS Code** |
