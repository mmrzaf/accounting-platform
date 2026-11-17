import { openDatabase, checkDatabase } from '../database/sqlite.ts'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { migrationStatus } from '../database/migrations.ts'
import { createIdentityService } from '../../modules/identity/service.ts'
import { createTradingService } from '../../modules/trading/service.ts'
import { createAccountingService } from '../../modules/accounting/service.ts'
import { createBusinessReports } from '../../modules/reports/service.ts'
import { createAiService } from '../../modules/ai/service.ts'
import { createInventoryService } from '../../modules/inventory/service.ts'
import { createTaxService } from '../../modules/tax/service.ts'
import { createContactImportService } from '../../modules/imports/contacts.ts'
import { createDocumentService } from '../../modules/documents/service.ts'
import { createIdentityHttpHandler } from '../http/identity-handler.ts'
import { createBusinessHttpHandler } from '../http/business-handler.ts'
import { createAiHttpHandler } from '../http/ai-handler.ts'
import { createAccountingHttpHandler } from '../http/accounting-handler.ts'
import { createExtensionsHttpHandler } from '../http/extensions-handler.ts'
import { createNodeHttpServer } from './node-http.ts'
import { createStaticWebHandler } from './static-web.ts'

export interface ApplicationOptions {
  databasePath: string
  migrationDirectory: string
  attachmentDirectory?: string
  webDistDirectory?: string
  publicOrigin: string | (() => string)
  /** 32-byte key; never store in the database or repository. Required to enable AI HTTP operations. */
  aiMasterKey?: Uint8Array
}
/** Reusable composition root. Later TanStack Start routes can mount these same typed HTTP adapters. */
export function createApplication(options: ApplicationOptions) {
  if (!existsSync(options.databasePath)) throw new Error('Database missing; run db:migrate and bootstrap first')
  const db = openDatabase(options.databasePath)
  try {
    const migrations = migrationStatus(db, options.migrationDirectory)
    if (migrations.pending.length) throw new Error('Pending database migrations; run db:migrate first')
    if (!checkDatabase(db).ok) throw new Error('Database integrity checks failed')
    const identity = createIdentityService(db)
    const trading = createTradingService(db)
    const accounting = createAccountingService(db)
    const reports = createBusinessReports(db)
    const authHttp = createIdentityHttpHandler(identity)
    const accountingHttp = createAccountingHttpHandler(identity, accounting)
    const extensionsHttp = createExtensionsHttpHandler(identity, trading, createInventoryService(db), createTaxService(db),
      createContactImportService(db), createDocumentService(db, options.attachmentDirectory ?? resolve(dirname(options.databasePath), '../attachments')))
    const businessHttp = createBusinessHttpHandler(identity, trading, accounting, reports)
    const aiHttp = options.aiMasterKey ? createAiHttpHandler(identity, createAiService(db, { masterKey: options.aiMasterKey })) : null
    const web = options.webDistDirectory ? createStaticWebHandler(options.webDistDirectory) : null
    const handler = async (request: Request) => {
      const path = new URL(request.url).pathname
      if (path.startsWith('/api/auth/') || path === '/api/companies' || path === '/api/users' || path.startsWith('/api/users/') ||
          path === '/api/roles' || path.startsWith('/api/roles/') || path === '/api/audit') return authHttp(request)
      if (path.startsWith('/api/business/')) return businessHttp(request)
      if (path.startsWith('/api/accounting/')) return accountingHttp(request)
      if (path.startsWith('/api/inventory/') || path.startsWith('/api/tax/') || path.startsWith('/api/imports/') ||
          path.startsWith('/api/credit-notes') || path.startsWith('/api/documents')) return extensionsHttp(request)
      if (path.startsWith('/api/ai/')) return aiHttp ? aiHttp(request) :
        new Response(JSON.stringify({ error: { code: 'AI_DISABLED', message: 'AI integration has not been configured on this installation' } }),
          { status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
      if (web) {
        const page = web(request)
        if (page) return page
      }
      return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }),
        { status: 404, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
    }
    const server = createNodeHttpServer({ origin: options.publicOrigin, handler, readiness: () => {
      try { return db.prepare('SELECT 1').get() !== undefined } catch { return false }
    } })
    let closed = false
    return { server, close: async () => {
      if (closed) return
      closed = true
      try {
        if (server.listening) {
          await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
        }
      } finally { db.close() }
    } }
  } catch (error) { db.close(); throw error }
}
