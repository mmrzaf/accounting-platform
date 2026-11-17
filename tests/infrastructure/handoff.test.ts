import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const script = fileURLToPath(new URL('../../scripts/handoff-check.ts', import.meta.url))

test('dependency-free handoff diagnostic reports missing browser lockfile without exposing secrets', () => {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', script, '--json'], {
    encoding: 'utf8', env: { ...process.env, APP_AI_MASTER_KEY_BASE64: 'do-not-print-this-secret' },
  })
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout) as { release: boolean; findings: Array<{ id: string; status: string }> }
  assert.equal(report.release, false)
  assert.ok(report.findings.some(item => item.id === 'node'))
  assert.ok(report.findings.some(item => item.id === 'browser-lock'))
  assert.ok(report.findings.some(item => item.id === 'node-type-alignment'))
  assert.equal(result.stdout.includes('do-not-print-this-secret'), false)
})

test('strict release handoff accurately reports browser lock presence and any unresolved gates', () => {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', script, '--release', '--strict', '--json'], { encoding: 'utf8' })
  const report = JSON.parse(result.stdout) as { ok: boolean; release: boolean; findings: Array<{ id: string; status: string }> }
  assert.equal(report.release, true)
  const blocked = report.findings.some(item => item.status !== 'pass')
  assert.equal(report.ok, !blocked)
  assert.equal(result.status, blocked ? 1 : 0)
  const lock = fileURLToPath(new URL('../../web/pnpm-lock.yaml', import.meta.url))
  const browser = report.findings.find(item => item.id === 'browser-lock')
  assert.equal(browser?.status, existsSync(lock) ? 'pass' : 'blocker')
})
