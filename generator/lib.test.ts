// Run with: node --test generator/lib.test.ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PipelineError,
  afterRunFailure,
  afterStaticFailure,
  canAnswerAppBug,
  checkSpec,
  contradictedValues,
  eslintProblems,
  isInside,
  parseCase,
  parseReply,
  parseSummary,
  passProblems,
  receivedValues,
  render,
  repairFailure,
  repairProblems,
  scan,
  snapshotFromErrorContext,
  startHistory,
  staticProblems,
  trimOutput,
  weakeningProblems,
  type Tools,
} from './lib.ts';

const tc = parseCase(`TC-GEN-03: Overview item total is rounded to cents

Steps:
1. Log in as standard_user with the password secret_sauce.
2. Add "Sauce Labs Fleece Jacket" and "Sauce Labs Onesie" to the cart.
3. Open the cart and click "Checkout".
4. Enter first name "John", last name "Doe", postal code "12345" and click "Continue".

Expected result:
- The overview shows "Item total: $57.98" ($49.99 + $7.99).
- The overview shows "Tax: $4.64".
- The overview shows "Total: $62.62".
`);

const strict = `import { test, expect } from '@playwright/test';

test('TC-GEN-03 Overview item total is rounded to cents', async ({ page }) => {
  await test.step('Log in as standard_user with the password secret_sauce.', async () => {
    await page.goto('/');
    await page.getByTestId('username').fill('standard_user');
    await page.getByTestId('password').fill('secret_sauce');
    await page.getByTestId('login-button').click();
    await expect(page.getByTestId('title')).toHaveText('Products');
  });
  await test.step('Add "Sauce Labs Fleece Jacket" and "Sauce Labs Onesie" to the cart.', async () => {
    await page.getByTestId('add-to-cart-sauce-labs-fleece-jacket').click();
    await page.getByTestId('add-to-cart-sauce-labs-onesie').click();
  });
  await test.step('Open the cart and click "Checkout".', async () => {
    await page.getByTestId('shopping-cart-link').click();
    await expect(page.getByTestId('title')).toHaveText('Your Cart');
    await page.getByTestId('checkout').click();
  });
  await test.step('Enter first name "John", last name "Doe", postal code "12345" and click "Continue".', async () => {
    await page.getByTestId('firstName').fill('John');
    await page.getByTestId('lastName').fill('Doe');
    await page.getByTestId('postalCode').fill('12345');
    await page.getByTestId('continue').click();
    await expect(page.getByTestId('title')).toHaveText('Checkout: Overview');
    await expect(page.getByTestId('subtotal-label')).toHaveText('Item total: $57.98');
    await expect(page.getByTestId('tax-label')).toHaveText('Tax: $4.64');
    await expect(page.getByTestId('total-label')).toHaveText('Total: $62.62');
  });
});
`;

// The failure text as Playwright 1.65 prints it for this defect.
const failure = `    Error: expect(locator).toHaveText(expected) failed

    Locator:  getByTestId('subtotal-label')
    Expected: "Item total: $57.98"
    Received: "Item total: $57.980000000000004"
    Timeout:  7000ms`;

const SUBTOTAL = "    await expect(page.getByTestId('subtotal-label')).toHaveText('Item total: $57.98');\n";
const CART_CHECK = "    await expect(page.getByTestId('title')).toHaveText('Your Cart');\n";

const replaced = (from: string, to: string): string => {
  assert.ok(strict.includes(from), `fixture does not contain ${from}`);
  return strict.replace(from, () => to);
};

describe('parseCase', () => {
  it('reads the ID, title, steps and the quoted expected values', () => {
    assert.equal(tc.id, 'TC-GEN-03');
    assert.equal(tc.title, 'Overview item total is rounded to cents');
    assert.equal(tc.steps.length, 4);
    assert.deepEqual(tc.literals, ['Item total: $57.98', 'Tax: $4.64', 'Total: $62.62']);
  });

  it('reads a case saved with a byte order mark', () => {
    assert.equal(parseCase(`\uFEFFTC-X-1: t\nSteps:\n1. a\nExpected result:\n- "b"`).id, 'TC-X-1');
  });

  it('rejects a case without an ID line or without steps', () => {
    assert.throws(() => parseCase('Steps:\n1. a\nExpected result:\n- b'), PipelineError);
    assert.throws(() => parseCase('TC-X-1: t\nExpected result:\n- "b"'), /no "Steps:"/);
  });

  // The ID names tests/generated/<ID>.spec.ts and generator/examples/<ID>/, and nothing else stops a path.
  it('rejects an ID that is not a plain file name', () => {
    const ids = [
      '../../x',
      'a;b',
      'a b',
      '$(touch PWNED1)',
      'TC-1/../../../x',
      '`touch PWNED2`',
      '..',
      'x\\y',
    ];
    for (const id of ids) {
      assert.throws(
        () => parseCase(`${id}: t\nSteps:\n1. a\nExpected result:\n- "b"`),
        /the first line must be "<CASE-ID>: <title>"/,
        id,
      );
    }
  });

  it('rejects an ID that names a directory the generator already uses', () => {
    for (const id of ['inputs', 'Inputs']) {
      assert.throws(
        () => parseCase(`${id}: t\nSteps:\n1. a\nExpected result:\n- "b"`),
        /cannot be a case ID/,
      );
    }
  });
});

