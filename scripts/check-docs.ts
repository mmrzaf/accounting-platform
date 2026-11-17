/** Dependency-free verification of required documents and local Markdown links. */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'README.md', 'AGENTS.md', 'START-HERE.md', 'docs/decisions/decision-register.md',
  'docs/validation/implementation-status.md', 'docs/validation/release-gates.md', 'docs/operations/identity-bootstrap.md',
  'docs/accounting/accounting-core.md', 'docs/ai/autonomy.md',
];
function isWithin(base: string, candidate: string): boolean {
  const rel = relative(base, candidate);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
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
        if (!isWithin(root, target) || !existsSync(target)) {
          failures.push(`${relative(root, path)}: missing or external local target ${link}`);
        }
      }
    }
  }
}

for (const filename of required) {
  if (!existsSync(join(root, filename))) failures.push(`Missing required artifact: ${filename}`);
}
for (const filename of ['README.md', 'AGENTS.md', 'START-HERE.md']) {
  // Include top-level documentation without traversing node_modules or dist.
  const contents = readFileSync(join(root, filename), 'utf8');
  checked++;
  for (const match of contents.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1]!.split('#')[0]!;
    if (!link || /^(https?:|mailto:|\/\/)/.test(link)) continue;
    const target = resolve(root, decodeURIComponent(link));
    if (!isWithin(root, target) || !existsSync(target)) failures.push(`${filename}: missing target ${link}`);
  }
}
recurse(join(root, 'docs'));
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log(`Documentation verified: ${checked} Markdown files; required artifacts and local links resolved.`);
}
