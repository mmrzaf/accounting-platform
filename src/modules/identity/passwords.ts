import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'

import { passwordValue } from './validation.ts'

// Native scrypt options are preserved in both hashing and verification.
const scrypt = (password: string, salt: Buffer, length: number): Promise<Buffer> =>
  new Promise((resolve, reject) => scryptCallback(password, salt, length, COST, (error, key) => {
    if (error) reject(error)
    else resolve(key)
  }))
const COST = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const LENGTH = 64

export async function hashPassword(password: string): Promise<string> {
  passwordValue(password)
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, LENGTH)
  return `scrypt$v1$${COST.N}$${COST.r}$${COST.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

export async function verifyPassword(password: unknown, encoded: string): Promise<boolean> {
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 1024) return false
  const fields = encoded?.split('$') ?? []
  if (fields.length !== 7 || fields[0] !== 'scrypt' || fields[1] !== 'v1') return false
  const [n, r, p] = fields.slice(2, 5).map(Number)
  if (n !== COST.N || r !== COST.r || p !== COST.p) return false
  const salt = Buffer.from(fields[5]!, 'base64url')
  const expected = Buffer.from(fields[6]!, 'base64url')
  // Reject corrupted or unsupported hashes before running the expensive KDF.
  if (salt.length !== 16 || expected.length !== LENGTH) return false
  const actual = await scrypt(password, salt, LENGTH)
  return timingSafeEqual(actual, expected)
}
