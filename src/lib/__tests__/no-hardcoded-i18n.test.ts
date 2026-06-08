import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import { describe, expect, it } from "vitest";

// i18n hardcoded-string guard.
//
// Goal: catch newly introduced user-visible Korean/Japanese strings that were
// written directly in app/component source instead of going through the
// dictionary in `src/lib/i18n.ts`.
//
// Why CJK only: Hangul, Kana, and Kanji virtually never appear legitimately in
// code identifiers, class names, route segments, DB field names, or log
// strings. A raw CJK literal in JSX/TSX is almost always a missed translation.
// Detecting English literals here would be far too noisy (className strings,
// aria values, technical defaults), so English is intentionally left to code
// review and the dictionary-first convention. This keeps the signal high and
// the false-positive rate near zero.
//
// Scope (intentionally limited): only `src/app` and `src/components`
// (`.ts` / `.tsx`). This is the user-facing UI surface where a hardcoded CJK
// literal is almost certainly a missed translation. `src/lib` is deliberately
// excluded — it holds the dictionary itself (`i18n.ts`, all CJK by design) and
// canonical domain constants (building names), which would be false positives.
// The guard is not a whole-repo enforcement; treat it as a high-signal UI net.
//
// Allowed (not flagged):
//   1. Comments (line, block, and JSX comment forms).
//   2. Complete `LocalizedText` literals — a single line carrying `ko:`, `ja:`,
//      and `en:` keys together (e.g. `{ ko: "..", ja: "..", en: ".." }`).
//      These are fully localized data, not single-language hardcoded copy.
//   3. Explicit escape-hatch directives (see below) for domain data such as
//      canonical building-label constants.
//
// Escape hatches (use sparingly, with a justifying comment). Each directive is
// recognized ONLY when written inside a comment — line (`//`), block (`/* */`),
// or JSX (`{/* */}`). The same text in a string literal or ordinary code does
// NOT suppress scanning.
//   - `i18n-ignore`            -> ignore the single line it appears on.
//   - `i18n-ignore-start` / `i18n-ignore-end` -> ignore the enclosed block.
//   - `i18n-ignore-file`       -> ignore the whole file.
//
// When the guard flags a real string: move the copy into `src/lib/i18n.ts`
// (ko/ja/en together) and read it from the dictionary instead.

const SCAN_ROOTS = ["src/app", "src/components"];

// Hangul syllables, Hiragana, Katakana, and CJK Unified Ideographs (Kanji).
const CJK = /[぀-ヿ一-鿿가-힣]/;

