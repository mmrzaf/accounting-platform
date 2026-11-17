/** There are no organization-wide or per-record roles; all permissions belong to one company. */
export const PERMISSIONS = {
  'company.read': true, 'company.manage': true,
  'users.read': true, 'users.manage': true, 'roles.manage': true, 'audit.read': true,
  'ai.configure': true, 'ai.use': true, 'ai.execute': true, 'ai.policy': true,
  'accounting.read': true, 'accounting.post': true, 'accounting.configure': true,
  'accounting.reverse': true, 'accounting.close': true,
  'contacts.read': true, 'contacts.manage': true,
  'sales.read': true, 'sales.manage': true, 'purchasing.read': true, 'purchasing.manage': true,
  'payments.read': true, 'payments.manage': true,
  'tax.read': true, 'tax.manage': true,
  'inventory.read': true, 'inventory.manage': true,
  'documents.read': true, 'documents.manage': true,
} as const
export type Permission = keyof typeof PERMISSIONS
const all = Object.keys(PERMISSIONS) as Permission[]
export const SYSTEM_ROLES = [
  { code: 'company-admin', name: 'Administrator', permissions: all },
  { code: 'company-accountant', name: 'Accountant', permissions: [
    'company.read','users.read','ai.use','ai.execute','accounting.read','accounting.post',
    'accounting.configure','accounting.reverse','accounting.close','contacts.read','sales.read',
    'purchasing.read','payments.read','payments.manage','tax.read','tax.manage',
    'inventory.read','documents.read'] },
  { code: 'company-reader', name: 'Read-only', permissions: [
    'company.read','ai.use','accounting.read','contacts.read','sales.read','purchasing.read',
    'payments.read','tax.read','inventory.read','documents.read'] },
  { code: 'company-operator', name: 'Operations', permissions: [
    'company.read','ai.use','ai.execute','contacts.read','contacts.manage','sales.read','sales.manage',
    'purchasing.read','purchasing.manage','payments.read','tax.read',
    'inventory.read','inventory.manage','documents.read','documents.manage'] },
] as const satisfies readonly { code: string; name: string; permissions: readonly Permission[] }[]
