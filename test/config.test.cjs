// Portable unit tests of the SHIPPED config helpers (dist/extension.cjs): variable expansion,
// library-dir resolution, xschemrc-append parsing. Extracted verbatim and run with mocked vscode.
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const REPO = path.resolve(__dirname, "..");
const FIX = path.join(__dirname, "fixtures");
const PROJ = path.join(FIX, "proj");
const SCHEM = path.join(PROJ, "blocks", "top.sch");
const EXTRA = path.join(PROJ, "libs", "extra");
const ALT = path.join(PROJ, "altlib");             // [file dirname [file normalize [info script]]]/altlib
const QUOTED = path.join(PROJ, "quotedlib");       // "[file dirname [info script]]/quotedlib"
const BEYOND = path.join(FIX, "beyond");           // ../beyond from proj: OUTSIDE the workspace (must be gated)
// PDK `source` following (opt-in). proj/xschemrc sources $env(PDK_ROOT)/$env(PDK)/libs.tech/xschem.
const PDKS = path.join(FIX, "pdks");                                       // stand-in $PDK_ROOT
const OPEN_PDK = path.join(PDKS, "ihp-sg13g2", "libs.tech", "xschem");     // open -> may be followed
const CLOSED_PDK = path.join(PDKS, "tsmcN65", "libs.tech", "xschem");      // proprietary -> must be refused
const CLOSED_PROJ = path.join(FIX, "closedproj");
const CLOSED_SCHEM = path.join(CLOSED_PROJ, "blocks", "top.sch");

// Extract the helper block between the fork markers and eval with injected deps.
const src = fs.readFileSync(path.join(REPO, "dist", "extension.cjs"), "utf8");
const a = src.indexOf("// ----- configurable library-path support");
const b = src.indexOf("// -------------------------------------------------------------");
assert.ok(a >= 0 && b > a, "helper markers present");
const block = src.slice(a, b);

const folders = [{ name: "proj", uri: { fsPath: PROJ } }];
let WF = folders;          // mutable so tests can exercise the no-workspace-open case
let cfgStore = {};
const s = {
	workspace: {
		get workspaceFolders() { return WF; },
		getConfiguration: () => ({ get: (k) => cfgStore[k] }),
		getWorkspaceFolder: (uri) => {
			const p = uri.fsPath; let best = null;
			for (const wf of (WF || [])) { const f = wf.uri.fsPath; if (p === f || p.startsWith(f + path.sep)) { if (!best || f.length > best.uri.fsPath.length) best = wf; } }
			return best;
		},
	},
};
const { xExpand, xLibDirs, xParseAppends, xParsePdkSource } = new Function(
	"s", "P", "O", "FS", block + "\n; return { xExpand, xLibDirs, xParseAppends, xParsePdkSource };"
)(s, path, os, fs);

const uri = { fsPath: SCHEM };
let pass = 0, fail = 0;
function ok(name, cond) { console.log((cond ? "  OK  " : "FAIL  ") + name); cond ? pass++ : fail++; }
function has(arr, d) { return arr.includes(path.normalize(d)); }

// 1) xExpand: named multi-root folder token
ok("xExpand ${workspaceFolder:proj}", xExpand("${workspaceFolder:proj}/libs/extra", PROJ) === path.join(PROJ, "libs/extra"));
// 2) xExpand: ${env:VAR}
process.env.XTEST_ROOT = FIX;
ok("xExpand ${env:VAR}", xExpand("${env:XTEST_ROOT}/libdir", PROJ) === path.join(FIX, "libdir"));
// 3) xExpand: unset env collapses (bogus path, later skipped by existence check)
ok("xExpand unset ${env:} -> leading empty", xExpand("${env:XTEST_NOPE}/x", PROJ) === "/x");

// 4) xParseAppends parses in-repo appends, resolves [file dirname [info script]], gates the rest
const appends = xParseAppends(path.join(PROJ, "xschemrc"), PROJ, PROJ);
ok("xParseAppends includes rc dir", has(appends, PROJ));
ok("xParseAppends includes normalized in-repo append (libs/extra)", has(appends, EXTRA));
ok("xParseAppends gates out-of-workspace append (../beyond)", !has(appends, BEYOND));
ok("xParseAppends skips $env(...) / source lines", appends.every((d) => !d.includes("SOME_PDK") && !d.includes("PDK_ROOT")));
ok("xParseAppends resolves [file dirname [file normalize [info script]]]/rel", has(appends, ALT));
ok("xParseAppends resolves quoted append", has(appends, QUOTED));

// 5) xLibDirs: autodetect xschemrc + parse appends (no explicit libraryPaths)
cfgStore = { libraryPaths: [], autoDetectXschemrc: true };
let dirs = xLibDirs(uri);
ok("xLibDirs autodetects xschemrc dir", has(dirs, PROJ));
ok("xLibDirs adds parsed in-repo append", has(dirs, EXTRA));
ok("xLibDirs excludes gated ../beyond", !has(dirs, BEYOND));

