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
const BEYOND = path.join(FIX, "beyond");           // ../beyond from proj: exists but OUTSIDE the workspace

// Extract the helper block between the fork markers and eval with injected deps.
const src = fs.readFileSync(path.join(REPO, "dist", "extension.cjs"), "utf8");
const a = src.indexOf("// ----- configurable library-path support");
const b = src.indexOf("// -------------------------------------------------------------");
assert.ok(a >= 0 && b > a, "helper markers present");
const block = src.slice(a, b);

const folders = [{ name: "proj", uri: { fsPath: PROJ } }];
let cfgStore = {};
const s = {
	workspace: {
		workspaceFolders: folders,
		getConfiguration: () => ({ get: (k) => cfgStore[k] }),
		getWorkspaceFolder: (uri) => {
			const p = uri.fsPath; let best = null;
			for (const wf of folders) { const f = wf.uri.fsPath; if (p === f || p.startsWith(f + path.sep)) { if (!best || f.length > best.uri.fsPath.length) best = wf; } }
			return best;
		},
	},
};
const { xExpand, xLibDirs, xParseAppends } = new Function(
	"s", "P", "O", "FS", block + "\n; return { xExpand, xLibDirs, xParseAppends };"
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

console.log("\n=== config: " + pass + " passed, " + fail + " failed ===");
assert.strictEqual(fail, 0);