function isLocalizedTextLine(line: string): boolean {
  const hasKo = /["']?ko["']?\s*:/.test(line);
  const hasJa = /["']?ja["']?\s*:/.test(line);
  const hasEn = /["']?en["']?\s*:/.test(line);
  return hasKo && hasJa && hasEn;
}

// Replace block-comment characters with spaces while preserving newlines, so
// line numbers stay accurate. Also covers the inner part of JSX comments.
function blankBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (match) =>
    match.replace(/[^\n]/g, " "),
  );
}

// Return the text content of the trailing line comment on `rawLine`, or null if
// there is no line comment. Leaves `://` intact so URL schemas are not treated
// as comment starts. Uses an index scan so unusual characters in the comment
// body cannot interfere with finding the `//` marker.
function getLineCommentText(rawLine: string): string | null {
  for (let i = 0; i < rawLine.length - 1; i += 1) {
    if (rawLine[i] === "/" && rawLine[i + 1] === "/") {
      if (i > 0 && rawLine[i - 1] === ":") continue; // part of `://`
      return rawLine.slice(i + 2);
    }
  }
  return null;
}

// Return the part of `rawLine` that precedes any trailing line comment.
// Leaves `://` intact. Used to remove the comment portion before CJK scanning.
function stripLineComment(rawLine: string): string {
  for (let i = 0; i < rawLine.length - 1; i += 1) {
    if (rawLine[i] === "/" && rawLine[i + 1] === "/") {
      if (i > 0 && rawLine[i - 1] === ":") continue; // part of `://`
      return rawLine.slice(0, i);
    }
  }
  return rawLine;
}

// Return true if `token` appears inside a comment on this single source line.
//
// Recognized comment forms:
//   - Single-line block comment:   /* ... token ... */  (including {/* */} JSX form)
//   - Trailing line comment:       // ... token ...
//
// The same token in a string literal, template literal, or ordinary code does
// NOT cause this function to return true. Only the text content of comments is
// inspected. Note: multi-line block comments (/* on one line, */ on another)
// are not recognized here — place directives on a single self-contained line.
function lineHasDirective(rawLine: string, token: string): boolean {
  // Single-line block comments, e.g. `/* token */` or `{/* token */}`.
  // The regex matches /* ... */ pairs that open and close on the same rawLine.
  const blockMatches = rawLine.match(/\/\*[\s\S]*?\*\//g) ?? [];
  if (blockMatches.some((c) => c.includes(token))) return true;

  // Trailing line comment: text after `//` (excluding `://`).
  const lineText = getLineCommentText(rawLine);
  if (lineText !== null && lineText.includes(token)) return true;

  return false;
}

// Return true if `i18n-ignore-file` appears inside any comment anywhere in
// `source`. Handles both multi-line block comments and line comments.
function sourceHasFileDirective(source: string): boolean {
  const token = "i18n-ignore-file";

  // Block comments (may span multiple lines).
  const blockMatches = source.match(/\/\*[\s\S]*?\*\//g) ?? [];
  if (blockMatches.some((c) => c.includes(token))) return true;

  // Line comments — scan every line.
  for (const line of source.split("\n")) {
    const lineText = getLineCommentText(line);
    if (lineText !== null && lineText.includes(token)) return true;
  }

  return false;
}

type SourceViolation = { line: number; text: string };
type Violation = SourceViolation & { file: string };

// Pure scanner over a source string. Returns 1-based line violations.
//
// Two parallel views of the source are used so directives and CJK content are
// each read from the right place:
//   - `rawLines` drives DIRECTIVE detection (via lineHasDirective / sourceHasFileDirective)
//     and provides the violation text. Directives are checked against actual
//     comment content so they cannot be triggered by string literals or code.
//   - `blankedLines` (block comments replaced with spaces, newlines preserved
//     so indices stay 1:1 with rawLines) drives CJK CONTENT detection, so CJK
//     that only appears inside a comment never triggers a violation.
function scanSource(source: string): SourceViolation[] {
  if (sourceHasFileDirective(source)) return [];

  const rawLines = source.split("\n");
  const blankedLines = blankBlockComments(source).split("\n");
  const violations: SourceViolation[] = [];
  let ignoring = false;

  rawLines.forEach((rawLine, idx) => {
    if (lineHasDirective(rawLine, "i18n-ignore-start")) {
      ignoring = true;
      return;
    }
    if (lineHasDirective(rawLine, "i18n-ignore-end")) {
      ignoring = false;
      return;
    }
    if (ignoring) return;
    if (lineHasDirective(rawLine, "i18n-ignore")) return;

    const line = stripLineComment(blankedLines[idx]);
    if (!CJK.test(line)) return;
    if (isLocalizedTextLine(line)) return;

    violations.push({ line: idx + 1, text: rawLine.trim() });
  });

  return violations;
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

function scanFile(absPath: string, repoRoot: string): Violation[] {
  const raw = readFileSync(absPath, "utf-8");
  const file = relative(repoRoot, absPath).replace(/\\/g, "/");
  return scanSource(raw).map((v) => ({ ...v, file }));
}

describe("i18n hardcoded-string guard", () => {
  it("has no untracked Korean/Japanese literals in app/component source", () => {
    const repoRoot = resolve(process.cwd());
    const violations: Violation[] = [];

    for (const root of SCAN_ROOTS) {
      const abs = resolve(repoRoot, root);
      for (const file of listSourceFiles(abs)) {
        violations.push(...scanFile(file, repoRoot));
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line}  →  ${v.text}`)
        .join("\n");
      throw new Error(
        `Found ${violations.length} hardcoded CJK string(s) in app/component source.\n` +
          `Move the copy into src/lib/i18n.ts (ko/ja/en) and read it from the dictionary,\n` +
          `or add an i18n-ignore directive with justification for legitimate domain data.\n\n` +
          report,
      );
    }

    expect(violations).toHaveLength(0);
  });
});

describe("i18n guard scanner (directive handling)", () => {
  // ── basic CJK detection ──────────────────────────────────────────────────

  it("flags a bare CJK literal", () => {
    const v = scanSource(`const label = "안녕하세요";`);
    expect(v).toHaveLength(1);
    expect(v[0].line).toBe(1);
  });

  it("ignores CJK inside a line comment", () => {
    expect(scanSource(`const x = 1; // 한국어 주석`)).toHaveLength(0);
  });

  it("ignores CJK inside a block comment", () => {
    expect(scanSource(`/*\n  한국어 블록 주석\n*/\nconst x = 1;`)).toHaveLength(0);
  });

  it("does not flag a complete LocalizedText literal", () => {
    expect(
      scanSource(`const t = { ko: "안녕", ja: "こんにちは", en: "Hello" };`),
    ).toHaveLength(0);
  });

  it("reports accurate 1-based line numbers", () => {
    const src = ["const a = 1;", "const b = 2;", 'const label = "환영합니다";'].join("\n");
    const v = scanSource(src);
    expect(v).toHaveLength(1);
    expect(v[0].line).toBe(3);
  });

  // ── single-line i18n-ignore directive ────────────────────────────────────

  it("honors i18n-ignore in a line comment", () => {
    expect(
      scanSource(`const label = "안녕"; // i18n-ignore: dynamic domain value`),
    ).toHaveLength(0);
  });

  it("honors i18n-ignore in a block comment", () => {
    expect(
      scanSource(`const label = "안녕"; /* i18n-ignore: domain value */`),
    ).toHaveLength(0);
  });

  it("honors i18n-ignore in a JSX comment", () => {
    expect(
      scanSource(`const label = "안녕"; {/* i18n-ignore: domain value */}`),
    ).toHaveLength(0);
  });

  // ── i18n-ignore-start / i18n-ignore-end ──────────────────────────────────

  it("honors i18n-ignore-start/end written as line comments", () => {
    const src = [
      "// i18n-ignore-start: canonical domain keys",
      'const BUILDINGS = ["아라키초A", "가부키초"];',
      "// i18n-ignore-end",
    ].join("\n");
    expect(scanSource(src)).toHaveLength(0);
  });

  it("honors i18n-ignore-start/end written as block comments", () => {
    const src = [
      "/* i18n-ignore-start: canonical domain keys */",
      'const BUILDINGS = ["아라키초A", "가부키초"];',
      "/* i18n-ignore-end */",
    ].join("\n");
    expect(scanSource(src)).toHaveLength(0);
  });

  it("honors i18n-ignore-start/end written as JSX comments", () => {
    const src = [
      "{/* i18n-ignore-start: canonical domain keys */}",
      'const BUILDINGS = ["아라키초A", "가부키초"];',
      "{/* i18n-ignore-end */}",
    ].join("\n");
    expect(scanSource(src)).toHaveLength(0);
  });

  // ── i18n-ignore-file ─────────────────────────────────────────────────────

  it("honors i18n-ignore-file in a line comment", () => {
    expect(
      scanSource(`// i18n-ignore-file\nconst label = "안녕";`),
    ).toHaveLength(0);
  });

  it("honors i18n-ignore-file in a block comment", () => {
    expect(
      scanSource(`/* i18n-ignore-file */\nconst label = "안녕";`),
    ).toHaveLength(0);
  });

  it("honors i18n-ignore-file in a multiline block comment", () => {
    expect(
      scanSource(`/*\n * i18n-ignore-file\n */\nconst label = "안녕";`),
    ).toHaveLength(0);
  });

  // ── directives in non-comment contexts must NOT suppress scanning ─────────

  it("does not suppress a line when i18n-ignore appears only in a string literal", () => {
    // Token is in a string value, not a comment — scanning must NOT be suppressed.
    // CJK on the same line must still be flagged.
    const src = `const label = "안녕"; const t = "i18n-ignore";`;
    expect(scanSource(src)).toHaveLength(1);
  });

  it("does not enable block-ignore mode when i18n-ignore-start appears only in a string literal", () => {
    // Token in a string on line 0 must not set ignoring=true.
    // The CJK on line 1 must still be flagged.
    const src = [
      'const token = "i18n-ignore-start";',
      'const label = "안녕";',
    ].join("\n");
    expect(scanSource(src)).toHaveLength(1);
  });

  it("does not suppress the whole file when i18n-ignore-file appears only in a string literal", () => {
    const src = `const t = "i18n-ignore-file";\nconst label = "안녕";`;
    expect(scanSource(src)).toHaveLength(1);
  });

  it("does not suppress scanning when directive-like text appears as a code token", () => {
    // An object key that spells out a directive token must not suppress the CJK on the same line.
    const src = `const cfg = { "i18n-ignore": true }; const label = "안녕";`;
    expect(scanSource(src)).toHaveLength(1);
  });
});