// 6) xLibDirs: explicit libraryPaths, named folder + nonexistent (skipped)
cfgStore = { libraryPaths: ["${workspaceFolder:proj}/libs/extra", "${workspaceFolder:proj}/does/not/exist"], autoDetectXschemrc: false };
dirs = xLibDirs(uri);
ok("xLibDirs resolves named-folder libraryPath", has(dirs, EXTRA));
ok("xLibDirs skips nonexistent libraryPath", !dirs.some((d) => d.includes("does" + path.sep + "not")));

// 7) xLibDirs: empty config -> empty
cfgStore = { libraryPaths: [], autoDetectXschemrc: false };
ok("xLibDirs empty when nothing configured", xLibDirs(uri).length === 0);

// 8) No workspace open (wsRoot/stop null): the gate must fall back to the rc's own dir, never vanish.
WF = [];
cfgStore = { libraryPaths: [], autoDetectXschemrc: true };
const noWs = xLibDirs(uri);
ok("no-workspace: still autodetects rc dir", has(noWs, PROJ));
ok("no-workspace: still adds in-tree append (libs/extra)", has(noWs, EXTRA));
ok("no-workspace: STILL gates out-of-tree append (../beyond)", !has(noWs, BEYOND));
WF = folders;

// 9) PDK `source` following — opt-in, allowlisted, out-of-tree.
process.env.PDK_ROOT = PDKS;
const PDK_RC = path.join(PROJ, "xschemrc");
const CLOSED_RC = path.join(CLOSED_PROJ, "xschemrc");

// 9a) unit: an OPEN PDK source line yields the PDK's libs.tech/xschem dir
ok("xParsePdkSource follows an OPEN PDK source line", has(xParsePdkSource(PDK_RC, false), OPEN_PDK));
// 9b) unit: a proprietary PDK is refused by the allowlist — and its dir EXISTS, so the refusal
//     is proven to come from the allowlist rather than from mere absence.
ok("proprietary PDK dir exists (refusal must be the allowlist, not absence)", fs.existsSync(CLOSED_PDK));
ok("xParsePdkSource REFUSES a proprietary PDK", xParsePdkSource(CLOSED_RC, false).length === 0);
// 9c) unit: an unset variable must refuse, not collapse to a bogus path rooted at "/"
delete process.env.PDK_ROOT;
const unsetDirs = xParsePdkSource(PDK_RC, false);
ok("xParsePdkSource refuses when PDK_ROOT is unset", unsetDirs.length === 0);
ok("...and never yields a path rooted at / from an empty expansion", !unsetDirs.some((d) => d.startsWith(path.sep + "ihp-sg13g2")));
process.env.PDK_ROOT = PDKS;

// 9d) integration: OFF by default (opt-in gate)
cfgStore = { libraryPaths: [], autoDetectXschemrc: true };
ok("xLibDirs does NOT follow PDK source by default", !has(xLibDirs(uri), OPEN_PDK));
// 9e) integration: enabled -> the open PDK dir becomes a search root
cfgStore = { libraryPaths: [], autoDetectXschemrc: true, followXschemrcPdkSource: true };
ok("xLibDirs follows an open PDK source when enabled", has(xLibDirs(uri), OPEN_PDK));
// 9f) integration: independent of autoDetectXschemrc
cfgStore = { libraryPaths: [], autoDetectXschemrc: false, followXschemrcPdkSource: true };
const pdkOnly = xLibDirs(uri);
ok("PDK following works with autoDetectXschemrc off", has(pdkOnly, OPEN_PDK));
ok("...without pulling in the in-repo append dirs", !has(pdkOnly, EXTRA));
// 9g) integration: proprietary PDK refused end-to-end
WF = [{ name: "closedproj", uri: { fsPath: CLOSED_PROJ } }];
cfgStore = { libraryPaths: [], autoDetectXschemrc: true, followXschemrcPdkSource: true };
ok("xLibDirs REFUSES a proprietary PDK end-to-end", !has(xLibDirs({ fsPath: CLOSED_SCHEM }), CLOSED_PDK));
WF = folders;
// 9h) integration: enabled but the PDK install doesn't exist -> nothing added
process.env.PDK_ROOT = path.join(FIX, "no-such-pdk-root");
cfgStore = { libraryPaths: [], autoDetectXschemrc: true, followXschemrcPdkSource: true };
ok("xLibDirs skips a non-existent PDK install", !xLibDirs(uri).some((d) => d.includes("no-such-pdk-root")));
delete process.env.PDK_ROOT;

console.log("\n=== config: " + pass + " passed, " + fail + " failed ===");
assert.strictEqual(fail, 0);
