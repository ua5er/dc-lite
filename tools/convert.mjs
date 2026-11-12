#!/usr/bin/env node
// dc-lite converter: turns a design board file (*.dc.html) into a standalone HTML page
// that runs on dc-lite. No dependencies. MIT licence.
//
// Usage:
//   node tools/convert.mjs board.dc.html --out dist [--assets ./assets] [--runtime ../dc-lite.js] [--morphdom ../morphdom.min.js]
//
// --assets   folder with image or video files named by asset id (for example 4bd9...1da26.webp).
//            Every /_blob/<id> reference, and every bare "<id>" string in the component code,
//            is rewritten to img/<id>.<ext> and the file is copied next to the page.
// --runtime  URL of dc-lite.js as the page should load it (default: dc-lite.js)
// --morphdom URL of morphdom (default: the jsDelivr build)
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith("--") && !isValue(a));
function isValue(a) { const i = args.indexOf(a); return i > 0 && args[i - 1].startsWith("--"); }
function opt(name, def) { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : def; }
if (!input) {
  console.error("usage: node tools/convert.mjs board.dc.html --out dist [--assets dir] [--runtime url] [--morphdom url]");
  process.exit(1);
}
const out = opt("out", "dist");
const assets = opt("assets", null);
const runtime = opt("runtime", "dc-lite.js");
const morph = opt("morphdom", "https://cdn.jsdelivr.net/npm/morphdom@2.7.4/dist/morphdom-umd.min.js");

const src = fs.readFileSync(input, "utf8");
const pick = (re, what) => {
  const m = src.match(re);
  if (!m) throw new Error(`${input}: no ${what} found`);
  return m;
};
const title = (src.match(/<title>([\s\S]*?)<\/title>/) || [, path.basename(input)])[1];
const helmet = (src.match(/<helmet>([\s\S]*?)<\/helmet>/) || [, ""])[1];
let markup = pick(/<x-dc>([\s\S]*)<\/x-dc>/, "<x-dc> block")[1].replace(/<helmet>[\s\S]*?<\/helmet>/, "");
let script = pick(/<script type="text\/x-dc"[\s\S]*?<\/script>/, 'script type="text/x-dc"')[0];

fs.mkdirSync(out, { recursive: true });
const copied = new Set();
const missing = new Set();
const index = assets && fs.existsSync(assets)
  ? Object.fromEntries(fs.readdirSync(assets).map((f) => [path.parse(f).name, f]))
  : {};
function asset(id) {
  const file = index[id];
  if (!file) { missing.add(id); return null; }
  if (!copied.has(file)) {
    fs.mkdirSync(path.join(out, "img"), { recursive: true });
    fs.copyFileSync(path.join(assets, file), path.join(out, "img", file));
    copied.add(file);
  }
  return "img/" + file;
}
const blob = (s) => s.replace(/\/_blob\/([a-f0-9]{32})/g, (m, id) => asset(id) || m);
markup = blob(markup);
const head = blob(helmet);
script = blob(script)
  .replace(/"([a-f0-9]{32})"/g, (m, id) => { const p = asset(id); return p ? `"${path.basename(p)}"` : m; })
  .replace(/"\/_blob\/"/g, '"img/"');

const name = path.basename(input).replace(/\.dc\.html$/, "").replace(/\.html$/, "") + ".html";
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
${head.trim()}
<style>html,body{margin:0}</style>
</head><body>
<div id="dc-root"></div>
<template id="dc-template">${markup}</template>
${script}
<script src="${morph}"></script>
<script src="${runtime}"></script>
</body></html>
`;
fs.writeFileSync(path.join(out, name), html);
console.log(`wrote ${path.join(out, name)} (${html.length} bytes, ${copied.size} assets)`);
if (missing.size) console.warn(`missing assets: ${[...missing].join(", ")}`);
