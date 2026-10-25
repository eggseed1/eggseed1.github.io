/* Public tag directory, safely rendered from the published post index. */
(function () {
  "use strict";
  var root = document.getElementById("tag-results");
  var filters = document.getElementById("tag-filter");
  if (!root || !filters) return;
  var params = new URLSearchParams(location.search);
  var selected = (params.get("tag") || "").trim().toLowerCase();
  function text(tag, className, value) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = value;
    return el;
  }
  fetch("data/studio-posts.json", { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw Error("cannot load tags"); return r.json(); })
    .then(function (data) {
      if (!data || !Array.isArray(data.posts)) throw Error("invalid post list");
      var posts = data.posts.filter(function (p) { return !!p.published; });
      var all = Array.from(new Set(posts.reduce(function (out, p) { return out.concat(p.tags || []); }, []))).sort();
      var allButton = text("a", selected ? "" : "is-current", "[ all ]");
      allButton.href = "tags.html"; filters.appendChild(allButton);
      all.forEach(function (tag) {
        var a = text("a", tag === selected ? "is-current" : "", "#" + tag);
        a.href = "tags.html?tag=" + encodeURIComponent(tag); filters.appendChild(a);
      });
      var found = posts.filter(function (p) { return !selected || (p.tags || []).includes(selected); });
      found.sort(function (a, b) { return b.date.localeCompare(a.date); });
      root.replaceChildren();
      if (!found.length) { root.appendChild(text("p", "", "nothing here yet.")); return; }
      var list = text("ul", "studio-index-list");
      found.forEach(function (p) {
        var row = text("li", "");
        var date = text("time", "", p.date); date.dateTime = p.date; row.appendChild(date);
        var link = text("a", "", p.title); link.href = p.file; row.appendChild(link);
        row.appendChild(text("p", "", (p.section === "writings" ? "archive / writings" : p.section) +
          (p.excerpt ? " — " + p.excerpt : "")));
        list.appendChild(row);
      });
      root.appendChild(list);
    })
    .catch(function () { root.textContent = "tags couldn't be loaded right now."; });
}());