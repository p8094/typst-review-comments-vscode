// Pure (VS Code independent) parser for `#comment(...)[note][text]` calls of
// the review-comments Typst package, and for its `review-comments.with(...)`
// setup call. Operates on plain strings with absolute offsets.

export interface ParsedComment {
  /** Offset of the '#' and one past the last character of the whole call. */
  start: number;
  end: number;
  author: string | null;
  date: string | null;
  resolved: boolean;
  /** Other named arguments, kept verbatim (`name: value`). */
  extraArgs: string[];
  /** Raw Typst markup of the note and of the highlighted text. */
  note: string;
  body: string | null;
  /** The full original source of the call, used to detect stale edits. */
  raw: string;
}

const isIdent = (c: string | undefined): boolean => c !== undefined && /[A-Za-z0-9_-]/.test(c);

/** Index after the closing quote of the string starting at `i` (a `"`). */
function skipString(t: string, i: number): number {
  let j = i + 1;
  while (j < t.length) {
    if (t[j] === "\\") j += 2;
    else if (t[j] === '"') return j + 1;
    else j++;
  }
  return t.length;
}

/** Index after the raw block starting at `i` (a backtick run). */
function skipRaw(t: string, i: number): number {
  let n = 0;
  while (t[i + n] === "`") n++;
  const close = "`".repeat(n);
  const k = t.indexOf(close, i + n);
  return k < 0 ? i + n : k + n;
}

/** True if a `//` at `i` starts a comment (not the `//` of a URL like `https://`). */
function isLineComment(t: string, i: number): boolean {
  return t[i] === "/" && t[i + 1] === "/" && t[i - 1] !== ":";
}

function skipLineComment(t: string, i: number): number {
  const k = t.indexOf("\n", i);
  return k < 0 ? t.length : k;
}

function skipBlockComment(t: string, i: number): number {
  const k = t.indexOf("*/", i + 2);
  return k < 0 ? t.length : k + 2;
}

/** Index after the `]` matching the `[` at `i`, or -1 if unbalanced. */
export function skipContent(t: string, i: number): number {
  let depth = 0;
  let j = i;
  while (j < t.length) {
    const c = t[j];
    if (c === "\\") j += 2;
    else if (c === "`") j = skipRaw(t, j);
    else if (isLineComment(t, j)) j = skipLineComment(t, j);
    else if (c === "/" && t[j + 1] === "*") j = skipBlockComment(t, j);
    else if (c === "[") { depth++; j++; }
    else if (c === "]") { depth--; j++; if (depth === 0) return j; }
    else j++;
  }
  return -1;
}

/** Index after the bracket matching the opener at `i` in code mode, or -1. */
function skipCode(t: string, i: number): number {
  const open = t[i];
  const close = open === "(" ? ")" : "}";
  let depth = 0;
  let j = i;
  while (j < t.length) {
    const c = t[j];
    if (c === '"') j = skipString(t, j);
    else if (c === "`") j = skipRaw(t, j);
    else if (isLineComment(t, j)) j = skipLineComment(t, j);
    else if (c === "/" && t[j + 1] === "*") j = skipBlockComment(t, j);
    else if (c === "[") {
      const k = skipContent(t, j);
      if (k < 0) return -1;
      j = k;
    } else if (c === open) { depth++; j++; }
    else if (c === close) { depth--; j++; if (depth === 0) return j; }
    else j++;
  }
  return -1;
}

interface Arg { text: string; start: number; end: number }

/** Split the top-level comma separated arguments between `open`+1 and `close`. */
function splitArgs(t: string, open: number, close: number): Arg[] {
  const args: Arg[] = [];
  let segStart = open + 1;
  let j = open + 1;
  const push = (end: number) => {
    const raw = t.slice(segStart, end);
    if (raw.trim() !== "") {
      const lead = raw.length - raw.trimStart().length;
      const trail = raw.length - raw.trimEnd().length;
      args.push({ text: raw.trim(), start: segStart + lead, end: end - trail });
    }
  };
  while (j < close) {
    const c = t[j];
    if (c === '"') j = skipString(t, j);
    else if (c === "`") j = skipRaw(t, j);
    else if (isLineComment(t, j)) j = skipLineComment(t, j);
    else if (c === "/" && t[j + 1] === "*") j = skipBlockComment(t, j);
    else if (c === "[") { const k = skipContent(t, j); j = k < 0 ? close : k; }
    else if (c === "(" || c === "{") { const k = skipCode(t, j); j = k < 0 ? close : k; }
    else if (c === ",") { push(j); j++; segStart = j; }
    else j++;
  }
  push(close);
  return args;
}

