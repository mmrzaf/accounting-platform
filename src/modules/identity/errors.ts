export type IdentityErrorCode = 'VALIDATION_FAILED' | 'NOT_AUTHENTICATED' | 'PERMISSION_DENIED' | 'NOT_FOUND' | 'CONFLICT'
export class IdentityError extends Error {
  readonly code: IdentityErrorCode
  constructor(code: IdentityErrorCode, message: string) {
    super(message)
    this.name = 'IdentityError'
    this.code = code
  }
}

export const invalid = (message: string = 'Invalid input') => new IdentityError('VALIDATION_FAILED', message)
export const unauthenticated = () => new IdentityError('NOT_AUTHENTICATED', 'Authentication required')
export const forbidden = () => new IdentityError('PERMISSION_DENIED', 'Permission denied')
export const conflict = (message: string = 'Conflict') => new IdentityError('CONFLICT', message)
export const missing = () => new IdentityError('NOT_FOUND', 'Not found')
