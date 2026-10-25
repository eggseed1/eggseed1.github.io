/* Eggseed responsive layout regression test, no dependencies.
   Ensures the three-column personal-web composition
   remains the same on desktop and on small touch screens. */
"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");

const files = [
  "index.html", "about.html", "blog.html", "reviews.html", "archive.html",
  "45rpm.html", "media.html", "photos.html", "ascii.html",
  "reviews/hard-to-love-a-man.html",
  ...Array.from({ length: 34 }, (_, i) => "records/" + String(i + 1).padStart(3, "0") + ".html")
];
const toggle = 'id="eggseed-mobile-size"';
for (const file of files) {
  const html = fs.readFileSync(file, "utf8");
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/, file + ": missing viewport");
  assert.equal(html.split(toggle).length - 1, 1, file + ": expected exactly one fit/pan toggle");
  assert.ok(html.includes('for="eggseed-mobile-size"'), file + ": toggle label absent");
  assert.ok(html.indexOf(toggle) < html.indexOf('<div class="site">'), file + ": toggle must precede site");
  assert.ok(html.includes('<div class="columns">'), file + ": missing grid");
  assert.ok(html.includes('class="left-col"') && html.includes('class="center-col"')
    && html.includes('class="right-col"'), file + ": missing one of the desktop columns");
}
const css = fs.readFileSync("style.css", "utf8");
assert.ok(css.includes("Mobile desktop-layout preservation"), "Mobile override absent");
assert.match(css, /\.site \.columns,\.maker-page \.columns,\.maker-page\.maker-wide \.columns\{[\s\S]*?grid-template-columns:145px minmax\(0,1fr\) 145px!important;/,
  "Mobile must keep three desktop columns");
assert.ok(css.includes('.mobile-view-toggle:checked ~ .site'), "Full-size switch must activate");
assert.ok(css.includes("zoom:1!important"), "Full-size mode must preserve original-size text");
assert.ok(css.includes("overflow-x:auto"), "Horizontal pan must remain available");
assert.ok(css.includes('.site .navbox .inner{display:block!important}'),
  "Mobile navigation must not change from vertical list to a two-column grid");
for (const breakpoint of [609,539,479,419,369,324]) {
  assert.ok(css.includes("@media(max-width:" + breakpoint + "px)"),
    "Missing fit breakpoint " + breakpoint);
}
// Mobile reuses the original desktop text-frame animation rather than the
// simplified three preformatted horse drawings.
assert.ok(css.includes(".mobile-view-label{margin-bottom:143px!important}"),
  "Mobile should leave an unobstructed strip for the desktop ASCII horse");
assert.ok(css.includes(".horse-parade::before,.horse-parade::after{\n    display:block!important;"),
  "Detailed desktop pseudo-element horses must be visible on mobile");
assert.ok(css.includes("animation:eggseed-horse-pose 0.84s steps(1,end) infinite"),
  "Keep the eight-frame desktop ASCII leg animation");
assert.ok(css.includes("eggseed-horse-run 22s linear infinite"),
  "Keep the desktop cross-screen gallop");
assert.ok(css.includes(".horse-parade > .running-horse{display:none!important}"),
  "Hide the simpler placeholder horses on mobile");
assert.ok(!css.includes("eggseed-mobile-horse-run"),
  "Do not substitute a simplified mobile-only animation");
assert.ok(css.includes("prefers-reduced-motion:reduce"),
  "Respect reduced-motion preference");
assert.ok(css.includes('.site .footer{\n    font:11px/1.55 "Trebuchet MS"'),
  "Keep the mobile footer legible");

console.log("Mobile layout OK: 44 pages preserve 3 columns; fit-to-screen + full-size pan available.");
