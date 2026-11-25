import { stripVTControlCharacters } from 'node:util';
import { test } from '@playwright/test';

const BUG_ID = /^BUG-(UI|API)-\d{2}$/;

/** Enough for the matcher line, an optional custom message, the locator and the Expected/Received pair. */
const EVIDENCE_LINES = 6;

/** An error thrown by expect(), built-in or custom matcher. Anything else is not a verdict on the bug. */
function isAssertionFailure(error: unknown): error is Error {
  return error instanceof Error && 'matcherResult' in error;
}

/** The head of an expect() failure on one line: what was asserted, then Expected and Received. */
function evidence(error: Error): string {
  const lines = stripVTControlCharacters(error.message).split('\n');
  const callLog = lines.findIndex((line) => line.startsWith('Call log:'));
  return (callLog === -1 ? lines : lines.slice(0, callLog))
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '' && !line.startsWith('Timeout:'))
    .slice(0, EVIDENCE_LINES)
    .join(' | ');
}

/**
 * Parks the end of a test on a registered, still open bug. `bugAssertions` assert the correct behaviour.
 *
 * - The bug is open (an assertion fails): the test is skipped, with a `parked` annotation that carries the
 *   failure. An open bug is known news, so it must not paint the run red or hide behind a pass.
 * - The bug is fixed (the assertions pass): the test passes like any other, with a `parked-fixed` annotation
 *   asking to unpark it. A fix must arrive green, not as "Expected to fail, but passed".
 *
 * Nothing else is covered. Positive controls belong before this call as plain assertions, so a broken path is
 * still a real failure. Inside the callback only a failed hard expect() parks the test: any other error is
 * rethrown, and expect.soft() is refused, because a soft failure is recorded on the test and cannot be undone.
 * A test timeout cannot be caught either, so keep the callback to the bug assertions (they have their own
 * expect timeout).
 */
export async function parkedOn(
  bugId: string,
  symptom: string,
  bugAssertions: () => Promise<void> | void,
): Promise<void> {
  // Parking without a registered bug is just a skip.
  if (!BUG_ID.test(bugId))
    throw new Error(`parkedOn: "${bugId}" is not a bug id, expected BUG-UI-NN or BUG-API-NN as in README.md`);

  const testInfo = test.info();
  const errorsBefore = testInfo.errors.length;
  let failure: Error | undefined;
  try {
    await test.step(`parked on ${bugId}: the correct behaviour`, bugAssertions);
  } catch (error) {
    if (!isAssertionFailure(error)) throw error;
    failure = error;
  }
  if (testInfo.errors.length > errorsBefore)
    throw new Error(
      `parkedOn(${bugId}): expect.soft() failed inside the callback. A soft failure is already recorded on ` +
        'the test and cannot be parked: use hard assertions there.',
    );

  if (failure === undefined) {
    testInfo.annotations.push({
      type: 'parked-fixed',
      description: `${bugId} no longer reproduces: unpark this test and close the bug report`,
    });
    return;
  }
  testInfo.annotations.push({
    type: 'parked',
    description: `${bugId}: ${symptom}. Still failing: ${evidence(failure)}`,
  });
  // The one skip the suite allows: it is tied to a registered bug and carries the failure as evidence.
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(true, `${bugId} is still open: ${symptom}`);
}
