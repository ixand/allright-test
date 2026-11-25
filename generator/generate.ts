// Plain-text test case in, runnable Playwright spec out: tests/generated/<case-id>.spec.ts.
// Each run is logged to generator/examples/<case-id>/. See generator/README.md.
import {
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import {
  PipelineError,
  afterRunFailure,
  afterStaticFailure,
  canAnswerAppBug,
  caseWarnings,
  checkSpec,
  eslintProblems,
  isInside,
  parseCase,
  parseReply,
  parseSummary,
  passProblems,
  render,
  repairFailure,
  repairProblems,
  runVerdict,
  snapshotFromErrorContext,
  startHistory,
  trimOutput,
  type Gate,
  type TestCase,
} from './lib.ts';

const GENERATOR_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(GENERATOR_DIR);
const SPEC_DIR = join(ROOT, 'tests', 'generated');
const LOG_ROOT = join(GENERATOR_DIR, 'examples');
const KEEP_PROMPT_MAX_CHARS = 20_000;
const PLAYWRIGHT_TIMEOUT_MS = 180_000;
// The repository's definition of done for any test: three passes in a row, no retries. It lowers the chance
// of accepting an unstable spec and does not remove it: a spec that failed 6 times in 10 has passed three.
const RUNS = 3;
const TOOL_TIMEOUT_MS = 120_000;
const requireFromRoot = createRequire(join(ROOT, 'package.json'));

const EXIT = { PASSED: 0, FAILED: 1, APP_BUG: 2, PIPELINE_ERROR: 3 } as const;
type Verdict = keyof typeof EXIT;

const USAGE = `usage: node generator/generate.ts <test-case.txt>

  GEN_LLM_CMD         required. Shell command that reads the prompt on stdin and prints the reply on stdout
  GEN_MAX_REPAIRS     repair rounds after a failed attempt (default 1)
  GEN_LLM_TIMEOUT_MS  timeout of one model call (default 300000)
  GEN_PW_OUTPUT_DIR   base of the Playwright output dir; each case uses <base>/<case-id> (default <os tmp>/pw-generated)

exit codes: 0 passed, 1 failed, 2 classified APP_BUG, 3 pipeline error`;

interface Attempt {
  n: number;
  kind: 'generate' | 'repair';
  outcome:
    | 'passed'
    | 'failed'
    | 'static-check-failed'
    | 'rejected-weakening'
    | 'app-bug'
    | 'unusable-reply'
    /** GEN_LLM_CMD failed, timed out or printed nothing; `problems` says which. */
    | 'model-error'
    /** Prettier, ESLint or Playwright did not complete; `problems` says which. */
    | 'pipeline-error';
  /** For static-check-failed: the gate that stopped the attempt. */
  gate?: Gate;
  problems?: string[];
  /** sha256 of the formatted spec this attempt ran. The file left in tests/generated/ is result.specSha256. */
  specSha256?: string;
  appBugReason?: string;
  promptChars: number;
  promptSha256: string;
  promptSaved: boolean;
  replyChars: number;
  modelMs: number;
  playwrightMs?: number;
  playwright?: string;
}

interface RunResult {
  passed: boolean;
  summary: string;
  log: string;
  failure: string;
  ms: number;
}

const log = (message: string): void => console.log(`[generate] ${message}`);
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');
const readGeneratorFile = (name: string): string => readFileSync(join(GENERATOR_DIR, name), 'utf8');
const errorCode = (error: Error): string => (error as NodeJS.ErrnoException).code ?? error.name;

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0)
    throw new PipelineError(`${name} must be a non-negative integer, got "${raw}"`);
  return value;
}

