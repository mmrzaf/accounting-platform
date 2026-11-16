import type { DatabaseSync } from 'node:sqlite'
import { createIdentityContext } from './context.ts'
import { createBootstrapService } from './bootstrap.ts'
import { createSessionService } from './sessions.ts'
import { createUserService } from './users.ts'
import { createCompanyService } from './companies.ts'
import { createRoleService } from './roles.ts'

/** Framework-neutral identity facade; composes domain-scoped services. */
export function createIdentityService(db: DatabaseSync, { clock = () => new Date() }: { clock?: () => Date } = {}) {
  const ctx = createIdentityContext(db, clock)
  return Object.freeze({
    ...createBootstrapService(ctx),
    ...createSessionService(ctx),
    ...createUserService(ctx),
    ...createCompanyService(ctx),
    ...createRoleService(ctx),
  })
}
