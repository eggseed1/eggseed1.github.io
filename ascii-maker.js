/* eggseed's little ASCII machine.
   Images stay local; no uploads, requests, libraries, or trackers. */
(function () {
  "use strict";

  var fileInput = document.getElementById("ascii-file");
  var dropZone = document.getElementById("ascii-drop");
  var output = document.getElementById("ascii-output");
  var statusBox = document.getElementById("ascii-status");
  var widthInput = document.getElementById("ascii-width");
  var widthNumber = document.getElementById("ascii-width-number");
  var widthValue = document.getElementById("ascii-width-value");
  var contrastInput = document.getElementById("ascii-contrast");
  var contrastValue = document.getElementById("ascii-contrast-value");
  var brightnessInput = document.getElementById("ascii-brightness");
  var brightnessValue = document.getElementById("ascii-brightness-value");
  var charsetInput = document.getElementById("ascii-charset");
  var invertInput = document.getElementById("ascii-invert");
  var edgeInput = document.getElementById("ascii-edge");
  var ditherInput = document.getElementById("ascii-dither");
  var zoomInput = document.getElementById("ascii-zoom");
  var zoomValue = document.getElementById("ascii-zoom-value");
  var wideButton = document.getElementById("ascii-wide");
  var presetButtons = document.querySelectorAll("[data-ascii-width]");
  var convertButton = document.getElementById("ascii-convert");
  var copyButton = document.getElementById("ascii-copy");
  var downloadButton = document.getElementById("ascii-download");
  var clearButton = document.getElementById("ascii-clear");
  var imageSource = null;
  var fileBase = "eggseed-ascii";
  var processing = false;
  var canvas = document.createElement("canvas");
  var ctx = canvas.getContext("2d", { willReadFrequently: true });
  var MAX_COLUMNS = 1200;
  var MAX_CELLS = 1200000;
  var MAX_ROWS = 2200;
  var palettes = {
    ultra: "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,. ",
    classic: "@%#*+=-:. ",
    darkroom: "@#8&o:*. ",
    simple: "#+-. ",
    binary: "10 "
  };
  function say(message) {
    statusBox.textContent = message;
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function setColumns(raw) {
    var value = Number(raw);
    if (!Number.isFinite(value)) value = 160;
    value = clamp(Math.round(value), 24, MAX_COLUMNS);
    widthNumber.value = String(value);
    widthInput.value = String(value);
    widthValue.textContent = String(value);
  }
  function updateZoom() {
    var px = clamp(Number(zoomInput.value) || 7, 4, 13);
    output.style.fontSize = px + "px";
    zoomValue.textContent = px + "px";
  }
  function updateIndicators() {
    widthValue.textContent = widthNumber.value;
    contrastValue.textContent = (Number(contrastInput.value) / 100).toFixed(2);
    brightnessValue.textContent = brightnessInput.value;
  }

  function closeOldImage() {
    if (imageSource && typeof imageSource.close === "function") imageSource.close();
    imageSource = null;
  }

  function makeImage(file) {
    if ("createImageBitmap" in window) return createImageBitmap(file);
    return new Promise(function (resolve, reject) {
      var image = new Image();
      var url = URL.createObjectURL(file);
      image.onload = function () { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Could not read that image.")); };
      image.src = url;
    });
  }

  function imageDimensions(image) {
    return { width: image.width || image.naturalWidth, height: image.height || image.naturalHeight };
  }

  function convert() {
    if (!imageSource || !ctx) { say("choose a picture first."); return; }
    var dims = imageDimensions(imageSource);
    if (!dims.width || !dims.height) { say("image has no readable pixels."); return; }

    // Character cells are about twice as tall as they are wide.
    var ratio = (dims.height / dims.width) * 0.5;
    var requested = clamp(Math.round(Number(widthNumber.value) || 160), 24, MAX_COLUMNS);
    setColumns(requested);
    var columns = Math.min(requested, Math.floor(Math.sqrt(MAX_CELLS / ratio)), Math.floor(MAX_ROWS / ratio));
    if (columns < 1) { say("picture is too tall; crop it before converting."); return; }
    var rows = Math.max(1, Math.round(columns * ratio));
    if (columns * rows > MAX_CELLS || rows > MAX_ROWS) {
      columns -= 1;
      rows = Math.max(1, Math.round(columns * ratio));
    }
    if (columns < 1 || rows > MAX_ROWS || columns * rows > MAX_CELLS) {
      say("picture dimensions are too extreme; try cropping first.");
      return;
    }
    var count = columns * rows;
    var characters = palettes[charsetInput.value] || palettes.ultra;
    var steps = characters.length - 1;
    var contrast = Number(contrastInput.value) / 100;
    var brightness = Number(brightnessInput.value) / 100;
    var invert = invertInput.checked;
    var dither = ditherInput.checked;
    var enhanceEdges = edgeInput.checked;
    var pixels;
    try {
      canvas.width = columns;
      canvas.height = rows;
      ctx.imageSmoothingEnabled = true;
      if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, columns, rows);
      ctx.drawImage(imageSource, 0, 0, columns, rows);
      pixels = ctx.getImageData(0, 0, columns, rows).data;
    } catch (error) {
      say("could not read the image: " + (error.message || "pixel error"));
      return;
    }
    var tones = new Float32Array(count);
    for (var p = 0, i = 0; p < count; p++, i += 4) {
      var alpha = pixels[i + 3] / 255;
      var luminosity = (0.2126 * pixels[i] + 0.7152 * pixels[i + 1]
        + 0.0722 * pixels[i + 2]) * alpha + 255 * (1 - alpha);
      var tone = clamp((luminosity / 255 - 0.5) * contrast + 0.5 + brightness, 0, 1);
      tones[p] = invert ? 1 - tone : tone;
    }
    if (enhanceEdges) {
      var sharp = new Float32Array(count);
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < columns; x++) {
          var at = y * columns + x, sum = 0, neighbors = 0;
          if (x > 0) { sum += tones[at - 1]; neighbors++; }
          if (x + 1 < columns) { sum += tones[at + 1]; neighbors++; }
          if (y > 0) { sum += tones[at - columns]; neighbors++; }
          if (y + 1 < rows) { sum += tones[at + columns]; neighbors++; }
          var average = neighbors ? sum / neighbors : tones[at];
          sharp[at] = clamp(tones[at] + 0.65 * (tones[at] - average), 0, 1);
        }
      }
      tones = sharp;
    }
    var error = dither ? new Float32Array(count) : null;
    var lines = new Array(rows);
    for (var row = 0; row < rows; row++) {
      var line = new Array(columns);
      for (var col = 0; col < columns; col++) {
        var index = row * columns + col;
        var adjusted = clamp(tones[index] + (dither ? error[index] : 0), 0, 1);
        var shade = Math.round(adjusted * steps);
        line[col] = characters.charAt(shade);
        if (dither) {
          var quantError = adjusted - shade / steps;
          if (col + 1 < columns) error[index + 1] += quantError * 7 / 16;
          if (row + 1 < rows) {
            if (col > 0) error[index + columns - 1] += quantError * 3 / 16;
            error[index + columns] += quantError * 5 / 16;
            if (col + 1 < columns) error[index + columns + 1] += quantError / 16;
          }
        }
      }
      lines[row] = line.join("");
    }
    output.value = lines.join("\n");
    output.scrollLeft = 0;
    output.scrollTop = 0;
    var message = "done! " + columns + " columns x " + rows + " rows ("
      + count.toLocaleString() + " characters). scroll sideways or save .txt for the full detail.";
    if (columns < requested) {
      message += " reduced from " + requested + " columns to stay within the browser safety limit.";
    }
    say(message);
  }

  function safeBase(name) {
    return name.replace(/\.[^.]*$/, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").slice(0, 64) || "eggseed-ascii";
  }

  async function loadFile(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|gif|webp|bmp|avif)$/.test(file.type)) {
      say("use a png, jpeg, webp, gif, bmp, or avif image.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      say("image is too large. please use one under 15 MB.");
      return;
    }
    if (processing) return;
    processing = true;
    say("reading picture locally...");
    try {
      var decoded = await makeImage(file);
      var dims = imageDimensions(decoded);
      if (!dims.width || !dims.height || dims.width * dims.height > 40000000) {
        if (typeof decoded.close === "function") decoded.close();
        throw new Error("Image is too large to process safely.");
      }
      closeOldImage();
      imageSource = decoded;
      fileBase = safeBase(file.name);
      convertButton.disabled = false;
      convert();
    } catch (err) {
      say("could not convert: " + (err && err.message ? err.message : "unsupported file"));
    } finally {
      processing = false;
    }
  }

  function copyResult() {
    if (!output.value) { say("nothing to copy yet."); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(output.value).then(
        function () { say("ascii copied to clipboard."); },
        function () { fallbackCopy(); }
      );
    } else {
      fallbackCopy();
    }
  }

  function fallbackCopy() {
    output.focus();
    output.select();
    try {
      var ok = document.execCommand("copy");
      say(ok ? "ascii copied to clipboard." : "select the text and copy it manually.");
    } catch (err) {
      say("select the text and copy it manually.");
    }
  }

  function downloadText() {
    if (!output.value) { say("nothing to download yet."); return; }
    var file = new Blob([output.value + "\n"], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(file);
    var link = document.createElement("a");
    link.href = url;
    link.download = fileBase + ".txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    say("text file ready.");
  }

  fileInput.addEventListener("change", function () { loadFile(fileInput.files && fileInput.files[0]); });
  ["dragenter", "dragover"].forEach(function (name) {
    dropZone.addEventListener(name, function (event) {
      event.preventDefault();
      dropZone.classList.add("hover");
    });
  });
  ["dragleave", "drop"].forEach(function (name) {
    dropZone.addEventListener(name, function (event) {
      event.preventDefault();
      dropZone.classList.remove("hover");
    });
  });
  dropZone.addEventListener("drop", function (event) {
    if (event.dataTransfer && event.dataTransfer.files.length) loadFile(event.dataTransfer.files[0]);
  });
  widthInput.addEventListener("input", function () {
    setColumns(widthInput.value);
  });
  widthInput.addEventListener("change", function () {
    setColumns(widthInput.value);
    if (imageSource && !processing) convert();
  });
  widthNumber.addEventListener("input", function () { widthValue.textContent = widthNumber.value; });
  widthNumber.addEventListener("change", function () {
    setColumns(widthNumber.value);
    if (imageSource && !processing) convert();
  });
  Array.prototype.forEach.call(presetButtons, function (button) {
    button.addEventListener("click", function () {
      setColumns(button.getAttribute("data-ascii-width"));
      if (imageSource && !processing) convert();
    });
  });
  [contrastInput, brightnessInput].forEach(function (input) {
    input.addEventListener("input", updateIndicators);
    input.addEventListener("change", function () {
      updateIndicators();
      if (imageSource && !processing) convert();
    });
  });
  [charsetInput, invertInput, edgeInput, ditherInput].forEach(function (input) {
    input.addEventListener("change", function () {
      if (imageSource && !processing) convert();
    });
  });
  zoomInput.addEventListener("input", function () {
    var px = clamp(Number(zoomInput.value) || 7, 4, 13);
    output.style.fontSize = px + "px";
    zoomValue.textContent = px + "px";
  });
  wideButton.addEventListener("click", function () {
    var wide = document.body.classList.toggle("maker-wide");
    wideButton.textContent = wide ? "[ normal view ]" : "[ wide view ]";
  });
  convertButton.addEventListener("click", convert);
  copyButton.addEventListener("click", copyResult);
  downloadButton.addEventListener("click", downloadText);
  clearButton.addEventListener("click", function () {
    closeOldImage();
    convertButton.disabled = true;
    fileInput.value = "";
    output.value = "";
    fileBase = "eggseed-ascii";
    say("cleared. ready for another picture.");
  });
  if (!ctx) {
    say("image conversion is unavailable in this browser; the text editor still works.");
    fileInput.disabled = true;
  } else {
    say("ready. images never leave your device.");
  }
  setColumns(160);
  updateIndicators();
  updateZoom();
}());

