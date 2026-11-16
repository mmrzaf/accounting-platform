import { randomUUID } from 'node:crypto'
import { hashPassword } from './passwords.ts'
import { code, requiredString } from './validation.ts'
import { conflict } from './errors.ts'
import type { BootstrapInput } from './types.ts'
import type { IdentityContext } from './context.ts'

/** Scoped application use cases; no direct framework or HTTP dependency. */
export function createBootstrapService(ctx: IdentityContext) {
  const { db, audit, grant, installRoles, transaction } = ctx
  async function bootstrapOrganization({ slug, name, adminUsername, adminDisplayName, password, companyName, companyCode = 'main' }: BootstrapInput) {
    slug = code(slug, 'Organization slug')
    name = requiredString(name, 'Organization name')
    adminUsername = code(adminUsername, 'Username')
    adminDisplayName = requiredString(adminDisplayName, 'Administrator name')
    companyName = requiredString(companyName ?? name, 'Company name')
    companyCode = code(companyCode, 'Company code')
    const passwordHash = await hashPassword(password)
    return transaction(db, () => {
      if (db.prepare('SELECT 1 FROM organizations WHERE slug=?').get(slug)) throw conflict('Organization slug already exists')
      const orgId = randomUUID(), userId = randomUUID(), companyId = randomUUID()
      db.prepare('INSERT INTO organizations(id,slug,name) VALUES(?,?,?)').run(orgId, slug, name)
      db.prepare('INSERT INTO companies(id,organization_id,code,name) VALUES(?,?,?,?)').run(companyId, orgId, companyCode, companyName)
      db.prepare('INSERT INTO users(id,organization_id,username,display_name,password_hash) VALUES(?,?,?,?,?)').run(userId, orgId, adminUsername, adminDisplayName, passwordHash)
      const roles = installRoles(orgId)
      grant(orgId, userId, roles.get('organization-admin')!, 'organization')
      grant(orgId, userId, roles.get('company-admin')!, 'company', companyId)
      audit({ organizationId: orgId, actorId: userId, action: 'organization.bootstrap', subjectType: 'organization', subjectId: orgId })
      return { organization: { id: orgId, slug, name }, company: { id: companyId, code: companyCode, name: companyName }, administrator: { id: userId, username: adminUsername, displayName: adminDisplayName } }
    })
  }
  return Object.freeze({ bootstrapOrganization })
}