describe('render', () => {
  it('inserts values verbatim, "$" patterns included, and does not re-scan them', () => {
    assert.equal(render('a {{X}} b', { X: '$57.98 $& $1' }), 'a $57.98 $& $1 b');
    assert.equal(render('{{X}}', { X: '{{Y}}' }), '{{Y}}');
  });

  it('fails on a placeholder without a value', () => {
    assert.throws(() => render('{{MISSING}}', {}), PipelineError);
  });
});

describe('parseReply', () => {
  it('takes the single ts block, or the APP_BUG line', () => {
    assert.deepEqual(parseReply('Here:\n```ts\nconst a = 1;\n```\n'), {
      kind: 'code',
      code: 'const a = 1;\n',
    });
    assert.deepEqual(parseReply('APP_BUG: the overview shows $57.980000000000004'), {
      kind: 'app-bug',
      reason: 'the overview shows $57.980000000000004',
    });
    assert.equal(parseReply('`APP_BUG: wrapped in backticks`').kind, 'app-bug');
  });

  it('refuses ambiguous or empty replies', () => {
    assert.equal(parseReply('```ts\na\n```\nAPP_BUG: both').kind, 'invalid');
    assert.equal(parseReply('```ts\na\n```\n```ts\nb\n```').kind, 'invalid');
    assert.equal(parseReply('I could not do it.').kind, 'invalid');
  });
});