function parseNamed(a: Arg): { name: string; value: string; valueStart: number } | null {
  const m = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*/.exec(a.text);
  if (!m) return null;
  return { name: m[1], value: a.text.slice(m[0].length), valueStart: a.start + m[0].length };
}

export function unescapeString(lit: string): string {
  return lit.slice(1, -1).replace(/\\(u\{([0-9a-fA-F]+)\}|.)/gs, (_m, g1: string, hex?: string) => {
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    switch (g1) {
      case "n": return "\n";
      case "t": return "\t";
      case "r": return "\r";
      default: return g1;
    }
  });
}

export function escapeString(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
}

const isStringLiteral = (v: string): boolean => /^"(?:[^"\\]|\\.)*"$/s.test(v);

/** Parse one comment call whose `#` is at `hash`; returns null if it is not a valid call. */
function parseCall(t: string, hash: number): ParsedComment | null {
  let j = hash + "#comment".length;
  const positional: string[] = [];
  const extra: string[] = [];
  let author: string | null = null;
  let date: string | null = null;
  let resolved = false;

  if (t[j] === "(") {
    const close = skipCode(t, j);
    if (close < 0) return null;
    for (const a of splitArgs(t, j, close - 1)) {
      const named = parseNamed(a);
      if (!named) {
        if (a.text.startsWith("[")) positional.push(a.text.slice(1, -1));
        else extra.push(a.text);
        continue;
      }
      if (named.name === "author" && isStringLiteral(named.value)) author = unescapeString(named.value);
      else if (named.name === "date" && isStringLiteral(named.value)) date = unescapeString(named.value);
      else if (named.name === "resolved" && (named.value === "true" || named.value === "false")) resolved = named.value === "true";
      else extra.push(a.text);
    }
    j = close;
  } else if (t[j] !== "[") {
    return null;
  }

  // Trailing content blocks: `[note]` and optionally `[text]`.
  while (t[j] === "[" && positional.length < 2) {
    const k = skipContent(t, j);
    if (k < 0) return null;
    positional.push(t.slice(j + 1, k - 1));
    j = k;
  }
  if (positional.length < 1 || positional.length > 2) return null;

  return {
    start: hash,
    end: j,
    author,
    date,
    resolved,
    extraArgs: extra,
    note: positional[0],
    body: positional.length === 2 ? positional[1] : null,
    raw: t.slice(hash, j),
  };
}

/** Find every top-level `#comment` call, in document order. */
export function parseComments(t: string): ParsedComment[] {
  const out: ParsedComment[] = [];
  let i = 0;
  while (i < t.length) {
    const c = t[i];
    if (c === "\\") i += 2;
    else if (c === "`") i = skipRaw(t, i);
    else if (isLineComment(t, i)) i = skipLineComment(t, i);
    else if (c === "/" && t[i + 1] === "*") i = skipBlockComment(t, i);
    else if (c === "#" && t.startsWith("comment", i + 1) && !isIdent(t[i + 8])) {
      const p = parseCall(t, i);
      if (p) { out.push(p); i = p.end; } else i++;
    } else i++;
  }
  return out;
}

// --- setup call: `#show: review-comments.with(...)` --------------------------

export interface SetupCall {
  /** Offsets of the `(` and `)` of `.with(...)`. */
  open: number;
  close: number;
  args: { name: string | null; value: string; start: number; end: number; valueStart: number }[];
}

/** Find the `review-comments.with(...)` call, if any. */
export function findSetup(t: string): SetupCall | null {
  const re = /review-comments\.with\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const lineStart = t.lastIndexOf("\n", m.index) + 1;
    if (/^\s*\/\//.test(t.slice(lineStart, m.index))) continue; // commented out
    const open = m.index + m[0].length - 1;
    const close = skipCode(t, open);
    if (close < 0) continue;
    const args = splitArgs(t, open, close - 1).map((a) => {
      const n = parseNamed(a);
      return { name: n ? n.name : null, value: n ? n.value : a.text, start: a.start, end: a.end, valueStart: n ? n.valueStart : a.start };
    });
    return { open, close: close - 1, args };
  }
  return null;
}

/** Whether the setup call enables a boolean option (absent -> `dflt`). */
export function setupFlag(setup: SetupCall | null, name: string, dflt: boolean): boolean {
  if (!setup) return dflt;
  const a = setup.args.find((x) => x.name === name);
  if (!a) return dflt;
  return a.value.trim() === "true";
}