/** Stops every process of a group; one that has already exited is not an error. */
function killGroup(pid: number): void {
  if (pid <= 0) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

// spawnSync honours `detached` although @types/node leaves it out of its options: the child becomes the
// leader of a new process group, so a timeout can stop what the child started and not only the child.
type GroupOptions = SpawnSyncOptionsWithStringEncoding & { detached: boolean };

function callModel(prompt: string, timeoutMs: number): string {
  const command = process.env.GEN_LLM_CMD ?? '';
  // An empty working directory keeps a backend that can read files away from the repository.
  const cwd = mkdtempSync(join(tmpdir(), 'gen-llm-'));
  const options: GroupOptions = {
    shell: true,
    detached: true,
    cwd,
    input: prompt,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  };
  try {
    const result = spawnSync(command, options);
    // Only the exit status is reported: the command itself stays out of logs.
    if (result.error) {
      // On a timeout or a full buffer spawnSync kills only the shell; the model would keep running.
      killGroup(result.pid);
      throw new PipelineError(`GEN_LLM_CMD did not complete (${errorCode(result.error)})`);
    }
    if (result.status !== 0) {
      process.stderr.write(result.stderr ?? '');
      throw new PipelineError(`GEN_LLM_CMD exited with ${result.status ?? result.signal}`);
    }
    if (!result.stdout.trim()) throw new PipelineError('GEN_LLM_CMD printed nothing');
    return result.stdout;
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

/** The CLI script of a devDependency, the one `npx <name>` runs, resolved without a shell or a PATH lookup. */
function binOf(name: 'prettier' | 'eslint'): string {
  const manifest = requireFromRoot.resolve(`${name}/package.json`);
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as { bin: string | Record<string, string> };
  return join(dirname(manifest), typeof bin === 'string' ? bin : bin[name]);
}

function runTool(name: 'prettier' | 'eslint', args: string[], input?: string): SpawnSyncReturns<string> {
  const result = spawnSync(process.execPath, [binOf(name), ...args], {
    cwd: ROOT,
    input,
    encoding: 'utf8',
    timeout: TOOL_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw new PipelineError(`${name} did not complete (${errorCode(result.error)})`);
  return result;
}

/** `prettier --write` on the spec, without writing it: the config is resolved for its final path. */
function formatWithPrettier(code: string, specFile: string): { code: string } | { error: string } {
  const result = runTool('prettier', ['--no-color', '--stdin-filepath', relative(ROOT, specFile)], code);
  if (result.status === 0) return { code: result.stdout };
  // FORCE_COLOR=0 in the environment turns Prettier's colours on rather than off, hence --no-color and the strip.
  const stderr = stripVTControlCharacters(result.stderr);
  // Exit code 2 with a SyntaxError is the model's code; any other failure is the pipeline's.
  if (result.status === 2 && /^\[error\] .*SyntaxError/m.test(stderr)) return { error: stderr };
  throw new PipelineError(`Prettier exited with ${result.status ?? result.signal}:\n${stderr.slice(-2000)}`);
}

/**
 * `npx eslint --max-warnings=0 <spec>` on the formatted spec at its final path: the type-checked rules
 * need the file inside the TypeScript project. Whatever was there before is put back afterwards, so a
 * spec that fails the gate never stays in tests/generated/.
 */
function lintWithEslint(code: string, specFile: string): string[] {
  const previous = existsSync(specFile) ? readFileSync(specFile, 'utf8') : undefined;
  writeFileSync(specFile, code);
  try {
    const result = runTool('eslint', ['--max-warnings=0', '--format', 'json', relative(ROOT, specFile)]);
    if (result.status === 0) return [];
    if (result.status !== 1) {
      throw new PipelineError(
        `ESLint exited with ${result.status ?? result.signal}:\n${result.stderr.slice(-2000)}`,
      );
    }
    const problems = eslintProblems(result.stdout, ROOT);
    return problems.length > 0 ? problems : [`ESLint exited with 1: ${result.stderr.trim() || 'no report'}`];
  } finally {
    if (previous === undefined) rmSync(specFile, { force: true });
    else writeFileSync(specFile, previous);
  }
}

function runPlaywright(specFile: string, outputDir: string): RunResult {
  const cli = requireFromRoot.resolve('@playwright/test/cli');
  const started = Date.now();
  // Playwright empties its output dir on start, so each case gets its own outside the repo, and the
  // list reporter keeps the shared html report untouched.
  const args = [
    cli,
    'test',
    relative(ROOT, specFile),
    '--project=generated',
    '--reporter=list',
    `--output=${outputDir}`,
    '--retries=0',
    `--repeat-each=${RUNS}`,
    // The first failure is the one the repair round needs; the remaining runs would only repeat it.
    '--max-failures=1',
    '--workers=1',
  ];
  const options: GroupOptions = {
    detached: true,
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
    timeout: PLAYWRIGHT_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
  };
  const result = spawnSync(process.execPath, args, options);
  const ms = Date.now() - started;
  if (result.error) {
    // On a timeout spawnSync kills only the runner; its workers and browsers would keep running.
    killGroup(result.pid);
    throw new PipelineError(`Playwright did not complete (${errorCode(result.error)})`);
  }
  const raw = `${result.stdout}${result.stderr}`;
  if (result.status !== 0 && result.status !== 1) {
    throw new PipelineError(`Playwright exited with ${result.status ?? result.signal}:\n${raw.slice(-2000)}`);
  }
  const counts = parseSummary(raw);
  const summary =
    Object.entries(counts)
      .map(([name, n]) => `${n} ${name}`)
      .join(', ') || 'no summary line';
  const trimmed = trimOutput(raw, [
    [`${ROOT}/`, ''],
    [outputDir, '<output-dir>'],
    [relative(ROOT, outputDir), '<output-dir>'],
  ]);
  const verdict = runVerdict(result.status, counts, RUNS);
  // No test failed, so this is not a failed spec: it must not start a repair round or allow APP_BUG.
  if (verdict === 'did-not-run') {
    throw new PipelineError(
      `Playwright exited with 1 and no failed test (${summary}):\n${trimmed.trimEnd().slice(-2000)}`,
    );
  }
  const passed = verdict === 'passed';
  const contextFile = /^\s*Error Context:\s*(.+\.md)\s*$/m.exec(raw)?.[1];
  const contextPath = contextFile ? resolve(ROOT, contextFile) : '';
  const snapshot =
    contextPath && existsSync(contextPath) ? snapshotFromErrorContext(readFileSync(contextPath, 'utf8')) : '';
  const failure = snapshot ? `${trimmed}\nARIA snapshot at the failure:\n${snapshot}\n` : trimmed;
  return { passed, summary, log: trimmed, failure, ms };
}

/** The files of one run in its log dir. manual-fixes.md is the reviewer's and survives a re-run. */
const RUN_FILE_RE = /^(attempt-\d+\..+|result\.json|input\.txt)$/;

function resetLogDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) if (RUN_FILE_RE.test(name)) rmSync(join(dir, name));
}

const hasPreviousRun = (logDir: string, specFile: string): boolean =>
  existsSync(specFile) || (existsSync(logDir) && readdirSync(logDir).some((name) => RUN_FILE_RE.test(name)));

function generate(source: string, inputPath: string, tc: TestCase): number {
  const maxRepairs = intFromEnv('GEN_MAX_REPAIRS', 1);
  const modelTimeoutMs = intFromEnv('GEN_LLM_TIMEOUT_MS', 300_000);
  const outputDir = join(process.env.GEN_PW_OUTPUT_DIR || join(tmpdir(), 'pw-generated'), tc.id);
  const templates = {
    generate: readGeneratorFile('prompt.md'),
    repair: readGeneratorFile('repair-prompt.md'),
  };
  const shared = {
    APP_MAP: readGeneratorFile('app-map.md').trim(),
    CONVENTIONS: readGeneratorFile('conventions.md').trim(),
    TEST_CASE: tc.text,
  };
  const logDir = join(LOG_ROOT, tc.id);
  const specFile = join(SPEC_DIR, `${tc.id}.spec.ts`);
  // parseCase admits only plain IDs; this keeps any other ID from writing outside these two directories.
  if (dirname(logDir) !== LOG_ROOT || dirname(specFile) !== SPEC_DIR)
    throw new PipelineError(`the case ID "${tc.id}" is not a plain file name`);

  // The previous run's log and spec, possibly hand-fixed, are cleared only once the model has answered:
  // a run that stops before that, e.g. on a wrong GEN_LLM_CMD, leaves them as they were.
  let started = false;
  const unsaved = new Map<string, string>();
  const writeLog = (name: string, content: string): void => {
    if (started) writeFileSync(join(logDir, name), content);
    else unsaved.set(name, content);
  };
  const start = (): void => {
    if (started) return;
    resetLogDir(logDir);
    // A spec left over from an earlier run must not pass for the output of this one.
    rmSync(specFile, { force: true });
    mkdirSync(SPEC_DIR, { recursive: true });
    // The text read before the reset: the input may be this log's own input.txt.
    writeFileSync(join(logDir, 'input.txt'), source);
    for (const [name, content] of unsaved) writeFileSync(join(logDir, name), content);
    started = true;
  };

  const runStarted = Date.now();
  const attempts: Attempt[] = [];
  let history = startHistory();
  let note = '';
  let verdict: Verdict = 'FAILED';
  let appBugReason: string | undefined;
  let pipelineError: string | undefined;

  try {
    for (let n = 1; n <= maxRepairs + 1; n += 1) {
      const kind = history.previous ? 'repair' : 'generate';
      const prompt = history.previous
        ? render(templates.repair, {
            ...shared,
            PREVIOUS_CODE: history.previous.code.trimEnd(),
            FAILURE: repairFailure(history),
            NOTE: note,
          })
        : render(templates.generate, { ...shared, NOTE: note });
      const attempt: Attempt = {
        n,
        kind,
        // Until the model answers. After that, 'pipeline-error' until the attempt reaches an outcome.
        outcome: 'model-error',
        promptChars: prompt.length,
        promptSha256: sha256(prompt),
        promptSaved: prompt.length <= KEEP_PROMPT_MAX_CHARS,
        replyChars: 0,
        modelMs: 0,
      };
      attempts.push(attempt);
      if (attempt.promptSaved) writeLog(`attempt-${n}.prompt.md`, prompt);
      log(`${tc.id} attempt ${n}/${maxRepairs + 1} (${kind}): calling GEN_LLM_CMD`);
      const modelStarted = Date.now();
      let reply: string;
      try {
        reply = callModel(prompt, modelTimeoutMs);
      } finally {
        attempt.modelMs = Date.now() - modelStarted;
      }
      start();
      attempt.outcome = 'pipeline-error';
      attempt.replyChars = reply.length;
      const parsed = parseReply(reply);
      note = '';

      if (parsed.kind === 'app-bug' && canAnswerAppBug(history)) {
        attempt.outcome = 'app-bug';
        attempt.appBugReason = parsed.reason;
        appBugReason = parsed.reason;
        verdict = 'APP_BUG';
        log(`${tc.id} attempt ${n}: classified as APP_BUG: ${parsed.reason}`);
        break;
      }
      if (parsed.kind !== 'code') {
        const problem =
          parsed.kind === 'app-bug' ? 'APP_BUG answers only a spec that ran and failed' : parsed.problem;
        attempt.outcome = 'unusable-reply';
        attempt.problems = [problem];
        writeLog(`attempt-${n}.reply.txt`, reply);
        note = `\nYour previous reply could not be used: ${problem}.\n`;
        log(`${tc.id} attempt ${n}: unusable reply: ${problem}`);
        continue;
      }

      writeLog(`attempt-${n}.spec.ts`, parsed.code);
      const weakening = repairProblems(history, parsed.code, tc);
      if (weakening.length > 0) {
        // The rejected code is kept in the log only; the spec on disk stays the stricter one.
        attempt.outcome = 'rejected-weakening';
        attempt.problems = weakening;
        note = `\nA previous repair of this spec was rejected because it ${weakening.join('; ')}.\n`;
        log(`${tc.id} attempt ${n}: repair rejected, it weakens the spec:\n  - ${weakening.join('\n  - ')}`);
        continue;
      }
      const checked = checkSpec(parsed.code, tc, {
        format: (code) => formatWithPrettier(code, specFile),
        lint: (code) => lintWithEslint(code, specFile),
      });
      if (!checked.ok) {
        attempt.outcome = 'static-check-failed';
        attempt.gate = checked.gate;
        attempt.problems = checked.problems;
        history = afterStaticFailure(history, checked.code, checked.report);
        log(`${tc.id} attempt ${n}: ${checked.gate} check failed:\n  - ${checked.problems.join('\n  - ')}`);
        continue;
      }

      // attempt-N.spec.ts keeps the reply as it was; tests/generated/ gets the formatted spec that passed.
      writeFileSync(specFile, checked.code);
      log(`${tc.id} attempt ${n}: wrote ${relative(ROOT, specFile)}, running Playwright`);
      let run: RunResult;
      try {
        run = runPlaywright(specFile, outputDir);
      } catch (error) {
        // A spec that Playwright did not run is neither accepted nor judged: tests/generated/ gets the
        // last spec that ran back, or nothing.
        if (history.lastRun) writeFileSync(specFile, history.lastRun.code);
        else rmSync(specFile, { force: true });
        throw error;
      }
      attempt.specSha256 = sha256(checked.code);
      writeLog(`attempt-${n}.log`, run.log);
      attempt.playwrightMs = run.ms;
      attempt.playwright = run.summary;
      if (run.passed) {
        const doubts = passProblems(history);
        if (doubts.length === 0) {
          attempt.outcome = 'passed';
          verdict = 'PASSED';
          log(`${tc.id} attempt ${n}: ${run.summary}`);
          break;
        }
        // Rejected like any weakening repair: tests/generated/ gets the last spec that failed back.
        attempt.outcome = 'rejected-weakening';
        attempt.problems = doubts;
        if (history.lastRun) writeFileSync(specFile, history.lastRun.code);
        note = `\nA previous repair of this spec was rejected because it ${doubts.join('; ')}. If the application contradicts the case, reply with the APP_BUG line.\n`;
        log(
          `${tc.id} attempt ${n}: ${run.summary}, but the repair is rejected:\n  - ${doubts.join('\n  - ')}`,
        );
        continue;
      }
      attempt.outcome = 'failed';
      // The spec that ran, so the line numbers in the failure match the code the repair round sees.
      history = afterRunFailure(history, checked.code, run.failure, tc);
      log(`${tc.id} attempt ${n}: ${run.summary}`);
    }
  } catch (error) {
    if (!(error instanceof PipelineError)) throw error;
    verdict = 'PIPELINE_ERROR';
    pipelineError = error.message;
    const last = attempts.at(-1);
    if (last && (last.outcome === 'model-error' || last.outcome === 'pipeline-error'))
      last.problems = [error.message];
  }

  if (pipelineError) console.error(`[generate] pipeline error: ${pipelineError}`);
  if (!started) {
    if (hasPreviousRun(logDir, specFile)) {
      log(
        `${tc.id}: ${verdict} before the model answered, exit code ${EXIT[verdict]}; the previous run in ${relative(ROOT, logDir)}/ and its spec are left as they were`,
      );
      return EXIT[verdict];
    }
    start();
  }

  const total = (pick: (a: Attempt) => number | undefined): number =>
    attempts.reduce((sum, a) => sum + (pick(a) ?? 0), 0);
  // start() removed the spec of any earlier run, so a file here is the one this run left.
  const specLeft = existsSync(specFile) ? readFileSync(specFile, 'utf8') : undefined;
  const result = {
    caseId: tc.id,
    title: tc.title,
    // A path outside the repository would put the local directory layout into the log; input.txt has the text.
    input: isInside(ROOT, inputPath) ? relative(ROOT, inputPath) : basename(inputPath),
    spec: specLeft === undefined ? null : relative(ROOT, specFile),
    // Not always the spec of the last attempt: a rejected pass puts the last failed spec back.
    specSha256: specLeft === undefined ? null : sha256(specLeft),
    backend: 'GEN_LLM_CMD',
    maxRepairs,
    verdict,
    passed: verdict === 'PASSED',
    exitCode: EXIT[verdict],
    appBugReason: appBugReason ?? null,
    pipelineError: pipelineError ?? null,
    attemptsUsed: attempts.length,
    attempts,
    durationsMs: {
      total: Date.now() - runStarted,
      model: total((a) => a.modelMs),
      playwright: total((a) => a.playwrightMs),
    },
    finishedAt: new Date().toISOString(),
  };
  writeFileSync(join(logDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  log(
    `${tc.id}: ${verdict} after ${attempts.length} attempt(s), exit code ${EXIT[verdict]}; log in ${relative(ROOT, logDir)}/`,
  );
  return EXIT[verdict];
}

function main(argv: string[]): number {
  const input = argv[0];
  if (!input || input === '-h' || input === '--help') {
    console.error(USAGE);
    return input ? 0 : EXIT.PIPELINE_ERROR;
  }
  const inputPath = resolve(input);
  let source: string;
  try {
    source = readFileSync(inputPath, 'utf8');
  } catch (error) {
    // A missing file, a directory, no permission: the code says which, without a stack trace.
    if (!(error instanceof Error) || !('code' in error)) throw error;
    throw new PipelineError(`cannot read the test case "${input}" (${String(error.code)})`);
  }
  const tc = parseCase(source);
  if (!process.env.GEN_LLM_CMD) throw new PipelineError('GEN_LLM_CMD is not set; see generator/README.md');
  for (const warning of caseWarnings(tc)) console.error(`[generate] warning: ${warning}`);
  return generate(source, inputPath, tc);
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (error instanceof PipelineError) {
    console.error(`[generate] pipeline error: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = EXIT.PIPELINE_ERROR;
}