describe('scan', () => {
  it('drops comments and tells strings from regex literals and division', () => {
    const s = scan(
      "const a = 'x'; // expect(1)\nconst b = /it's/;\nconst c = a / b; const d = \"q\";\nexpect(2)",
    );
    assert.deepEqual(s.strings, ['x', 'q']);
    assert.equal(s.code.match(/expect\(/g)?.length, 1);
  });
});

describe('staticProblems', () => {
  it('accepts a spec that follows the conventions', () => {
    assert.deepEqual(staticProblems(strict, tc), []);
  });

  it('names each broken convention', () => {
    const cases: Array<[string, RegExp]> = [
      [replaced(CART_CHECK, `${CART_CHECK}    await page.waitForTimeout(1000);\n`), /waitForTimeout/],
      [replaced("test('TC-GEN-03", "test.only('TC-GEN-03"), /\.only/],
      [replaced("await page.goto('/');", "await page.goto('https://www.saucedemo.com/');"), /absolute URL/],
      [replaced("page.getByTestId('checkout')", "page.locator('#checkout')"), /CSS or XPath/],
      [
        replaced('async ({ page }) => {\n', "async ({ page }) => {\n  test.fail(true, 'known');\n"),
        /test\.skip\/fixme\/fail/,
      ],
      [
        replaced(".toHaveText('Tax: $4.64')", '.toHaveText(/Tax: \\$4\\.64/)'),
        /"Tax: \$4\.64" is not in the spec/,
      ],
      [
        replaced('test.step(\'Open the cart and click "Checkout".\'', "test.step('Go to checkout'"),
        /no test\.step\(\) is titled/,
      ],
      // Both keep every expect() and every literal and pass ESLint, yet turn the failed assertion into a pass.
      [
        replaced(SUBTOTAL, `${SUBTOTAL.trimEnd().slice(0, -1)}.then(undefined, () => undefined);\n`),
        /\.then\(\)/,
      ],
      [
        replaced(
          SUBTOTAL,
          `    await Promise.allSettled([${SUBTOTAL.trim().replace('await ', '').slice(0, -1)}]);\n`,
        ),
        /Promise\.allSettled/,
      ],
    ];
    for (const [spec, problem] of cases) {
      const problems = staticProblems(spec, tc);
      assert.ok(
        problems.some((p) => problem.test(p)),
        `expected ${problem} in ${JSON.stringify(problems)}`,
      );
    }
  });
});

describe('checkSpec', () => {
  // Stands in for Prettier and ESLint and records what each of them was given.
  const tools = (format: ReturnType<Tools['format']>, lint: string[] = []) => {
    const calls: { format: string[]; lint: string[] } = { format: [], lint: [] };
    const fake: Tools = {
      format: (code) => {
        calls.format.push(code);
        return format;
      },
      lint: (code) => {
        calls.lint.push(code);
        return lint;
      },
    };
    return { fake, calls };
  };
  const FORMATTED = `${strict}// formatted\n`;

  it('stops at the conventions and does not format or lint such a spec', () => {
    const { fake, calls } = tools({ code: FORMATTED });
    const checked = checkSpec(replaced("test('TC-GEN-03", "test.only('TC-GEN-03"), tc, fake);
    assert.equal(checked.ok, false);
    assert.ok(!checked.ok && checked.gate === 'conventions');
    assert.ok(checked.report.startsWith('The spec was not run because it breaks the conventions:\n- '));
    assert.ok(checked.report.includes('\n- uses .only'), checked.report);
    assert.deepEqual(calls, { format: [], lint: [] });
  });

  it('stops at Prettier when it cannot parse the spec, and keeps its error for the repair round', () => {
    // Coloured, as Prettier prints it whenever FORCE_COLOR is set, even to 0.
    const red = (text: string): string => `\u001b[31m${text}\u001b[39m`;
    const error = `[${red('error')}] tests/generated/TC-GEN-03.spec.ts: SyntaxError: ';' expected. (5:3)\n[error] > 5 | x y\n`;
    const { fake, calls } = tools({ error });
    const checked = checkSpec(strict, tc, fake);
    assert.ok(!checked.ok && checked.gate === 'prettier');
    assert.deepEqual(checked.problems, [
      "Prettier cannot parse the spec: tests/generated/TC-GEN-03.spec.ts: SyntaxError: ';' expected. (5:3)",
    ]);
    assert.ok(checked.report.endsWith("SyntaxError: ';' expected. (5:3)\n> 5 | x y"));
    assert.equal(checked.code, strict);
    assert.deepEqual(calls.lint, []);
  });

  it('treats an ESLint problem as a failed static check: the formatted spec and the lint output go to the repair round', () => {
    const lint = ['5:3 error Promises must be awaited (@typescript-eslint/no-floating-promises)'];
    const { fake, calls } = tools({ code: FORMATTED }, lint);
    const checked = checkSpec(strict, tc, fake);
    assert.deepEqual(calls, { format: [strict], lint: [FORMATTED] });
    assert.ok(!checked.ok && checked.gate === 'eslint');
    assert.equal(checked.code, FORMATTED);
    assert.deepEqual(checked.problems, lint);
    assert.ok(checked.report.includes(`reported:\n- ${lint[0]}`));
  });

  it('passes the formatted spec on when every gate passes', () => {
    const { fake } = tools({ code: FORMATTED });
    assert.deepEqual(checkSpec(strict, tc, fake), { ok: true, code: FORMATTED });
  });
});

describe('eslintProblems', () => {
  const report = (messages: unknown[]): string =>
    JSON.stringify([{ filePath: '/repo/tests/generated/x.spec.ts', messages }]);

  it('lists errors and warnings as line:column, level, message and rule', () => {
    const json = report([
      {
        ruleId: '@typescript-eslint/no-floating-promises',
        severity: 2,
        message: 'Promises must be awaited.',
        line: 5,
        column: 3,
      },
      {
        ruleId: 'playwright/no-wait-for-timeout',
        severity: 1,
        message: 'Unexpected use of page.waitForTimeout().',
        line: 6,
        column: 9,
      },
    ]);
    assert.deepEqual(eslintProblems(json), [
      '5:3 error Promises must be awaited. (@typescript-eslint/no-floating-promises)',
      '6:9 warning Unexpected use of page.waitForTimeout(). (playwright/no-wait-for-timeout)',
    ]);
  });

  it('keeps a parsing error that has no rule, without the machine path', () => {
    const json = report([
      {
        ruleId: null,
        fatal: true,
        severity: 2,
        message: 'Parsing error: /repo/tests/generated/x.spec.ts was not found by the project service.',
      },
    ]);
    assert.deepEqual(eslintProblems(json, '/repo'), [
      'error Parsing error: tests/generated/x.spec.ts was not found by the project service.',
    ]);
  });

  it('returns nothing for a clean report and fails on output that is not a report', () => {
    assert.deepEqual(eslintProblems(report([])), []);
    assert.throws(() => eslintProblems('ESLint found too many warnings (maximum: 0).'), PipelineError);
  });
});

describe('weakeningProblems', () => {
  const rejects = (repair: string, problem: RegExp): void => {
    const problems = weakeningProblems(strict, repair, failure, tc);
    assert.ok(
      problems.some((p) => problem.test(p)),
      `expected ${problem} in ${JSON.stringify(problems)}`,
    );
  };

  it('rejects a repair that deletes an expect()', () => {
    rejects(replaced(CART_CHECK, ''), /has 5 expect\(\) calls where the spec it repairs had 6/);
    rejects(replaced(SUBTOTAL, ''), /expect\(\) calls/);
  });

  it('rejects a repair that comments an expect() out', () => {
    rejects(replaced(SUBTOTAL, `    // ${SUBTOTAL.trimStart()}`), /expect\(\) calls/);
  });

  it('rejects a repair that swaps the expected value for the one the app showed', () => {
    const buggy = replaced("'Item total: $57.98'", "'Item total: $57.980000000000004'");
    rejects(buggy, /drops the expected value "Item total: \$57\.98"/);
    rejects(buggy, /copies the value the application showed/);
  });

  it('rejects a copied value even when the literal is kept somewhere else', () => {
    const sneaky = replaced(
      SUBTOTAL,
      `    const wanted = 'Item total: $57.98';\n${SUBTOTAL.replace('$57.98', () => '$57.980000000000004')}`,
    );
    const problems = weakeningProblems(strict, sneaky, failure, tc);
    assert.deepEqual(problems, [
      'copies the value the application showed ("Item total: $57.980000000000004") into the spec',
    ]);
  });

  it('rejects loosening an exact matcher or negating it', () => {
    rejects(
      replaced(".toHaveText('Item total: $57.98')", ".toContainText('Item total: $57.98')"),
      /exact matchers/,
    );
    rejects(
      replaced(".toHaveText('Item total: $57.98')", ".not.toHaveText('Item total: $57.98')"),
      /negated/,
    );
  });

  it('accepts a repair that only fixes a locator and adds a screen check', () => {
    const repair = replaced(
      "    await page.getByTestId('checkout').click();\n",
      "    await page.getByRole('button', { name: 'Checkout' }).click();\n    await expect(page.getByTestId('title')).toHaveText('Checkout: Your Information');\n",
    );
    assert.deepEqual(weakeningProblems(strict, repair, failure, tc), []);
  });
});

describe('repair history', () => {
  const laundered = replaced(
    SUBTOTAL,
    "    await expect(page.getByTestId('subtotal-label').filter({ hasText: 'Item total: $57.98' })).toHaveText('Item total: $57.980000000000004');\n",
  );
  const unrun = replaced(CART_CHECK, `${CART_CHECK}    await page.waitForTimeout(1000);\n`);
  const staticReport = 'The spec was not run because it breaks the conventions:\n- uses waitForTimeout';
  const ran = afterRunFailure(startHistory(), strict, failure, tc);
  const ranThenStatic = afterStaticFailure(ran, unrun, staticReport);

  it('reads the case values a run contradicted, and only those', () => {
    assert.deepEqual(contradictedValues(failure, tc), [
      { expected: 'Item total: $57.98', received: 'Item total: $57.980000000000004' },
    ]);
    const notFound = failure.replace(/Received: .*/, 'Received: <element(s) not found>');
    assert.deepEqual(contradictedValues(notFound, tc), []);
    const screenCheck = 'Expected: "Checkout: Overview"\nReceived: "Checkout: Your Information"';
    assert.deepEqual(contradictedValues(screenCheck, tc), []);
  });

  it('shows the repair round the run failure unchanged after a run', () => {
    assert.equal(repairFailure(ran), failure.trimEnd());
    assert.ok(canAnswerAppBug(ran));
  });

  it('keeps the last run through a static failure: run, static failure, repair', () => {
    // Measured against the static failure alone, as before, the copied value goes unnoticed.
    assert.deepEqual(weakeningProblems(unrun, laundered, staticReport, tc), []);
    assert.deepEqual(repairProblems(ranThenStatic, laundered, tc), [
      'copies the value the application showed ("Item total: $57.980000000000004") into the spec',
    ]);
    const shown = repairFailure(ranThenStatic);
    assert.ok(shown.startsWith(staticReport), shown);
    assert.ok(shown.includes('Received: "Item total: $57.980000000000004"'), shown);
    assert.ok(canAnswerAppBug(ranThenStatic));
  });

  it('measures a repair against the last spec that ran, not against code that never ran', () => {
    const extra = "    await expect(page.getByTestId('cart_list')).toHaveCount(1);\n";
    const unrunWithExtra = replaced(
      CART_CHECK,
      `${CART_CHECK}${extra}    await page.waitForTimeout(1000);\n`,
    );
    const history = afterStaticFailure(ran, unrunWithExtra, staticReport);
    assert.deepEqual(repairProblems(history, strict, tc), []);
    assert.deepEqual(
      repairProblems(afterStaticFailure(startHistory(), unrunWithExtra, staticReport), strict, tc),
      [
        'has 6 expect() calls where the spec it repairs had 7',
        'has 6 exact matchers (toHaveText, toHaveCount, toHaveURL, ...) where the spec it repairs had 7',
      ],
    );
  });

  it('accepts APP_BUG only after a spec ran', () => {
    assert.equal(canAnswerAppBug(afterStaticFailure(startHistory(), unrun, staticReport)), false);
  });

  it('objects to a repair that passes where a run contradicted the case', () => {
    assert.deepEqual(passProblems(startHistory()), []);
    assert.deepEqual(passProblems(ranThenStatic), [
      'passed, but an earlier run showed "Item total: $57.980000000000004" where the case expects "Item total: $57.98", and the application has not changed since',
    ]);
    // The same contradiction in a second run is reported once.
    assert.equal(passProblems(afterRunFailure(ran, strict, failure, tc)).length, 1);
    const notFound = failure.replace(/Received: .*/, 'Received: <element(s) not found>');
    assert.deepEqual(passProblems(afterRunFailure(startHistory(), strict, notFound, tc)), []);
  });
});

describe('isInside', () => {
  it('tells a path inside a directory from one outside it', () => {
    assert.ok(isInside('/repo', '/repo/generator/examples/inputs/TC-GEN-01.txt'));
    assert.ok(isInside('/repo', '/repo/..x/case.txt'));
    for (const path of ['/repo', '/repo-other/case.txt', '/tmp/case.txt', '/repo/../tmp/case.txt']) {
      assert.equal(isInside('/repo', path), false, path);
    }
  });
});

describe('Playwright output helpers', () => {
  const raw = [
    '  1) [generated] › tests/generated/x.spec.ts:3:1 › x ──────',
    '    Error: expect(locator).toHaveValue(expected) failed',
    '    Expected: "Login wrong"',
    '    Received: "Login"',
    '        at /repo/tests/generated/x.spec.ts:6:52',
    '        at /repo/tests/generated/x.spec.ts:4:3',
    '    attachment #1: screenshot (image/png) ──────',
    '    ../../tmp/out/x/test-failed-1.png',
    '    ──────',
    '    Error Context: ../../tmp/out/x/error-context.md',
    '  1 failed',
  ].join('\n');

  it('drops terminal colour codes', () => {
    assert.equal(trimOutput('\u001b[31m  1 failed\u001b[39m\n', []), '1 failed\n');
  });

  it('trims attachments, extra stack frames and machine paths', () => {
    const out = trimOutput(raw, [['/repo/', '']]);
    assert.ok(out.includes('at tests/generated/x.spec.ts:6:52'));
    assert.ok(!out.includes(':4:3'));
    assert.ok(
      !out.includes('attachment') && !out.includes('test-failed-1.png') && !out.includes('Error Context'),
    );
    assert.ok(!out.includes('─'));
  });

  it('reads the received values and the summary', () => {
    assert.deepEqual(receivedValues(raw), ['Login']);
    assert.deepEqual(parseSummary(raw), { failed: 1 });
    assert.deepEqual(parseSummary('  1 passed (3.1s)\n'), { passed: 1 });
    // --repeat-each=3 --max-failures=1 stops at the first failure.
    assert.deepEqual(parseSummary('  1 failed\n    [generated] › x\n  2 did not run\n'), {
      failed: 1,
      'did not run': 2,
    });
  });

  it('keeps only the ARIA snapshot of an error-context file', () => {
    assert.equal(
      snapshotFromErrorContext('# Instructions\n- x\n```yaml\n- button "Login"\n```\n```ts\ncode\n```'),
      '- button "Login"',
    );
  });
});
