import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

const SUPPORTED_MAJORS = new Set([22, 24, 26])

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigurationError'
  }
}

export function validateRuntime(version: string = process.versions.node) {
  const [major = NaN, minor = NaN] = version.split('.').map(Number)
  if (!SUPPORTED_MAJORS.has(major) || (major === 22 && minor < 16)) {
    throw new ConfigurationError('Supported Node.js versions: 22.16+, 24.x, or 26.x')
  }
  return { version, major, primary: major === 24 }
}

/** Node 22.16+, 24 and 26 provide process.loadEnvFile; existing environment values win. */
export function loadLocalEnv(path: string = resolve(process.cwd(), '.env')) {
  if (existsSync(path)) {
    process.loadEnvFile(path)
    return true
  }
  return false
}

export function parseConfig(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()) {
  const port = Number(env['APP_PORT'] ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigurationError('APP_PORT must be an integer between 1 and 65535')
  }
  const bindHost = env['APP_BIND_HOST'] ?? '127.0.0.1'
  if (!['127.0.0.1', 'localhost', '::1', '0.0.0.0', '::'].includes(bindHost)) {
    throw new ConfigurationError('APP_BIND_HOST must be an explicit supported bind address')
  }
  const dbPath = resolve(cwd, env['APP_DB_PATH'] ?? 'var/data/accounting.sqlite')
  const backupDir = resolve(cwd, env['APP_BACKUP_DIR'] ?? 'var/backups')
  const attachmentDir = resolve(cwd, env['APP_ATTACHMENT_DIR'] ?? 'var/attachments')
  const publicOrigin = env['APP_PUBLIC_ORIGIN'] ?? `http://127.0.0.1:${port}`
  let parsed: URL
  try { parsed = new URL(publicOrigin) } catch { throw new ConfigurationError('APP_PUBLIC_ORIGIN must be an absolute origin') }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.origin !== publicOrigin || parsed.username || parsed.password ||
      (parsed.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))) {
    throw new ConfigurationError('APP_PUBLIC_ORIGIN must be HTTPS or loopback HTTP with no path')
  }
  return Object.freeze({ port, bindHost, dbPath, backupDir, attachmentDir, publicOrigin })
}
