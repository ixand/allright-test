// The pure half of the pipeline: parse the case, render prompts, read replies, check specs.
// No I/O here, so lib.test.ts can exercise every guard without a model or a browser.
import { isAbsolute, relative, sep } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

export class PipelineError extends Error {
  name = 'PipelineError';
}

export interface TestCase {
  id: string;
  title: string;
  preconditions: string[];
  steps: string[];
  expected: string[];
  /** The double-quoted values of the expected result. Each must reach the spec verbatim. */
  literals: string[];
  /** The case as written; the model gets it unchanged. */
  text: string;
}

type Section = 'preconditions' | 'steps' | 'expected';

// The ID becomes a file name and a directory name, so it is limited to letters, digits and inner hyphens.
const HEADER_RE = /^([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)\s*:\s*(\S.*)$/;
// generator/examples/<ID>/ is the log of a case; these names under generator/examples/ are taken.
const RESERVED_IDS = new Set(['inputs']);
const SECTION_RE = /^(preconditions?|steps|expected(?:\s+results?)?)\s*:\s*(.*)$/i;
const ITEM_RE = /^(?:\d+[.)]|[-*•])\s+(.*)$/;
const QUOTED_RE = /"([^"\n]+)"|“([^”\n]+)”/g;
// Quotes that do not make a literal: «…», „…“ and '…' (not an apostrophe inside a word).
const OTHER_QUOTES_RE = /«[^»\n]+»|„[^“”\n]+[“”]|(?<![\w'])'[^'\n]+'(?![\w'])/g;
const indentOf = (line: string): number => line.length - line.trimStart().length;

const unique = <T>(items: T[]): T[] => [...new Set(items)];
const count = (text: string, re: RegExp): number => text.match(re)?.length ?? 0;

export function parseCase(source: string): TestCase {
  const text = source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  const [first = '', ...rest] = text.split('\n');
  const header = HEADER_RE.exec(first.trim());
  if (!header) {
    throw new PipelineError(
      'the first line must be "<CASE-ID>: <title>", e.g. "TC-GEN-01: Add a product to the cart"',
    );
  }
  if (RESERVED_IDS.has(header[1].toLowerCase()))
    throw new PipelineError(`"${header[1]}" cannot be a case ID: generator/examples/${header[1]}/ is taken`);
  const sections: Record<Section, string[]> = { preconditions: [], steps: [], expected: [] };
  let current: Section | undefined;
  // The indent of the last step item, and whether the lines under it belong to its own "Expected:".
  let stepIndent = 0;
  let underStep = false;
  let firstExpectedItem = true;
  for (const raw of rest) {
    const line = raw.trim();
    if (!line) continue;
    const indent = indentOf(raw);
    const section = SECTION_RE.exec(line);
    if (underStep && indent <= stepIndent) underStep = false;
    if (underStep && !section) {
      const nested = ITEM_RE.exec(line);
      if (nested || sections.expected.length === 0) sections.expected.push(nested ? nested[1] : line);
      else sections.expected[sections.expected.length - 1] += ` ${line}`;
      continue;
    }
    if (section) {
      const name = section[1].toLowerCase();
      const next = name.startsWith('pre') ? 'preconditions' : name === 'steps' ? 'steps' : 'expected';
      // "Expected:" indented under a step is the expected result of that step: the step list goes on after it.
      if (next === 'expected' && current === 'steps' && sections.steps.length > 0 && indent > stepIndent) {
        underStep = true;
        if (section[2]) sections.expected.push(section[2]);
        continue;
      }
      current = next;
      if (section[2]) sections[current].push(section[2]);
      continue;
    }
    if (!current) {
      throw new PipelineError(
        `"${line}" is outside a section: start one with "Preconditions:", "Steps:" or "Expected result:"`,
      );
    }
    const list = sections[current];
    const item = ITEM_RE.exec(line);
    if (item && current === 'steps') stepIndent = indent;
    if (item && current === 'expected') {
      // Without the indent, an "Expected:" between two steps reads as the final section, and every
      // later step would silently become an expected result.
      const number = /^(\d+)[.)]/.exec(line)?.[1];
      if (firstExpectedItem && number !== undefined && Number(number) > 1 && sections.steps.length > 0) {
        throw new PipelineError(
          `"${line}" continues a numbered list after an "Expected:" line. Indent the expected result of a step under that step, or put every expected result in one final "Expected result:" section`,
        );
      }
      firstExpectedItem = false;
    }
    if (item) list.push(item[1]);
    else if (list.length > 0) list[list.length - 1] += ` ${line}`;
    else list.push(line);
  }
  if (sections.steps.length === 0) throw new PipelineError('the case has no "Steps:" items');
  if (sections.expected.length === 0) throw new PipelineError('the case has no "Expected result:" items');
  const literals = unique(
    [...sections.expected.join('\n').matchAll(QUOTED_RE)].map((m) => m[1] ?? m[2] ?? ''),
  );
  return { id: header[1], title: header[2].trim(), ...sections, literals, text };
}

/**
 * What a case leaves unguarded. Only double-quoted values become literals; a case that quotes with
 * '…' or «…» parses, but nothing then ties its expected values to the spec.
 */
export function caseWarnings(tc: TestCase): string[] {
  const warnings: string[] = [];
  const expected = tc.expected.join('\n');
  const other = unique(expected.replace(QUOTED_RE, '').match(OTHER_QUOTES_RE) ?? []);
  if (other.length > 0) {
    warnings.push(
      `the expected result quotes ${other.join(', ')} without double quotes: only "…" marks a value that must reach the spec verbatim`,
    );
  }
  if (tc.literals.length === 0) {
    warnings.push(
      'the expected result has no double-quoted value, so no expected value is checked in the spec or guarded in a repair',
    );
  }
  return warnings;
}

/**
 * Fills {{NAME}} placeholders in one pass. A replacer function is used on purpose: with a plain
 * replacement string, the "$5" in a price like "$57.98" would be read as a capture-group reference.
 */
export function render(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_match, key: string) => {
    if (!Object.hasOwn(values, key)) throw new PipelineError(`the template needs a value for {{${key}}}`);
    return values[key];
  });
}

export type Reply =
  { kind: 'code'; code: string } | { kind: 'app-bug'; reason: string } | { kind: 'invalid'; problem: string };

export function parseReply(raw: string): Reply {
  const reply = raw.replace(/\r\n?/g, '\n');
  // A fence opens and closes on a line of its own, so ``` inside a template literal of the spec does
  // not cut the block short. A line of the spec that is nothing but ``` still would.
  const fenced = [...reply.matchAll(/^[ \t]*```([\w-]*)[^\n]*\n([\s\S]*?)^[ \t]*```[ \t]*$/gm)];
  const typed = fenced.filter((m) => /^(ts|typescript)$/i.test(m[1]));
  const blocks = typed.length > 0 ? typed : fenced.filter((m) => m[1] === '');
  const bug = /^[\s`*]*APP_BUG:\s*(.+?)[\s`*]*$/m.exec(reply);
  if (blocks.length > 1)
    return { kind: 'invalid', problem: `the reply has ${blocks.length} code blocks instead of one` };
  if (blocks.length === 1 && bug)
    return { kind: 'invalid', problem: 'the reply has both a code block and an APP_BUG line' };
  if (blocks.length === 1) return { kind: 'code', code: `${blocks[0][2].trim()}\n` };
  if (bug) return { kind: 'app-bug', reason: bug[1] };
  return { kind: 'invalid', problem: 'the reply has no ```ts code block' };
}

export interface Scan {
  /** The source without comments, with every string, template and regex literal emptied. */
  code: string;
  /** The source without comments, literals kept. */
  stripped: string;
  /** The contents of every string and template literal, unescaped. */
  strings: string[];
}

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r' };
// A "/" right after one of these starts a regex literal; anywhere else it is a division.
const REGEX_AFTER = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';']);

