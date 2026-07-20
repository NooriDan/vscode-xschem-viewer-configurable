// Portable end-to-end test of the SHIPPED symbol resolver (dist/assets/index.js).
// Extracts the real fetchContent method, drives it against the repo's bundled libraries
// and local fixtures, mocking fetch() to hit files (and simulating the webview CSP block).
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const REPO = path.resolve(__dirname, "..");
const DIST = path.join(REPO, "dist");
const FIX = path.join(__dirname, "fixtures");
const LIBDIR = path.join(FIX, "libdir");       // a configured search root
const SCHEMDIR = path.join(FIX, "schemdir");   // the opened schematic's directory (baseURL)

// --- extract `async fetchContent(<param>){ ... }` from the bundle by brace matching ---
// Matched by REGEX, not a literal signature: the minifier picks a different parameter name on every
// rebuild (the hand-patched bundle uses `i`, a from-source build via build-from-source.sh emits `o`),
// so a hardcoded "async fetchContent(i){" would silently stop matching after a legitimate rebuild.
function extractMethod(src, re) {
	const m = re.exec(src);
	if (!m) throw new Error("signature not found: " + re);
	const start = m.index;
	let depth = 0, i = src.indexOf("{", start);
	for (let j = i; j < src.length; j++) {
		const c = src[j];
		if (c === "{") depth++;
		else if (c === "}") { depth--; if (depth === 0) return src.slice(start, j + 1); }
	}
	throw new Error("unbalanced braces");
}
const idx = fs.readFileSync(path.join(DIST, "assets", "index.js"), "utf8");
const fetchContent = extractMethod(idx, /async fetchContent\([A-Za-z_$]*\)\s*\{/);

// --- globals the resolver reads ---
const LIB_URI = "https://wv.test/lib0";        // fake webview URI for LIBDIR
global.window = {
	XSCHEM_EXTRA_LIBRARY_ROOTS: [LIB_URI],
	XSCHEM_ROOT_MAP: [{ fs: LIBDIR, uri: LIB_URI }],
	XSCHEM_RESOLVE_DEBUG: false,
};
function tn(x) { return String(x); }
const SCHEM_BASE = "https://schem.test/dir/";  // baseURL host/dir -> SCHEMDIR
let lastFetches = [];
global.fetch = async function (u) {
	const url = typeof u === "string" ? u : u.toString();
	lastFetches.push(url);
	if (url.startsWith("https://raw.githubusercontent.com")) throw new TypeError("blocked by CSP: " + url);
	let real = null;
	if (url.startsWith("xschem_lib/")) real = path.join(DIST, url);          // <base href="dist/">
	else if (url.startsWith(LIB_URI + "/")) real = path.join(LIBDIR, url.slice(LIB_URI.length + 1));
	else if (url.startsWith(SCHEM_BASE)) real = path.join(SCHEMDIR, url.slice(SCHEM_BASE.length));
	const ok = real != null && fs.existsSync(real) && fs.statSync(real).isFile();
	return { ok, url, async text() { return fs.readFileSync(real, "utf8"); } };
};

function makeLib() {
	// Every free identifier in the extracted method is a minified module-scope helper whose name
	// changes on each rebuild. Only two shapes exist, and one stub covers both:
	//   githubURLToRaw(url) -> called WITH an argument; identity for the non-github URLs used here
	//   hostGlobals()       -> called with NO argument; returns the object holding the XSCHEM_* globals
	// A `with`-scope Proxy resolves real globals normally and everything else to that stub, so the
	// test never has to know the minifier's chosen names.
	const helper = (...a) => (a.length ? String(a[0]) : global.window);
	const scope = new Proxy(Object.create(null), {
		has: () => true,
		get: (_t, k) => {
			if (k === Symbol.unscopables) return undefined;
			if (k === "LIBS") return LIBS;
			if (k in global) return global[k];
			return helper;
		},
	});
	const Ao = new Function("scope", `
		with (scope) {
			return class Ao {
				constructor(){ this.libraries=LIBS; this.cache=new Map(); this.pathToUrl=new Map(); this.baseURL=null; }
				async load(i){ const r=this.cache.get(i); if(r!=null)return r; const l=await this.fetchContent(i); if(!l.ok) throw new Error("File not found: "+i); const s=await l.text(); return this.cache.set(i,s), s; }
				${fetchContent}
			};
		}
	`)(scope);
	const o = new Ao();
	o.baseURL = SCHEM_BASE + "top.sch";
	return o;
}
// Use the REAL bundled library map extracted from index.js (no drift). The constructor's minified
// class name changes per build, so match on the map's shape rather than a specific identifier.
const mapMatch = idx.match(/new [A-Za-z_$][A-Za-z0-9_$]*\((\[\{path:[^\]]*\])\)/);
if (!mapMatch) throw new Error("library map not found in index.js");
const LIBS = eval(mapMatch[1]);

const cases = [
	// [ref, shouldResolve, label]
	["devices/title.sym", true, "bundled generic device"],
	["capa.sym", true, "bare name -> devices/ fallback"],
	["sky130_fd_pr/nfet_01v8.sym", true, "bundled sky130 primitive"],
	["sg13g2_pr/sg13_lv_nmos.sym", true, "bundled IHP primitive (default, was CSP-blocked)"],
	["sg13g2_pr/cap_cmim.sym", true, "bundled IHP MIM cap"],
	["sg13g2_stdcells/IHP130_stdcells.sym", true, "bundled IHP stdcell"],
	["mylib/foo.sym", true, "configured libraryPaths root"],
	["local.sym", true, "schematic-relative (baseURL)"],
	[path.join(LIBDIR, "mylib/foo.sym"), true, "absolute ref under a configured root"],
	["nonexistent/nope.sym", false, "unknown symbol fails"],
	["/etc/shadow", false, "absolute ref outside any root is refused"],
];

// The IHP test galleries are fetched on demand (scripts/fetch-ihp-testlibs.sh), git-ignored, and
// absent from a clean checkout — so exercise their routing only when they're actually installed.
const haveTestlibs = fs.existsSync(path.join(DIST, "xschem_lib", "ihp-sg13g2", "sg13g2_tests", "ac_mim_cap.sym"));
if (haveTestlibs) cases.push(["sg13g2_tests/ac_mim_cap.sym", true, "on-demand IHP test gallery"]);
else console.log("  SKIP  on-demand IHP test gallery (run scripts/fetch-ihp-testlibs.sh to cover)");

(async () => {
	let pass = 0, fail = 0;
	for (const [ref, want, label] of cases) {
		lastFetches = [];
		let got = false;
		try { await makeLib().load(ref); got = true; } catch (e) { got = false; }
		const ok = got === want;
		console.log((ok ? "  OK  " : "FAIL  ") + (want ? "resolves " : "refuses  ") + label + "  [" + ref + "]");
		if (!ok) { console.log("        tried: " + lastFetches.join("  |  ")); fail++; } else pass++;
	}
	console.log("\n=== resolver: " + pass + " passed, " + fail + " failed ===");
	assert.strictEqual(fail, 0);
})().catch((e) => { console.error(e); process.exit(1); });
