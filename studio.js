/* eggseed studio. Public UI, owner-only commits through GitHub.
   Fine-grained GitHub tokens stay in JS memory and are never saved. */
(function () {
  "use strict";
  var REPOSITORY = "eggseed1/eggseed1.github.io";
  var BRANCH = "main";
  var BASE = "https://api.github.com/repos/" + REPOSITORY;
  var CONFIG = {
    blog: { name: "blog", index: "blog.html", directory: "blog", nav: "blog.html" },
    writings: { name: "archive / writings", index: "archive.html", directory: "archive-notes", nav: "archive.html" },
    reviews: { name: "reviews", index: "reviews.html", directory: "reviews", nav: "reviews.html" },
    scans: { name: "scans & photos", index: "media.html", directory: "scans", nav: "photos.html" },
    photos: { name: "photographs", index: "photos.html", directory: "photo-notes", nav: "photos.html" }
  };
  var token = "";
  var registry = { version: 1, posts: [] };
  var registrySnapshot = "";
  var activeId = null;
  var bodyCache = {};
  var template = "";
  var busy = false;
  var dirty = false;
  var slugTouched = false;
  var ids = ["studio-title", "studio-section", "studio-slug", "studio-date",
    "studio-tags", "studio-excerpt", "studio-image", "studio-body", "studio-published"];
  function $(id) { return document.getElementById(id); }
  function clean(s) { return String(s == null ? "" : s); }
  function escapeHTML(s) {
    return clean(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function slugify(s) {
    return clean(s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 65);
  }
  function tagsOf(s) {
    return Array.from(new Set(clean(s).split(",").map(function (t) {
      return t.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 32);
    }).filter(Boolean))).slice(0, 15);
  }
  function day(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ""; }
  function safeURL(s) {
    s = clean(s).trim();
    if (/^https:\/\//i.test(s)) return s;
    if (/^(?:\.\.\/|\.\/)?[a-z0-9][a-z0-9_./?=&%#-]*$/i.test(s) && !s.includes("..//")) return s;
    return "";
  }
  function status(message, error) {
    var el = $("studio-status");
    el.textContent = message;
    el.className = error ? "studio-status is-error" : "studio-status";
  }
  function lockWork(locked) {
    $("studio-workspace").hidden = locked;
    $("studio-locked").hidden = !locked;
  }
  async function request(path, options) {
    if (!token) throw Error("Connect to GitHub first.");
    var opts = options || {};
    var headers = { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28" };
    if (opts.body) headers["Content-Type"] = "application/json";
    var res;
    try { res = await fetch(BASE + path, { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: "no-store" }); }
    catch (e) { throw Error("Could not connect to GitHub. Check your internet connection."); }
    if (!res.ok) {
      var msg = "";
      try { msg = (await res.json()).message || ""; } catch (_) {}
      var err = Error("GitHub " + res.status + ": " + (msg || "Request failed"));
      err.status = res.status;
      throw err;
    }
    return res.json();
  }
  function utf8Decode(b64) {
    var bytes = Uint8Array.from(atob(b64.replace(/\s/g, "")), function (c) { return c.charCodeAt(0); });
    return new TextDecoder("utf-8").decode(bytes);
  }
  async function fileFromGitHub(path) {
    var encoded = path.split("/").map(encodeURIComponent).join("/");
    var data = await request("/contents/" + encoded + "?ref=" + BRANCH);
    if (typeof data.content !== "string") throw Error("Could not read " + path);
    return utf8Decode(data.content);
  }
  function validateRegistry(data) {
    if (!data || !Array.isArray(data.posts) || data.version !== 1) throw Error("Invalid post index. Nothing changed.");
    return data;
  }
  function entryPath(section, slug) { return CONFIG[section].directory + "/" + slug + ".html"; }
  function compareByDate(a, b) {
    return (b.date || "").localeCompare(a.date || "") || a.title.localeCompare(b.title);
  }
  function buildTags(entry, prefix) {
    return (entry.tags || []).map(function (t) {
      return '<a href="' + prefix + 'tags.html?tag=' + encodeURIComponent(t) +
        '" class="post-tag">#' + escapeHTML(t) + '</a>';
    }).join(" ");
  }
  function inline(text) {
    var s = escapeHTML(text);
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (_, alt, href) {
      var url = safeURL(href.replace(/&amp;/g, "&"));
      return url ? '<img src="' + escapeHTML(url) + '" alt="' + alt + '" loading="lazy">' : alt;
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, name, href) {
      var url = safeURL(href.replace(/&amp;/g, "&"));
      return url ? '<a href="' + escapeHTML(url) + '" rel="noopener noreferrer">' + name + '</a>' : name;
    });
    s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    s = s.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
    s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    return s;
  }
  function renderMarkdown(md) {
    var lines = clean(md).replace(/\r\n?/g, "\n").split("\n");
    var blocks = [], para = [], list = null;
    function flush() {
      if (para.length) { blocks.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; }
      if (list) { blocks.push("</" + list + ">"); list = null; }
    }
    lines.forEach(function (line) {
      var s = line.trim();
      if (!s) { flush(); return; }
      var h = s.match(/^(#{1,3})\s+(.+)$/);
      if (h) { flush(); var level = Math.min(4, h[1].length + 1); blocks.push("<h" + level + ">" + inline(h[2]) + "</h" + level + ">"); return; }
      if (/^---+$/.test(s)) { flush(); blocks.push("<hr>"); return; }
      var bullet = s.match(/^[-*]\s+(.+)$/);
      var ordered = s.match(/^\d+\.\s+(.+)$/);
      if (bullet || ordered) {
        if (para.length) { blocks.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; }
        var kind = bullet ? "ul" : "ol";
        if (list !== kind) { if (list) blocks.push("</" + list + ">"); blocks.push("<" + kind + ">"); list = kind; }
        blocks.push("<li>" + inline((bullet || ordered)[1]) + "</li>");
        return;
      }
      if (/^>\s?/.test(s)) { flush(); blocks.push("<blockquote><p>" + inline(s.replace(/^>\s?/, "")) + "</p></blockquote>"); return; }
      if (list) { blocks.push("</" + list + ">"); list = null; }
      para.push(s);
    });
    flush();
    return blocks.join("\n");
  }
  function newForm() {
    activeId = null; slugTouched = false;
    $("studio-form").reset();
    $("studio-date").value = new Date().toLocaleDateString("en-CA");
    $("studio-section").value = "blog";
    $("studio-published").checked = true;
    $("studio-delete").disabled = true;
    $("studio-form-heading").textContent = "new post";
    $("studio-open-link").hidden = true;
    dirty = false;
    updatePreview();
    highlightList();
    status("new post ready");
  }
  function highlightList() {
    document.querySelectorAll("[data-post-id]").forEach(function (n) {
      n.classList.toggle("is-selected", n.getAttribute("data-post-id") === activeId);
    });
  }
  function renderList() {
    var root = $("studio-post-list");
    root.replaceChildren();
    var needle = $("studio-search").value.trim().toLowerCase();
    var rows = registry.posts.slice().sort(compareByDate).filter(function (p) {
      return (p.title + " " + p.section + " " + (p.tags || []).join(" ")).toLowerCase().includes(needle);
    });
    if (!rows.length) { var empty = document.createElement("p"); empty.textContent = "no matching posts."; root.appendChild(empty); return; }
    rows.forEach(function (p) {
      var btn = document.createElement("button");
      btn.type = "button"; btn.className = "studio-post-item"; btn.setAttribute("data-post-id", p.id);
      var name = document.createElement("strong"); name.textContent = p.title;
      var desc = document.createElement("span"); desc.textContent =
        p.date + " / " + (CONFIG[p.section] ? CONFIG[p.section].name : p.section) + (p.published ? "" : " / draft");
      btn.appendChild(name); btn.appendChild(desc);
      btn.addEventListener("click", function () { loadPost(p.id); });
      root.appendChild(btn);
    });
    highlightList();
  }
  function getForm() {
    return {
      title: $("studio-title").value.trim(),
      section: $("studio-section").value,
      slug: $("studio-slug").value.trim().toLowerCase(),
      date: $("studio-date").value,
      tags: tagsOf($("studio-tags").value),
      excerpt: $("studio-excerpt").value.trim(),
      image: $("studio-image").value.trim(),
      body: $("studio-body").value,
      published: $("studio-published").checked
    };
  }
  function updatePreview() {
    var p = getForm(), node = $("studio-preview");
    var example = { tags: p.tags };
    var image = p.image && safeURL(p.image) ?
      '<figure class="studio-article-image"><img src="' + escapeHTML(p.image) + '" alt="' + escapeHTML(p.title) + '" loading="lazy"></figure>' : "";
    node.innerHTML = '<h2>' + escapeHTML(p.title || "untitled") + '</h2>' +
      '<p class="studio-preview-date">' + escapeHTML(p.date || "") + '</p>' +
      '<p class="studio-preview-tags">' + buildTags(example, "") + '</p>' +
      image + '<div class="blog-entry-body">' + renderMarkdown(p.body) + '</div>';
  }
  async function loadPost(id) {
    if (busy) return;
    if (dirty && !confirm("Discard your unsaved changes?")) return;
    var post = registry.posts.find(function (p) { return p.id === id; });
    if (!post) return;
    busy = true;
    status("opening " + post.title + "...");
    try {
      var body = bodyCache[post.id];
      if (body == null) body = await fileFromGitHub(post.source);
      bodyCache[post.id] = body;
      activeId = post.id;
      $("studio-title").value = post.title;
      $("studio-section").value = post.section;
      $("studio-slug").value = post.slug;
      $("studio-date").value = post.date;
      $("studio-tags").value = (post.tags || []).join(", ");
      $("studio-excerpt").value = post.excerpt || "";
      $("studio-image").value = post.image || "";
      $("studio-body").value = body;
      $("studio-published").checked = !!post.published;
      $("studio-delete").disabled = false;
      $("studio-form-heading").textContent = "editing / " + post.title;
      $("studio-open-link").hidden = !post.published;
      if (post.published) $("studio-open-link").href = post.file;
      slugTouched = true; dirty = false;
      updatePreview(); highlightList(); status("loaded " + post.title);
    } catch (e) { status(e.message, true); }
    finally { busy = false; }
  }
  function checkPost(post, previous) {
    if (!post.title || post.title.length > 160) throw Error("Add a title (160 characters max).");
    if (!CONFIG[post.section]) throw Error("Choose a valid section.");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug) || post.slug.length > 65) throw Error("Use a short URL slug: lowercase letters, numbers, and hyphens.");
    if (!day(post.date)) throw Error("Choose a publication date.");
    if (post.body.trim().length < 1) throw Error("Write something before saving.");
    if (post.body.length > 150000) throw Error("Post exceeds the 150,000-character editor limit.");
    if (post.excerpt.length > 300) throw Error("Keep the summary below 300 characters.");
    if (post.image && !safeURL(post.image)) throw Error("Image URL must be HTTPS or a relative path.");
    var path = entryPath(post.section, post.slug);
    if (registry.posts.some(function (x) { return (!previous || x.id !== previous.id) && x.file === path; }))
      throw Error("Another managed post already uses that URL.");
  }
  function generateArticle(post, md, source) {
    var cfg = CONFIG[post.section];
    var indexLink = "../" + cfg.index;
    var tags = buildTags(post, "../");
    var img = post.image ? '<figure class="studio-article-image"><img src="' +
      escapeHTML(post.image) + '" alt="' + escapeHTML(post.title) + '" loading="lazy"></figure>' : "";
    var main = '<main class="center-col" id="content"><div class="centerframe blog-entry">' +
      '<p class="blog-entry-back"><a href="' + indexLink + '">[ back to ' + escapeHTML(cfg.name) + ' ]</a></p>' +
      '<article><header class="blog-entry-heading"><h1>' + escapeHTML(post.title) + '</h1>' +
      '<p><time datetime="' + escapeHTML(post.date) + '">' + escapeHTML(post.date) + '</time></p>' +
      (tags ? '<p class="studio-article-tags">' + tags + '</p>' : "") +
      '</header>' + img + '<div class="blog-entry-body">' + renderMarkdown(md) + '</div></article>' +
      '<p class="blog-entry-back blog-entry-bottom"><a href="' + indexLink + '">[ back to ' + escapeHTML(cfg.name) + ' ]</a></p>' +
      '</div></main>';
    var page = source.replace(/<main class="center-col" id="content">[\s\S]*?<\/main>/, main);
    page = page.replace(/<title>[\s\S]*?<\/title>/, '<title>' + escapeHTML(post.title) + ' | eggseed</title>');
    page = page.replace(/<meta name="description" content="[^"]*">/,
      '<meta name="description" content="' + escapeHTML(post.excerpt || post.title) + '">');
    page = page.replace(/<nav>[\s\S]*?<\/nav>/, function (nav) {
      return nav.replace(/ class="navrow active"/g, ' class="navrow"')
        .replace(/ aria-current="page"/g, "")
        .replace('class="navrow" href="../' + cfg.nav + '"',
          'class="navrow active" href="../' + cfg.nav + '" aria-current="page"');
    });
    return page;
  }
  function buildIndex(section, posts) {
    var list = posts.filter(function (p) { return p.published && p.section === section; }).sort(compareByDate);
    function tagLine(p) { var t = buildTags(p, ""); return t ? '<p class="studio-list-tags">' + t + '</p>' : ""; }
    if (section !== "blog") {
      if (!list.length) return "";
      return '<ul class="studio-index-list">' + list.map(function (p) {
        return '<li><time datetime="' + escapeHTML(p.date) + '">' + escapeHTML(p.date) + '</time>' +
          '<a href="' + escapeHTML(p.file) + '">' + escapeHTML(p.title) + '</a>' +
          (p.excerpt ? '<p>' + escapeHTML(p.excerpt) + '</p>' : "") + tagLine(p) + '</li>';
      }).join("\n") + '</ul>';
    }
    var years = {};
    list.forEach(function (p) {
      var y = p.date.slice(0, 4), m = p.date.slice(5, 7);
      if (!years[y]) years[y] = {};
      if (!years[y][m]) years[y][m] = [];
      years[y][m].push(p);
    });
    var names = ["january", "february", "march", "april", "may", "june",
      "july", "august", "september", "october", "november", "december"];
    return Object.keys(years).sort().reverse().map(function (y) {
      var count = Object.keys(years[y]).reduce(function (n, m) { return n + years[y][m].length; }, 0);
      return '<div class="blog-index-year"><h2>' + y + '</h2><span>' + count + (count === 1 ? ' post' : ' posts') + '</span></div>' +
        Object.keys(years[y]).sort().reverse().map(function (m) {
          var month = names[Number(m)-1] || m;
          return '<section class="blog-month"><h3>' + month + '</h3><ul class="blog-index-list">' +
            years[y][m].map(function (p) {
              return '<li><time datetime="' + escapeHTML(p.date) + '">' + p.date.slice(8) + '</time>' +
                '<div><a href="' + escapeHTML(p.file) + '">' + escapeHTML(p.title) + '</a>' +
                (p.excerpt ? '<p>' + escapeHTML(p.excerpt) + '</p>' : "") + tagLine(p) + '</div></li>';
            }).join("") + '</ul></section>';
        }).join("");
    }).join("\n");
  }
  /* Keep the home-page recent writings shelf in sync with published blog posts. */
  /* Publish any writing from Studio (blog, archive, reviews, scans or photos).
   * The standalone review predates Studio, so include it explicitly.
   * The 45rpm collection is intentionally excluded. */
  function buildRecentWritings(posts) {
    var months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    var olderArticles = [
      { title: "Hard to Love a Man", date: "2026-10-24", section: "reviews",
        file: "reviews/hard-to-love-a-man.html" }
    ];
    var seen = {};
    var candidates = [];
    posts.concat(olderArticles).forEach(function (p, index) {
      if (!p.published && !olderArticles.includes(p)) return;
      if (p.section === "45rpm" || !p.file || seen[p.file]) return;
      seen[p.file] = true;
      candidates.push({ title: p.title, date: p.date, file: p.file,
        managed: index < posts.length });
    });
    var latest = candidates.sort(function (a, b) {
      return clean(b.date).localeCompare(clean(a.date)) ||
        Number(b.managed) - Number(a.managed) ||
        a.title.localeCompare(b.title);
    }).slice(0, 3);
    if (!latest.length) return '<p class="recent-writings-empty">no writings yet.</p>';
    return '<ul class="recent-writings-list">' + latest.map(function (p) {
      var date = clean(p.date), month = months[Number(date.slice(5, 7)) - 1] || "";
      var label = month + " " + Number(date.slice(8, 10)) + ", " + date.slice(0, 4);
      return '<li><time datetime="' + escapeHTML(date) + '">' + escapeHTML(label) + '</time>' +
        '<a href="' + escapeHTML(p.file) + '">' + escapeHTML(p.title) + '</a></li>';
    }).join("") + '</ul>';
  }
  function updateHomepageHTML(html, posts) {
    var start = "<!-- STUDIO_RECENT_BLOG_START -->";
    var end = "<!-- STUDIO_RECENT_BLOG_END -->";
    var from = html.indexOf(start), to = html.indexOf(end);
    if (from < 0 || to <= from) throw Error("Recent writings block is missing from index.html");
    return html.slice(0, from + start.length) + "\n" +
      buildRecentWritings(posts) + "\n" + html.slice(to);
  }
  function updateIndexHTML(html, section, posts) {
    var open = "<!-- STUDIO_LIST_START:" + section + " -->";
    var close = "<!-- STUDIO_LIST_END:" + section + " -->";
    var start = html.indexOf(open), end = html.indexOf(close);
    if (start < 0 || end < start) throw Error("Cannot locate the managed area in " + CONFIG[section].index);
    return html.slice(0, start + open.length) + "\n" + buildIndex(section, posts) +
      "\n" + html.slice(end);
  }
  async function checkUniquePath(path, previous) {
    if (previous && previous.file === path) return;
    try { await fileFromGitHub(path); }
    catch (e) { if (e.status === 404) return; throw e; }
    throw Error("The URL is already used by an existing file: " + path);
  }
  async function save() {
    if (busy || !token) return;
    var form = getForm();
    var previous = registry.posts.find(function (p) { return p.id === activeId; }) || null;
    try { checkPost(form, previous); } catch (e) { status(e.message, true); return; }
    busy = true; $("studio-save").disabled = true; $("studio-delete").disabled = true;
    status("checking the latest repository state...");
    try {
      var current = validateRegistry(JSON.parse(await fileFromGitHub("data/studio-posts.json")));
      if (JSON.stringify(current) !== registrySnapshot) throw Error("Posts changed in another session. Reconnect before saving to avoid overwriting changes.");
      var path = entryPath(form.section, form.slug);
      await checkUniquePath(path, previous);
      var id = previous ? previous.id : "post-" + Date.now().toString(36);
      var post = {
        id: id, title: form.title, section: form.section, slug: form.slug, date: form.date,
        tags: form.tags, excerpt: form.excerpt, image: form.image, published: form.published,
        file: path, source: previous ? previous.source : "data/studio/" + id + ".md"
      };
      var posts = current.posts.filter(function (p) { return p.id !== id; }).concat([post]);
      var targets = Array.from(new Set(Object.keys(CONFIG).map(function (key) { return CONFIG[key].index; })));
      var indexes = await Promise.all(targets.map(fileFromGitHub));
      var homepage = await fileFromGitHub("index.html");
      if (!template) template = await fileFromGitHub("templates/post.html");
      var branch = await request("/branches/" + BRANCH);
      var treeItems = [
        { path: "data/studio-posts.json", mode: "100644", type: "blob",
          content: JSON.stringify({ version: 1, posts: posts }, null, 2) + "\n" },
        { path: post.source, mode: "100644", type: "blob", content: form.body }
      ];
      Object.keys(CONFIG).forEach(function (section) {
        var target = CONFIG[section].index, index = targets.indexOf(target);
        treeItems.push({ path: target, mode: "100644", type: "blob",
          content: updateIndexHTML(indexes[index], section, posts) });
      });
      treeItems.push({ path: "index.html", mode: "100644", type: "blob",
        content: updateHomepageHTML(homepage, posts) });
      if (form.published) treeItems.push({ path: post.file, mode: "100644", type: "blob",
        content: generateArticle(post, form.body, template) });
      if (previous && previous.published && (!form.published || previous.file !== post.file))
        treeItems.push({ path: previous.file, mode: "100644", type: "blob", sha: null });
      status("publishing to GitHub...");
      var newTree = await request("/git/trees", { method: "POST",
        body: { base_tree: branch.commit.commit.tree.sha, tree: treeItems } });
      var commit = await request("/git/commits", { method: "POST",
        body: { message: (form.published ? "Publish" : "Save draft") + ": " + form.title,
          tree: newTree.sha, parents: [branch.commit.sha] } });
      await request("/git/refs/heads/" + BRANCH, { method: "PATCH",
        body: { sha: commit.sha, force: false } });
      registry = { version: 1, posts: posts };
      registrySnapshot = JSON.stringify(registry);
      bodyCache[id] = form.body; activeId = id; dirty = false; slugTouched = true;
      $("studio-delete").disabled = false;
      $("studio-open-link").hidden = !post.published;
      if (post.published) $("studio-open-link").href = post.file;
      $("studio-form-heading").textContent = "editing / " + post.title;
      renderList(); updatePreview();
      status((post.published ? "Published!" : "Draft saved!") + " GitHub Pages may need a minute to rebuild.");
    } catch (e) { status(e.message || "Save failed. No confirmation of publication.", true); }
    finally { busy = false; $("studio-save").disabled = false; $("studio-delete").disabled = !activeId; }
  }
  async function deletePost() {
    if (!token || !activeId || busy) return;
    var old = registry.posts.find(function (p) { return p.id === activeId; });
    if (!old || !confirm("Permanently delete '" + old.title + "' from GitHub and remove it from the site?")) return;
    busy = true; status("removing the post...");
    try {
      var current = validateRegistry(JSON.parse(await fileFromGitHub("data/studio-posts.json")));
      if (JSON.stringify(current) !== registrySnapshot) throw Error("Posts changed elsewhere. Reconnect and retry.");
      var posts = current.posts.filter(function (p) { return p.id !== activeId; });
      var targets = Array.from(new Set(Object.keys(CONFIG).map(function (key) { return CONFIG[key].index; })));
      var indexes = await Promise.all(targets.map(fileFromGitHub));
      var homepage = await fileFromGitHub("index.html");
      var branch = await request("/branches/" + BRANCH);
      var changes = [
        { path: "data/studio-posts.json", mode: "100644", type: "blob", content: JSON.stringify({ version: 1, posts: posts }, null, 2) + "\n" },
        { path: old.source, mode: "100644", type: "blob", sha: null }
      ];
      if (old.published) changes.push({ path: old.file, mode: "100644", type: "blob", sha: null });
      Object.keys(CONFIG).forEach(function (section) {
        var target = CONFIG[section].index;
        changes.push({ path: target, mode: "100644", type: "blob",
          content: updateIndexHTML(indexes[targets.indexOf(target)], section, posts) });
      });
      changes.push({ path: "index.html", mode: "100644", type: "blob",
        content: updateHomepageHTML(homepage, posts) });
      var tree = await request("/git/trees", { method: "POST", body: { base_tree: branch.commit.commit.tree.sha, tree: changes } });
      var commit = await request("/git/commits", { method: "POST",
        body: { message: "Delete site post: " + old.title, tree: tree.sha, parents: [branch.commit.sha] } });
      await request("/git/refs/heads/" + BRANCH, { method: "PATCH", body: { sha: commit.sha, force: false } });
      delete bodyCache[old.id]; registry = { version: 1, posts: posts }; registrySnapshot = JSON.stringify(registry);
      dirty = false; newForm(); renderList(); status("Post deleted. GitHub Pages will rebuild.");
    } catch (e) { status(e.message || "Delete failed.", true); }
    finally { busy = false; $("studio-save").disabled = false; }
  }
  async function connect() {
    var candidate = $("studio-token").value.trim();
    if (!candidate) { status("Paste your fine-grained GitHub token first.", true); return; }
    token = candidate;
    $("studio-token").value = "";
    status("connecting...");
    try {
      await request("/branches/" + BRANCH);
      registry = validateRegistry(JSON.parse(await fileFromGitHub("data/studio-posts.json")));
      registrySnapshot = JSON.stringify(registry);
      lockWork(false); $("studio-connection").textContent = "connected / " + REPOSITORY;
      newForm(); renderList(); status("connected. token stays only in this browser tab's memory.");
    } catch (e) {
      token = ""; lockWork(true); $("studio-connection").textContent = "not connected";
      status(e.message || "Connection failed.", true);
    }
  }
  $("studio-connect").addEventListener("click", connect);
  $("studio-disconnect").addEventListener("click", function () {
    token = ""; registry = { version: 1, posts: [] }; bodyCache = {}; activeId = null; dirty = false;
    lockWork(true); $("studio-connection").textContent = "not connected"; status("disconnected");
  });
  $("studio-new").addEventListener("click", function () {
    if (dirty && !confirm("Discard your unsaved changes?")) return;
    newForm();
  });
  $("studio-save").addEventListener("click", save);
  $("studio-delete").addEventListener("click", deletePost);
  $("studio-preview-button").addEventListener("click", updatePreview);
  $("studio-search").addEventListener("input", renderList);
  ids.forEach(function (id) {
    $(id).addEventListener("input", function () {
      dirty = true;
      if (id === "studio-title" && !slugTouched && !activeId) $("studio-slug").value = slugify($("studio-title").value);
      if (id === "studio-slug") slugTouched = true;
      updatePreview();
    });
    $(id).addEventListener("change", function () { dirty = true; updatePreview(); });
  });
  $("studio-form").addEventListener("submit", function (event) { event.preventDefault(); save(); });
  window.addEventListener("beforeunload", function (event) {
    if (!dirty) return;
    event.preventDefault(); event.returnValue = "";
  });
  lockWork(true);
  status("connect with a fine-grained GitHub token to begin.");
}());