/**
 * A small lexer, just enough to tell code from comments and literals. Counting `expect(` on raw
 * text would let a commented-out assertion count as present, and searching raw text for a value
 * would find "$57.98" inside "$57.980000000000004".
 */
export function scan(source: string): Scan {
  let code = '';
  let stripped = '';
  const strings: string[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      code += ' ';
      stripped += ' ';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      let value = '';
      while (j < source.length && source[j] !== c && (c === '`' || source[j] !== '\n')) {
        if (source[j] === '\\') {
          const escaped = source[j + 1] ?? '';
          value += ESCAPES[escaped] ?? escaped;
          j += 2;
        } else {
          value += source[j];
          j += 1;
        }
      }
      strings.push(value);
      code += c + c;
      stripped += source.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '/' && REGEX_AFTER.has(code.trimEnd().slice(-1))) {
      let j = i + 1;
      let inClass = false;
      while (j < source.length && source[j] !== '\n') {
        const d = source[j];
        if (d === '\\') j += 1;
        else if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) break;
        j += 1;
      }
      j += 1;
      while (j < source.length && /[a-z]/i.test(source[j])) j += 1;
      code += '/r/';
      stripped += source.slice(i, j);
      i = j;
      continue;
    }
    code += c;
    stripped += c;
    i += 1;
  }
  return { code, stripped, strings };
}

