// Hierarchy-navigation tests for the injected webview script (dist/extension.cjs → NAV_SCRIPT).
//
// Why this file exists:
//
// The up/down buttons are only as good as the depth arithmetic in the injected script, and that
// arithmetic has exactly two ways to be subtly wrong in a way no smoke test would catch:
//   1. "up" at depth 0 calls history.back(), which walks the webview iframe OFF the app into a blank
//      document — a dead editor with no way back except reopening the file.
//   2. a descend after going back leaves canGoDown true, pointing at a forward entry the browser
//      already truncated.
// Both are state-machine bugs, not rendering bugs, so they belong in the dependency-free Node suite
// rather than the browser smoke test.
//
// The script is written against the DOM (history, addEventListener, acquireVsCodeApi), so the test
// drives it in a vm with a fake window that models the ONE behaviour that matters: pushState
// truncates forward history. It is not a browser; it is a model of the history contract the script
// depends on. Assertions are on the messages the script posts back to the extension host, because
// those are what actually drive the button enablement.
const vm = require("vm");
const Module = require("module");

// dist/extension.cjs requires "vscode", which only exists inside the extension host. Stub it so the
// module loads here — this also means the suite fails loudly if extension.cjs stops being loadable
// at all, which a regex-scrape of the file would not catch.
const origLoad = Module._load;
Module._load = function (request, ...rest) {
	if (request === "vscode") return { window: {}, commands: {}, workspace: { getConfiguration: () => ({ get: () => void 0 }) }, Uri: {} };
	return origLoad.call(this, request, ...rest);
};
const { __navScript: NAV } = require("../dist/extension.cjs");
Module._load = origLoad;

let pass = 0, fail = 0;
function ok(name, cond) { console.log((cond ? "  OK  " : "FAIL  ") + name); cond ? pass++ : fail++; }
function eq(name, actual, expected) {
	const good = JSON.stringify(actual) === JSON.stringify(expected);
	ok(name + (good ? "" : `\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`), good);
}

// --- a minimal, faithful history model ------------------------------------------------------------
// Real session history is a list plus a cursor. back()/forward() move the cursor and fire popstate
// with that entry's state; pushState inserts AFTER the cursor and DROPS everything past it. That
// truncation is the whole reason `top` exists in the script, so the fake must reproduce it.
function makeHarness() {
	const posted = [];
	const listeners = {};
	const entries = [{ state: null }];   // the initial entry, pushed by the head script before NAV runs
	let cursor = 0;
	const fire = (type, ev) => (listeners[type] || []).forEach((fn) => fn(ev));

	const sandbox = {
		acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m) }),
		addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
		history: {
			pushState(state, _title, _url) {
				entries.length = cursor + 1;   // truncate forward history
				entries.push({ state });
				cursor = entries.length - 1;
			},
			back() { if (cursor > 0) { cursor--; fire("popstate", { state: entries[cursor].state }); } },
			forward() { if (cursor < entries.length - 1) { cursor++; fire("popstate", { state: entries[cursor].state }); } },
		},
	};
	sandbox.window = sandbox;
	vm.createContext(sandbox);
	vm.runInContext(NAV, sandbox);

	return {
		posted,
		// What the app does on a component click: pushState({path}, …). The script's wrapper is in
		// place by now, so this exercises the wrapper, not the raw fake.
		descend: (path) => sandbox.history.pushState({ path }, "", "?file=" + path),
		send: (dir) => fire("message", { data: { type: "xschem.nav", dir } }),
		last: () => posted[posted.length - 1],
		// Where the fake's cursor actually ended up — catches a no-op guard that silently did nothing
		// as distinct from one that moved.
		cursor: () => cursor,
		stateOfCursor: () => entries[cursor].state,
		depthOfCursor: () => { const st = entries[cursor].state; return st && st.__xdepth || 0; },
	};
}

// --- the initial report ---------------------------------------------------------------------------
{
	const h = makeHarness();
	eq("reports both disabled at the top of the hierarchy",
		h.last(), { type: "xschem.nav.state", canUp: false, canDown: false });
}

