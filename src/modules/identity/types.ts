/** Public service contracts: the company is the sole security and accounting boundary. */
export type RecordStatus = 'active' | 'disabled'
export interface UserRow {
  id: string; company_id: string; username: string; display_name: string;
  status: RecordStatus; password_hash: string; auth_version: number
}
export interface CompanyRow { id: string; name: string; status: RecordStatus }
export interface Actor {
  sessionId: string; companyId: string; userId: string; username: string;
  displayName: string; csrfToken: string
}
export interface AuditEvent {
  companyId: string; action: string; subjectType: string;
  actorId?: string | null; subjectId?: string | null;
  outcome?: 'success' | 'failure'; details?: Record<string, string | number | boolean | null>
}
export interface BootstrapInput {
  name: string; adminUsername: string; adminDisplayName: string; password: string
}
export interface LoginInput { username: string; password: string }
export interface AuthInput { sessionToken: string }
export interface UserIdInput extends AuthInput { userId: string }
export interface RoleIdInput extends AuthInput { roleId: string }
export interface RoleInput extends AuthInput { code: string; name: string; permissions: string[] }
