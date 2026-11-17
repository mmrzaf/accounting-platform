import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { type AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { response } from '../http/request-security.ts'

const MAX_REQUEST_BYTES = 16 * 1024
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const MAX_CSV_IMPORT_BYTES = 2 * 1024 * 1024
export interface NodeHttpOptions {
  origin: string | (() => string)
  handler: (request: Request) => Promise<Response>
  readiness?: () => boolean
}
function send(res: ServerResponse, result: Response) {
  res.statusCode = result.status
  result.headers.forEach((value, key) => res.setHeader(key, value))
  return result.arrayBuffer().then(body => { res.end(Buffer.from(body)) })
}
function bad(status: number, message: string) {
  return response({ error: { code: status === 413 ? 'BODY_TOO_LARGE' : 'INVALID_REQUEST', message }, requestId: randomUUID() }, status)
}
/** Explicit canonical origin, no forwarding-header trust. Intended behind a separately configured TLS terminator. */
export function createNodeHttpServer(options: NodeHttpOptions): Server {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    let result: Response
    try {
      const original = typeof options.origin === 'string' ? options.origin : options.origin()
      const origin = new URL(original)
      if ((origin.protocol !== 'http:' && origin.protocol !== 'https:') || origin.origin !== original ||
          origin.username || origin.password || !origin.hostname) throw Error('Invalid configured origin')
      if (req.headers.host !== origin.host) {
        result = bad(400, 'Unrecognized Host header')
      } else if (!req.url || !req.url.startsWith('/') || req.url.startsWith('//') || req.url.includes('\\')) {
        result = bad(400, 'Invalid request path')
      } else if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'PUT') {
        result = bad(405, 'Method not allowed')
      } else if (req.url === '/health/live' && req.method === 'GET') {
        result = response({ ok: true })
      } else if (req.url === '/health/ready' && req.method === 'GET') {
        const ready = options.readiness?.() ?? true
        result = response({ ok: ready }, ready ? 200 : 503)
      } else {
        const headers = new Headers()
        for (const [key, value] of Object.entries(req.headers)) {
          if (Array.isArray(value)) for (const v of value) headers.append(key, v)
          else if (value !== undefined) headers.set(key, value)
        }
        // Only the attachment endpoint accepts a large binary payload. All other requests stay small.
        const path = new URL(req.url, origin).pathname
        const maxBytes = req.method === 'POST' && path === '/api/documents' ? MAX_ATTACHMENT_BYTES
          : req.method === 'POST' && path === '/api/imports/contacts' ? MAX_CSV_IMPORT_BYTES
          : MAX_REQUEST_BYTES
        const chunks: Buffer[] = []
        let size = 0
        for await (const chunk of req) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
          size += bytes.byteLength
          if (size > maxBytes) break
          chunks.push(bytes)
        }
        if (size > maxBytes) {
          res.shouldKeepAlive = false
          result = bad(413, 'Request body exceeds endpoint limit')
        } else if (req.method === 'GET' && size > 0) result = bad(400, 'GET request must not have a body')
        else {
          // Do not take the request URL, scheme or host from client-supplied proxy headers.
          const request = new Request(new URL(req.url, origin), { method: req.method, headers,
            ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) })
          result = await options.handler(request)
        }
      }
    } catch {
      result = response({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }, requestId: randomUUID() }, 500)
    }
    try { await send(res, result) } catch { res.destroy() }
  })
  server.headersTimeout = 15_000
  server.requestTimeout = 15_000
  server.keepAliveTimeout = 5_000
  server.maxRequestsPerSocket = 500
  return server
}
export async function listen(server: Server, host: string, port: number) {
  // Deliberately reject public binding without a trusted TLS reverse proxy architecture.
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('Direct non-loopback binding is disabled; use a local TLS reverse proxy')
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => { server.off('error', reject); resolve() })
  })
  const address = server.address() as AddressInfo
  return { address: address.address, port: address.port }
}
