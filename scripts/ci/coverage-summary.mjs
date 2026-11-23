// Appends a unit-test coverage table to the GitHub job summary (or prints it locally).
import fs from 'node:fs';

const suites = [
  ['API (Jest)', 'apps/api/coverage/coverage-summary.json'],
  ['Web (Vitest)', 'apps/web/coverage/coverage-summary.json'],
];
let md = '### Unit test coverage\n\n| Suite | Lines | Statements | Functions | Branches |\n|---|---|---|---|---|\n';
for (const [name, file] of suites) {
  if (!fs.existsSync(file)) continue;
  const t = JSON.parse(fs.readFileSync(file, 'utf8')).total;
  md += `| ${name} | ${t.lines.pct}% | ${t.statements.pct}% | ${t.functions.pct}% | ${t.branches.pct}% |\n`;
}
md += '\nIntegration, scenario and browser suites cover the rest of the code; unit coverage is reported, not enforced.\n';
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
else console.log(md);