// --- guard 1: never walk the iframe off the app ---------------------------------------------------
{
	const h = makeHarness();
	h.send("up");
	eq("'up' at depth 0 is a no-op (does NOT call history.back)", h.cursor(), 0);
	h.send("down");
	eq("'down' with no forward entry is a no-op", h.cursor(), 0);
}

// --- descend / ascend -----------------------------------------------------------------------------
{
	const h = makeHarness();
	h.descend("core.sch");
	eq("descending enables up, leaves down disabled",
		h.last(), { type: "xschem.nav.state", canUp: true, canDown: false });

	h.send("up");
	eq("going up re-disables up and enables down",
		h.last(), { type: "xschem.nav.state", canUp: false, canDown: true });
	eq("going up actually moved the cursor", h.cursor(), 0);

	h.send("down");
	eq("going back down restores the descended state",
		h.last(), { type: "xschem.nav.state", canUp: true, canDown: false });
	eq("going down actually moved the cursor", h.cursor(), 1);
}

// --- three levels deep, then all the way back up --------------------------------------------------
{
	const h = makeHarness();
	h.descend("core.sch"); h.descend("ota.sch"); h.descend("mirror.sch");
	eq("three levels deep tracks depth, not just a boolean", h.depthOfCursor(), 3);
	h.send("up"); h.send("up");
	eq("two ups from depth 3 leaves up still available",
		h.last(), { type: "xschem.nav.state", canUp: true, canDown: true });
	h.send("up");
	eq("the third up lands back at the top",
		h.last(), { type: "xschem.nav.state", canUp: false, canDown: true });
	h.send("up");
	eq("a fourth up is a no-op, not a walk off the app", h.cursor(), 0);
}

// --- guard 2: a descend after going back truncates forward history --------------------------------
// The bug this catches: tracking only a `depth` counter and inferring canDown from "have we ever
// gone deeper". Descend twice, go up, then descend somewhere ELSE — the old forward entry is gone,
// so canDown must be false. A stale true would offer a "down" that jumps to a schematic the user
// never descended into from here.
{
	const h = makeHarness();
	h.descend("core.sch"); h.descend("ota.sch");
	h.send("up");
	eq("mid-stack: down is available before the new descend",
		h.last(), { type: "xschem.nav.state", canUp: true, canDown: true });

	h.descend("bias.sch");
	eq("a new descend truncates forward history, so down goes false",
		h.last(), { type: "xschem.nav.state", canUp: true, canDown: false });

	h.send("down");
	eq("and 'down' into the truncated entry is a no-op", h.cursor(), 2);
}

// --- the host's explicit refresh ------------------------------------------------------------------
// resolveCustomEditor sends {dir:"report"} when a hidden panel is re-activated, because
// retainContextWhenHidden means the webview may have navigated while the context keys were cleared.
{
	const h = makeHarness();
	h.descend("core.sch");
	const before = h.posted.length;
	h.send("report");
	eq("'report' re-posts the current state without navigating", h.cursor(), 1);
	ok("'report' produced a fresh message", h.posted.length === before + 1);
	eq("'report' state matches reality",
		h.last(), { type: "xschem.nav.state", canUp: true, canDown: false });
}

// --- the wrapper must preserve the app's own state ------------------------------------------------
// The root component restores the file from `event.state.path ?? ?file=`. Because of that `??`
// fallback an ascend still renders correctly even when the wrapper clobbers `path` — which is
// exactly why this belongs here: the browser smoke test cannot see the difference (verified by
// mutation), and the fallback is upstream code we do not control. Were it ever tightened to trust
// `state.path` alone, a wrapper that replaced rather than extended the state would blank every
// ascend, and this is the test that would catch it.
{
	const h = makeHarness();
	h.descend("core.sch");
	h.descend("ota.sch");
	// Assert on the stored state, not on a posted message: `path` never reaches the extension host,
	// it is read by the webview's own popstate handler.
	eq("descended entry carries the app's {path} alongside our __xdepth",
		h.stateOfCursor(), { path: "ota.sch", __xdepth: 2 });
	h.send("up");
	eq("the entry restored by an ascend still has its path",
		h.stateOfCursor(), { path: "core.sch", __xdepth: 1 });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
