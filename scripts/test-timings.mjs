// Run the same full suite as npm test, or selected files, with actionable timings.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
let report;
const index = args.indexOf('--json');
if (index >= 0) {
  report = args[index + 1];
  if (!report || report.startsWith('--')) throw new Error('--json requires an output file path');
  args.splice(index, 2);
}
const files = args.length ? args : readdirSync(new URL('../test/', import.meta.url))
  .filter(name => name.endsWith('.test.js')).sort().map(name => `test/${name}`);
const child = spawn(process.execPath, ['--test', '--test-reporter=./scripts/test-timing-reporter.mjs', ...files], {
  cwd: root, stdio: 'inherit', env: { ...process.env, ...(report ? { TEST_TIMING_REPORT: report } : {}) },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
