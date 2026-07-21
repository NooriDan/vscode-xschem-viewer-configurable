// Headless render smoke test: drives the REAL WASM viewer in headless Chromium and asserts that a
// schematic referencing bundled symbols actually renders — the one thing the resolver/config/manifest
// unit tests cannot cover (they exercise resolution logic, never the renderer).
//
// Deliberately NOT part of `npm test`: that suite is dependency-free and must stay that way. This
// needs Playwright + a browser, so it runs via `npm run test:smoke` and its own CI workflow.
//
//   npm i --no-save playwright && npx playwright install --with-deps chromium
//   npm run test:smoke                  # add --headed --keep-open to watch it
//
// It serves the repo over https (see the TLS note below) and loads a page that reproduces what
// dist/extension.cjs injects into the webview (base href, the three XSCHEM_* globals, the ?file=
// query param), then checks:
//   1. no uncaught page errors
//   2. every referenced symbol resolved (via the resolveDebug log lines)
//   3. the <svg> became visible and holds real geometry with a non-degenerate bounding box
//
// The viewer renders to SVG (src/render/SVGRenderer.ts), not canvas, and keeps the <svg> at
// visibility:hidden until the render completes — so "svg became visible" is the render-done signal.
import https from "node:https";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Module from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const ARGS = new Set(process.argv.slice(2));
const HEADED = ARGS.has("--headed");
const KEEP_OPEN = ARGS.has("--keep-open");
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 90_000);

// Symbols the fixture instantiates; each must resolve for the test to pass.
const EXPECTED_SYMBOLS = [
	"devices/title.sym",
	"devices/vsource.sym",
	"devices/gnd.sym",
	"devices/lab_pin.sym",
	"sg13g2_pr/sg13_lv_nmos.sym",
	"sg13g2_pr/sg13_lv_pmos.sym",
	"sky130_fd_pr/nfet_01v8.sym",
	// Carries the property value with bare inner quotes (patch 0003), exercising the fix through
	// the real shipped bundle. This is a BELT, not the guard: at the pinned UPSTREAM_REF the
	// unpatched grammar TRUNCATES that value rather than throwing, and every assertion below is
	// value-blind, so a regression can still render 8/8 symbols and pass. test/parser.test.cjs is
	// what actually fails -- and it runs in the required matrix, unlike this workflow.
	"devices/code_shown.sym",
	// NOT listed: the fixture's own sub.sym. It sits beside the schematic, so it resolves off
	// baseURL without ever entering the library resolver — the only thing that emits these log
	// lines. Its rendering is covered instead by the navigation round-trip below, which fails
	// outright if the [data-symbol="sub.sym"] group was never drawn.
];

// The navigation script the extension host injects, pulled from the module that ships it rather than
// re-typed here — a copy would drift and quietly stop testing the real thing.
const { __navScript: NAV_SCRIPT } = await (async () => {
	const req = Module.createRequire(import.meta.url);
	const origLoad = Module._load;
	Module._load = function (request, ...rest) {
		if (request === "vscode") return { window: {}, commands: {}, workspace: { getConfiguration: () => ({ get: () => void 0 }) }, Uri: {} };
		return origLoad.call(this, request, ...rest);
	};
	try { return req("../../dist/extension.cjs"); } finally { Module._load = origLoad; }
})();

const MIME = {
	".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
	".html": "text/html", ".wasm": "application/wasm", ".json": "application/json",
	".data": "application/octet-stream", ".sch": "text/plain", ".sym": "text/plain",
};

let playwright;
try {
	playwright = await import("playwright");
} catch {
	console.error(
		"\nrender-smoke: playwright is not installed.\n" +
		"  npm i --no-save playwright && npx playwright install --with-deps chromium\n" +
		"(kept out of package.json dependencies so `npm test` stays dependency-free)\n"
	);
	process.exit(1);
}