const EXPECT_CALL = /\bexpect(?:\s*\.\s*(?:soft|poll))?\s*\(/g;
const EXACT_MATCHERS = new Set([
  'toHaveText',
  'toHaveValue',
  'toHaveValues',
  'toHaveCount',
  'toHaveURL',
  'toHaveTitle',
  'toHaveAttribute',
  'toBe',
  'toEqual',
  'toStrictEqual',
]);
const MATCHER_AFTER = /^(?:\s*\.\s*not)?\s*\.\s*([A-Za-z]\w*)\s*\(/;
const CONSTANT_DECLARATION = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=(?!=|>)([^;]*)/g;
const NUMBER_TOKEN = /(?<![\w$])\d[\w.]*/g;
const CONSTANT_WORD = /\b(?:true|false|null|undefined|NaN|Infinity|void|typeof)\b/g;
const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

/** Whether an expression of scanned code (literals emptied) names nothing but literals and `constants`. */
function isConstant(expression: string, constants: Set<string>): boolean {
  const rest = expression
    .replace(NUMBER_TOKEN, '')
    .replace(CONSTANT_WORD, '')
    .replace(IDENTIFIER, (name) => (constants.has(name) ? '' : name));
  return !/[A-Za-z_$]/.test(rest);
}

interface ExpectCall {
  /** expect(1), expect('a'), expect(one) with `const one = 1`: an assertion that cannot see the page. */
  constant: boolean;
  /** The matcher is one that compares the whole value. */
  exact: boolean;
}

/** Every expect() of scanned code, with what it is called on and the matcher chained to it. */
function expectCalls(code: string): ExpectCall[] {
  const constants = new Set<string>();
  for (const [, name, value] of code.matchAll(CONSTANT_DECLARATION)) {
    if (isConstant(value, constants)) constants.add(name);
  }
  const calls: ExpectCall[] = [];
  for (const match of code.matchAll(EXPECT_CALL)) {
    const open = match.index + match[0].length;
    let depth = 1;
    let end = open;
    while (end < code.length && depth > 0) {
      if ('([{'.includes(code[end])) depth += 1;
      else if (')]}'.includes(code[end])) depth -= 1;
      end += 1;
    }
    // The first argument only: a second one is the message of the assertion.
    let argument = code.slice(open, end - 1);
    let nesting = 0;
    for (let i = 0; i < argument.length; i += 1) {
      if ('([{'.includes(argument[i])) nesting += 1;
      else if (')]}'.includes(argument[i])) nesting -= 1;
      else if (argument[i] === ',' && nesting === 0) argument = argument.slice(0, i);
    }
    const matcher = MATCHER_AFTER.exec(code.slice(end))?.[1] ?? '';
    calls.push({ constant: isConstant(argument, constants), exact: EXACT_MATCHERS.has(matcher) });
  }
  return calls;
}

const NEGATION = /\.\s*not\s*\./g;
const TEST_CALL = /\btest\s*\(/g;
const STEP_CALL = /\btest\s*\.\s*step\s*\(/g;
const IMPORT_SOURCE = /\bimport\b[^;]*?\bfrom\s*(['"])([^'"]+)\1|\bimport\s*(['"])([^'"]+)\3/g;
const TEST_TITLE = /\btest\s*\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/;

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\bwaitForTimeout\b/, 'uses waitForTimeout'],
  [/\bsetTimeout\b/, 'uses setTimeout'],
  [
    /\b(?:waitForLoadState|waitForNavigation|waitForURL)\b/,
    'waits with waitForLoadState/waitForNavigation/waitForURL instead of a web-first assertion',
  ],
  [/\.\s*only\s*\(/, 'uses .only'],
  [/\btest\s*\.\s*(?:skip|fixme|fail)\b/, 'skips or marks the test with test.skip/fixme/fail'],
  // The same three through TestInfo: test.info().fail(), or testInfo.skip() on the second argument of test().
  [
    /\btest\s*\.\s*info\b|\btestInfo\b|(?<!\btest\s*)\.\s*(?:skip|fixme|fail)\s*\(/,
    'skips or marks the test through TestInfo (test.info(), testInfo, .skip()/.fixme()/.fail())',
  ],
  // await expect(expect(locator).toHaveText('…')).rejects.toThrow() passes exactly when the inner assertion fails.
  [
    /\.\s*(?:rejects|resolves)\b|\.\s*toThrow(?:Error)?\s*\(/,
    'expects a failure with .rejects/.resolves/.toThrow(), which turns a failed assertion into a pass',
  ],
  // page['locator'](…) and locator['first']() are the forbidden calls below under a name these checks cannot read.
  [
    /[\w$)\]]\s*(?:\?\.\s*)?\[\s*(?:''|""|``)\s*\]/,
    "reads a member by a string key (page['locator']); call methods by name",
  ],
  [/\btry\s*\{|\.\s*catch\s*\(|\bcatch\s*[({]/, 'swallows errors with try/catch or .catch()'],
  // An assertion is a promise, so a rejection handler or a settle-all turns its failure into a pass.
  // ESLint's no-floating-promises message itself suggests ".then with a rejection handler".
  [
    /\.\s*then\s*\(|\bPromise\s*\.\s*(?:allSettled|any|race)\b/,
    'handles a promise with .then() or Promise.allSettled/any/race, which can swallow a failed assertion',
  ],
  [
    /\.\s*(?:locator|\$\$?|\$eval|\$\$eval)\s*\(/,
    'uses CSS or XPath locators (.locator(), $()) instead of getByTestId/getByRole/getByText',
  ],
  [/\.\s*(?:nth|first|last)\s*\(/, 'picks elements by position with nth()/first()/last()'],
  [/\bpage\s*\.\s*pause\s*\(/, 'calls page.pause()'],
  [/\brequire\s*\(/, 'uses require()'],
  [/\bimport\s*\(/, 'uses a dynamic import()'],
  [/\bconsole\s*\./, 'writes to the console'],
];

/** "1. Log in." and "Log in" are the same step title. */
const normalizeStep = (text: string): string =>
  text
    .replace(/[“”‘’']/g, '"')
    .replace(/^\s*(?:step\s*)?\d+\s*[.):]\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '')
    .trim()
    .toLowerCase();

/** Convention checks that run on every attempt before the spec is executed. */
export function staticProblems(source: string, tc: TestCase): string[] {
  const { code, stripped, strings } = scan(source);
  const problems: string[] = [];
  const imports = [...stripped.matchAll(IMPORT_SOURCE)].map((m) => m[2] ?? m[4] ?? '');
  if (!imports.includes('@playwright/test'))
    problems.push("does not import { test, expect } from '@playwright/test'");
  for (const name of imports.filter((m) => m !== '@playwright/test'))
    problems.push(`imports '${name}'; only '@playwright/test' is allowed`);
  const tests = count(code, TEST_CALL);
  if (tests !== 1) problems.push(`has ${tests} test() calls; exactly one is required`);
  const title = TEST_TITLE.exec(stripped)?.[2];
  if (tests === 1 && !title?.startsWith(tc.id))
    problems.push(`the test title does not start with the case ID ${tc.id}`);
  const expects = expectCalls(code);
  if (expects.length === 0) problems.push('has no expect() assertion');
  if (expects.some((call) => call.constant))
    problems.push(
      'asserts on a constant, e.g. expect(1) or expect(true): such an assertion never sees the page',
    );
  for (const [re, problem] of FORBIDDEN) if (re.test(code)) problems.push(problem);
  if (strings.includes('networkidle')) problems.push("waits for 'networkidle'");
  if (/\.\s*goto\s*\(\s*(['"`])https?:/.test(stripped))
    problems.push("calls page.goto() with an absolute URL; use a relative path such as '/'");
  const steps = count(code, STEP_CALL);
  if (steps < tc.steps.length)
    problems.push(`has ${steps} test.step() calls for ${tc.steps.length} case steps`);
  const titles = new Set(strings.map(normalizeStep));
  for (const step of tc.steps) {
    if (!titles.has(normalizeStep(step)))
      problems.push(`no test.step() is titled with the case step "${step}"`);
  }
  for (const literal of tc.literals) {
    if (!strings.includes(literal))
      problems.push(`the expected value "${literal}" is not in the spec as a whole string literal`);
  }
  return problems;
}

export type Gate = 'conventions' | 'prettier' | 'eslint';

const bullets = (items: string[]): string => items.map((item) => `- ${item}`).join('\n');

/** The repository's own tools, behind an interface so that checkSpec can be tested without them. */
export interface Tools {
  /** The spec as the repository's Prettier formats it, or Prettier's error output if it cannot parse it. */
  format(code: string): { code: string } | { error: string };
  /** The problems ESLint reports for the spec; empty when it passes with zero warnings. */
  lint(code: string): string[];
}

export type Checked =
  | { ok: true; code: string }
  | {
      ok: false;
      gate: Gate;
      /** The code the failing gate saw: as written by the model, or formatted for ESLint. */
      code: string;
      problems: string[];
      /** What the repair round is told. */
      report: string;
    };

/**
 * The gates an attempt passes before it runs: the generator's conventions on the code as the model
 * wrote it, then the gates every hand-written spec passes, Prettier and ESLint with zero warnings.
 * The first failing gate stops the attempt, so a spec that fails any of them is never run.
 */
export function checkSpec(raw: string, tc: TestCase, tools: Tools): Checked {
  const conventions = staticProblems(raw, tc);
  if (conventions.length > 0) {
    const report = `The spec was not run because it breaks the conventions:\n${bullets(conventions)}`;
    return { ok: false, gate: 'conventions', code: raw, problems: conventions, report };
  }
  const formatted = tools.format(raw);
  if ('error' in formatted) {
    const error = stripVTControlCharacters(formatted.error)
      .split('\n')
      .map((line) => line.replace(/^\[error\] ?/, '').trimEnd())
      .filter((line) => line.trim() !== '')
      .join('\n');
    const problems = [`Prettier cannot parse the spec: ${error.split('\n')[0] || 'no error output'}`];
    return {
      ok: false,
      gate: 'prettier',
      code: raw,
      problems,
      report: `The spec was not run because Prettier cannot parse it:\n${error}`,
    };
  }
  const lint = tools.lint(formatted.code);
  if (lint.length > 0) {
    // ESLint sees the formatted file, so the repair round gets that version: the line numbers match it.
    const report = `The spec was not run because ESLint, run on the spec above with zero warnings allowed, reported:\n${bullets(lint)}`;
    return { ok: false, gate: 'eslint', code: formatted.code, problems: lint, report };
  }
  return { ok: true, code: formatted.code };
}

interface EslintMessage {
  ruleId: string | null;
  severity: number;
  message: string;
  line?: number;
  column?: number;
}

/**
 * The messages of an `eslint --format json` report, one line each, e.g.
 * "5:3 error Promises must be awaited, … (@typescript-eslint/no-floating-promises)". Warnings are
 * kept: with --max-warnings=0 a warning fails the gate too. `root` is cut from absolute paths.
 */
export function eslintProblems(json: string, root = ''): string[] {
  let results: Array<{ messages?: EslintMessage[] }>;
  try {
    results = JSON.parse(json) as Array<{ messages?: EslintMessage[] }>;
  } catch {
    throw new PipelineError('ESLint did not print a JSON report');
  }
  return results.flatMap((result) =>
    (result.messages ?? []).map((m) => {
      const where = m.line === undefined ? '' : `${m.line}:${m.column ?? 0} `;
      const message = root ? m.message.split(`${root}/`).join('') : m.message;
      return `${where}${m.severity === 2 ? 'error' : 'warning'} ${message}${m.ruleId ? ` (${m.ruleId})` : ''}`;
    }),
  );
}

/** The values the application actually showed, as Playwright prints them on an assertion failure. */
export function receivedValues(failure: string): string[] {
  return unique([...failure.matchAll(/^\s*Received(?: string)?\s*:\s*"(.+)"\s*$/gm)].map((m) => m[1]));
}

interface Mismatch {
  expected: string;
  received: string;
  /** A string, printed in double quotes; otherwise a number, as toHaveCount and toBe print it. */
  quoted: boolean;
}

const FAILURE_VALUE = /^(?:"(.+)"|(-?\d+(?:\.\d+)?))$/;
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The "Expected: … / Received: …" pairs of a failure whose two sides are both strings or both numbers
 * and differ. "<element(s) not found>" is neither, so a wrong locator gives no pair. A failure printed
 * as a multi-line diff (arrays, objects) gives none either.
 */
function mismatches(failure: string): Mismatch[] {
  const found: Mismatch[] = [];
  let expected: { value: string; quoted: boolean } | undefined;
  for (const line of failure.split('\n')) {
    const e = /^\s*Expected(?: string)?\s*:\s*(.+?)\s*$/.exec(line);
    if (e) {
      const value = FAILURE_VALUE.exec(e[1]);
      expected = value ? { value: value[1] ?? value[2], quoted: value[1] !== undefined } : undefined;
      continue;
    }
    const r = /^\s*Received(?: string)?\s*:\s*(.+?)\s*$/.exec(line);
    const value = r ? FAILURE_VALUE.exec(r[1]) : null;
    if (value && expected && expected.quoted === (value[1] !== undefined)) {
      const received = value[1] ?? value[2];
      const same = expected.quoted
        ? received === expected.value
        : Number(received) === Number(expected.value);
      if (!same) found.push({ expected: expected.value, received, quoted: expected.quoted });
    }
    if (r || /^\s*Error:/.test(line)) expected = undefined;
  }
  return found;
}

/** How many matchers of scanned code take the number as their only or first argument: toHaveCount(2). */
const matcherArguments = (code: string, number: string): number =>
  count(code, new RegExp(`\\.\\s*to[A-Z]\\w*\\s*\\(\\s*${escapeRegExp(number)}\\s*[,)]`, 'g'));

/**
 * Compares a repair with the spec it repairs. A repair that makes a failing test pass by asserting
 * less is worse than no repair: it turns a found defect into a green check.
 */
export function weakeningProblems(previous: string, next: string, failure: string, tc: TestCase): string[] {
  const before = scan(previous);
  const after = scan(next);
  const problems: string[] = [];
  // An expect() on a constant is not counted: expect(1).toBe(1) in place of a failed toHaveCount(1)
  // would otherwise keep both counts.
  const was = expectCalls(before.code).filter((call) => !call.constant);
  const now = expectCalls(after.code).filter((call) => !call.constant);
  const notFewer = (pick: (call: ExpectCall) => boolean, what: string): void => {
    const [a, b] = [now.filter(pick).length, was.filter(pick).length];
    if (a < b) problems.push(`has ${a} ${what} where the spec it repairs had ${b}`);
  };
  notFewer(() => true, 'expect() calls');
  // toHaveText('Item total: $57.98') -> toContainText('Item total: $57.98') keeps the count of
  // expect() and the literal, yet passes on the buggy "Item total: $57.980000000000004".
  notFewer((call) => call.exact, 'exact matchers (toHaveText, toHaveCount, toHaveURL, ...)');
  if (count(after.code, NEGATION) > count(before.code, NEGATION))
    problems.push('adds a negated (.not) assertion');
  for (const literal of tc.literals) {
    if (!after.strings.includes(literal)) problems.push(`drops the expected value "${literal}" of the case`);
  }
  for (const value of receivedValues(failure)) {
    if (tc.literals.includes(value) || before.strings.some((s) => s.includes(value))) continue;
    if (after.strings.some((s) => s.includes(value)))
      problems.push(`copies the value the application showed ("${value}") into the spec`);
  }
  // toHaveCount(1) -> toHaveCount(2) after "Expected: 1, Received: 2": the same copy, without quotes.
  const numbers = unique(
    mismatches(failure)
      .filter((m) => !m.quoted)
      .map((m) => m.received),
  );
  for (const number of numbers) {
    if (matcherArguments(after.code, number) > matcherArguments(before.code, number))
      problems.push(`copies the number the application showed (${number}) into a matcher`);
  }
  return problems;
}

export interface Contradiction {
  /** A double-quoted value of the case, or a number its expected result names. */
  expected: string;
  /** What the application showed instead. */
  received: string;
}

/** Whether the text names the number as a number of its own, not as a part of "12345" or "$57.98". */
const namesNumber = (text: string, number: string): boolean =>
  new RegExp(`(?<![\\w.])${escapeRegExp(number)}(?![\\w]|[.,]\\d)`).test(text);

/**
 * The case values a run contradicted: an assertion expected a double-quoted value of the case, or a
 * number the expected result names ("the cart lists 1 item"), and the application showed another.
 * "<element(s) not found>" is neither a string nor a number, so a wrong locator is not a contradiction.
 */
export function contradictedValues(failure: string, tc: TestCase): Contradiction[] {
  const expectedText = tc.expected.join('\n');
  return mismatches(failure)
    .filter((m) => (m.quoted ? tc.literals.includes(m.expected) : namesNumber(expectedText, m.expected)))
    .map(({ expected, received }) => ({ expected, received }));
}

/** What the repair rounds of one case work from. */
export interface History {
  /** The code of the last attempt that reached the gates, and why it failed. The repair round sees both. */
  previous?: { code: string; failure: string };
  /** The last spec that ran and failed. A static failure leaves it alone: it says nothing about the application. */
  lastRun?: { code: string; failure: string };
  /** Every case value a run has contradicted so far. */
  contradicted: Contradiction[];
}

export const startHistory = (): History => ({ contradicted: [] });

export function afterStaticFailure(history: History, code: string, report: string): History {
  return { ...history, previous: { code, failure: report } };
}

export function afterRunFailure(history: History, code: string, failure: string, tc: TestCase): History {
  const run = { code, failure };
  const key = (c: Contradiction): string => JSON.stringify([c.expected, c.received]);
  const seen = new Set(history.contradicted.map(key));
  const added = contradictedValues(failure, tc).filter((c) => !seen.has(key(c)));
  return { previous: run, lastRun: run, contradicted: [...history.contradicted, ...added] };
}

/** APP_BUG is a claim about the application, so it needs a spec that ran. */
export const canAnswerAppBug = (history: History): boolean => history.lastRun !== undefined;

/** The {{FAILURE}} of the repair prompt: why the code above failed and, if it never ran, how the last run failed. */
export function repairFailure(history: History): string {
  const { previous, lastRun } = history;
  if (!previous) throw new PipelineError('a repair round needs a failed attempt');
  if (!lastRun || lastRun === previous) return previous.failure.trimEnd();
  return `${previous.failure.trimEnd()}\n\nAn earlier version of the spec did run, and failed. Its line numbers refer to that version, not to the code above:\n${lastRun.failure.trimEnd()}`;
}

/**
 * The weakening guard for a repair, measured against the last spec that ran: a static failure in
 * between must not reset what the guard knows, such as the values the application showed.
 */
export function repairProblems(history: History, next: string, tc: TestCase): string[] {
  const reference = history.lastRun ?? history.previous;
  return reference ? weakeningProblems(reference.code, next, history.lastRun?.failure ?? '', tc) : [];
}

/**
 * Objections to a repair that passed. The application does not change between attempts, so once a run
 * has shown a value that contradicts the case, a pass means the assertion of that value no longer
 * checks what the earlier run checked: it was weakened (a swallowed rejection, a filtered locator), or
 * rightly moved because the earlier spec asserted in the wrong place. The guard cannot tell these apart,
 * so such a pass is not accepted without a human.
 */
export function passProblems(history: History): string[] {
  return history.contradicted.map(
    ({ expected, received }) =>
      `passed, but an earlier run showed "${received}" where the case expects "${expected}", and the application has not changed since`,
  );
}

/** Whether the absolute `path` lies strictly inside the absolute `dir`. */
export function isInside(dir: string, path: string): boolean {
  const rel = relative(dir, path);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

export type RunVerdict = 'passed' | 'failed' | 'did-not-run';

/**
 * What one Playwright run says about the spec. Exit status 0 alone is not a pass: a skipped test also
 * exits 0. Exit status 1 alone is not a failed test: a config error or "No tests found" exits 1 too,
 * and such a run says nothing about the application.
 */
export function runVerdict(status: number, counts: Record<string, number>, runs: number): RunVerdict {
  if (status === 0) return counts.passed === runs && Object.keys(counts).length === 1 ? 'passed' : 'failed';
  return (counts.failed ?? 0) + (counts.flaky ?? 0) > 0 ? 'failed' : 'did-not-run';
}

/** Counts from the summary lines of the list reporter, e.g. { passed: 1 } or { failed: 1 }. */
export function parseSummary(output: string): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const m of output.matchAll(/^\s*(\d+) (passed|failed|flaky|skipped|did not run|interrupted)\b/gm)) {
    summary[m[2]] = Number(m[1]);
  }
  return summary;
}

/**
 * Keeps what a reader needs from the list reporter: the error, the call log, the code frame and the
 * first stack frame. Attachment blocks and machine-specific paths are dropped.
 */
export function trimOutput(raw: string, replacements: Array<[string, string]>, maxLines = 120): string {
  let text = stripVTControlCharacters(raw);
  for (const [from, to] of replacements) if (from) text = text.split(from).join(to);
  const kept: string[] = [];
  let inAttachment = false;
  let frames = 0;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\s*─+\s*$/, '').trimEnd();
    if (/^\s*attachment #\d+:/.test(rawLine)) {
      inAttachment = true;
      continue;
    }
    if (inAttachment) {
      if (/^\s*─+\s*$/.test(rawLine)) inAttachment = false;
      continue;
    }
    if (/^\s*Error Context:/.test(line)) continue;
    if (/^\s+at /.test(line)) {
      frames += 1;
      if (frames > 1) continue;
    } else {
      frames = 0;
    }
    if (line === '' && (kept.length === 0 || kept[kept.length - 1] === '')) continue;
    kept.push(line);
  }
  const lines =
    kept.length > maxLines
      ? [...kept.slice(0, maxLines), `[${kept.length - maxLines} more lines trimmed]`]
      : kept;
  return `${lines.join('\n').trim()}\n`;
}

/** The ARIA snapshot blocks of a Playwright error-context.md file, capped. */
export function snapshotFromErrorContext(markdown: string, maxLines = 80): string {
  const blocks = [...markdown.matchAll(/```yaml\n([\s\S]*?)```/g)].map((m) => m[1].trimEnd());
  const lines = blocks
    .join('\n')
    .split('\n')
    .filter((l) => l.trim() !== '');
  if (lines.length === 0) return '';
  return lines.length > maxLines
    ? [...lines.slice(0, maxLines), `[${lines.length - maxLines} more lines trimmed]`].join('\n')
    : lines.join('\n');
}
