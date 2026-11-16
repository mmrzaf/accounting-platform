import { randomUUID } from 'node:crypto'
import { rowAs, rowsAs } from '../../platform/database/rows.ts'
import { code, requiredString } from './validation.ts'
import { conflict, missing } from './errors.ts'
import { publicCompany } from './presenters.ts'
import type { CompanyRow, AuthInput } from './types.ts'
import type { IdentityContext } from './context.ts'

/** Scoped application use cases; no direct framework or HTTP dependency. */
export function createCompanyService(ctx: IdentityContext) {
  const { db, audit, grant, transaction, requireActor, currentSession } = ctx
  function createCompany({ sessionToken, code: companyCode, name }: AuthInput & { code: string; name: string }) {
    companyCode = code(companyCode, 'Company code')
    name = requiredString(name, 'Company name')
    return transaction(db, () => {
      const actor = requireActor(sessionToken, 'companies.manage')
      if (db.prepare('SELECT 1 FROM companies WHERE organization_id=? AND code=?').get(actor.organizationId, companyCode)) throw conflict('Company code already exists')
      const id = randomUUID()
      db.prepare('INSERT INTO companies(id,organization_id,code,name) VALUES(?,?,?,?)').run(id, actor.organizationId, companyCode, name)
      // A creator with organization authority receives access to the new company without another setup step.
      const ownerRole = rowAs<{ id: string }>(db.prepare("SELECT id FROM roles WHERE organization_id=? AND code='company-admin' AND scope='company'").get(actor.organizationId))
      if (!ownerRole) throw missing()
      grant(actor.organizationId, actor.userId, ownerRole.id, 'company', id)
      audit({ organizationId: actor.organizationId, companyId: id, actorId: actor.userId, action: 'company.create', subjectType: 'company', subjectId: id })
      return { id, organizationId: actor.organizationId, code: companyCode, name, status: 'active' }
    })
  }
  function listCompanies({ sessionToken }: AuthInput) {
    const actor = currentSession(sessionToken)
    const all = rowsAs<CompanyRow>(db.prepare(`SELECT c.* FROM companies c WHERE c.organization_id=? AND c.status='active'
      AND (EXISTS (SELECT 1 FROM user_role_assignments a JOIN role_permissions p ON p.role_id=a.role_id AND p.organization_id=a.organization_id
        WHERE a.organization_id=c.organization_id AND a.user_id=? AND a.scope='organization' AND p.permission_code='companies.read')
      OR EXISTS (SELECT 1 FROM user_role_assignments a JOIN role_permissions p ON p.role_id=a.role_id AND p.organization_id=a.organization_id
        WHERE a.organization_id=c.organization_id AND a.user_id=? AND a.scope='company' AND a.company_id=c.id AND p.permission_code='company.read')) ORDER BY c.code`)
      .all(actor.organizationId, actor.userId, actor.userId))
    return all.map(publicCompany)
  }
  return Object.freeze({ createCompany, listCompanies })
}
