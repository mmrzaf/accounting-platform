const SAFE_KEYS = new Set(['operation', 'elapsedMs', 'requestId', 'event', 'code', 'resource', 'status', 'count', 'migration'])
const LEVELS = new Set(['debug', 'info', 'warn', 'error'])

/** Allowlist contextual log fields. Values are constrained to primitives; secrets are never serialized. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogFields = Record<string, unknown>
export function makeLogRecord(level: LogLevel, event: string, context: LogFields = {}, timestamp: string = new Date().toISOString()): { timestamp: string; level: LogLevel; event: string } & Record<string, string | number | boolean | undefined> {
  if (!LEVELS.has(level) || typeof event !== 'string' || !/^[a-z0-9_.-]{1,100}$/.test(event)) {
    throw new TypeError('Invalid log event')
  }
  const fields: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(context)) {
    if (SAFE_KEYS.has(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
      fields[key] = typeof value === 'string' ? value.slice(0, 120) : value
    }
  }
  return { timestamp, level, event, ...fields }
}

export function logEvent(level: LogLevel, event: string, context: LogFields = {}, output: NodeJS.WritableStream = process.stderr) {
  output.write(`${JSON.stringify(makeLogRecord(level, event, context))}\n`)
}
