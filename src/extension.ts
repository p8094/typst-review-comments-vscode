import * as vscode from "vscode";
import * as path from "path";
import { ParsedComment, SetupCall, findSetup, parseComments, setupFlag } from "./parser";
import {
  TextEdit, buildComment, deleteComment, editComment, hasImport, importLine, insertSetup, isBalanced, setSetupFlag,
} from "./edits";
import { getHtml } from "./webview";
import { installLocalPackage, latestPreviewVersion } from "./pkg";

// --- store of parsed documents ---------------------------------------------------

interface Entry {
  uri: vscode.Uri;
  text: string;
  comments: ParsedComment[];
  setup: SetupCall | null;
}

const pkgVersion = (): string => cfg().get<string>("packageVersion") || "0.3.0";
const pkgSource = (): "preview" | "local" => (cfg().get<string>("packageSource") === "local" ? "local" : "preview");

async function installPackage(): Promise<void> {
  try {
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Setting up the review-comments Typst package…" },
      async () => {
        // Prefer the published Typst Universe package; fall back to GitHub.
        const published = await latestPreviewVersion();
        if (published) return { source: "preview" as const, version: published, dir: "" };
        return { source: "local" as const, ...(await installLocalPackage()) };
      },
    );
    await cfg().update("packageVersion", result.version, vscode.ConfigurationTarget.Global);
    await cfg().update("packageSource", result.source, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(result.source === "preview"
      ? `@preview/review-comments:${result.version} is on Typst Universe; Typst downloads it automatically on first compile. New imports use @preview.`
      : `Not on Typst Universe (yet or offline), so the GitHub version ${result.version} was installed in ${result.dir}. New imports use @local.`);
  } catch (e: any) {
    vscode.window.showErrorMessage(`Package setup failed: ${e?.message ?? e}`);
  }
}

const isTypst = (doc: vscode.TextDocument): boolean =>
  doc.languageId === "typst" || doc.uri.path.endsWith(".typ");

function sig(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

class Store {
  private entries = new Map<string, Entry>();

  async scan(): Promise<void> {
    this.entries.clear();
    const uris = await vscode.workspace.findFiles("**/*.typ", "**/{node_modules,.git,out}/**", 2000);
    await Promise.all(uris.map((u) => this.load(u)));
    for (const d of vscode.workspace.textDocuments) if (isTypst(d)) this.setText(d.uri, d.getText());
  }

  async load(uri: vscode.Uri): Promise<void> {
    const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    try {
      const text = open ? open.getText() : Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
      this.setText(uri, text);
    } catch {
      this.entries.delete(uri.toString());
    }
  }

  setText(uri: vscode.Uri, text: string): void {
    this.entries.set(uri.toString(), { uri, text, comments: parseComments(text), setup: findSetup(text) });
  }

  remove(uri: vscode.Uri): void { this.entries.delete(uri.toString()); }

  get(uri: vscode.Uri): Entry | undefined { return this.entries.get(uri.toString()); }

  all(): Entry[] {
    return [...this.entries.values()].sort((a, b) => a.uri.fsPath.localeCompare(b.uri.fsPath, undefined, { numeric: true }));
  }
}

// --- helpers -----------------------------------------------------------------------

const cfg = () => vscode.workspace.getConfiguration("reviewComments");

function relName(uri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(uri, false) || path.basename(uri.fsPath);
}

function typstEditor(): vscode.TextEditor | undefined {
  const a = vscode.window.activeTextEditor;
  if (a && isTypst(a.document)) return a;
  return vscode.window.visibleTextEditors.find((e) => isTypst(e.document));
}

async function applyEdits(uri: vscode.Uri, edits: TextEdit[]): Promise<boolean> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const we = new vscode.WorkspaceEdit();
  for (const e of edits) {
    we.replace(uri, new vscode.Range(doc.positionAt(e.start), doc.positionAt(e.end)), e.text);
  }
  const ok = await vscode.workspace.applyEdit(we);
  if (ok && cfg().get<boolean>("saveAfterEdit")) await doc.save();
  return ok;
}

