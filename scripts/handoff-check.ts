#!/usr/bin/env node
/** Dependency-free handoff diagnostic. Never changes files or prints secrets. */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface Finding {
  id: string
  status: 'pass' | 'action' | 'blocker'
  detail: string
  next?: string
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const allowed = new Set(['--json', '--strict', '--release'])
for (const arg of args) if (!allowed.has(arg)) throw Error(`Unknown option: ${arg}`)
const release = args.has('--release')
const findings: Finding[] = []
function add(id: string, ok: boolean, detail: string, next: string, severity: 'action'|'blocker' = 'action') {
  findings.push(ok ? { id, status: 'pass', detail } : { id, status: severity, detail, next })
}
const version = process.versions.node
const [major = 0, minor = 0] = version.split('.').map(Number)
const supported = major === 24 || major === 26 || major === 22 && minor >= 16
add('node', supported, `Node ${version}${major === 24 ? ' (primary)' : ' (compatibility only)'}`, 'Install Node 24 LTS (22.16+ and 26 are compatibility targets)', 'blocker')
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { packageManager?: string; devDependencies?: Record<string, string> }
add('package-manager-policy', packageJson.packageManager === 'pnpm@10.20.0', 'Project requests pnpm@10.20.0', 'Review packageManager and installed pnpm version', 'blocker')
add('node-type-alignment', /^24\./u.test(packageJson.devDependencies?.['@types/node'] ?? ''),
  'Node type declarations match Node 24 primary target',
  'On a connected machine, update @types/node to a reviewed 24.x version, regenerate and commit the root pnpm-lock.yaml',
  release ? 'blocker' : 'action')
add('backend-lock', existsSync(join(root, 'pnpm-lock.yaml')), 'Backend pnpm lockfile', 'Restore the tracked root pnpm-lock.yaml', 'blocker')
add('backend-dependencies', existsSync(join(root, 'node_modules', 'typescript', 'package.json')),
  'Backend TypeScript compiler installed locally', 'From repository root: pnpm install --frozen-lockfile', release ? 'blocker' : 'action')
add('browser-lock', existsSync(join(root, 'web', 'pnpm-lock.yaml')),
  'Browser dependency lockfile committed',
  'First connected handoff: pnpm --dir web install --no-frozen-lockfile; review and COMMIT web/pnpm-lock.yaml. Thereafter use --frozen-lockfile.',
  release ? 'blocker' : 'action')
add('browser-dependencies', existsSync(join(root, 'web', 'node_modules', 'react', 'package.json')),
  'React installed locally', 'From repository root: pnpm --dir web install --frozen-lockfile (after committing the browser lockfile)', release ? 'blocker' : 'action')
add('browser-build', existsSync(join(root, 'web', 'dist', 'index.html')),
  'Browser production bundle present', 'After installation: pnpm run web:build (do not use Vite dev server in production)', release ? 'blocker' : 'action')
add('agent-instructions', existsSync(join(root, 'AGENTS.md')) && existsSync(join(root, 'START-HERE.md')),
  'Agent handoff and architecture instructions present', 'Restore AGENTS.md and START-HERE.md', 'blocker')
add('migrations', existsSync(join(root, 'migrations', '0001_initial.sql')),
  'Tracked database migrations found', 'Restore the migrations directory before bootstrapping', 'blocker')
const unresolved = findings.filter(item => item.status !== 'pass')
const report = { ok: unresolved.length === 0, release, nodeVersion: version, findings,
  next: release ? 'Do not release until all blockers are cleared and the acceptance checklist is signed off.' :
    'Read START-HERE.md; install and lock dependencies on a connected machine, run verification, then bootstrap only a disposable database.' }
if (args.has('--json')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
else {
  process.stdout.write(`Accounting handoff check — ${release ? 'release' : 'development'}\n`)
  for (const finding of findings) {
    process.stdout.write(`${finding.status.toUpperCase().padEnd(7)} ${finding.id}: ${finding.detail}\n`)
    if (finding.next) process.stdout.write(`         → ${finding.next}\n`)
  }
  process.stdout.write(`\n${report.next}\n`)
}
if (args.has('--strict') && unresolved.length) process.exitCode = 1
