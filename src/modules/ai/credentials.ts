import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { aiError } from './errors.ts'
/** Requires a random 32-byte operator-managed master key, never derived from an account password. */
export function validateMasterKey(key: Uint8Array): Buffer {
  if (!(key instanceof Uint8Array) || key.byteLength !== 32) return aiError('INVALID_INPUT', 'AI encryption master key must contain 32 bytes')
  return Buffer.from(key)
}
export function encryptApiKey(secret: string, key: Buffer, companyId: string): string {
  if (typeof secret !== 'string' || secret.length < 1 || secret.length > 4096) return aiError('INVALID_INPUT', 'Invalid API key')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(companyId))
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`
}
export function decryptApiKey(stored: string, key: Buffer, companyId: string): string {
  try {
    const parts = stored.split(':')
    if (parts.length !== 4 || parts[0] !== 'v1' || !parts[1] || !parts[2] || !parts[3]) throw Error('invalid envelope')
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64url'))
    decipher.setAAD(Buffer.from(companyId))
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8')
  } catch { return aiError('CONFIGURATION_REQUIRED', 'AI credential cannot be decrypted; check the master key') }
}
