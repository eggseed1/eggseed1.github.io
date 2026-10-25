/* Inline guestbook, with shared comments hosted by HTML Comment Box.
 * Moderation is not linked to the site owner yet. To claim moderation,
 * copy your own account code from https://www.htmlcommentbox.com/html-guestbook.html
 * and update the MOD variable below. Never paste anyone else's moderator code.
 */
(function () {
  "use strict";
  if (!document.getElementById("HCB_comment_box")) return;
  var PAGE = "https://eggseed1.github.io/eggseed/guestbook.html";
  var MOD = "";
  window.hcb_user = {
    PAGE: PAGE,
    MAX_CHARS: 3000,
    comments_header: "comments",
    name_label: "[ name ]",
    add_image: "[ + add image ]",
    content_label: "leave a comment...",
    submit: "post comment",
    add: "leave a comment",
    again: "write another comment",
    no_comments_msg: "no comments yet.",
    RELATIVE_DATES: false
  };
  var script = document.createElement("script");
  script.id = "hcb";
  script.async = true;
  script.src = "https://www.htmlcommentbox.com/jread?page=" +
    encodeURIComponent(PAGE).replace("+", "%2B") +
    "&mod=" + MOD + "&opts=16862&num=10";
  script.onerror = function () {
    var el = document.getElementById("HCB_comment_box");
    if (el) el.textContent = "the guestbook could not load.";
  };
  document.head.appendChild(script);
}());
