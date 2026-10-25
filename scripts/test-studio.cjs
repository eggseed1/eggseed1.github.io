/* Static smoke tests for the owner editor, no network or credentials required. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = (name) => fs.readFileSync(name, "utf8");
const manifest = JSON.parse(read("data/studio-posts.json"));
const script = read("studio.js");
const studio = read("studio.html");
const tags = read("tags.html");
assert.equal(manifest.version, 1);
assert.ok(Array.isArray(manifest.posts));
assert.ok(manifest.posts.some(p => p.slug === "first-ramblings-october" && p.section === "blog"));
for (const p of manifest.posts) {
  assert.ok(fs.existsSync(p.source), "Missing source: " + p.source);
  if (p.published) assert.ok(fs.existsSync(p.file), "Missing published file: " + p.file);
}
for (const [section, path] of Object.entries({
  blog: "blog.html", writings: "archive.html", reviews: "reviews.html",
  scans: "media.html", photos: "photos.html"
})) {
  const html = read(path);
  assert.ok(html.includes("<!-- STUDIO_LIST_START:" + section + " -->"), path + ": start marker");
  assert.ok(html.includes("<!-- STUDIO_LIST_END:" + section + " -->"), path + ": end marker");
}
for (const id of ["studio-title", "studio-section", "studio-slug", "studio-date", "studio-tags",
  "studio-excerpt", "studio-image", "studio-body", "studio-published", "studio-save",
  "studio-delete", "studio-new", "studio-post-list", "studio-preview"]) {
  assert.ok(studio.includes('id="' + id + '"'), "Missing form input " + id);
}
assert.ok(studio.includes('content="noindex,nofollow"'));
assert.ok(read("index.html").includes('<!-- STUDIO_RECENT_BLOG_START -->'));
assert.ok(read("index.html").includes('<!-- STUDIO_RECENT_BLOG_END -->'));
assert.ok(read("index.html").includes('>recent writings</h2>'));
assert.ok(!read("index.html").includes('href="blog.html">[ blog ]</a>'), "Blog CTA must be removed");
assert.ok(read("index.html").includes('href="reviews/hard-to-love-a-man.html"'), "Existing review missing from recent writings");
assert.ok(script.includes('}).slice(0, 3)'), "Recent writings should cap at three");
assert.ok(script.includes('p.section === "45rpm"'), "45rpm exclusion must be explicit");
assert.ok(script.includes('function updateHomepageHTML('));
assert.ok(script.includes('content: updateHomepageHTML(homepage, posts)'));
assert.ok(!read("index.html").includes('href="studio.html"'), "Editor linked on public nav");
assert.ok(tags.includes("tags.js"), "Missing public tag browser");
assert.ok(!/localStorage|sessionStorage|document\.cookie/.test(script), "Never persist tokens in browser storage");
assert.ok(!/github_pat_[A-Za-z0-9_]{12,}/.test(script), "Hardcoded credentials");
assert.ok(script.includes("Authorization") && script.includes("git/refs/heads/"));
console.log("studio checks ok");
