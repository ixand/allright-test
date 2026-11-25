// Turns Playwright's JSON report into a Markdown table for the GitHub job summary.
// Tests parked on a known bug are counted apart from real passes and from plain skips, so a green run
// never hides how many defects are still open, and a parked test that starts passing is called out.
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
const nowPassing = [];
// Annotations pushed while a test runs are reported on its results; declared ones on the test itself.
const annotationsOf = (test) => {
  const all = [
    ...(test.annotations ?? []),
    ...(test.results ?? []).flatMap((result) => result.annotations ?? []),
  ];
  return new Map(all.map((a) => [a.type, a.description ?? '']));
};
const row = (project) => {
  if (!rows.has(project)) {
    rows.set(project, { passed: 0, parked: 0, fixed: 0, failed: 0, flaky: 0, skipped: 0 });
  }
  return rows.get(project);
};

function walk(suite, titlePath) {
  for (const child of suite.suites ?? []) walk(child, [...titlePath, child.title]);
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) {
      const r = row(test.projectName);
      const notes = annotationsOf(test);
      if (notes.has('parked-fixed')) nowPassing.push(notes.get('parked-fixed'));
      if (notes.has('parked')) r.parked++;
      else if (test.status === 'skipped') r.skipped++;
      else if (test.status === 'flaky') r.flaky++;
      else if (test.status === 'unexpected') {
        r.failed++;
        failures.push(`${test.projectName} › ${[...titlePath, spec.title].filter(Boolean).join(' › ')}`);
      } else if (notes.has('parked-fixed')) r.fixed++;
      else r.passed++;
    }
  }
}
for (const suite of report.suites ?? []) walk(suite, []);

const lines = [
  '### Test summary',
  '',
  '| Project | Passed | Parked on an open bug | Parked, now passing | Failed | Flaky (passed on retry) | Skipped |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
];
for (const [project, r] of [...rows].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(
    `| ${project} | ${r.passed} | ${r.parked} | ${r.fixed} | ${r.failed} | ${r.flaky} | ${r.skipped} |`,
  );
}
if (failures.length) lines.push('', '**Failed:**', ...failures.map((f) => `- ${f}`));
if (nowPassing.length) {
  lines.push(
    '',
    '**Parked tests that pass now (unpark them):**',
    ...[...new Set(nowPassing)].map((f) => `- ${f}`),
  );
}
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
