import test from "node:test";
import assert from "node:assert/strict";
import { parseComments, findSetup, setupFlag } from "../parser";
import { buildComment, editComment, deleteComment, applyEdits, isBalanced, insertSetup, withFlag, fieldsOf } from "../edits";

test("parses note + body with author and date", () => {
  const t = 'Hello #comment(author: "Pedro", date: "2026-11-15")[Add cites][the claim] more.';
  const [c] = parseComments(t);
  assert.equal(c.author, "Pedro");
  assert.equal(c.date, "2026-11-15");
  assert.equal(c.note, "Add cites");
  assert.equal(c.body, "the claim");
  assert.equal(c.resolved, false);
  assert.equal(t.slice(c.start, c.end), c.raw);
  assert.equal(t.slice(c.end), " more.");
});

test("anchor-only comment, no args", () => {
  const [c] = parseComments("x #comment[just a note] y");
  assert.equal(c.note, "just a note");
  assert.equal(c.body, null);
  assert.equal(c.author, null);
});

test("resolved flag and extra args", () => {
  const [c] = parseComments('#comment(author: "A", resolved: true, foo: 1)[n][b]');
  assert.equal(c.resolved, true);
  assert.deepEqual(c.extraArgs, ["foo: 1"]);
});

test("nested brackets, escapes, raw and strings", () => {
  const t = '#comment(author: "A, (B) ]")[see [1] and \\] and `]` ok][text with [x] inside]!';
  const [c] = parseComments(t);
  assert.equal(c.author, "A, (B) ]");
  assert.equal(c.note, "see [1] and \\] and `]` ok");
  assert.equal(c.body, "text with [x] inside");
  assert.equal(t.slice(c.end), "!");
});

test("note passed inside the parentheses", () => {
  const [c] = parseComments('#comment(author: "A", [the note])[body]');
  assert.equal(c.note, "the note");
  assert.equal(c.body, "body");
});

test("ignores comments in // comments, block comments, raw and escapes", () => {
  const t = [
    "// #comment[nope]",
    "/* #comment[nope] */",
    "`#comment[nope]`",
    "\\#comment[nope]",
    "https://x.org #comment[yes]",
    "#commentary[nope]",
    "#comment-x[nope]",
  ].join("\n");
  const cs = parseComments(t);
  assert.equal(cs.length, 1);
  assert.equal(cs[0].note, "yes");
});

test("multiple comments and multiline notes", () => {
  const t = "#comment[a][b]\n\n#comment[multi\nline][x]";
  const cs = parseComments(t);
  assert.equal(cs.length, 2);
  assert.equal(cs[1].note, "multi\nline");
});

test("unterminated call is skipped", () => {
  assert.equal(parseComments("#comment[oops").length, 0);
});

test("build round-trips", () => {
  const t = '#comment(author: "Pedro \\"P\\" Alves", date: "2026-11-15", resolved: true)[note][text]';
  const [c] = parseComments(t);
  assert.equal(c.author, 'Pedro "P" Alves');
  assert.equal(buildComment(fieldsOf(c)), t);
});

test("edit, resolve and delete", () => {
  const t = 'A #comment(author: "X")[old][body] B';
  const [c] = parseComments(t);
  assert.equal(applyEdits(t, [editComment(c, { note: "new" })]), 'A #comment(author: "X")[new][body] B');
  assert.equal(applyEdits(t, [editComment(c, { resolved: true })]), 'A #comment(author: "X", resolved: true)[old][body] B');
  assert.equal(applyEdits(t, [deleteComment(c)]), "A body B");
  const [a] = parseComments("A #comment[only] B");
  assert.equal(applyEdits("A #comment[only] B", [deleteComment(a)]), "A  B");
});

test("isBalanced", () => {
  assert.ok(isBalanced("a [b] c"));
  assert.ok(isBalanced("a \\] c"));
  assert.ok(!isBalanced("a ] c"));
  assert.ok(!isBalanced("a [ c"));
});

test("setup flag read and write", () => {
  const t = '#show: review-comments.with(enabled: false, paper: "a4")\n';
  assert.equal(setupFlag(findSetup(t), "enabled", false), false);
  assert.equal(withFlag(t, "enabled", true), '#show: review-comments.with(enabled: true, paper: "a4")\n');
  assert.equal(withFlag(t, "show-resolved", false), '#show: review-comments.with(show-resolved: false, enabled: false, paper: "a4")\n');
  assert.equal(withFlag("#show: review-comments.with()\n", "enabled", true), "#show: review-comments.with(enabled: true)\n");
  assert.equal(withFlag("// #show: review-comments.with(enabled: true)\n", "enabled", false), null);
  assert.equal(withFlag("no setup", "enabled", true), null);
});

test("setup with multiline args and nested calls", () => {
  const t = '#show: review-comments.with(\n  paper: "a4",\n  enabled: false, // note\n  margin-right: 3cm,\n)\n';
  assert.equal(withFlag(t, "enabled", true)!.includes("enabled: true, // note"), true);
});

test("insertSetup adds import and show after the last #show", () => {
  const t = '#import "@preview/x:1": *\n#show: x.with(\n  a: 1,\n)\n\n= Title\n';
  const out = applyEdits(t, insertSetup(t, false, "0.3.0"));
  assert.equal(
    out,
    '#import "@preview/review-comments:0.3.0": *\n#import "@preview/x:1": *\n#show: x.with(\n  a: 1,\n)\n#show: review-comments.with(enabled: false)\n\n= Title\n',
  );
});

test("insertSetup does not duplicate an existing import and handles empty files", () => {
  const t = '#import "@preview/review-comments:0.3.0": *\n= T\n';
  const out = applyEdits(t, insertSetup(t, true, "0.3.0"));
  assert.equal(out.match(/review-comments:0.3.0/g)!.length, 1);
  assert.ok(out.includes("#show: review-comments.with(enabled: true)"));
  assert.equal(applyEdits("", insertSetup("", true, "0.3.0")), '#import "@preview/review-comments:0.3.0": *\n#show: review-comments.with(enabled: true)\n');
});
