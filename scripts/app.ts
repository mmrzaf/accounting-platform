#!/usr/bin/env node
import { mkdir, access } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'
import { createIdentityService } from '../src/modules/identity/service.ts'
import { recoverOrganizationAdministrator } from '../src/modules/identity/operator-recovery.ts'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { validateRuntime, loadLocalEnv, parseConfig } from '../src/platform/config/runtime.ts'
import { openDatabase, checkDatabase } from '../src/platform/database/sqlite.ts'
import { migrationStatus, applyMigrations } from '../src/platform/database/migrations.ts'
import { createBackup, verifyBackup, restoreBackup } from '../src/platform/backup/backups.ts'
import { logEvent } from '../src/platform/logging/logger.ts'
import { createApplication } from '../src/platform/server/application.ts'
import { listen } from '../src/platform/server/node-http.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const migrations = join(root, 'migrations')
const commands = new Set(['setup', 'doctor', 'db:migrate', 'db:status', 'db:check', 'backup:create', 'backup:verify', 'backup:restore', 'server:start', 'organization:bootstrap', 'admin:recover'])

function parseArgs(args: string[]) {
  const flags: Record<string, string | boolean | undefined> = {}
  let command
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--') continue
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      if (!['json', 'password-stdin', 'database', 'source', 'target', 'output', 'slug', 'name', 'admin-username', 'admin-name', 'company-code', 'company-name', 'attachments', 'target-attachments'].includes(key)) throw new Error(`Unknown flag: ${arg}`)
      if (key === 'json' || key === 'password-stdin') flags[key] = true
      else {
        const value = args[++i]
        if (!value || value.startsWith('--')) throw new Error(`Missing value: ${arg}`)
        flags[key] = value
      }
    } else if (!command) command = arg
    else throw new Error(`Unexpected argument: ${arg}`)
  }
  if (!command || !commands.has(command)) throw new Error('Expected command: setup | doctor | db:migrate | db:status | db:check | backup:create | backup:verify | backup:restore | server:start | organization:bootstrap | admin:recover')
  return { command, flags }
}

