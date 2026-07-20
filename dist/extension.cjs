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
		if (!isDir(n)) { if (dbg && explicit) console.warn("[xschem-viewer] libraryPaths entry not found, skipping: " + n); return; }
		dirs.push(n);
	};
	const raw = cfg.get("libraryPaths");
	if (Array.isArray(raw)) for (const entry of raw) {
		if (typeof entry !== "string" || !entry.trim()) continue;
		let pth = xExpand(entry.trim(), wsFolder);
		if (!P.isAbsolute(pth)) pth = wsFolder ? P.join(wsFolder, pth) : P.resolve(pth);
		push(pth, true);
	}
	if (cfg.get("autoDetectXschemrc") !== false) {
		try {
			let dir = P.dirname(schematicUri.fsPath);
			const stop = wsFolder ? P.normalize(wsFolder) : null;
			for (let depth = 0; depth < 64; depth++) {
				try { if (FS.existsSync(P.join(dir, "xschemrc"))) push(dir, false); } catch (e) { }
				const parent = P.dirname(dir);
				if (!parent || parent === dir) break;
				if (stop && P.normalize(dir) === stop) break;
				dir = parent;
			}
		} catch (e) { }
	}
	return dirs;
}
// -------------------------------------------------------------

const o = class o {
	constructor(e) { h(this, "activeSchematic"); this.context = e; }
	static register(e) {
		const t = new o(e),
			r = s.window.registerCustomEditorProvider(o.viewType, t, { supportsMultipleEditorsPerDocument: !0, webviewOptions: { retainContextWhenHidden: !0 } }),
			c = s.commands.registerCommand("xschem.runSimulation", () => { console.log(t.activeSchematic), t.activeSchematic && l.exec(`xschem -x -n -S -q ${t.activeSchematic.uri.fsPath}`, (u, d, m) => { }); }),
			n = s.commands.registerCommand("xschem.editSchematic", () => { console.log(t.activeSchematic), t.activeSchematic && l.exec(`xschem ${t.activeSchematic.uri.fsPath}`, (u, d, m) => { }); });
		return e.subscriptions.push(r), e.subscriptions.push(c), e.subscriptions.push(n), r;
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
			const own = s.workspace.getWorkspaceFolder(e.uri);
			if (own) roots.push(own.uri);
			else for (const wf of s.workspace.workspaceFolders) roots.push(wf.uri);
		}
		t.webview.options = { enableScripts: !0, localResourceRoots: roots };
		this.activeSchematic = e;
		t.onDidChangeViewState((c) => { c.webviewPanel.active && (this.activeSchematic = e); });
		t.onDidDispose(() => { var c; ((c = this.activeSchematic) == null ? void 0 : c.uri.toString()) === e.uri.toString() && (this.activeSchematic = void 0); });
		t.webview.html = await this.getHtmlForWebview(e, t.webview);
	}
	async getHtmlForWebview(e, t) {
		const r = t.asWebviewUri(s.Uri.joinPath(this.context.extensionUri, "dist", "assets", "index.js")),
			c = t.asWebviewUri(s.Uri.joinPath(this.context.extensionUri, "dist", "assets", "index.css")),
			n = U();
		const libDirs = xLibDirs(e.uri);
		const rootUris = libDirs.map((d) => t.asWebviewUri(s.Uri.file(d)).toString());
		const dbg = xcfg().get("resolveDebug") === true;
		return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src ${t.cspSource};
				img-src ${t.cspSource} blob:; style-src ${t.cspSource}; script-src ${t.cspSource} 'nonce-${n}' 'unsafe-eval';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
    			<title>Xschem Viewer Online</title>
				<base href="${t.asWebviewUri(s.Uri.joinPath(this.context.extensionUri, "dist"))}/">
				<script nonce="${n}">
				window.XSCHEM_EXTRA_LIBRARY_ROOTS = ${JSON.stringify(rootUris)};
				window.XSCHEM_RESOLVE_DEBUG = ${dbg ? "true" : "false"};
				const targetUrl = new URL(window.location.href);
    			targetUrl.searchParams.set('file', "${t.asWebviewUri(e.uri)}");
    			window.history.pushState(null, '', targetUrl.toString());
				<\/script>
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
h(o, "viewType", "xschem.viewXschem");
let a = o;
exports.XschemEditorProvider = a;
exports.activate = f;
