/* Small, dependency-free smoke test for the standalone ASCII Maker.
   Runs with Node in GitHub Actions; simulates browser controls and a canvas. */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const script = fs.readFileSync("ascii-maker.js", "utf8");
const html = fs.readFileSync("ascii.html", "utf8");
for (const id of ["ascii-width-number", "ascii-width", "ascii-zoom", "ascii-wide",
  "ascii-dither", "ascii-edge", "ascii-output", "ascii-file"]) {
  assert.ok(html.includes('id="' + id + '"'), "Missing HTML control " + id);
}
assert.ok(html.includes('max="1200"'), "1200-column control missing");
assert.ok(html.includes('data-ascii-width="1200"'), "Ultra preset missing");

function element(value) {
  return {
    value: value || "", textContent: "", checked: false, disabled: false,
    style: {}, files: [], listeners: {}, scrollLeft: 0, scrollTop: 0,
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    fire(type) { for (const fn of (this.listeners[type] || [])) fn(); },
    focus() {}, select() {},
    getAttribute(attr) { return attr === "data-ascii-width" ? this.value : null; },
    classList: { add() {}, remove() {}, toggle() { this.active = !this.active; return this.active; } }
  };
}
const ids = {};
for (const [id, value] of Object.entries({
  "ascii-width": "160", "ascii-width-number": "160",
  "ascii-contrast": "120", "ascii-brightness": "0",
  "ascii-charset": "ultra", "ascii-zoom": "7"
})) ids[id] = element(value);
for (const id of ["ascii-file", "ascii-drop", "ascii-output", "ascii-status",
  "ascii-width-value", "ascii-contrast-value", "ascii-brightness-value",
  "ascii-invert", "ascii-edge", "ascii-dither", "ascii-zoom-value",
  "ascii-wide", "ascii-convert", "ascii-copy", "ascii-download",
  "ascii-clear", "ascii-letter-input", "ascii-letter-convert"]) {
  ids[id] ||= element("");
}
const presets = [80,160,320,640,1200].map(x => element(String(x)));
const context = {
  clearRect() {}, drawImage() {},
  getImageData(x0, y0, width, height) {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        pixels[index] = pixels[index + 1] = pixels[index + 2] = Math.round(x * 255 / width);
        pixels[index + 3] = 255;
      }
    }
    return { data: pixels };
  }
};
const canvas = { width: 0, height: 0, getContext() { return context; } };
const document = {
  listeners: {},
  getElementById(id) { assert.ok(ids[id], "Unknown element: " + id); return ids[id]; },
  querySelectorAll() { return presets; },
  createElement(tag) { return tag === "canvas" ? canvas : element(""); },
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
  body: { classList: { active: false, toggle() { this.active = !this.active; return this.active; } } }
};
const sandbox = {
  document, window: { createImageBitmap: async file => ({width:file.width, height:file.height}) },
  createImageBitmap: async file => ({width:file.width,height:file.height}),
  navigator: {}, console, Promise, Float32Array, Uint8ClampedArray, Array,
  Number, Math, Blob, URL, setTimeout
};
vm.runInNewContext(script, sandbox, { filename: "ascii-maker.js", timeout: 5000 });
function lines() { return ids["ascii-output"].value.split("\n"); }
function file(width,height) {
  ids["ascii-file"].files = [{name:"sample.png",type:"image/png",size:2048,width,height}];
  ids["ascii-file"].fire("change");
}
async function tick() { await new Promise(resolve => setImmediate(resolve)); }
async function main() {
  file(2000,1400);
  await tick();
  assert.equal(lines()[0].length, 160, "Default 160 columns");
  assert.equal(lines().length, 56, "Original ratio preserved");

  presets[4].fire("click");
  assert.equal(lines()[0].length, 1200, "Ultra output must actually be 1200 columns");
  assert.equal(lines().length, 420, "Must not silently clamp output to 200 rows");
  assert.ok(ids["ascii-output"].value.length > 500000, "Output should retain detail");
  assert.equal(ids["ascii-width-number"].value, "1200");
  assert.match(ids["ascii-status"].textContent, /1200 columns x 420 rows/);

  ids["ascii-edge"].checked = true;
  ids["ascii-edge"].fire("change");
  ids["ascii-dither"].checked = true;
  ids["ascii-dither"].fire("change");
  assert.equal(lines()[0].length, 1200, "Enhancements preserve requested width");

  ids["ascii-zoom"].value = "4";
  ids["ascii-zoom"].fire("input");
  assert.equal(ids["ascii-output"].style.fontSize, "4px");
  ids["ascii-wide"].fire("click");
  assert.equal(document.body.classList.active, true);

  file(200,1200);
  await tick();
  assert.ok(lines()[0].length < 1200, "Portrait image should obey safety limit");
  assert.ok(ids["ascii-output"].value.length < 1205000, "Must cap total characters");
  assert.match(ids["ascii-status"].textContent, /reduced from 1200/);
  console.log("ASCII Maker OK: 1200 columns, 420 rows, full detail, wide mode, dither, safety cap");
}
main().catch(error => {console.error(error);process.exitCode=1;});
