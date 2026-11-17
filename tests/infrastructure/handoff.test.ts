import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

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

test('strict release handoff fails when browser dependencies are not locked', () => {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', script, '--release', '--strict', '--json'], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  const report = JSON.parse(result.stdout) as { ok: boolean; release: boolean; findings: Array<{ id: string; status: string }> }
  assert.equal(report.ok, false)
  assert.equal(report.release, true)
  assert.ok(report.findings.some(item => item.id === 'browser-lock' && item.status === 'blocker'))
})
