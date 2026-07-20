# Upstreaming the resolver fix

Status: **prepared, not submitted.** Nothing here has been pushed and no pull request has been
opened against either upstream project. This document is the ready-to-send material; opening the
PRs is a deliberate, human decision.

## The change splits across two projects

`TODO.md` originally framed this as one PR to `barakhoffer/vscode-xschem-viewer`. Reading both
upstreams shows the fix actually belongs in **two** places, because the resolver and the host that
configures it live in different repos:

| Change | Lives in | Upstream repo |
|---|---|---|
| The `fetchContent` resolver (fall-through, search roots, absolute refs) | `src/model/LibraryLoader.ts` | [`TinyTapeout/xschem-viewer`](https://github.com/TinyTapeout/xschem-viewer) |
| The VS Code host (settings, `localResourceRoots`, injected globals) | `src/extension.ts` | [`barakhoffer/vscode-xschem-viewer`](https://github.com/barakhoffer/vscode-xschem-viewer) |

`barakhoffer/vscode-xschem-viewer` consumes the viewer by cloning TinyTapeout's repo during
`build_viewer.sh`, so the resolver PR must land (or be vendored) first — the host PR only supplies
the globals the resolver reads.

## PR 1 — TinyTapeout/xschem-viewer (the resolver)

Ready to submit as-is: [`patches/xschem-viewer/0001-configurable-library-search-roots.patch`](../patches/xschem-viewer/0001-configurable-library-search-roots.patch).
It applies cleanly to `4a2bc83` and is the same patch this fork builds and ships.

Do **not** include `0002-bundled-local-libraries.patch` — that one repoints the library map at this
extension's bundled copies, which is specific to a packaged/offline consumer, not something upstream
wants.

<details>
<summary>Suggested PR title and body</summary>

**Title:** `LibraryLoader: fall through on a failed library fetch, and support host-provided search roots`

**Body:**

> ### Problem
>
> `LibraryLoader.fetchContent` returns the *first* library whose `path` prefix matches, even when
> that fetch fails:
>
> ```ts
> for (const library of this.libraries) {
>   if (path.startsWith(library.path)) {
>     const url = library.url + path;
>     return await fetch(url);   // <- returns even when !ok
>   }
> }
> ```
>
> A prefix match therefore *shadows* every later resolution step. Two consequences:
>
> 1. **A failed/blocked PDK fetch is fatal rather than a miss.** In an embedding where the
>    `raw.githubusercontent.com` URLs are unreachable — a VS Code webview blocks them by
>    Content-Security-Policy — `sg13g2_pr/*` resolves to a rejected fetch and the schematic
>    silently fails to render, even though the file is available locally.
> 2. **There is no way to point the loader at local libraries.** Embedders can't express an
>    `XSCHEM_LIBRARY_PATH`-style search list.
>
> ### Change
>
> - A failed or throwing fetch becomes a **miss that falls through** to the next candidate instead
>   of aborting. Every `fetch` is wrapped so a CSP rejection can't throw out of the chain. The last
>   non-ok response is kept, so a genuine miss still reports a real status instead of a bare throw.
> - Optional host-provided globals, read at fetch time (all no-ops when unset, so default behavior
>   is unchanged):
>   - `XSCHEM_EXTRA_LIBRARY_ROOTS: string[]` — base URLs tried as `<root>/<path>`.
>   - `XSCHEM_ROOT_MAP: {fs, uri}[]` — maps a filesystem prefix to a fetchable base URL so absolute
>     symbol references (`C {/abs/foo.sym}`) resolve. An absolute ref outside every declared root is
>     refused rather than fetched.
>   - `XSCHEM_RESOLVE_DEBUG: boolean` — logs each attempt.
>
> Resolution order becomes: `https://` → absolute-ref root map → library prefixes → host search
> roots → schematic-relative (unchanged) → bare-name `devices/` fallback (unchanged).
>
> ### Compatibility
>
> No API change and no new dependency. With none of the globals set the only behavioral difference
> is that a failed library fetch now falls through instead of returning the failed response — which
> is what the later fallbacks were already there to handle.
>
> ### Testing
>
> Built with the repo's own Vite config and exercised against a 12-case resolver suite (bundled
> device/PDK symbols, host search roots, schematic-relative refs, absolute refs inside and outside a
> declared root, unknown symbols). Downstream at
> [NooriDan/vscode-xschem-viewer-configurable](https://github.com/NooriDan/vscode-xschem-viewer-configurable),
> this took a real IHP SG13G2 design from 8/19 to 19/19 symbols resolved.

</details>

## PR 2 — barakhoffer/vscode-xschem-viewer (the host)

This one is **not** a ready-made patch. Upstream's `src/extension.ts` is the TypeScript original;
this fork's equivalent logic lives in the built `dist/extension.cjs` (see the block marked
`// ----- configurable library-path support (fork addition) -----`) and would need porting back to
TypeScript before submission.

Scope to offer:

- `xschem.libraryPaths`, `xschem.autoDetectXschemrc`, `xschem.includeWorkspaceFolders`,
  `xschem.resolveDebug` settings.
- Adding the resolved directories to the webview's `localResourceRoots`.
- Injecting `XSCHEM_EXTRA_LIBRARY_ROOTS` / `XSCHEM_ROOT_MAP` / `XSCHEM_RESOLVE_DEBUG` via the
  nonce'd inline script.
- Bundling the IHP SG13G2 symbols so `sg13g2_*` resolves offline (upstream currently points them at
  a CSP-blocked GitHub URL).

Probably **hold back** from the first PR, as fork-specific policy rather than generally-wanted
behavior:

- `xschem.followXschemrcPdkSource` and its open-PDK allowlist — an opinionated trust boundary.
- The per-PDK `xschem_lib/<pdk>/` namespacing, which changes upstream's bundle layout.

## Before opening either PR

- [ ] Check each project's CONTRIBUTING / issue tracker; consider opening an issue describing the
      CSP-shadowing bug first, so the fix lands with agreed framing.
- [ ] Re-run `./build-from-source.sh` against upstream's current `main` and re-cut patch 0001 if it
      has drifted from the pinned `4a2bc83`.
- [ ] Confirm the DCO/CLA situation for each repo.
- [ ] Both upstreams are Apache-2.0, as is this fork — no license friction expected.
