// Structural / integrity tests: the manifest, the patched bundles, and the bundled libraries are
// internally consistent — the extension will contribute what it claims and the patches are intact.
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { execFileSync } = require("child_process");

const REPO = path.resolve(__dirname, "..");
const DIST = path.join(REPO, "dist");
const idxPath = path.join(DIST, "assets", "index.js");
const extPath = path.join(DIST, "extension.cjs");
const idx = fs.readFileSync(idxPath, "utf8");
const ext = fs.readFileSync(extPath, "utf8");
const pkg = require(path.join(REPO, "package.json"));

let pass = 0, fail = 0;
function ok(name, cond) { console.log((cond ? "  OK  " : "FAIL  ") + name); cond ? pass++ : fail++; }

// --- package.json manifest ---
const props = pkg.contributes.configuration.properties;
ok("main points at dist/extension.cjs", pkg.main === "./dist/extension.cjs");
ok("declares all four settings", ["xschem.libraryPaths", "xschem.autoDetectXschemrc", "xschem.includeWorkspaceFolders", "xschem.resolveDebug"].every((k) => props[k]));
ok("libraryPaths default []", Array.isArray(props["xschem.libraryPaths"].default) && props["xschem.libraryPaths"].default.length === 0);
ok("autoDetectXschemrc default true", props["xschem.autoDetectXschemrc"].default === true);
ok("includeWorkspaceFolders default false", props["xschem.includeWorkspaceFolders"].default === false);
ok("resolveDebug default false", props["xschem.resolveDebug"].default === false);
const ce = pkg.contributes.customEditors[0];
ok("registers custom editor for .sch and .sym", ce && ce.viewType === "xschem.viewXschem" && ce.selector.some((x) => x.filenamePattern === "*.sch") && ce.selector.some((x) => x.filenamePattern === "*.sym"));
ok("registers run/edit commands", pkg.contributes.commands.some((c) => c.command === "xschem.runSimulation") && pkg.contributes.commands.some((c) => c.command === "xschem.editSchematic"));

// --- bundles parse ---
function checks(file, esm) {
	try { execFileSync("node", esm ? ["--check", "--input-type=module"] : ["--check", file], esm ? { input: fs.readFileSync(file) } : {}); return true; }
	catch (e) { return false; }
}
ok("dist/extension.cjs parses", checks(extPath, false));
ok("dist/assets/index.js parses (ESM)", checks(idxPath, true));

// --- resolver patch intact ---
ok("resolver reads configured roots", idx.includes("XSCHEM_EXTRA_LIBRARY_ROOTS"));
ok("resolver supports absolute refs (root map)", idx.includes("XSCHEM_ROOT_MAP"));
ok("host injects all three globals", ["XSCHEM_EXTRA_LIBRARY_ROOTS", "XSCHEM_ROOT_MAP", "XSCHEM_RESOLVE_DEBUG"].every((g) => ext.includes("window." + g)));
ok("host parses xschemrc appends", ext.includes("xParseAppends"));

// --- IHP default support ---
ok("no CSP-blocked IHP GitHub URL remains", !idx.includes("raw.githubusercontent.com/IHP-GmbH"));
ok("library map routes sg13g2_pr to the bundle", idx.includes('path:"sg13g2_pr",url:"xschem_lib/"'));
for (const f of ["sg13g2_pr/sg13_lv_nmos.sym", "sg13g2_pr/sg13_lv_pmos.sym", "sg13g2_pr/cap_cmim.sym", "sg13g2_stdcells/IHP130_stdcells.sym"]) {
	ok("bundled IHP symbol " + f, fs.existsSync(path.join(DIST, "xschem_lib", f)));
}
// IHP symbols carry their Apache-2.0 header (attribution retained)
ok("bundled IHP symbol retains Apache-2.0 header", fs.readFileSync(path.join(DIST, "xschem_lib/sg13g2_pr/sg13_lv_nmos.sym"), "utf8").includes("Apache License"));

// --- other bundled libs still present ---
for (const d of ["devices", "sky130_fd_pr"]) {
	ok("bundled lib dir " + d, fs.existsSync(path.join(DIST, "xschem_lib", d)) && fs.readdirSync(path.join(DIST, "xschem_lib", d)).some((f) => f.endsWith(".sym")));
}

console.log("\n=== manifest: " + pass + " passed, " + fail + " failed ===");
assert.strictEqual(fail, 0);
