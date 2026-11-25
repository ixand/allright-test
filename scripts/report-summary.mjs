// Turns Playwright's JSON report into a Markdown table for the GitHub job summary.
// Known bugs (test.fail) are counted apart from real passes, so a green run
// never hides how many defects are still open.
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'test-results/results.json';
let report;
try {
  report = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
  console.log(`### Test summary\n\nNo JSON report at \`${file}\`: ${error.message}`);
  process.exit(0);
}

const rows = new Map();
const failures = [];
const row = (project) => {
  if (!rows.has(project)) {
    rows.set(project, { passed: 0, knownBug: 0, failed: 0, flaky: 0, skipped: 0 });
  }
  return rows.get(project);
};

function walk(suite, titlePath) {
  for (const child of suite.suites ?? []) walk(child, [...titlePath, child.title]);
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) {
      const r = row(test.projectName);
      if (test.status === 'skipped') r.skipped++;
      else if (test.status === 'flaky') r.flaky++;
      else if (test.status === 'unexpected') {
        r.failed++;
        failures.push(`${test.projectName} › ${[...titlePath, spec.title].filter(Boolean).join(' › ')}`);
      } else if (test.expectedStatus === 'failed') r.knownBug++;
      else r.passed++;
    }
  }
}
for (const suite of report.suites ?? []) walk(suite, []);

const lines = [
  '### Test summary',
  '',
  '| Project | Passed | Known bug (expected fail) | Failed | Flaky (passed on retry) | Skipped |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
];
for (const [project, r] of [...rows].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(`| ${project} | ${r.passed} | ${r.knownBug} | ${r.failed} | ${r.flaky} | ${r.skipped} |`);
}
if (failures.length) lines.push('', '**Failed:**', ...failures.map((f) => `- ${f}`));
// Errors raised outside any test (a worker teardown, the global timeout) turn the run red without a failed row.
const errors = report.errors ?? [];
if (errors.length) {
  lines.push(
    '',
    '**Errors outside tests:**',
    ...errors.map((e) => `- ${String(e.message ?? e).split('\n')[0]}`),
  );
}
lines.push('', `Duration: ${Math.round((report.stats?.duration ?? 0) / 1000)} s`);
console.log(lines.join('\n'));
