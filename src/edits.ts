import { ParsedComment, SetupCall, escapeString, findSetup, skipContent } from "./parser";

export interface TextEdit { start: number; end: number; text: string }

export interface CommentFields {
  author: string | null;
  date: string | null;
  resolved: boolean;
  extraArgs: string[];
  note: string;
  body: string | null;
}

/** Whether `s` can be placed inside `[...]` (its brackets are balanced). */
export function isBalanced(s: string): boolean {
  const wrapped = "[" + s + "]";
  return skipContent(wrapped, 0) === wrapped.length;
}

/** Canonical source for a comment call. */
export function buildComment(f: CommentFields): string {
  const args: string[] = [];
  if (f.author) args.push(`author: ${escapeString(f.author)}`);
  if (f.date) args.push(`date: ${escapeString(f.date)}`);
  if (f.resolved) args.push("resolved: true");
  args.push(...f.extraArgs);
  const head = args.length ? `#comment(${args.join(", ")})` : "#comment";
  return head + `[${f.note}]` + (f.body !== null ? `[${f.body}]` : "");
}

export function fieldsOf(c: ParsedComment): CommentFields {
  return { author: c.author, date: c.date, resolved: c.resolved, extraArgs: c.extraArgs, note: c.note, body: c.body };
}

/** Replace a comment call with a modified version of it. */
export function editComment(c: ParsedComment, change: Partial<CommentFields>): TextEdit {
  return { start: c.start, end: c.end, text: buildComment({ ...fieldsOf(c), ...change }) };
}

/** Remove a comment call, keeping the highlighted text if there is any. */
export function deleteComment(c: ParsedComment): TextEdit {
  return { start: c.start, end: c.end, text: c.body ?? "" };
}

export function applyEdits(text: string, edits: TextEdit[]): string {
  let out = text;
  // Last offset first so earlier offsets stay valid; edits at the same offset
  // end up in the order they were listed (as VS Code does).
  const order = edits.map((e, i) => ({ e, i })).sort((a, b) => b.e.start - a.e.start || b.i - a.i);
  for (const { e } of order) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
}

// --- setup call ---------------------------------------------------------------

/** Edit (or add) a named boolean option of the `review-comments.with(...)` call. */
export function setSetupFlag(setup: SetupCall, name: string, value: boolean): TextEdit {
  const lit = value ? "true" : "false";
  const a = setup.args.find((x) => x.name === name);
  if (a) return { start: a.valueStart, end: a.end, text: lit };
  const hasArgs = setup.args.length > 0;
  return { start: setup.open + 1, end: setup.open + 1, text: `${name}: ${lit}${hasArgs ? ", " : ""}` };
}

export type PackageSource = "preview" | "local";

export function importLine(version: string, source: PackageSource = "preview"): string {
  return `#import "@${source}/review-comments:${version}": *`;
}

export function hasImport(text: string): boolean {
  return /#import\s+"@(preview|local)\/review-comments:[^"]*"/.test(text) || /#import\s+"[^"]*review-comments[^"]*"/.test(text);
}

/**
 * Edits that add the import (if missing) and a `#show: review-comments.with(...)`
 * line. The show line goes after the last top-level `#show:` line of the file
 * (so it comes after the template's page setup), else after the imports.
 */
export function insertSetup(text: string, enabled: boolean, version: string, source: PackageSource = "preview"): TextEdit[] {
  const lines = text.split("\n");
  const offsets: number[] = [];
  let o = 0;
  for (const l of lines) { offsets.push(o); o += l.length + 1; }

  const lastIdx = (re: RegExp): number => {
    let idx = -1;
    lines.forEach((l, i) => { if (re.test(l)) idx = i; });
    return idx;
  };
  // A multi-line `#show: x.with(...)`: continue until its parentheses balance.
  const endOfStatement = (i: number): number => {
    let depth = 0;
    for (let k = i; k < lines.length; k++) {
      for (const ch of lines[k]) { if (ch === "(") depth++; else if (ch === ")") depth--; }
      if (depth <= 0) return k;
    }
    return i;
  };

  const showIdx = lastIdx(/^#show:/);
  const importIdx = lastIdx(/^#import\b/);
  const anchorLine = showIdx >= 0 ? endOfStatement(showIdx) : importIdx;
  const pos = anchorLine >= 0 ? offsets[anchorLine] + lines[anchorLine].length : 0;

  const showLine = `#show: review-comments.with(enabled: ${enabled})`;
  const edits: TextEdit[] = [];
  if (!hasImport(text)) {
    // Import goes right before the first #import/#show (or at the top).
    const first = lines.findIndex((l) => /^#(import|show:)/.test(l));
    const at = first >= 0 ? offsets[first] : 0;
    edits.push({ start: at, end: at, text: importLine(version, source) + "\n" });
  }
  const prefix = anchorLine >= 0 ? "\n" : "";
  const suffix = anchorLine >= 0 ? "" : "\n";
  edits.push({ start: pos, end: pos, text: prefix + showLine + suffix });
  return edits;
}

/** Convenience used by tests: apply a flag change to a whole text. */
export function withFlag(text: string, name: string, value: boolean): string | null {
  const setup = findSetup(text);
  if (!setup) return null;
  return applyEdits(text, [setSetupFlag(setup, name, value)]);
}
