import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStaticWebHandler } from '../../src/platform/server/static-web.ts'

test('only serves built web assets and browser routes, with conservative cache/CSP rules', () => {
  const directory = mkdtempSync(join(tmpdir(), 'accounting-web-'))
  try {
    const root = join(directory, 'dist')
    mkdirSync(join(root, 'assets'), { recursive: true })
    writeFileSync(join(root, 'index.html'), '<!doctype html><main>Accounting</main>')
    writeFileSync(join(root, 'assets', 'main.js'), 'console.log("ok")')
    writeFileSync(join(directory, 'secret.txt'), 'private')
    symlinkSync(join(directory, 'secret.txt'), join(root, 'assets', 'leak.js'))
    const handler = createStaticWebHandler(root)
    const req = (path: string, method = 'GET') => handler(new Request(`http://127.0.0.1:3000${path}`, { method }))
    assert.equal(req('/')?.status, 200)
    assert.equal(req('/invoices')?.status, 200)
    assert.equal(req('/assets/main.js')?.headers.get('content-type'), 'text/javascript; charset=utf-8')
    assert.match(req('/')?.headers.get('content-security-policy') ?? '', /object-src 'none'/u)
    assert.equal(req('/')?.headers.get('cache-control'), 'no-store')
    assert.equal(req('/assets/main.js')?.headers.get('cache-control'), 'public, max-age=31536000, immutable')
    assert.equal(req('/assets/leak.js')?.status, 400)
    assert.equal(req('/package.json')?.status, 404)
    assert.equal(req('/assets/main.js', 'POST'), null)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
