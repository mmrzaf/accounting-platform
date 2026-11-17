export type AiErrorCode = 'INVALID_INPUT' | 'CONFIGURATION_REQUIRED' | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_RESPONSE_INVALID' | 'CONFLICT' | 'INVALID_STATE' | 'RATE_LIMITED'
/** These messages may cross the HTTP boundary: never include keys, URLs with credentials, or provider bodies. */
export class AiError extends Error {
  readonly code: AiErrorCode
  constructor(code: AiErrorCode, message: string) { super(message); this.name = 'AiError'; this.code = code }
}
export const aiError = (code: AiErrorCode, message: string): never => { throw new AiError(code, message) }
