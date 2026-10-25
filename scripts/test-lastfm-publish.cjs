/* Reject the stale Last.fm placeholder in any future source deployment. */
"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const root = ".";
const pages = fs.readdirSync(root).filter(f => f.endsWith(".html") && f !== "studio.html")
  .concat(["records", "reviews"].flatMap(dir =>
    fs.readdirSync(dir).filter(f => f.endsWith(".html")).map(f => dir + "/" + f)));
const fallback = "https://www.last.fm/user/eggseed0";
for (const file of pages) {
  const html = fs.readFileSync(file,"utf8");
  assert.ok(html.includes("<!-- LASTFM_START -->") && html.includes("<!-- LASTFM_END -->"), file);
  assert.ok(!html.includes("Last.fm not connected yet"), file + ": stale placeholder");
  assert.ok(html.includes(fallback) || /href="https:\/\/www\.last\.fm\/music\//.test(html), file + ": missing Last.fm track or public profile link");
}
assert.equal(fs.readFileSync("lastfm-username.txt","utf8").trim().split("\n").at(-1),"eggseed0");
console.log("Last.fm source fallback OK on " + pages.length + " pages.");
