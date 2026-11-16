// Scope is part of permission identity. A company grant never becomes an organization grant.
export const PERMISSIONS = {
  'organizations.read': 'organization',
  'companies.read': 'organization',
  'companies.manage': 'organization',
  'users.read': 'organization',
  'users.manage': 'organization',
  'roles.manage': 'organization',
  'audit.read': 'organization',
  'company.read': 'company',
  'accounting.read': 'company',
  'accounting.post': 'company',
  'accounting.configure': 'company',
  'accounting.reverse': 'company',
  'accounting.close': 'company',
  'contacts.read': 'company',
  'contacts.manage': 'company',
  'sales.read': 'company',
  'sales.manage': 'company',
  'purchasing.read': 'company',
  'purchasing.manage': 'company',
  'payments.read': 'company',
  'payments.manage': 'company',
} as const satisfies Record<string, 'company' | 'organization'>

export type Permission = keyof typeof PERMISSIONS
export type RoleScope = 'company' | 'organization'
const organizationPermissions = (Object.keys(PERMISSIONS) as Permission[]).filter(key => PERMISSIONS[key] === 'organization')
const companyPermissions = (Object.keys(PERMISSIONS) as Permission[]).filter(key => PERMISSIONS[key] === 'company')

export const SYSTEM_ROLES = [
  { code: 'organization-admin', name: 'Organization administrator', scope: 'organization', permissions: organizationPermissions },
  { code: 'company-admin', name: 'Company administrator', scope: 'company', permissions: companyPermissions },
  { code: 'company-accountant', name: 'Company accountant', scope: 'company', permissions: ['company.read', 'accounting.read', 'accounting.post', 'accounting.configure', 'accounting.reverse', 'accounting.close', 'contacts.read', 'sales.read', 'purchasing.read', 'payments.read', 'payments.manage'] },
  { code: 'company-reader', name: 'Company read-only', scope: 'company', permissions: ['company.read', 'accounting.read', 'contacts.read', 'sales.read', 'purchasing.read', 'payments.read'] },
  { code: 'company-operator', name: 'Company operations', scope: 'company', permissions: ['company.read', 'contacts.read', 'contacts.manage', 'sales.read', 'sales.manage', 'purchasing.read', 'purchasing.manage', 'payments.read'] },
] as const satisfies readonly { code: string; name: string; scope: RoleScope; permissions: readonly Permission[] }[]
