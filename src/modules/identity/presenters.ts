import type { CompanyRow, UserRow } from './types.ts'

export const publicUser = (user: UserRow) => ({
  id: user.id, organizationId: user.organization_id, username: user.username,
  displayName: user.display_name, status: user.status,
})
export const publicCompany = (company: CompanyRow) => ({
  id: company.id, organizationId: company.organization_id, code: company.code,
  name: company.name, status: company.status,
})
