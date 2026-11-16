/** Public application-service contracts. Inputs are checked again at the trust boundary. */
export type RecordStatus = 'active' | 'disabled'
export interface UserRow {
  id: string; organization_id: string; username: string; display_name: string;
  status: RecordStatus; password_hash: string; auth_version: number
}
export interface CompanyRow {
  id: string; organization_id: string; code: string; name: string; status: RecordStatus
}
export interface Actor {
  sessionId: string; organizationId: string; userId: string; username: string;
  displayName: string; csrfToken: string
}
export interface AuditEvent {
  organizationId: string; action: string; subjectType: string;
  companyId?: string | null; actorId?: string | null;
  subjectId?: string | null; outcome?: 'success' | 'failure';
  details?: Record<string, string | number | boolean | null>
}
export interface BootstrapInput {
  slug: string; name: string; adminUsername: string;
  adminDisplayName: string; password: string;
  companyName?: string; companyCode?: string
}
export interface LoginInput { organizationSlug: string; username: string; password: string }
export interface AuthInput { sessionToken: string }
export interface UserIdInput extends AuthInput { userId: string }
export interface RoleIdInput extends AuthInput { roleId: string }
export interface RoleInput extends AuthInput {
  scope: 'organization' | 'company'; code: string; name: string;
  permissions: string[]
}
