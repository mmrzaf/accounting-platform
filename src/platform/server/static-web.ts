import { readFileSync, statSync, realpathSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'

const contentTypes: Readonly<Record<string, string>> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}
const securityHeaders = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
} as const

/** Serve only locally built frontend artifacts. Never expose arbitrary repository or storage files. */
export function createStaticWebHandler(directory: string) {
  const root = resolve(directory)
  const indexPath = resolve(root, 'index.html')
  return (request: Request): Response | null => {
    if (request.method !== 'GET') return null
    const url = new URL(request.url)
    let path: string
    try { path = decodeURIComponent(url.pathname) } catch { return new Response('Invalid URL', { status: 400 }) }
    if (path.includes('\\') || path.includes('\0') || path.includes('..') || path.startsWith('//'))
      return new Response('Invalid URL', { status: 400 })
    const hasExtension = extname(path).length > 0
    const assetPath = hasExtension ? resolve(root, `.${path}`) : indexPath
    if (assetPath !== indexPath && !assetPath.startsWith(root + sep)) return new Response('Invalid URL', { status: 400 })
    const ext = extname(assetPath)
    if (assetPath !== indexPath && (!path.startsWith('/assets/') || !Object.hasOwn(contentTypes, ext)))
      return new Response('Not found', { status: 404 })
    try {
      const actualRoot = realpathSync(root)
      const actualFile = realpathSync(assetPath)
      if (actualFile !== actualRoot && !actualFile.startsWith(actualRoot + sep)) return new Response('Invalid asset path', { status: 400 })
      if (!statSync(assetPath).isFile()) return new Response('Not found', { status: 404 })
      const data = readFileSync(assetPath)
      return new Response(new Uint8Array(data), { status: 200, headers: {
        ...securityHeaders,
        'content-type': assetPath === indexPath ? 'text/html; charset=utf-8' : contentTypes[ext]!,
        'cache-control': assetPath === indexPath ? 'no-store' : 'public, max-age=31536000, immutable',
      } })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null
      throw error
    }
  }
}
