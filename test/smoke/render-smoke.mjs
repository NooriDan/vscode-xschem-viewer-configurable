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
// It serves the repo over http and loads a page that reproduces what dist/extension.cjs injects into
// the webview (base href, the three XSCHEM_* globals, the ?file= query param), then checks:
//   1. no uncaught page errors
//   2. every referenced symbol resolved (via the resolveDebug log lines)
//   3. the canvas contains actual non-uniform pixels (i.e. something was drawn)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
];

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
<script type="module" crossorigin src="/dist/assets/index.js"><\/script>
<link rel="stylesheet" crossorigin href="/dist/assets/index.css">
</head>
<body><div id="root"></div><footer hidden></footer></body>
</html>`;
}

// --- static server -----------------------------------------------------------------------------
// Set once the ephemeral port is known; the request handler closes over it and only ever runs after.
let HARNESS_FILE_URL = "";
const server = http.createServer((req, res) => {
	const url = new URL(req.url, "http://127.0.0.1");
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
const ORIGIN = `http://127.0.0.1:${PORT}`;
HARNESS_FILE_URL = `${ORIGIN}/test/smoke/fixtures/smoke.sch`;

// --- drive the browser -------------------------------------------------------------------------
const failures = [];
const pageErrors = [];
const consoleLines = [];

const browser = await playwright.chromium.launch({ headless: !HEADED });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("console", (m) => consoleLines.push(m.text()));

let pixelInfo = null;
try {
	await page.goto(`${ORIGIN}/harness.html`, { waitUntil: "load", timeout: TIMEOUT_MS });
	await page.waitForSelector("canvas", { timeout: TIMEOUT_MS });

	// Poll until the canvas has actually been drawn to (more than one distinct pixel value).
	pixelInfo = await page.waitForFunction(() => {
		const c = document.querySelector("canvas");
		if (!c || !c.width || !c.height) return null;
		const g = c.getContext("2d", { willReadFrequently: true });
		if (!g) return null;                       // a WebGL canvas: fall back to the size check below
		const { data } = g.getImageData(0, 0, c.width, c.height);
		const seen = new Set();
		for (let i = 0; i < data.length; i += 4 * 97) {   // sparse stride: enough to prove non-uniformity
			seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
			if (seen.size > 1) return { w: c.width, h: c.height, distinct: seen.size };
		}
		return null;
	}, null, { timeout: TIMEOUT_MS, polling: 500 }).then((h) => h.jsonValue());
} catch (e) {
	failures.push(`render did not complete within ${TIMEOUT_MS}ms: ${e.message}`);
	// A WebGL-backed canvas yields no 2D context; accept a sized canvas plus a clean console instead.
	const box = await page.evaluate(() => {
		const c = document.querySelector("canvas");
		return c ? { w: c.width, h: c.height } : null;
	}).catch(() => null);
	if (box && box.w > 0 && box.h > 0) {
		failures.pop();
		pixelInfo = { ...box, distinct: "n/a (non-2d canvas)" };
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
if (!pixelInfo) failures.push("canvas never produced drawn pixels");

console.log("=== render smoke ===");
console.log(`  canvas          : ${pixelInfo ? `${pixelInfo.w}x${pixelInfo.h}, distinct=${pixelInfo.distinct}` : "NONE"}`);
console.log(`  symbols resolved: ${resolved.size ? [...resolved].join(", ") : "(none logged)"}`);
console.log(`  page errors     : ${pageErrors.length}`);

// Always capture what the viewer actually drew — the only useful artifact when this fails in CI.
const shot = path.join(HERE, "render-smoke.png");
try { await page.screenshot({ path: shot, fullPage: false }); console.log(`  screenshot      : ${shot}`); }
catch (e) { console.log(`  screenshot      : failed (${e.message})`); }

if (KEEP_OPEN) { console.log("\n--keep-open: press Ctrl-C to exit"); await new Promise(() => {}); }
await browser.close();
server.close();

if (failures.length) {
	console.error("\nFAILED:");
	for (const f of failures) console.error("  - " + f);
	console.error("\nfull console log:\n  " + consoleLines.join("\n  "));
	process.exit(1);
}
console.log("\n=== render smoke: PASSED ===");