// --- the page the extension host would build, minus VS Code ------------------------------------
function harnessHtml(fileUrl) {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<base href="/dist/">
<title>xschem render smoke</title>
<script>
	window.XSCHEM_EXTRA_LIBRARY_ROOTS = [];
	window.XSCHEM_ROOT_MAP = [];
	window.XSCHEM_RESOLVE_DEBUG = true;
	const t = new URL(window.location.href);
	t.searchParams.set('file', ${JSON.stringify(fileUrl)});
	window.history.pushState(null, '', t.toString());
</script>
<script>
	// Stand in for the VS Code webview API the injected script talks to, recording what it would have
	// posted to the extension host so the assertions can read the real button-enablement stream.
	window.__navPosts = [];
	window.acquireVsCodeApi = () => ({ postMessage: (m) => window.__navPosts.push(m) });
</script>
<script>${NAV_SCRIPT}</script>
<script type="module" crossorigin src="/dist/assets/index.js"><\/script>
<link rel="stylesheet" crossorigin href="/dist/assets/index.css">
</head>
<body><div id="root"></div><footer hidden></footer></body>
</html>`;
}

// --- TLS ---------------------------------------------------------------------------------------
// The harness must serve over HTTPS, not HTTP. The resolver's first branch is
// `path.startsWith('https://') -> fetch(path)`, which is how the top-level schematic is loaded:
// at that moment `baseURL` is still unset, so every later fallback is unavailable. In the webview
// the file is always an https vscode-resource URL, so an http harness would exercise a code path
// that cannot occur in production and fail with a misleading "File not found".
// Self-signed, generated per run into a temp dir; the browser is launched with ignoreHTTPSErrors.
function makeCert() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xschem-smoke-"));
	const key = path.join(dir, "key.pem");
	const cert = path.join(dir, "cert.pem");
	try {
		execFileSync("openssl", [
			"req", "-x509", "-newkey", "rsa:2048", "-nodes",
			"-keyout", key, "-out", cert, "-days", "1",
			"-subj", "/CN=127.0.0.1",
			"-addext", "subjectAltName=IP:127.0.0.1",
		], { stdio: "ignore" });
	} catch (e) {
		console.error("render-smoke: could not generate a self-signed cert (needs `openssl`): " + e.message);
		process.exit(1);
	}
	return { key: fs.readFileSync(key), cert: fs.readFileSync(cert), dir };
}
const tls = makeCert();

// --- static server -----------------------------------------------------------------------------
// Set once the ephemeral port is known; the request handler closes over it and only ever runs after.
let HARNESS_FILE_URL = "";
const server = https.createServer({ key: tls.key, cert: tls.cert }, (req, res) => {
	const url = new URL(req.url, "https://127.0.0.1");
	const send = (code, body, type) => {
		// COOP/COEP so a pthread-enabled emscripten build can use SharedArrayBuffer; CORP because
		// require-corp otherwise blocks our own same-origin subresources.
		res.writeHead(code, {
			"Content-Type": type,
			"Cross-Origin-Opener-Policy": "same-origin",
			"Cross-Origin-Embedder-Policy": "require-corp",
			"Cross-Origin-Resource-Policy": "same-origin",
		});
		res.end(body);
	};
	if (url.pathname === "/harness.html") return send(200, harnessHtml(HARNESS_FILE_URL), "text/html");

	const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
	const abs = path.resolve(REPO, rel);
	if (!abs.startsWith(REPO + path.sep)) return send(403, "forbidden", "text/plain");
	if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return send(404, "not found", "text/plain");
	send(200, fs.readFileSync(abs), MIME[path.extname(abs)] || "application/octet-stream");
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;
const ORIGIN = `https://127.0.0.1:${PORT}`;
HARNESS_FILE_URL = `${ORIGIN}/test/smoke/fixtures/smoke.sch`;

// --- drive the browser -------------------------------------------------------------------------
const failures = [];
const pageErrors = [];
const consoleLines = [];

const browser = await playwright.chromium.launch({ headless: !HEADED });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("console", (m) => consoleLines.push(m.text()));

// Minimum geometry for a render to count as real rather than blank/partial. The fixture draws eight
// symbols (a title block among them), so a genuine render is far above this.
const MIN_SHAPES = 10;

let renderInfo = null;
try {
	await page.goto(`${ORIGIN}/harness.html`, { waitUntil: "load", timeout: TIMEOUT_MS });
	// visibility:hidden until the render finishes, so `state: "visible"` (not mere existence) is the
	// signal that the viewer considers itself done.
	await page.waitForSelector("svg", { state: "visible", timeout: TIMEOUT_MS });

	renderInfo = await page.waitForFunction((minShapes) => {
		const svg = document.querySelector("svg");
		if (!svg) return null;
		const shapes = svg.querySelectorAll("line, polygon, polyline, rect, circle, path, text, image");
		if (shapes.length < minShapes) return null;
		let box;
		try { box = svg.getBBox(); } catch { return null; }   // getBBox throws while not rendered
		if (!(box.width > 1 && box.height > 1)) return null;
		return { shapes: shapes.length, w: Math.round(box.width), h: Math.round(box.height) };
	}, MIN_SHAPES, { timeout: TIMEOUT_MS, polling: 500 }).then((h) => h.jsonValue());
} catch (e) {
	failures.push(`render did not complete within ${TIMEOUT_MS}ms: ${e.message}`);
}

// --- hierarchy navigation: a real descend, then a real ascend -----------------------------------
// The unit test (test/navigation.test.cjs) models the History API; this drives the genuine one, in a
// browser, through the actual viewer. What it adds over the model is everything the model stubs: that
// the script parses and runs, that wrapping the app's pushState does not break the app's own descend,
// that a real history.back() fires a real popstate, and that the parent actually re-renders.
//
// It is NOT the guard on preserving the app's `{path}` state — the app's popstate handler falls back
// to the ?file= query param, so dropping that state still renders correctly here. The unit test is
// what pins that down, and it matters because the fallback is upstream code we do not control.
let navInfo = null;
if (renderInfo) {
	const fileParam = () => page.evaluate(() => new URL(location.href).searchParams.get("file"));
	const lastPost = () => page.evaluate(() => window.__navPosts[window.__navPosts.length - 1] ?? null);
	try {
		const atTop = await lastPost();
		if (!atTop || atTop.canUp !== false) failures.push(`nav: expected canUp=false at the top, got ${JSON.stringify(atTop)}`);

		// Descend the way a user does: click the component. Dispatched rather than page.click()'d
		// because the group sits under a pan/zoom transform, so hit-testing a real cursor position
		// would make this test about coordinate math instead of navigation.
		const before = await fileParam();
		await page.evaluate(() => document.querySelector('[data-symbol="sub.sym"]')
			.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		await page.waitForFunction(() => /sub\.sch$/.test(new URL(location.href).searchParams.get("file") || ""), null, { timeout: TIMEOUT_MS });
		await page.waitForSelector("svg", { state: "visible", timeout: TIMEOUT_MS });

		const descended = await lastPost();
		if (!descended || descended.canUp !== true) failures.push(`nav: expected canUp=true after descending, got ${JSON.stringify(descended)}`);

		// Ascend exactly as the editor-title button does: post the message the extension host posts.
		await page.evaluate(() => window.postMessage({ type: "xschem.nav", dir: "up" }, "*"));
		await page.waitForFunction((want) => new URL(location.href).searchParams.get("file") === want, before, { timeout: TIMEOUT_MS });
		await page.waitForSelector("svg", { state: "visible", timeout: TIMEOUT_MS });

		// Back at the parent the viewer must have REDRAWN it, not left a blank canvas.
		const backShapes = await page.evaluate(() =>
			document.querySelectorAll("svg line, svg polygon, svg polyline, svg rect, svg circle, svg path, svg text, svg image").length);
		if (backShapes < MIN_SHAPES) failures.push(`nav: parent redrew with only ${backShapes} shapes (expected >= ${MIN_SHAPES}) — ascend produced a blank editor`);

		const ascended = await lastPost();
		if (!ascended || ascended.canUp !== false || ascended.canDown !== true)
			failures.push(`nav: expected {canUp:false, canDown:true} after ascending, got ${JSON.stringify(ascended)}`);

		navInfo = { backShapes, ascended };
	} catch (e) {
		failures.push(`hierarchy navigation round-trip failed: ${e.message}`);
	}
}

// --- assertions --------------------------------------------------------------------------------
const resolved = new Set();
for (const line of consoleLines) {
	const m = line.match(/\[xschem-viewer\] '([^']+)' <- /);
	if (m) resolved.add(m[1]);
}
const missing = EXPECTED_SYMBOLS.filter((s) => !resolved.has(s));
const notFound = consoleLines.filter((l) => l.includes("[xschem-viewer] NOT FOUND"));

if (pageErrors.length) failures.push(`uncaught page errors:\n    ${pageErrors.join("\n    ")}`);
if (notFound.length) failures.push(`resolver reported NOT FOUND:\n    ${notFound.join("\n    ")}`);
if (missing.length) failures.push(`symbols never resolved: ${missing.join(", ")}`);
if (!renderInfo) failures.push("svg never produced drawn geometry");

// `tcleval failed: …` lines are expected noise: symbols carry ngspice annotation expressions
// (gm/id/vgs) that only evaluate against a live simulation. They are not render failures.
const tclNoise = consoleLines.filter((l) => l.startsWith("tcleval failed:")).length;

console.log("=== render smoke ===");
console.log(`  svg             : ${renderInfo ? `${renderInfo.shapes} shapes, bbox ${renderInfo.w}x${renderInfo.h}` : "NONE"}`);
console.log(`  symbols resolved: ${resolved.size}/${EXPECTED_SYMBOLS.length}${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
console.log(`  hierarchy nav   : ${navInfo ? `descend + ascend round-trip OK (parent redrew ${navInfo.backShapes} shapes)` : "NOT EXERCISED"}`);
console.log(`  page errors     : ${pageErrors.length}`);
console.log(`  tcleval notices : ${tclNoise} (expected; ngspice annotations, not render errors)`);

// Always capture what the viewer actually drew — the only useful artifact when this fails in CI.
const shot = path.join(HERE, "render-smoke.png");
try { await page.screenshot({ path: shot, fullPage: false }); console.log(`  screenshot      : ${shot}`); }
catch (e) { console.log(`  screenshot      : failed (${e.message})`); }

if (KEEP_OPEN) { console.log("\n--keep-open: press Ctrl-C to exit"); await new Promise(() => {}); }
await browser.close();
server.close();
fs.rmSync(tls.dir, { recursive: true, force: true });

if (failures.length) {
	console.error("\nFAILED:");
	for (const f of failures) console.error("  - " + f);
	console.error("\nfull console log:\n  " + consoleLines.join("\n  "));
	process.exit(1);
}
console.log("\n=== render smoke: PASSED ===");
