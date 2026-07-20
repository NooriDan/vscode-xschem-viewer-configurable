// Generate [Content_Types].xml covering every file extension in the extension payload tree.
const fs = require("fs");
const path = require("path");
const root = process.argv[2];
const out = process.argv[3];
const textExt = new Set(["json", "js", "cjs", "css", "md", "txt", "sym", "sch", "svg", "tcl", "awk", "xml", "vsixmanifest", "html"]);
const known = { json: "application/json", js: "application/javascript", cjs: "application/javascript", css: "text/css", png: "image/png", wasm: "application/wasm", svg: "image/svg+xml", md: "text/markdown", html: "text/html", vsixmanifest: "text/xml", xml: "text/xml" };
const exts = new Set();
(function walk(d) {
	for (const e of fs.readdirSync(d, { withFileTypes: true })) {
		const fp = path.join(d, e.name);
		if (e.isDirectory()) walk(fp);
		else { const m = e.name.match(/\.([^.]+)$/); if (m) exts.add(m[1].toLowerCase()); }
	}
})(root);
exts.add("vsixmanifest");
exts.add("xml");
const lines = [];
for (const ext of [...exts].sort()) {
	const ct = known[ext] || (textExt.has(ext) ? "text/plain" : "application/octet-stream");
	lines.push('  <Default Extension="' + ext + '" ContentType="' + ct + '"/>');
}
fs.writeFileSync(out, '<?xml version="1.0" encoding="utf-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' + lines.join("\n") + "\n</Types>\n");
console.log("wrote " + out + " (" + exts.size + " extensions)");
