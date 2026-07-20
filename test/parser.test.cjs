// Property-tokenization tests for the SHIPPED viewer bundle — the guard for
// patches/xschem-viewer/0003-xschem-faithful-property-tokenization.patch.
//
// Why this file exists, and why it is not the render smoke test:
//
// The smoke test (npm run test:smoke) drives the real WASM viewer, but its assertions are
// value-blind — page errors, symbol resolution, shape count, bbox. A tokenization regression that
// TRUNCATES a value instead of throwing renders a perfectly normal-looking schematic and passes it
// green. That silent mode is the one patch 0003 makes more likely, because 0003 deliberately trades
// hard SyntaxErrors for leniency. So the smoke fixture guards only the loud failure, and it lives in
// a non-required workflow that needs a browser download.
//
// This file closes that gap: it asserts exact parsed VALUES, runs in the required Node 18/20/22
// matrix, and needs no dependencies. It reads the parser out of the shipped bundle, so it tests the
// artifact users actually install rather than a re-derivation of it.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const REPO = path.resolve(__dirname, "..");
const BUNDLE = path.join(REPO, "dist", "assets", "index.js");

let pass = 0, fail = 0;
function ok(name, cond) { console.log((cond ? "  OK  " : "FAIL  ") + name); cond ? pass++ : fail++; }
function eq(name, actual, expected) {
	const good = JSON.stringify(actual) === JSON.stringify(expected);
	ok(name + (good ? "" : `\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`), good);
}