function emit(result: unknown, json: boolean | string | undefined) {
  if (json) process.stdout.write(`${JSON.stringify(result)}\n`)
  else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

async function readSecret(fromStdin: boolean | string | undefined): Promise<string> {
  if (!process.stdin.isTTY && !fromStdin) throw new Error('Use --password-stdin when piping the administrator password')
  if (process.stdin.isTTY && !fromStdin) {
    process.stderr.write('Administrator password (hidden): ')
    const silent = new Writable({ write(_chunk, _encoding, callback) { callback() } })
    const rl = createInterface({ input: process.stdin, output: silent, terminal: true })
    try { return await new Promise<string>(resolve => rl.question('', resolve)) }
    finally { rl.close(); process.stderr.write('\n') }
  }
  let secret = ''
  for await (const chunk of process.stdin) {
    secret += chunk.toString('utf8')
    if (Buffer.byteLength(secret, 'utf8') > 1026) throw new Error('Administrator password input is too long')
  }
  return secret.replace(/\r?\n$/u, '')
}

async function main(argv: string[]) {
  const { command, flags } = parseArgs(argv)
  const value = (name: string): string | undefined => typeof flags[name] === 'string' ? flags[name] : undefined
  const runtime = validateRuntime()
  loadLocalEnv(resolve(process.cwd(), '.env'))
  const config = parseConfig()
  const dbPath = resolve(value('database') ?? config.dbPath)
  if (command === 'setup') {
    await mkdir(dirname(dbPath), { recursive: true, mode: 0o700 })
    await mkdir(config.backupDir, { recursive: true, mode: 0o700 })
    await mkdir(config.attachmentDir, { recursive: true, mode: 0o700 })
    emit({ ok: true, initializedDirectories: true, next: 'Run db:migrate explicitly; setup never modifies a database' }, flags['json'])
    return
  }
  if (command === 'doctor') {
    let dbExists = true
    try { await access(dbPath) } catch { dbExists = false }
    const warnings: string[] = []
    const problems: string[] = []
    const browserBuilt = existsSync(resolve(root, 'web/dist/index.html'))
    if (!browserBuilt) warnings.push('Browser production bundle missing. Install web dependencies and run web:build before opening the browser UI.')
    let databaseIntegrity: boolean | null = null
    let pendingMigrations: number | null = null
    if (!dbExists) warnings.push('Database has not been initialized. Run db:migrate.')
    else {
      try {
        const inspection = openDatabase(dbPath, { create: false })
        try {
          databaseIntegrity = checkDatabase(inspection).ok
          pendingMigrations = migrationStatus(inspection, migrations).pending.length
          if (!databaseIntegrity) problems.push('Database integrity or foreign-key check failed')
          if (pendingMigrations) problems.push(`${pendingMigrations} pending migrations; run db:migrate after taking a complete backup`)
        } finally { inspection.close() }
      } catch { problems.push('Unable to inspect database and migration state') }
    }
    const checks = { runtime, nodeSupported: true, databaseExists: dbExists, databaseIntegrity,
      pendingMigrations, browserBuilt, bindHost: config.bindHost, port: config.port }
    emit({ ok: problems.length === 0, checks, warnings, problems }, flags['json'])
    if (problems.length) process.exitCode = 1
    return
  }
  if (command === 'server:start') {
    const encodedKey = process.env['APP_AI_MASTER_KEY_BASE64']
    const key = encodedKey ? Buffer.from(encodedKey, 'base64') : undefined
    if (encodedKey && (!/^[A-Za-z0-9+/]{43}=$/u.test(encodedKey) || key?.byteLength !== 32))
      throw new Error('APP_AI_MASTER_KEY_BASE64 must be a base64-encoded 32-byte random key')
    const application = createApplication({ databasePath: dbPath, migrationDirectory: migrations, publicOrigin: config.publicOrigin,
      attachmentDirectory: config.attachmentDir,
      webDistDirectory: resolve(process.cwd(), 'web/dist'),
      ...(key ? { aiMasterKey: key } : {}) })
    try {
      await listen(application.server, config.bindHost, config.port)
    } catch (error) {
      await application.close()
      throw error
    }
    const browserBuilt = existsSync(resolve(root, 'web/dist/index.html'))
    emit({ ok: true, publicOrigin: config.publicOrigin, bindHost: config.bindHost, port: config.port, aiEnabled: !!key,
      browserBuilt, ...(browserBuilt ? {} : { warning: 'Browser UI is not built; API is available but / will not show the app' }) }, flags['json'])
    let stopping = false
    const shutdown = () => {
      if (stopping) return
      stopping = true
      application.close().then(() => { process.exitCode = 0 }).catch(() => { process.exitCode = 1 })
    }
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
    return
  }
  if (command === 'backup:verify') {
    if (!value('source')) throw new Error('backup:verify requires --source BUNDLE_DIR')
    emit(await verifyBackup(value('source')!), flags['json'])
    return
  }
  if (command === 'backup:restore') {
    if (!value('source') || !value('target') || !value('target-attachments'))
      throw new Error('backup:restore requires --source BUNDLE_DIR --target NEW_DB --target-attachments NEW_DIR')
    emit(await restoreBackup(value('source')!, value('target')!, value('target-attachments')!), flags['json'])
    return
  }
  if (command === 'backup:create') {
    emit(await createBackup(dbPath, resolve(value('attachments') ?? config.attachmentDir),
      resolve(value('output') ?? config.backupDir)), flags['json'])
    return
  }
  const db = openDatabase(dbPath, { create: command === 'db:migrate' || command === 'organization:bootstrap' || command === 'admin:recover' })
  try {
    if (command === 'organization:bootstrap') {
      const required = ['slug', 'name', 'admin-username', 'admin-name']
      for (const flag of required) if (!flags[flag]) throw new Error(`organization:bootstrap requires --${flag}`)
      if (migrationStatus(db, migrations).pending.length) throw new Error('Database has pending migrations; run db:migrate first')
      const password = await readSecret(flags['password-stdin'])
      const result = await createIdentityService(db).bootstrapOrganization({
        slug: value('slug')!, name: value('name')!, adminUsername: value('admin-username')!,
        adminDisplayName: value('admin-name')!, password,
        ...(value('company-code') ? { companyCode: value('company-code')! } : {}),
        ...(value('company-name') ? { companyName: value('company-name')! } : {}),
      })
      emit({ ok: true, ...result }, flags['json'])
    }
    if (command === 'admin:recover') {
      if (!value('slug') || !value('admin-username')) throw new Error('admin:recover requires --slug and --admin-username')
      if (migrationStatus(db, migrations).pending.length) throw new Error('Database has pending migrations; run db:migrate first')
      const password = await readSecret(flags['password-stdin'])
      emit(await recoverOrganizationAdministrator(db, { organizationSlug: value('slug')!, username: value('admin-username')!, newPassword: password }), flags['json'])
    }
    if (command === 'db:migrate') emit({ ok: true, migrations: applyMigrations(db, migrations) }, flags['json'])
    if (command === 'db:status') {
      const { applied, pending } = migrationStatus(db, migrations)
      emit({ ok: true, applied, pending }, flags['json'])
    }
    if (command === 'db:check') {
      const result = checkDatabase(db)
      emit(result, flags['json'])
      if (!result.ok) process.exitCode = 1
    }
  } finally { db.close() }
}

main(process.argv.slice(2)).catch(error => {
  logEvent('error', 'cli.failure', { code: error.name === 'MigrationError' ? 'MIGRATION_ERROR' : 'OPERATION_FAILED' })
  process.stderr.write(`${JSON.stringify({ ok: false, error: { code: error.name ?? 'Error', message: error.message } })}\n`)
  process.exitCode = 1
})
