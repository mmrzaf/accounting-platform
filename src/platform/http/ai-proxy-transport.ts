import { request as httpRequest } from 'node:http'
import { request as httpsRequest, Agent as HttpsAgent } from 'node:https'
import { connect as tlsConnect, checkServerIdentity } from 'node:tls'
import { isIP, type Socket } from 'node:net'
import { Readable } from 'node:stream'
import { parseAiProxyUrl } from '../config/runtime.ts'
import type { AiFetcher } from '../../modules/ai/provider.ts'

/** Only outbound AI requests use this proxy. No global dispatcher or process-wide proxy settings. */
function aborted(): Error {
  return new DOMException('AI request aborted', 'AbortError')
}

async function openTunnel(proxy: URL, target: URL, signal?: AbortSignal | null): Promise<Socket> {
  const address = `${target.hostname}:${target.port || '443'}`
  return new Promise<Socket>((resolve, reject) => {
    if (signal?.aborted) { reject(aborted()); return }
    const req = httpRequest(proxy, {
      method: 'CONNECT', path: address, headers: { host: address },
      ...(signal ? { signal } : {}),
    })
    req.once('connect', (response, socket, head) => {
      if (response.statusCode !== 200) {
        socket.destroy()
        reject(new Error('AI proxy rejected the CONNECT tunnel'))
        return
      }
      if (head.length) socket.unshift(head)
      resolve(socket)
    })
    req.once('error', reject)
    req.end()
  })
}

async function connectSecurely(socket: Socket, target: URL, signal?: AbortSignal | null) {
  if (signal?.aborted) { socket.destroy(); throw aborted() }
  const host = target.hostname
  const secure = tlsConnect({
    socket,
    ...(isIP(host) ? {} : { servername: host }),
    rejectUnauthorized: true,
    checkServerIdentity: (_hostname, certificate) => checkServerIdentity(host, certificate),
  })
  return new Promise<typeof secure>((resolve, reject) => {
    const cleanup = () => {
      secure.off('secureConnect', onSecure)
      secure.off('error', onError)
      signal?.removeEventListener('abort', onAbort)
    }
    const onSecure = () => { cleanup(); resolve(secure) }
    const onError = (error: Error) => { cleanup(); secure.destroy(); reject(error) }
    const onAbort = () => { cleanup(); secure.destroy(); reject(aborted()) }
    secure.once('secureConnect', onSecure)
    secure.once('error', onError)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** HTTP CONNECT + normal Node TLS verification. Redirects are never followed. */
export function createAiProxyFetcher(proxyUrl: string): AiFetcher {
  const configured = parseAiProxyUrl(proxyUrl)
  if (!configured) throw new Error('AI proxy URL missing')
  const proxy = new URL(configured)
  return async (rawTarget, init) => {
    const target = new URL(rawTarget)
    // Local OpenAI-compatible endpoints should remain local, even when a proxy is configured.
    if (target.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
      return fetch(rawTarget, init)
    }
    if (target.protocol !== 'https:') throw new Error('AI proxy only supports HTTPS provider endpoints')
    if (init.redirect && init.redirect !== 'error') throw new Error('AI provider redirects must be disabled')
    if (init.body !== undefined && typeof init.body !== 'string') throw new Error('AI provider request body must be JSON text')

    const tunnel = await openTunnel(proxy, target, init.signal)
    const secure = await connectSecurely(tunnel, target, init.signal)
    const agent = new HttpsAgent({ keepAlive: false })
    agent.createConnection = () => secure
    return new Promise<Response>((resolve, reject) => {
      const request = httpsRequest(target, {
        method: init.method ?? 'GET',
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        agent, ...(init.signal ? { signal: init.signal } : {}),
      }, incoming => {
        const status = incoming.statusCode ?? 502
        if (status < 200 || status > 599) {
          incoming.destroy()
          reject(new Error('Invalid AI provider response status'))
          return
        }
        if (status >= 300) {
          // The provider's error body is intentionally discarded and never logged.
          incoming.destroy()
          resolve(new Response(null, { status }))
          return
        }
        const headers = new Headers()
        if (incoming.headers['content-type']) headers.set('content-type', incoming.headers['content-type'])
        const body = status === 204 || status === 205 ? null : Readable.toWeb(incoming) as ReadableStream<Uint8Array>
        resolve(new Response(body, { status, headers }))
      })
      request.once('error', error => { secure.destroy(); reject(error) })
      request.end(init.body)
    })
  }
}