// --- extract the peggy parser from the Vite bundle ------------------------------------------------
// The bundle is an ES module full of DOM code, so `import()` dies on `document is not defined`. The
// generated parser, though, is a self-contained DOM-free IIFE, so we slice it out and run it in a
// bare vm context. The anchors are deliberately strict: if minification moves and they stop
// matching, this throws and the suite FAILS rather than silently skipping the tokenization tests.
function loadParser(src) {
	// `}}();` in the older bundle, `}})();` in the current one — hence the optional paren.
	const endMatch = /return\{SyntaxError:\w+,parse:\w+\}\}\)?\(\);/.exec(src);
	if (!endMatch) throw new Error("parser end anchor not found in dist/assets/index.js — the bundle's shape changed; re-cut the anchors in test/parser.test.cjs");
	const end = endMatch.index + endMatch[0].length;
	// The parser IIFE is the last `<decl> <name>=function(){` (or `=(function(){`) before that return.
	const re = /(?:const|var|let)\s+(\w+)=\(?function\(\)\{/g;
	let start, name, m;
	while ((m = re.exec(src)) && m.index < end) { start = m.index; name = m[1]; }
	if (start === undefined) throw new Error("parser start anchor not found in dist/assets/index.js — re-cut the anchors in test/parser.test.cjs");
	const ctx = {};
	vm.createContext(ctx);
	vm.runInContext(src.slice(start, end) + "\nglobalThis.__parser=" + name + ";", ctx);
	if (!ctx.__parser || typeof ctx.__parser.parse !== "function") throw new Error("extracted object is not a peggy parser");
	return ctx.__parser;
}

const parser = loadParser(fs.readFileSync(BUNDLE, "utf8"));
ok("peggy parser extracted from the shipped bundle", typeof parser.parse === "function");

const HEADER = "v {xschem version=3.4.5 file_version=1.2}\n";
// Parse a single object record and hand back just its property map. A SyntaxError is returned as a
// value rather than thrown: a regressed grammar makes several of these throw at once, and a raw
// stack trace on the first one would hide the rest. This way every case still reports its own line.
function props(record) {
	let objects;
	try { objects = parser.parse(HEADER + record + "\n"); }
	catch (e) { return { __syntaxError: String(e.message) }; }
	const withProps = objects.find((o) => o && o.properties);
	return withProps ? withProps.properties : null;
}

// --- the regression this release fixes ------------------------------------------------------------
// Real xschem (token.c:438 get_tok_value) treats an unescaped `"` as a PARITY TOGGLE, not a
// delimiter: the value ends at the first SPACE() char reached while unquoted. So a value is a
// concatenation of alternating quoted and bare runs, and an ngspice comment mentioning "let"
// mid-value is ordinary content. Before 0003 this threw a SyntaxError that blanked the whole file.
eq("bare inner quotes are content, not a delimiter",
	props('K {name=R value="a ** vars defined by "let" become vars defined by "set" b"}'),
	{ name: "R", value: "a ** vars defined by let become vars defined by set b" });

eq("value survives with the full tail intact (truncation would drop it)",
	props('K {name=R value="head "mid" tail"}'),
	{ name: "R", value: "head mid tail" });

eq("alternating quoted/bare runs concatenate into one value",
	props('K {a=pre"mid"post b=2}'),
	{ a: "premidpost", b: "2" });

// --- SPACE() fidelity: `;` separates pairs, but only outside quotes -------------------------------
eq("';' separates property pairs (the new __ rule)", props("K {name=X;lab=Y}"), { name: "X", lab: "Y" });
eq("';' inside a quoted run stays part of the value", props('K {name=X value="a;b"}'), { name: "X", value: "a;b" });
// A space is protected only when a backslash SURVIVES pass 1 to escape it in pass 2 — i.e. when
// m = n>>1 is odd. One file backslash is consumed by load_ascii_string, so it protects nothing.
eq("n=1 backslash does NOT protect a space (consumed by pass 1)", props("K {a=x\\ y b=2}"), { a: "x", b: "2" });
eq("n=2 backslashes DO protect a space (m=1, odd)", props("K {a=x\\\\ y b=2}"), { a: "x y", b: "2" });
eq("n=3 backslashes protect a space (m=1, odd)", props("K {a=x\\\\\\ y b=2}"), { a: "x y", b: "2" });
eq("n=4 backslashes emit one backslash and do NOT protect (m=2, even)", props("K {a=x\\\\\\\\ y b=2}"), { a: "x\\", b: "2" });

// --- brace handling: pass-1 (load_ascii_string) business ------------------------------------------
eq("an escaped '}' is literal and does not end the record", props("K {name=X value=a\\}b}"), { name: "X", value: "a}b" });
eq("an escaped '}' is literal inside a quoted run too", props('K {name=X value="a\\}b"}'), { name: "X", value: "a}b" });

// --- the non-linear two-pass backslash fold -------------------------------------------------------
// save.c:3260 load_ascii_string() unescapes \X -> X, THEN token.c get_tok_value() re-escapes on that
// result. So n file backslashes leave m = n>>1 in memory and (n>>1)>>1 in the parsed value. A naive
// \\ -> \ rule gets this wrong and corrupts the 6-backslash runs in verilog_preprocessor.sym.
// These four cases pin the arithmetic the patch's own comment claims.
eq("backslash fold n=1 -> 0", props("K {a=\\x}"), { a: "x" });
eq("backslash fold n=2 -> 0", props("K {a=\\\\x}"), { a: "x" });
eq("backslash fold n=4 -> 1", props("K {a=\\\\\\\\x}"), { a: "\\x" });
eq("backslash fold n=6 -> 1", props("K {a=\\\\\\\\\\\\x}"), { a: "\\x" });

// --- documented lenient/faithful edge cases -------------------------------------------------------
// Odd final quote parity: the stray quote opens a run that swallows the rest of the line. This is
// what real xschem does (TOK_VALUE only ends on space && !quote && !escape), so `b` genuinely
// disappears rather than becoming its own pair. Pinned here so the behavior is deliberate, not
// incidental — it is a silent property-loss mode and must not drift unnoticed.
eq("odd quote parity swallows the rest of the line (xschem-faithful)", props('K {a=x" b=2}'), { a: "x b=2" });

// A file-level \" collapses to a bare " in memory and therefore toggles parity too.
eq("an escaped quote still toggles parity", props('K {a=\\\\"y" b=2}'), { a: '"y b=2' });

// --- corpus invariant -----------------------------------------------------------------------------
// Every library file the VSIX ships must parse. This is the check that would have caught the six
// bundled symbols patch 0003 fixes, and it costs about a second.
//
// Asserted as SET EQUALITY against a known-bad allowlist, not `<= 1`, so that an unexpected FIX is
// surfaced just as loudly as a new break — a silently-shrinking failure set is how a corpus test
// rots into a rubber stamp.
const KNOWN_UNPARSEABLE = [
	// Emits `G {}` before its `v {xschem ...}` header; the grammar only accepts the version block as
	// the very first element. Pre-existing and unrelated to tokenization — it fails identically on
	// the pre-0003 grammar. Tracked in TODO.md.
	"ihp-sg13g2/sg13g2_stdcells/sg13g2_a221oi_1.sym",
];

const LIB = path.join(REPO, "dist", "xschem_lib");
function walk(dir, out = []) {
	if (!fs.existsSync(dir)) return out;
	for (const e of fs.readdirSync(dir)) {
		const p = path.join(dir, e);
		if (fs.statSync(p).isDirectory()) walk(p, out);
		else if (p.endsWith(".sch") || p.endsWith(".sym")) out.push(p);
	}
	return out;
}

const corpus = walk(LIB);
ok("found the bundled library corpus (" + corpus.length + " files)", corpus.length > 500);

const broken = [];
for (const file of corpus) {
	try { parser.parse(fs.readFileSync(file, "utf8")); }
	catch (e) { broken.push(path.relative(LIB, file)); }
}
broken.sort();
const expected = [...KNOWN_UNPARSEABLE].sort();
eq("every bundled library file parses, except the known-bad allowlist", broken, expected);

console.log("\n=== parser: " + pass + " passed, " + fail + " failed ===");
assert.strictEqual(fail, 0);
