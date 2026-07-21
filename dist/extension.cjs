"use strict";
var p = Object.defineProperty;
var v = (i, e, t) => e in i ? p(i, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : i[e] = t;
var h = (i, e, t) => v(i, typeof e != "symbol" ? e + "" : e, t);
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const g = require("vscode"), l = require("child_process");
const P = require("path"), O = require("os"), FS = require("fs");
function S(i) {
	const e = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
	if (i) { for (const t in i) if (t !== "default") { const r = Object.getOwnPropertyDescriptor(i, t); Object.defineProperty(e, t, r.get ? r : { enumerable: !0, get: () => i[t] }); } }
	return e.default = i, Object.freeze(e);
}
const s = S(g);
function f(i) { a.register(i); }
function U() { let i = ""; const e = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; for (let t = 0; t < 32; t++) i += e.charAt(Math.floor(Math.random() * e.length)); return i; }

// ----- configurable library-path support (fork addition) -----
const xWarned = new Set(); // explicit libraryPaths already surfaced this session (warn once each)
function xcfg() { return s.workspace.getConfiguration("xschem"); }
function xWsFolder(uri) {
	try { const wf = s.workspace.getWorkspaceFolder(uri); if (wf) return wf.uri.fsPath; } catch (e) { }
	const all = s.workspace.workspaceFolders;
	return all && all.length ? all[0].uri.fsPath : void 0;
}
function xExpand(str, wsFolder) {
	let out = String(str);
	// ${workspaceFolder:NAME} — explicit, unambiguous in a multi-root workspace (recommended).
	out = out.replace(/\$\{workspaceFolder:([^}]+)\}/g, (_, nm) => {
		const wf = (s.workspace.workspaceFolders || []).find((w) => w.name === nm);
		return wf ? wf.uri.fsPath : "";
	});
	// Bare ${workspaceFolder} — the schematic's own (innermost) workspace folder.
	if (wsFolder) out = out.split("${workspaceFolder}").join(wsFolder);
	out = out.replace(/\$\{env:([^}]+)\}/g, (_, vn) => process.env[vn] || "");
	out = out.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, vn) => process.env[vn] || "");
	if (out === "~" || out.startsWith("~/") || out.startsWith("~\\")) out = O.homedir() + out.slice(1);
	return out;
}
// Parse `append XSCHEM_LIBRARY_PATH <expr>` lines from an xschemrc, resolving the common
// `[file dirname [info script]]` idiom to the rc's own directory (with any trailing relative
// path). Only existing, in-workspace directories are returned; lines using $env(...) or `source`
// (i.e. a foundry/PDK xschemrc that may point out of tree) are intentionally skipped and left to
// explicit `xschem.libraryPaths` — this keeps out-of-tree PDKs opt-in.
function xRelFromInfoScript(expr) {
	if (expr.indexOf("[info script]") < 0) return null;
	// Accept [info script] nested under any [file dirname ...] wrapper (incl. [file normalize ...]),
	// but reject non-dirname uses like `source [info script]`. A library path is a directory.
	if (!/\[file\s+dirname\b[^\]]*\[info script\]/.test(expr)) return null;
	let after = expr.slice(expr.indexOf("[info script]") + "[info script]".length);
	after = after.replace(/^\]+/, "").replace(/\]+\s*$/, "").replace(/["'}]+\s*$/, "").trim(); // drop closers + trailing quotes/braces
	if (after.startsWith("/") || after.startsWith("\\")) after = after.slice(1);
	return after === "" ? "." : after;
}
function xParseAppends(rcPath, rcDir, wsRoot) {
	const out = [];
	let text;
	try { text = FS.readFileSync(rcPath, "utf8"); } catch (e) { return out; }
	const re = /^[ \t]*append[ \t]+XSCHEM_LIBRARY_PATH[ \t]+(.+?)[ \t]*$/gm;
	let m;
	while ((m = re.exec(text))) {
		let expr = m[1].trim();
		if (/\$env\(|\bsource\b/.test(expr)) continue;
		expr = expr.replace(/^:/, "");
		const rel = xRelFromInfoScript(expr);
		if (rel == null) continue;
		const resolved = P.normalize(P.join(rcDir, rel));
		// Gate to the workspace root, or the rc's own directory when no folder is open (a null gate
		// must never mean "no gate"). Resolve symlinks on both sides so an in-tree symlink cannot
		// smuggle in an out-of-tree PDK directory. Non-existent paths fall back to the lexical form
		// and are dropped later by the isDir() check in xLibDirs.
		const gate = wsRoot || rcDir;
		let real, gateReal;
		try { real = FS.realpathSync(resolved); } catch (e) { real = resolved; }
		try { gateReal = FS.realpathSync(gate); } catch (e) { gateReal = P.normalize(gate); }
		if (!(real === gateReal || real.startsWith(gateReal + P.sep))) continue;
		out.push(resolved);
	}
	return out;
}
// Open-source PDKs whose OUT-OF-TREE xschem library dir we're willing to auto-add when
// `xschem.followXschemrcPdkSource` is on. A repo's xschemrc commonly does:
//   set ::env(PDK) ihp-sg13g2
//   source $env(PDK_ROOT)/$env(PDK)/libs.tech/xschem/xschemrc
// pulling in the PDK's library tree that lives outside the workspace. We follow that ONLY for PDKs
// on this allowlist (open silicon) — never a proprietary/foundry PDK name.
const xOpenPdk = [/^sky130[a-z0-9]*$/i, /^gf180mcu[a-z0-9]*$/i, /^ihp[-_]?sg13g2$/i, /^sg13g2$/i];
function xIsOpenPdk(name) {
	return typeof name === "string" && xOpenPdk.some((re) => re.test(name.trim()));
}
// Expand Tcl-style $env(VAR) / ${VAR} / $VAR against the process environment. `pdkName` (parsed from
// the rc's `set ::env(PDK) …`) overrides $env(PDK)/$PDK so an rc that sets it inline is honored even
// when the host process didn't export PDK. Returns null if ANY referenced variable is unset/empty:
// an unset PDK_ROOT would otherwise collapse `$env(PDK_ROOT)/$env(PDK)/libs.tech/xschem` down to a
// bogus absolute path rooted at "/", so a partial expansion must never be treated as a real path.
function xTclEnv(str, pdkName) {
	let missing = false;
	const val = (v) => {
		const r = v === "PDK" && pdkName ? pdkName : (process.env[v] || "");
		if (!r) missing = true;
		return r;
	};
	const out = String(str)
		.replace(/\$\{?env\(([A-Za-z_][A-Za-z0-9_]*)\)\}?/g, (_, v) => val(v))
		.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, v) => val(v))
		.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, v) => val(v));
	return missing ? null : out;
}
// Parse an xschemrc that `source`s an OPEN PDK's xschemrc, returning that PDK's `libs.tech/xschem`
// directory (absolute) so its libraries resolve. Opt-in and allowlisted: this deliberately reaches
// OUTSIDE the workspace, so it is gated on the resolved path's PDK segment (…/<pdk>/libs.tech/xschem)
// being an open PDK. An unresolved variable, a proprietary PDK name, or a missing PDK_ROOT yields
// nothing. Existence is enforced later by xLibDirs' isDir() check.
function xParsePdkSource(rcPath, dbg) {
	const out = [];
	let text;
	try { text = FS.readFileSync(rcPath, "utf8"); } catch (e) { return out; }
	// PDK name for $env(PDK) expansion: `set ::env(PDK) X` / `set env(PDK) X` / `set PDK X`, else env.
	let pdk = null;
	const pm = text.match(/^[ \t]*set[ \t]+(?:::)?(?:env\(PDK\)|PDK)[ \t]+(.+?)[ \t]*$/m);
	if (pm) pdk = pm[1].replace(/^["'{]+|["'}]+$/g, "").trim();
	if (!pdk) pdk = process.env.PDK || null;
	const marker = "libs.tech/xschem";
	const re = /^[ \t]*source[ \t]+(.+?)[ \t]*$/gm;
	let m;
	while ((m = re.exec(text))) {
		let raw = m[1].replace(/^["']+|["']+$/g, "").trim();
		if (raw.indexOf(marker) < 0) continue;                 // only follow rc's that source a PDK xschem tree
		const expanded = xTclEnv(raw, pdk);
		if (expanded == null) {                                // an unset/empty variable -> refuse
			if (dbg) console.warn("[xschem-viewer] xschemrc PDK source has an unset variable, skipping: " + raw);
			continue;
		}
		if (expanded.indexOf("$") >= 0) continue;              // leftover literal $ -> refuse (never trust a partial path)
		const at = expanded.indexOf(marker);
		const dir = P.normalize(expanded.slice(0, at + marker.length));
		if (!P.isAbsolute(dir)) continue;                      // out-of-tree roots must be absolute
		// Gate on the resolved path itself: the segment naming the PDK (…/<pdk>/libs.tech/xschem) must
		// be an open-source PDK. This — not `set PDK` — is what actually widens the webview's read scope,
		// so a proprietary PDK path is refused even if `set PDK` claimed something open.
		const pdkSeg = P.basename(P.dirname(P.dirname(dir)));
		if (!xIsOpenPdk(pdkSeg)) {
			if (dbg) console.warn("[xschem-viewer] xschemrc PDK source not on the open-PDK allowlist, skipping: " + dir + " (pdk=" + pdkSeg + ")");
			continue;
		}
		if (!out.includes(dir)) out.push(dir);
	}
	return out;
}
// Absolute directories that should become library search roots for a given schematic.
function xLibDirs(schematicUri) {
	const cfg = xcfg();
	const dbg = cfg.get("resolveDebug") === true;
	const wsFolder = xWsFolder(schematicUri);
	const dirs = [];
	const isDir = (d) => { try { return FS.existsSync(d) && FS.statSync(d).isDirectory(); } catch (e) { return false; } };
	// Only real directories become search roots; a misconfigured/nonexistent entry is skipped
	// (and surfaced when resolveDebug is on) rather than silently polluting localResourceRoots.
	const push = (d, explicit) => {
		const n = P.normalize(d);
		if (dirs.includes(n)) return;
		if (!isDir(n)) {
			if (explicit) {
				if (dbg) console.warn("[xschem-viewer] libraryPaths entry not found, skipping: " + n);
				if (!xWarned.has(n)) { xWarned.add(n); try { s.window.showWarningMessage("Xschem Viewer: library path not found, skipping “" + n + "” (check xschem.libraryPaths)."); } catch (e) { } }
			}
			return;
		}
		dirs.push(n);
	};
	const raw = cfg.get("libraryPaths");
	if (Array.isArray(raw)) for (const entry of raw) {
		if (typeof entry !== "string" || !entry.trim()) continue;
		let pth = xExpand(entry.trim(), wsFolder);
		if (!P.isAbsolute(pth)) pth = wsFolder ? P.join(wsFolder, pth) : P.resolve(pth);
		push(pth, true);
	}
	// The xschemrc walk feeds two independent features: in-workspace `append` parsing (on by default)
	// and out-of-tree open-PDK `source` following (opt-in). Walk if either is enabled.
	const autoRc = cfg.get("autoDetectXschemrc") !== false;
	const followPdk = cfg.get("followXschemrcPdkSource") === true;
	if (autoRc || followPdk) {
		try {
			let dir = P.dirname(schematicUri.fsPath);
			const stop = wsFolder ? P.normalize(wsFolder) : null;
			for (let depth = 0; depth < 64; depth++) {
				try {
					const rc = P.join(dir, "xschemrc");
					if (FS.existsSync(rc)) {
						if (autoRc) {
							push(dir, false);
							for (const extra of xParseAppends(rc, dir, stop)) push(extra, false);
						}
						// Out-of-tree, so never workspace-gated: safety comes from the opt-in, the
						// open-PDK allowlist inside xParsePdkSource, and push()'s existence check.
						if (followPdk) for (const pdkDir of xParsePdkSource(rc, dbg)) push(pdkDir, false);
					}
				} catch (e) { }
				const parent = P.dirname(dir);
				if (!parent || parent === dir) break;
				if (stop && P.normalize(dir) === stop) break;
				dir = parent;
			}
		} catch (e) { }
	}
	return dirs;
}
// ----- hierarchy navigation (fork addition) -----
// Descending is already history-based upstream: clicking a component calls
// `history.pushState({path}, '', ?file=…)` and the root component restores from `popstate`. So the
// whole descend stack exists in the webview already — there was just no way to walk back up it.
// This wires that stack to the editor-title buttons and Alt+Left/Right.
//
// "Up" is history.back(), NOT a parent lookup. A .sym is instantiated in arbitrarily many parents,
// so there is no unique parent to compute; the stack you descended is the only correct answer, and
// it is what xschem itself walks.
//
// The script below is injected inline (nonce'd) into the webview head and MUST run before the app's
// module script so its pushState wrapper is in place before the first descend. It is exported for
// test/navigation.test.cjs, which evaluates it against a fake window/history — a browser-free guard
// on the depth arithmetic, which is the only part with real logic in it.
const NAV_SCRIPT = `
(function () {
	const vscode = acquireVsCodeApi();
	// Position within OUR stack. The initial entry (pushed above to carry ?file=) is depth 0.
	let depth = 0;
	// Highest entry currently reachable forward. A fresh pushState truncates browser forward history,
	// so it also truncates ours — otherwise "down" would stay enabled pointing at a dead entry.
	let top = 0;
	const post = () => vscode.postMessage({ type: "xschem.nav.state", canUp: depth > 0, canDown: depth < top });
	const origPush = history.pushState.bind(history);
	history.pushState = function (state, title, url) {
		depth += 1;
		top = depth;
		const r = origPush({ ...(state || {}), __xdepth: depth }, title, url);
		// Must report here too: pushState fires no event, so without this the buttons stay stale
		// until the next popstate — i.e. "up" would not light up until after you had already gone up.
		post();
		return r;
	};
	// A popstate entry with no __xdepth is the initial one (pushed before this wrapper installed).
	addEventListener("popstate", (e) => {
		depth = (e.state && typeof e.state.__xdepth === "number") ? e.state.__xdepth : 0;
		post();
	});
	addEventListener("message", (e) => {
		const m = e.data;
		if (!m || m.type !== "xschem.nav") return;
		// Guard on OUR depth, not just the host's when-clause. A context key can go stale (it is set
		// asynchronously and is global to the window), and history.back() at depth 0 would walk the
		// iframe off the app entirely into a blank document with no way back.
		if (m.dir === "up") { if (depth > 0) history.back(); }
		else if (m.dir === "down") { if (depth < top) history.forward(); }
		else if (m.dir === "report") post();
	});
	post();
})();
`;
// -------------------------------------------------------------

const o = class o {
	constructor(e) { h(this, "activeSchematic"); h(this, "activePanel"); this.context = e; }
	// Push the enablement keys the editor-title buttons and keybindings are gated on. Called with
	// both false whenever no Xschem editor is active, so a stale "enabled" never leaks into another
	// editor's title bar — the keys are global to the window, not per-editor.
	static setNavContext(canUp, canDown) {
		s.commands.executeCommand("setContext", "xschemViewer.canGoUp", !!canUp);
		s.commands.executeCommand("setContext", "xschemViewer.canGoDown", !!canDown);
	}
	nav(dir) { var e; (e = this.activePanel) == null || e.webview.postMessage({ type: "xschem.nav", dir }); }
	// child_process.exec errors used to be silently discarded, so a missing `xschem` binary (e.g. VS
	// Code launched from a GUI/dock and not inheriting the shell's PATH — see TROUBLESHOOTING.md)
	// failed with zero feedback. Surface it instead. execFile (not exec) also avoids building a shell
	// command line by string interpolation, so a schematic path with a space or shell metacharacter
	// no longer breaks — or is unsafely interpreted as shell syntax.
	static runXschemCmd(label, args) {
		l.execFile("xschem", args, (err, stdout, stderr) => {
			if (!err) return;
			const notFound = err.code === "ENOENT" || /command not found|not recognized as an internal/i.test(String(stderr || err.message || ""));
			const detail = String(stderr || err.message || err).trim();
			const hint = notFound ? " 'xschem' was not found on PATH. The extension host inherits VS Code's own launch environment, not your shell's — see Troubleshooting in the README/docs if VS Code wasn't started from a terminal that has 'xschem' on PATH." : "";
			s.window.showErrorMessage(`Xschem: ${label} failed: ${detail}${hint}`);
		});
	}
	static register(e) {
		const t = new o(e),
			r = s.window.registerCustomEditorProvider(o.viewType, t, { supportsMultipleEditorsPerDocument: !0, webviewOptions: { retainContextWhenHidden: !0 } }),
			c = s.commands.registerCommand("xschemViewerConfigurable.runSimulation", () => { t.activeSchematic && o.runXschemCmd("Run Simulation", ["-x", "-n", "-S", "-q", t.activeSchematic.uri.fsPath]); }),
			n = s.commands.registerCommand("xschemViewerConfigurable.editSchematic", () => { t.activeSchematic && o.runXschemCmd("Open in Xschem", [t.activeSchematic.uri.fsPath]); }),
			gu = s.commands.registerCommand("xschemViewerConfigurable.goUp", () => t.nav("up")),
			gd = s.commands.registerCommand("xschemViewerConfigurable.goDown", () => t.nav("down"));
		return e.subscriptions.push(r), e.subscriptions.push(c), e.subscriptions.push(n), e.subscriptions.push(gu), e.subscriptions.push(gd), r;
	}
	async openCustomDocument(e) { return { uri: e, dispose: () => { } }; }
	async resolveCustomEditor(e, t, r) {
		const libDirs = xLibDirs(e.uri);
		const roots = [
			s.Uri.joinPath(this.context.extensionUri, "dist", "assets"),
			s.Uri.joinPath(this.context.extensionUri, "dist", "xschem_lib"),
			s.Uri.joinPath(this.context.extensionUri, "dist", "tcl"),
			s.Uri.joinPath(e.uri, ".."),
			...libDirs.map((d) => s.Uri.file(d))
		];
		// Off by default (minimal blast radius). When enabled, expose only the schematic's OWN
		// workspace folder — not sibling roots — so relative "../" sub-block refs resolve without
		// widening the webview's file-read scope to the whole (multi-root) workspace.
		if (xcfg().get("includeWorkspaceFolders") === true && s.workspace.workspaceFolders) {
			// ONLY the schematic's own folder. A schematic opened from outside every workspace folder
			// has no "own" folder — previously that fell back to exposing ALL folders, which broke the
			// documented contract ("never sibling roots") in exactly the case the user has least
			// reason to expect it. Its own directory is already a root regardless, and anything else
			// stays explicit via xschem.libraryPaths.
			const own = s.workspace.getWorkspaceFolder(e.uri);
			if (own) roots.push(own.uri);
		}
		t.webview.options = { enableScripts: !0, localResourceRoots: roots };
		this.activeSchematic = e;
		this.activePanel = t;
		// Latest depth report from THIS panel. Cached so re-activating an editor restores its button
		// state immediately; the "report" round-trip below refreshes it in case the webview moved on
		// while hidden (retainContextWhenHidden keeps it alive and interactive).
		let navState = { canUp: !1, canDown: !1 };
		t.webview.onDidReceiveMessage((c) => {
			if (!c || c.type !== "xschem.nav.state") return;
			navState = { canUp: !!c.canUp, canDown: !!c.canDown };
			if (this.activePanel === t) o.setNavContext(navState.canUp, navState.canDown);
		});
		t.onDidChangeViewState((c) => {
			if (c.webviewPanel.active) {
				this.activeSchematic = e;
				this.activePanel = t;
				o.setNavContext(navState.canUp, navState.canDown);
				t.webview.postMessage({ type: "xschem.nav", dir: "report" });
			} else if (this.activePanel === t) {
				// Another editor took focus. Drop the keys rather than leaving this panel's stack
				// advertised on someone else's title bar.
				this.activePanel = void 0;
				o.setNavContext(!1, !1);
			}
		});
		t.onDidDispose(() => {
			var c; ((c = this.activeSchematic) == null ? void 0 : c.uri.toString()) === e.uri.toString() && (this.activeSchematic = void 0);
			this.activePanel === t && (this.activePanel = void 0, o.setNavContext(!1, !1));
		});
		t.webview.html = await this.getHtmlForWebview(e, t.webview);
	}
	async getHtmlForWebview(e, t) {
		const r = t.asWebviewUri(s.Uri.joinPath(this.context.extensionUri, "dist", "assets", "index.js")),
			c = t.asWebviewUri(s.Uri.joinPath(this.context.extensionUri, "dist", "assets", "index.css")),
			n = U();
		const libDirs = xLibDirs(e.uri);
		const rootUris = libDirs.map((d) => t.asWebviewUri(s.Uri.file(d)).toString());
		// {fs, uri} pairs let the resolver map an absolute symbol ref (C {/abs/foo.sym}) that falls
		// under a configured library root to the corresponding webview URI.
		const rootMap = libDirs.map((d) => ({ fs: d, uri: t.asWebviewUri(s.Uri.file(d)).toString() }));
		const dbg = xcfg().get("resolveDebug") === true;
		return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src ${t.cspSource};
				img-src ${t.cspSource} blob:; font-src ${t.cspSource} data:; style-src ${t.cspSource}; script-src ${t.cspSource} 'nonce-${n}' 'unsafe-eval';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
    			<title>Xschem Viewer Online</title>
				<base href="${t.asWebviewUri(s.Uri.joinPath(this.context.extensionUri, "dist"))}/">
				<script nonce="${n}">
				window.XSCHEM_EXTRA_LIBRARY_ROOTS = ${JSON.stringify(rootUris)};
				window.XSCHEM_ROOT_MAP = ${JSON.stringify(rootMap)};
				window.XSCHEM_RESOLVE_DEBUG = ${dbg ? "true" : "false"};
				const targetUrl = new URL(window.location.href);
    			targetUrl.searchParams.set('file', "${t.asWebviewUri(e.uri)}");
    			window.history.pushState(null, '', targetUrl.toString());
				<\/script>
				<script nonce="${n}">${NAV_SCRIPT}<\/script>
				<script type="module" crossorigin src="${r}"><\/script>
    			<link rel="stylesheet" crossorigin href="${c}">
			</head>
			<body>
			<div id="root"></div>
			<footer hidden></footer>
			</body>
			</html>`;
	}
};
h(o, "viewType", "xschemViewerConfigurable.editor");
let a = o;
exports.XschemEditorProvider = a;
exports.activate = f;
exports.__navScript = NAV_SCRIPT; // test-only handle; see test/navigation.test.cjs
