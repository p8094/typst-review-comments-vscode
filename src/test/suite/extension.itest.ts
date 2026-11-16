import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { execFileSync } from "child_process";
import type { TestApi } from "../../extension";

const fixture = process.env.RC_FIXTURE as string;
const ch1 = vscode.Uri.file(path.join(fixture, "chapters/ch1.typ"));
const main = vscode.Uri.file(path.join(fixture, "main.typ"));
let api: TestApi;

const text = async (u: vscode.Uri) => (await vscode.workspace.openTextDocument(u)).getText();
async function saveAll() {
  for (const d of vscode.workspace.textDocuments) if (d.isDirty) assert.ok(await d.save(), "save failed: " + d.uri.fsPath);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Current comments of ch1 as the panel sees them. */
function ch1Comments() {
  const f = api.view.state().files.find((x: any) => x.uri === ch1.toString());
  return f ? f.comments : [];
}
async function send(m: any) { await api.view.onMessage(m); await sleep(150); }
const ref = (i: number) => ({ uri: ch1.toString(), index: i, sig: ch1Comments()[i].sig });

function compileWidth(): number {
  // Save everything, compile main.typ with the Typst CLI and return the PDF page width in pt.
  const out = path.join(fixture, "out.pdf");
  execFileSync("typst", ["compile", path.join(fixture, "main.typ"), out, "--root", fixture, "--package-cache-path", process.env.RC_PKG_CACHE as string], { stdio: "pipe" });
  const info = execFileSync("pdfinfo", [out]).toString();
  return parseFloat(/Page size:\s+([\d.]+)/.exec(info)![1]);
}

suite("Typst Review Comments", () => {
  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension("martijnkuipers.typst-review-comments")!;
    api = await ext.activate();
    await sleep(500);
    await vscode.workspace.getConfiguration("reviewComments").update("author", "Tester", vscode.ConfigurationTarget.Global);
  });

  test("parses the comments of the workspace", () => {
    const cs = ch1Comments();
    assert.equal(cs.length, 3);
    assert.deepEqual(cs.map((c: any) => c.resolved), [false, true, false]);
    assert.equal(cs[0].author, "Pedro");
    assert.equal(cs[0].body, "the organisation of data");
    assert.equal(cs[2].body, null);
    assert.equal(api.view.state().setup.found, true);
    assert.equal(api.view.state().setup.enabled, false);
  });

  test("click on a comment selects it in the editor", async () => {
    await send({ type: "reveal", uri: ch1.toString(), index: 0 });
    const ed = vscode.window.activeTextEditor!;
    assert.equal(ed.document.uri.toString(), ch1.toString());
    assert.ok(ed.document.getText(ed.selection).startsWith("#comment(author: \"Pedro\""));
  });

  test("edit a comment", async () => {
    await send({ type: "save", ...ref(0), note: "Please cite [1] here.", author: "Pedro Alves", date: "2026-11-16" });
    const t = await text(ch1);
    assert.ok(t.includes('#comment(author: "Pedro Alves", date: "2026-11-16")[Please cite [1] here.][the organisation of data]'), t);
  });

  test("unbalanced note is rejected, document unchanged", async () => {
    const before = await text(ch1);
    const shown: string[] = [];
    const orig = vscode.window.showErrorMessage;
    (vscode.window as any).showErrorMessage = async (m: string) => { shown.push(m); };
    await send({ type: "save", ...ref(0), note: "oops ]", author: "", date: "" });
    (vscode.window as any).showErrorMessage = orig;
    assert.equal(await text(ch1), before);
    assert.equal(shown.length, 1);
  });

  test("stale comment (document changed) is not edited", async () => {
    const before = await text(ch1);
    const warned: string[] = [];
    const orig = vscode.window.showWarningMessage;
    (vscode.window as any).showWarningMessage = async (m: string) => { warned.push(m); };
    await send({ type: "save", uri: ch1.toString(), index: 0, sig: "bogus", note: "x", author: "", date: "" });
    (vscode.window as any).showWarningMessage = orig;
    assert.equal(await text(ch1), before);
    assert.equal(warned.length, 1);
  });

  test("mark resolved and reopen", async () => {
    await send({ type: "resolve", ...ref(0), resolved: true });
    assert.ok((await text(ch1)).includes('date: "2026-11-16", resolved: true)[Please cite'));
    assert.equal(ch1Comments()[0].resolved, true);
    await send({ type: "resolve", ...ref(0), resolved: false });
    assert.ok(!(await text(ch1)).includes("resolved: true)[Please"));
    assert.equal(ch1Comments()[0].resolved, false);
  });

  test("add a comment from a selection", async () => {
    const doc = await vscode.workspace.openTextDocument(ch1);
    const ed = await vscode.window.showTextDocument(doc);
    const start = doc.positionAt(doc.getText().indexOf("hospitals"));
    ed.selection = new vscode.Selection(start, start.translate(0, "hospitals".length));
    const orig = vscode.window.showInputBox;
    (vscode.window as any).showInputBox = async () => "Which hospitals?";
    await vscode.commands.executeCommand("reviewComments.addComment");
    (vscode.window as any).showInputBox = orig;
    await sleep(200);
    const t = await text(ch1);
    const today = new Date().toISOString().slice(0, 10);
    assert.ok(t.includes(`#comment(author: "Tester", date: "${today}")[Which hospitals?][hospitals]`), t);
    assert.equal(ch1Comments().length, 4);
  });

  test("add an anchor-only comment without selection", async () => {
    const doc = await vscode.workspace.openTextDocument(ch1);
    const ed = await vscode.window.showTextDocument(doc);
    const pos = doc.positionAt(doc.getText().indexOf("= Intro") + "= Intro".length);
    ed.selection = new vscode.Selection(pos, pos);
    const orig = vscode.window.showInputBox;
    (vscode.window as any).showInputBox = async () => "Rename the title";
    await vscode.commands.executeCommand("reviewComments.addComment");
    (vscode.window as any).showInputBox = orig;
    await sleep(200);
    assert.ok((await text(ch1)).includes("= Intro#comment(author: \"Tester\""));
    assert.equal(ch1Comments().length, 5);
  });

  test("delete keeps the highlighted text", async () => {
    const idx = ch1Comments().findIndex((c: any) => c.note === "Fixed already.");
    const orig = vscode.window.showWarningMessage;
    (vscode.window as any).showWarningMessage = async () => "Delete";
    await send({ type: "delete", ...ref(idx) });
    (vscode.window as any).showWarningMessage = orig;
    const t = await text(ch1);
    assert.ok(!t.includes("Fixed already."));
    assert.ok(t.includes("A resolved one: this part and"));
    assert.equal(ch1Comments().length, 4);
  });

  test("cancelled delete does nothing", async () => {
    const before = await text(ch1);
    const orig = vscode.window.showWarningMessage;
    (vscode.window as any).showWarningMessage = async () => undefined;
    await send({ type: "delete", ...ref(0) });
    (vscode.window as any).showWarningMessage = orig;
    assert.equal(await text(ch1), before);
  });

  test("toggle show/hide changes the setup line and the compiled PDF", async () => {
    await saveAll();
    const hiddenWidth = compileWidth();
    assert.ok(Math.abs(hiddenWidth - 595.28) < 1, "hidden: A4 width, got " + hiddenWidth);

    await send({ type: "toggle", key: "enabled", value: true });
    assert.ok((await text(main)).includes("review-comments.with(enabled: true)"));
    assert.equal(api.view.state().setup.enabled, true);
    await saveAll();
    const shownWidth = compileWidth();
    assert.ok(shownWidth > hiddenWidth + 100, "shown: widened page, got " + shownWidth);

    await send({ type: "toggle", key: "show-resolved", value: false });
    assert.ok((await text(main)).includes("review-comments.with(show-resolved: false, enabled: true)"));
    await send({ type: "toggle", key: "enabled", value: false });
    assert.ok((await text(main)).includes("enabled: false"));
    await saveAll();
    assert.ok(Math.abs(compileWidth() - hiddenWidth) < 1);
  });

  test("toggle command flips the switch", async () => {
    await vscode.commands.executeCommand("reviewComments.toggleShow");
    await sleep(200);
    assert.ok((await text(main)).includes("enabled: true"));
    await vscode.commands.executeCommand("reviewComments.toggleShow");
    await sleep(200);
    assert.ok((await text(main)).includes("enabled: false"));
  });

  test("setup is added when missing", async () => {
    const fresh = vscode.Uri.file(path.join(fixture, "solo.typ"));
    fs.writeFileSync(fresh.fsPath, '#import "@preview/foo:1.0.0": *\n#show: foo.with()\n\nText\n');
    const doc = await vscode.workspace.openTextDocument(fresh);
    // Hide the other setup files so the extension finds none.
    const s = (api.store as any).entries as Map<string, any>;
    const saved = [...s.entries()].filter(([k]) => k !== fresh.toString());
    for (const [k] of saved) s.delete(k);
    (api.store as any).setText(fresh, doc.getText());
    (vscode.window as any).showQuickPick = async (items: any[]) => items[0];
    await send({ type: "toggle", key: "enabled", value: true });
    const t = await text(fresh);
    assert.ok(t.includes('#import "@preview/review-comments:0.3.0": *'), t);
    assert.ok(t.includes("#show: foo.with()\n#show: review-comments.with(enabled: true)"), t);
  });
});
