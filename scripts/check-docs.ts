/** Dependency-free verification of local Markdown links and required phase artifacts. */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'README.md', 'AGENTS.md', 'docs/decisions/decision-register.md',
  'docs/validation/phase-0.md', 'docs/validation/phase-1.md', 'docs/validation/phase-2.md', 'docs/validation/phase-3.md', 'docs/operations/identity-bootstrap.md',
  'docs/accounting/accounting-core.md', 'docs/ai/autonomy.md',
];
let checked = 0;
const failures: string[] = [];

function recurse(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) recurse(path);
    else if (entry.isFile() && entry.name.endsWith('.md')) {
      checked++;
      const contents = readFileSync(path, 'utf8');
      for (const match of contents.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
        const link = match[1]!.split('#')[0]!;
        if (!link || /^(https?:|mailto:|\/\/)/.test(link)) continue;
        const target = resolve(dirname(path), decodeURIComponent(link));
        if (!target.startsWith(root + '/') || !existsSync(target)) {
          failures.push(`${relative(root, path)}: missing or external local target ${link}`);
        }
      }
    }
  }
}

for (const filename of required) {
  if (!existsSync(join(root, filename))) failures.push(`Missing required artifact: ${filename}`);
}
recurse(root);
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log(`Documentation verified: ${checked} Markdown files; required artifacts and local links resolved.`);
}