/* Word lettering and screenshot-paste extension. No network requests. */
(function(){
"use strict";
var input=document.getElementById("ascii-letter-input");
var button=document.getElementById("ascii-letter-convert");
var output=document.getElementById("ascii-output");
var status=document.getElementById("ascii-status");
var imageInput=document.getElementById("ascii-file");
var chars={"0":[".@@.","@..@","@..@","@..@",".@@."],"1":[".@.","@@.","..@.","..@.","@@@"],"2":["@@@.","...@",".@@.","@...","@@@@"],"3":["@@@.","...@",".@@.","...@","@@@."],"4":["@..@","@..@","@@@@","...@","...@"],"5":["@@@@","@...","@@@.","...@","@@@."],"6":[".@@@","@...","@@@.","@..@",".@@."],"7":["@@@@","...@","..@.",".@..",".@.."],"8":[".@@.","@..@",".@@.","@..@",".@@."],"9":[".@@.","@..@",".@@.","...@",".@@."],"A":[".@@.","@..@","@@@@","@..@","@..@"],"B":["@@@.","@..@","@@@.","@..@","@@@."],"C":[".@@@","@...","@...","@...",".@@@"],"D":["@@@.","@..@","@..@","@..@","@@@."],"E":["@@@@","@...","@@@.","@...","@@@@"],"F":["@@@@","@...","@@@.","@...","@..."],"G":[".@@@","@...","@.@@","@..@",".@@@"],"H":["@..@","@..@","@@@@","@..@","@..@"],"I":["@@@","..@.","..@.","..@.","@@@"],"J":["..@@","...@","...@","@..@",".@@."],"K":["@..@","@.@.","@@..","@.@.","@..@"],"L":["@...","@...","@...","@...","@@@@"],"M":["@...@","@@.@@","@.@.@","@...@","@...@"],"N":["@...@","@@..@","@.@.@","@..@@","@...@"],"O":[".@@.","@..@","@..@","@..@",".@@."],"P":["@@@.","@..@","@@@.","@...","@..."],"Q":[".@@.","@..@","@..@","@.@@",".@@@"],"R":["@@@.","@..@","@@@.","@.@.","@..@"],"S":[".@@@","@...",".@@.","...@","@@@."],"T":["@@@@@","..@..","..@..","..@..","..@.."],"U":["@..@","@..@","@..@","@..@",".@@."],"V":["@...@","@...@","@...@","..@.@.","..@.."],"W":["@...@","@...@","@.@.@","@@.@@","@...@"],"X":["@...@","..@.@.","..@..","..@.@.","@...@"],"Y":["@...@","..@.@.","..@..","..@..","..@.."],"Z":["@@@@","...@","..@.",".@..","@@@@"],"!":["@","@","@"," ","@"],"?":["@@@.","...@",".@@.","....",".@.."],".":[" "," "," "," ","@"],"-":["    ","    ","@@@@","    ","    "],"/":["...@","..@.",".@..","@...","...."]," ":["  ","  ","  ","  ","  "],"&":[".@@.","@.@.","..@.","@.@@",".@@@"],"@":[".@@@.","@...@","@.@@@","@....",".@@@."]};
function letterArt(){
var value=input.value.toUpperCase().replace(/[^A-Z0-9!?\.\/&@ -]/g,"?").trim();
if(!value){status.textContent="type a phrase first.";return;}
var rendered=[];
for(var offset=0;offset<value.length;offset+=12){
 var chunk=value.slice(offset,offset+12).split("");
 for(var row=0;row<5;row++){
  rendered.push(chunk.map(function(letter){var cells=chars[letter]||chars["?"];return cells[row].replace(/@/g,"#").replace(/\./g," ");}).join("  ").replace(/\s+$/,""));
 }
 if(offset+12<value.length)rendered.push("");
}
output.value=rendered.join("\n");
status.textContent="word art ready. edit, copy, or save it below.";
output.focus();
}
button.addEventListener("click",letterArt);
input.addEventListener("keydown",function(event){if(event.key==="Enter"){event.preventDefault();letterArt();}});
document.addEventListener("paste",function(event){
 if(!event.clipboardData||!event.clipboardData.items)return;
 var imageItem=Array.from(event.clipboardData.items).find(function(item){return item.kind==="file"&&item.type.indexOf("image/")===0;});
 if(!imageItem)return;
 var image=imageItem.getAsFile();
 if(!image)return;
 try{
  var transfer=new DataTransfer();transfer.items.add(image);imageInput.files=transfer.files;
  imageInput.dispatchEvent(new Event("change",{bubbles:true}));
  event.preventDefault();
 }catch(error){status.textContent="paste unavailable here; save the screenshot and choose it above.";}
});
}());
