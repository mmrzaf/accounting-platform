import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { parseAiProxyUrl, parseConfig, ConfigurationError } from '../../src/platform/config/runtime.ts'
import { createAiProxyFetcher } from '../../src/platform/http/ai-proxy-transport.ts'

test('AI HTTP proxy is explicit, scoped to its own setting, and validated', () => {
  assert.equal(parseConfig({ APP_AI_PROXY_URL: 'http://127.0.0.1:1080' }).aiProxyUrl, 'http://127.0.0.1:1080')
  assert.equal(parseConfig({}).aiProxyUrl, undefined)
  for (const invalid of ['socks5://127.0.0.1:1080', 'https://proxy.example', 'http://user:pass@localhost:1080',
    'http://localhost:1080/path', 'http://localhost:1080/?secret=yes', '']) {
    assert.throws(() => parseAiProxyUrl(invalid), ConfigurationError)
  }
})

test('AI HTTPS requests use HTTP CONNECT and do not disclose credentials to proxy', async t => {
  let destination = ''
  let leakedCredentials = false
  const proxy = createServer()
  proxy.on('connect', (req, socket) => {
    destination = req.url ?? ''
    leakedCredentials = !!req.headers.authorization || !!req.headers['proxy-authorization']
    socket.write('HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n')
    socket.destroy()
  })
  proxy.listen(0, '127.0.0.1')
  await once(proxy, 'listening')
  t.after(() => proxy.close())
  const address = proxy.address()
  if (!address || typeof address === 'string') throw new Error('Could not get proxy port')
  const fetcher = createAiProxyFetcher(`http://127.0.0.1:${address.port}`)
  await assert.rejects(() => fetcher('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { authorization: 'Bearer sensitive-provider-key' },
    body: '{}', redirect: 'error', signal: AbortSignal.timeout(3000),
  }), /proxy rejected the CONNECT/u)
  assert.equal(destination, 'api.groq.com:443')
  assert.equal(leakedCredentials, false)
})

test('local HTTP provider bypasses optional outbound AI proxy', async t => {
  const local = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: 'local model' }, finish_reason: 'stop' }] }))
  })
  local.listen(0, '127.0.0.1')
  await once(local, 'listening')
  t.after(() => local.close())
  const address = local.address()
  if (!address || typeof address === 'string') throw new Error('Could not get local port')
  const fetcher = createAiProxyFetcher('http://127.0.0.1:1') // unreachable; must not be used
  const response = await fetcher(`http://127.0.0.1:${address.port}/v1/chat/completions`, {
    method: 'POST', body: '{}', signal: AbortSignal.timeout(3000),
  })
  assert.equal(response.status, 200)
  assert.match(await response.text(), /local model/u)
})

test('an unresponsive AI HTTP proxy respects provider timeout/abort', async t => {
  const proxy = createServer()
  const connections = new Set<import('node:stream').Duplex>()
  proxy.on('connect', (_req, socket) => {
    connections.add(socket)
    socket.on('close', () => connections.delete(socket))
  })
  proxy.listen(0, '127.0.0.1')
  await once(proxy, 'listening')
  t.after(() => { for (const socket of connections) socket.destroy(); proxy.close() })
  const address = proxy.address()
  if (!address || typeof address === 'string') throw new Error('Could not get proxy port')
  const fetcher = createAiProxyFetcher(`http://127.0.0.1:${address.port}`)
  await assert.rejects(() => fetcher('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', body: '{}', signal: AbortSignal.timeout(60),
  }), error => error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))
})
