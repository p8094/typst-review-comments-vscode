// Builds the HTML of the comments panel. The script is plain JavaScript kept in
// a normal string (no template literals inside) so it can be embedded as is.

export function getHtml(nonce: string, cspSource: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${nonce}">
  :root { --amber: #e0b800; --green: #3a9a47; }
  body { padding: 0 10px 14px; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); }
  .switches { position: sticky; top: 0; z-index: 2; background: var(--vscode-sideBar-background); padding: 10px 0 6px; border-bottom: 1px solid var(--vscode-panel-border); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 4px 0; }
  .row label { cursor: pointer; flex: 1; }
  .hint { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin: 2px 0 6px; }
  .switch { position: relative; width: 34px; height: 18px; flex: none; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .slider { position: absolute; inset: 0; border-radius: 9px; background: var(--vscode-input-background); border: 1px solid var(--vscode-checkbox-border, var(--vscode-panel-border)); transition: .15s; }
  .slider::before { content: ""; position: absolute; width: 12px; height: 12px; left: 2px; top: 2px; border-radius: 50%; background: var(--vscode-foreground); opacity: .7; transition: .15s; }
  input:checked + .slider { background: var(--vscode-button-background); border-color: var(--vscode-button-background); }
  input:checked + .slider::before { transform: translateX(16px); background: var(--vscode-button-foreground); opacity: 1; }
  input:focus-visible + .slider { outline: 1px solid var(--vscode-focusBorder); }
  input:disabled + .slider { opacity: .4; }
  .toolbar { display: flex; gap: 6px; align-items: center; margin: 10px 0 4px; flex-wrap: wrap; }
  .chip { border: 1px solid var(--vscode-panel-border); background: transparent; color: var(--vscode-foreground); border-radius: 10px; padding: 1px 9px; cursor: pointer; font-size: .85em; }
  .chip.on { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-color: transparent; }
  button { font-family: inherit; font-size: inherit; cursor: pointer; }
  .btn { border: 1px solid transparent; border-radius: 2px; padding: 3px 10px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
  .btn.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .btn.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .btn.danger { background: transparent; color: var(--vscode-errorForeground); border-color: var(--vscode-errorForeground); }
  .spacer { flex: 1; }
  h3 { margin: 14px 0 4px; font-size: .85em; text-transform: uppercase; letter-spacing: .04em; color: var(--vscode-descriptionForeground); font-weight: 600; }
  .card { margin: 6px 0; border-left: 3px solid var(--amber); background: var(--vscode-editor-inactiveSelectionBackground, rgba(128,128,128,.12)); border-radius: 2px; padding: 6px 8px; cursor: pointer; }
  .card.resolved { border-left-color: var(--green); opacity: .85; }
  .card:hover { background: var(--vscode-list-hoverBackground); }
  .card.open { cursor: default; outline: 1px solid var(--vscode-focusBorder); }
  .meta { display: flex; gap: 6px; align-items: baseline; font-size: .85em; color: var(--vscode-descriptionForeground); }
  .meta b { color: var(--vscode-foreground); }
  .tick { color: var(--green); font-weight: bold; }
  .note { white-space: pre-wrap; word-break: break-word; margin: 3px 0; }
  .anchor { font-style: italic; color: var(--vscode-descriptionForeground); border-left: 2px solid var(--vscode-panel-border); padding-left: 6px; margin: 3px 0; white-space: pre-wrap; word-break: break-word; max-height: 4.5em; overflow: hidden; }
  .anchor mark { background: rgba(224,184,0,.35); color: inherit; }
  .card.resolved .anchor mark { background: rgba(58,154,71,.35); }
  form { margin-top: 6px; display: grid; gap: 6px; }
  form label { display: grid; gap: 2px; font-size: .85em; color: var(--vscode-descriptionForeground); }
  input[type=text], textarea { font-family: inherit; font-size: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); padding: 3px 5px; border-radius: 2px; width: 100%; box-sizing: border-box; }
  input[type=text]:focus, textarea:focus { outline: 1px solid var(--vscode-focusBorder); }
  textarea { min-height: 70px; resize: vertical; }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .empty { color: var(--vscode-descriptionForeground); padding: 16px 0; text-align: center; }
  .err { color: var(--vscode-errorForeground); font-size: .85em; }
</style>
</head>
<body>
  <div class="switches">
    <div class="row">
      <label for="sw-enabled"><b>Show comments</b> in preview and PDF</label>
      <span class="switch"><input type="checkbox" id="sw-enabled"><span class="slider"></span></span>
    </div>
    <div class="row">
      <label for="sw-resolved">Show resolved comments</label>
      <span class="switch"><input type="checkbox" id="sw-resolved"><span class="slider"></span></span>
    </div>
    <div class="hint" id="setup-hint"></div>
  </div>
  <div class="toolbar">
    <button class="chip" data-filter="all">All <span id="n-all"></span></button>
    <button class="chip" data-filter="open">Open <span id="n-open"></span></button>
    <button class="chip" data-filter="resolved">Resolved <span id="n-resolved"></span></button>
    <span class="spacer"></span>
    <button class="chip" id="scope" title="Switch between all workspace files and the active file"></button>
    <button class="btn" id="add" title="Add a comment at the selection of the active editor">+ Add</button>
  </div>
  <div id="list"></div>
<script nonce="${nonce}">
(function () {
  var vscode = acquireVsCodeApi();
  var state = null;
  var filter = (vscode.getState() || {}).filter || "all";
  var openKey = null;     // "uri|index" of the card being edited
  var dirty = false;      // edit form has unsaved changes -> postpone re-render
  var pending = null;     // state received while editing

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function post(m) { vscode.postMessage(m); }
  function keyOf(f, c) { return f.uri + "|" + c.index; }

  $("sw-enabled").addEventListener("change", function (e) { post({ type: "toggle", key: "enabled", value: e.target.checked }); });
  $("sw-resolved").addEventListener("change", function (e) { post({ type: "toggle", key: "show-resolved", value: e.target.checked }); });
  $("add").addEventListener("click", function () { post({ type: "add" }); });
  $("scope").addEventListener("click", function () { post({ type: "scope", value: state && state.scope === "workspace" ? "file" : "workspace" }); });
  Array.prototype.forEach.call(document.querySelectorAll("[data-filter]"), function (b) {
    b.addEventListener("click", function () { filter = b.getAttribute("data-filter"); vscode.setState({ filter: filter }); render(); });
  });

  window.addEventListener("message", function (ev) {
    if (ev.data.type !== "state") return;
    if (openKey && dirty) { pending = ev.data.state; return; }
    state = ev.data.state; render();
  });

  function counts() {
    var open = 0, res = 0;
    state.files.forEach(function (f) { f.comments.forEach(function (c) { if (c.resolved) res++; else open++; }); });
    return { all: open + res, open: open, resolved: res };
  }

  function render() {
    if (!state) return;
    var s = state.setup;
    $("sw-enabled").checked = s.found && s.enabled;
    $("sw-resolved").checked = s.showResolved;
    $("sw-resolved").disabled = !s.found;
    $("setup-hint").textContent = s.found
      ? "Switch stored in " + s.file + " (review-comments.with). Preview and PDF update when the file is recompiled."
      : "No review-comments.with(...) found yet. Turning the switch on adds it to a file of your choice.";
    $("scope").textContent = state.scope === "workspace" ? "All files" : "This file";

    var n = counts();
    $("n-all").textContent = n.all; $("n-open").textContent = n.open; $("n-resolved").textContent = n.resolved;
    Array.prototype.forEach.call(document.querySelectorAll("[data-filter]"), function (b) {
      b.classList.toggle("on", b.getAttribute("data-filter") === filter);
    });

    var list = $("list");
    list.textContent = "";
    var shown = 0;
    state.files.forEach(function (f) {
      var cs = f.comments.filter(function (c) { return filter === "all" || (filter === "resolved") === c.resolved; });
      if (!cs.length) return;
      shown += cs.length;
      if (state.scope === "workspace") list.appendChild(el("h3", "", f.name));
      cs.forEach(function (c) { list.appendChild(card(f, c)); });
    });
    if (!shown) list.appendChild(el("div", "empty", n.all ? "No comments match this filter." : "No comments yet. Select text in a .typ file and press the shortcut, or use + Add."));
  }

  function card(f, c) {
    var key = keyOf(f, c);
    var isOpen = key === openKey;
    var d = el("div", "card" + (c.resolved ? " resolved" : "") + (isOpen ? " open" : ""));
    var meta = el("div", "meta");
    meta.appendChild(el("b", "", c.author || "Anonymous"));
    if (c.date) meta.appendChild(el("span", "", c.date));
    meta.appendChild(el("span", "", "line " + (c.line + 1)));
    if (c.resolved) meta.appendChild(el("span", "tick", "\\u2713 resolved"));
    d.appendChild(meta);
    d.appendChild(el("div", "note", c.note));
    if (c.body !== null) {
      var a = el("div", "anchor");
      var m = el("mark", "", c.body.length > 160 ? c.body.slice(0, 160) + "\\u2026" : c.body);
      a.appendChild(m);
      d.appendChild(a);
    }
    if (!isOpen) {
      d.addEventListener("click", function () {
        openKey = key; dirty = false;
        post({ type: "reveal", uri: f.uri, index: c.index });
        render();
      });
      return d;
    }
    d.appendChild(editForm(f, c));
    return d;
  }

  function editForm(f, c) {
    var form = el("form");
    function field(label, node) { var l = el("label", "", label); l.appendChild(node); form.appendChild(l); return node; }
    var note = el("textarea"); note.value = c.note;
    var author = el("input"); author.type = "text"; author.value = c.author || "";
    var date = el("input"); date.type = "text"; date.value = c.date || "";
    field("Comment (Typst markup)", note);
    field("Author", author);
    field("Date", date);
    var err = el("div", "err");
    form.appendChild(err);
    [note, author, date].forEach(function (i) { i.addEventListener("input", function () { dirty = true; }); });

    var actions = el("div", "actions");
    var save = el("button", "btn", "Save"); save.type = "submit";
    var resolve = el("button", "btn secondary", c.resolved ? "Reopen" : "Mark resolved"); resolve.type = "button";
    var del = el("button", "btn danger", "Delete"); del.type = "button";
    var cancel = el("button", "btn secondary", "Close"); cancel.type = "button";
    actions.appendChild(save); actions.appendChild(resolve); actions.appendChild(del);
    actions.appendChild(el("span", "spacer")); actions.appendChild(cancel);
    form.appendChild(actions);

    var base = { uri: f.uri, index: c.index, sig: c.sig };
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!note.value.trim()) { err.textContent = "The comment cannot be empty."; return; }
      post(Object.assign({ type: "save", note: note.value, author: author.value, date: date.value }, base));
      dirty = false; openKey = null; flushPending();
    });
    resolve.addEventListener("click", function () {
      post(Object.assign({ type: "resolve", resolved: !c.resolved }, base));
      dirty = false; openKey = null; flushPending();
    });
    del.addEventListener("click", function () { post(Object.assign({ type: "delete" }, base)); dirty = false; openKey = null; flushPending(); });
    cancel.addEventListener("click", function () { dirty = false; openKey = null; flushPending(); });
    setTimeout(function () { note.focus(); }, 0);
    return form;
  }

  function flushPending() {
    if (pending) { state = pending; pending = null; }
    render();
  }

  post({ type: "ready" });
})();
</script>
</body>
</html>`;
}
