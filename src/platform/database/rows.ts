import type { SQLOutputValue } from 'node:sqlite'

/**
 * All SQL projections are bound at the infrastructure edge. The caller must
 * declare the projected shape; SQLite foreign keys and constraints are still
 * responsible for the stored data invariants. Replace with schema decoders or
 * Drizzle's inferred projections when production persistence is integrated.
 */
export function rowAs<T extends object>(value: Record<string, SQLOutputValue> | undefined): T | undefined {
  return value as unknown as T | undefined
}

export function rowsAs<T extends object>(value: Record<string, SQLOutputValue>[]): T[] {
  return value as unknown as T[]
}