async function getAuthor(): Promise<string | undefined> {
  const existing = cfg().get<string>("author")?.trim();
  if (existing) return existing;
  const name = await vscode.window.showInputBox({
    prompt: "Your name, stored as the author of your comments (saved in the setting reviewComments.author)",
    placeHolder: "Name",
  });
  if (name === undefined) return undefined;
  if (name.trim()) await cfg().update("author", name.trim(), vscode.ConfigurationTarget.Global);
  return name.trim();
}

// --- panel ---------------------------------------------------------------------------

class CommentsView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private timer?: NodeJS.Timeout;
  private lastSetupUri?: string;

  constructor(private store: Store) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    const nonce = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    view.webview.html = getHtml(nonce, view.webview.cspSource);
    view.webview.onDidReceiveMessage((m) => this.onMessage(m).catch((e) => vscode.window.showErrorMessage(String(e?.message ?? e))));
    view.onDidDispose(() => { this.view = undefined; });
  }

  refreshSoon(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.post(), 250);
  }

  /** The file whose `review-comments.with(...)` call the switches control. */
  primarySetup(): Entry | undefined {
    const withSetup = this.store.all().filter((e) => e.setup);
    if (!withSetup.length) return undefined;
    const chosen = withSetup.find((e) => e.uri.toString() === this.lastSetupUri);
    if (chosen) return chosen;
    const active = vscode.window.activeTextEditor?.document.uri.toString();
    return withSetup.find((e) => e.uri.toString() === active) ?? withSetup[0];
  }

  state() {
    const scope = cfg().get<string>("scope") === "file" ? "file" : "workspace";
    let entries = this.store.all();
    if (scope === "file") {
      const ed = typstEditor();
      entries = ed ? entries.filter((e) => e.uri.toString() === ed.document.uri.toString()) : [];
    }
    const primary = this.primarySetup();
    return {
      scope,
      setup: {
        found: !!primary,
        enabled: primary ? setupFlag(primary.setup, "enabled", false) : false,
        showResolved: primary ? setupFlag(primary.setup, "show-resolved", true) : true,
        file: primary ? relName(primary.uri) : "",
      },
      importLine: importLine(pkgVersion(), pkgSource()),
      files: entries
        .filter((e) => e.comments.length)
        .map((e) => ({
          uri: e.uri.toString(),
          name: relName(e.uri),
          comments: e.comments.map((c, index) => ({
            index,
            sig: sig(c.raw),
            author: c.author,
            date: c.date,
            resolved: c.resolved,
            note: c.note,
            body: c.body,
            line: e.text.slice(0, c.start).split("\n").length - 1,
          })),
        })),
    };
  }

  post(): void {
    this.view?.webview.postMessage({ type: "state", state: this.state() });
  }

  /** Re-read the current text and find the comment the webview refers to. */
  private async locate(uri: string, index: number, signature: string): Promise<{ uri: vscode.Uri; c: ParsedComment } | undefined> {
    const u = vscode.Uri.parse(uri);
    await this.store.load(u);
    const c = this.store.get(u)?.comments[index];
    if (!c || sig(c.raw) !== signature) {
      vscode.window.showWarningMessage("The document changed in the meantime. The comment list was refreshed; please try again.");
      this.post();
      return undefined;
    }
    return { uri: u, c };
  }

  async onMessage(m: any): Promise<void> {
    switch (m.type) {
      case "ready":
        this.post();
        break;
      case "scope":
        await cfg().update("scope", m.value, vscode.ConfigurationTarget.Global);
        this.post();
        break;
      case "add":
        await vscode.commands.executeCommand("reviewComments.addComment");
        break;
      case "installPackage":
        await installPackage();
        this.post();
        break;
      case "copyImport":
        await vscode.env.clipboard.writeText(importLine(pkgVersion(), pkgSource()));
        vscode.window.showInformationMessage("Import line copied to the clipboard.");
        break;
      case "insertImport": {
        const ed = typstEditor();
        if (!ed) { vscode.window.showWarningMessage("Open a .typ file first."); break; }
        if (hasImport(ed.document.getText())) { vscode.window.showInformationMessage("This file already imports the review-comments package."); break; }
        const first = ed.document.getText().search(/^#(import|show:)/m);
        const at = ed.document.positionAt(first >= 0 ? first : 0);
        await ed.edit((b) => b.insert(at, importLine(pkgVersion(), pkgSource()) + "\n"));
        break;
      }
      case "reveal": {
        const e = this.store.get(vscode.Uri.parse(m.uri));
        const c = e?.comments[m.index];
        if (!e || !c) return;
        const doc = await vscode.workspace.openTextDocument(e.uri);
        const ed = await vscode.window.showTextDocument(doc, { preserveFocus: true, preview: false });
        const range = new vscode.Range(doc.positionAt(c.start), doc.positionAt(c.end));
        ed.selection = new vscode.Selection(range.start, range.end);
        ed.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        break;
      }
      case "save": {
        const hit = await this.locate(m.uri, m.index, m.sig);
        if (!hit) return;
        if (!isBalanced(m.note)) {
          vscode.window.showErrorMessage("The comment has unbalanced square brackets. Balance them (or escape with \\[ and \\]).");
          this.post();
          return;
        }
        await applyEdits(hit.uri, [editComment(hit.c, { note: m.note, author: m.author.trim() || null, date: m.date.trim() || null })]);
        break;
      }
      case "resolve": {
        const hit = await this.locate(m.uri, m.index, m.sig);
        if (!hit) return;
        await applyEdits(hit.uri, [editComment(hit.c, { resolved: !!m.resolved })]);
        break;
      }
      case "delete": {
        const hit = await this.locate(m.uri, m.index, m.sig);
        if (!hit) return;
        const yes = await vscode.window.showWarningMessage(
          "Delete this comment?" + (hit.c.body !== null ? " The commented text stays in the document." : ""),
          { modal: true }, "Delete",
        );
        if (yes !== "Delete") { this.post(); return; }
        await applyEdits(hit.uri, [deleteComment(hit.c)]);
        break;
      }
      case "toggle":
        await this.toggle(m.key, !!m.value);
        break;
    }
  }

  /** Set `enabled` / `show-resolved` in the review-comments.with(...) call. */
  async toggle(key: "enabled" | "show-resolved", value: boolean): Promise<void> {
    let target = this.primarySetup();
    if (target?.setup) {
      await this.store.load(target.uri);
      const fresh = this.store.get(target.uri);
      if (fresh?.setup) {
        await applyEdits(fresh.uri, [setSetupFlag(fresh.setup, key, value)]);
        this.lastSetupUri = fresh.uri.toString();
        return;
      }
    }
    if (key !== "enabled") {
      vscode.window.showInformationMessage("Turn on 'Show comments' first so the setup line exists.");
      this.post();
      return;
    }
    // No setup call anywhere: let the user choose the main file and add it.
    const candidates = this.store.all().filter((e) => /^#show:/m.test(e.text) || /^#import\b/m.test(e.text));
    const active = typstEditor()?.document.uri.toString();
    candidates.sort((a, b) => Number(b.uri.toString() === active) - Number(a.uri.toString() === active));
    if (!candidates.length) {
      vscode.window.showWarningMessage("No .typ file found to add the review-comments setup to.");
      this.post();
      return;
    }
    const pick = candidates.length === 1 ? candidates[0] : (await vscode.window.showQuickPick(
      candidates.map((e) => ({ label: relName(e.uri), entry: e })),
      { placeHolder: "Which file is your main document? The review-comments setup line is added there." },
    ))?.entry;
    if (!pick) { this.post(); return; }
    await applyEdits(pick.uri, insertSetup(pick.text, value, pkgVersion(), pkgSource()));
    this.lastSetupUri = pick.uri.toString();
  }
}

// --- add comment -----------------------------------------------------------------------

async function addComment(): Promise<void> {
  const editor = typstEditor();
  if (!editor) {
    vscode.window.showInformationMessage("Open a Typst file and select the text to comment on.");
    return;
  }
  const doc = editor.document;
  const sel = editor.selection;
  const selected = sel.isEmpty ? null : doc.getText(sel);
  if (selected !== null && !isBalanced(selected)) {
    vscode.window.showErrorMessage("The selection has unbalanced square brackets, so it cannot be wrapped in a comment. Adjust the selection.");
    return;
  }
  const note = await vscode.window.showInputBox({
    prompt: selected !== null ? "Comment on the selected text" : "Comment (inserted at the cursor)",
    placeHolder: "Your comment",
    validateInput: (v) => (isBalanced(v) ? undefined : "Unbalanced square brackets: balance them or escape with \\[ and \\]"),
  });
  if (!note || !note.trim()) return;
  const author = await getAuthor();
  if (author === undefined) return;

  const date = cfg().get<boolean>("includeDate") ? new Date().toISOString().slice(0, 10) : null;
  const text = buildComment({ author: author || null, date, resolved: false, extraArgs: [], note: note.trim(), body: selected });
  await editor.edit((b) => (sel.isEmpty ? b.insert(sel.active, text) : b.replace(sel, text)));
  if (cfg().get<boolean>("saveAfterEdit")) await doc.save();

  // The package must be imported in this file for #comment to resolve.
  if (!hasImport(doc.getText())) {
        const choice = await vscode.window.showInformationMessage(
      "This file does not import the review-comments package yet, so #comment will not compile.", "Add import",
    );
    if (choice === "Add import") {
      const first = doc.getText().search(/^#(import|show:)/m);
      const at = doc.positionAt(first >= 0 ? first : 0);
      await editor.edit((b) => b.insert(at, importLine(pkgVersion(), pkgSource()) + "\n"));
    }
  }
}

// --- activation ------------------------------------------------------------------------

/** Exposed for the integration tests. */
export interface TestApi { view: CommentsView; store: Store }

export async function activate(context: vscode.ExtensionContext): Promise<TestApi> {
  const store = new Store();
  const view = new CommentsView(store);
  await store.scan();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("reviewComments.view", view, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand("reviewComments.addComment", addComment),
    vscode.commands.registerCommand("reviewComments.focus", () => vscode.commands.executeCommand("reviewComments.view.focus")),
    vscode.commands.registerCommand("reviewComments.installPackage", installPackage),
    vscode.commands.registerCommand("reviewComments.refresh", async () => { await store.scan(); view.post(); }),
    vscode.commands.registerCommand("reviewComments.toggleShow", async () => {
      const p = view.primarySetup();
      await view.toggle("enabled", !(p && setupFlag(p.setup, "enabled", false)));
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (!isTypst(e.document)) return;
      store.setText(e.document.uri, e.document.getText());
      view.refreshSoon();
    }),
    vscode.workspace.onDidOpenTextDocument((d) => {
      if (isTypst(d)) { store.setText(d.uri, d.getText()); view.refreshSoon(); }
    }),
    vscode.window.onDidChangeActiveTextEditor(() => view.refreshSoon()),
    vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration("reviewComments")) view.refreshSoon(); }),
  );

  const watcher = vscode.workspace.createFileSystemWatcher("**/*.typ");
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(async (u) => { await store.load(u); view.refreshSoon(); }),
    watcher.onDidChange(async (u) => { await store.load(u); view.refreshSoon(); }),
    watcher.onDidDelete((u) => { store.remove(u); view.refreshSoon(); }),
  );
  return { view, store };
}

export function deactivate(): void {}
