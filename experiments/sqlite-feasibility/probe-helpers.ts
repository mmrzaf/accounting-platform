/**
 * Feasibility helpers only — NOT the accounting engine.
 * No application imports allowed. This exists exclusively to measure SQLite
 * boundaries with Node's built-in driver in a dependency-free environment.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { rowAs, rowsAs } from '../../src/platform/database/rows.ts';

const dirname = fileURLToPath(new URL('.', import.meta.url));
const schema = readFileSync(join(dirname, 'schema.sql'), 'utf8');

export function openProbeDatabase(path: string, options: { timeout?: number } = {}): DatabaseSync {
  const db = new DatabaseSync(path, { timeout: options.timeout ?? 100 });
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 100');
  return db;
}

export function initializeProbe(db: DatabaseSync) {
  db.exec(schema);
  db.prepare('INSERT INTO organizations VALUES (?, ?)').run('org-a', 'First Org');
  db.prepare('INSERT INTO organizations VALUES (?, ?)').run('org-b', 'Other Org');
  for (const [o, c] of [['org-a', 'co-a'], ['org-a', 'co-b'], ['org-b', 'co-c']] as const) {
    db.prepare('INSERT INTO companies VALUES (?, ?, ?)').run(o, c, c);
    db.prepare('INSERT INTO accounts VALUES (?, ?, ?, ?)').run(o, c, 'cash', '100');
    db.prepare('INSERT INTO accounts VALUES (?, ?, ?, ?)').run(o, c, 'payable', '200');
    db.prepare('INSERT INTO documents VALUES (?, ?, ?, ?)').run(o, c, 'purchase', 'draft');
  }
}

/** Test-only transactional journal command with exact integer minor units. */
export function postProbeJournal(db: DatabaseSync, { organizationId, companyId, documentId, eventId, idempotencyKey, amount, failAfterJournal = false }: {
  organizationId: string; companyId: string; documentId: string; eventId: string;
  idempotencyKey: string; amount: bigint; failAfterJournal?: boolean
}) {
  if (typeof amount !== 'bigint' || amount <= 0n || amount > 9223372036854775807n) {
    throw new RangeError('Invalid signed 64-bit monetary amount');
  }
  const fingerprint = createHash('sha256').update(JSON.stringify({ organizationId, companyId, documentId, eventId, amount: amount.toString() })).digest('hex');
  db.exec('BEGIN IMMEDIATE');
  try {
    const prior = rowAs<{ journal_id: string; request_fingerprint: string }>(db.prepare(`SELECT journal_id, request_fingerprint FROM journals
      WHERE organization_id=? AND company_id=? AND idempotency_key=?`)
      .get(organizationId, companyId, idempotencyKey));
    if (prior) {
      if (prior.request_fingerprint !== fingerprint) throw new Error('Idempotency key reused with different payload');
      db.exec('COMMIT');
      return { id: prior.journal_id, replayed: true };
    }
    const doc = rowAs<{ state: string }>(db.prepare(`SELECT state FROM documents WHERE organization_id=? AND company_id=? AND document_id=?`)
      .get(organizationId, companyId, documentId));
    if (!doc || doc.state !== 'draft') throw new Error('Not an unposted document in this scope');
    const id = randomUUID();
    db.prepare(`INSERT INTO journals VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(organizationId, companyId, id, documentId, eventId, idempotencyKey, fingerprint, '2026-11-17T00:00:00.000Z');
    if (failAfterJournal) throw new Error('Simulated mid-transaction failure');
    const insert = db.prepare(`INSERT INTO journal_lines
      (organization_id, company_id, journal_id, line_number, account_id, debit_minor, credit_minor)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    insert.run(organizationId, companyId, id, 1, 'cash', amount, 0n);
    insert.run(organizationId, companyId, id, 2, 'payable', 0n, amount);
    // Node SQLite returns JS numbers by default. Financial code MUST opt into BigInt.
    const exactStmt = db.prepare(`SELECT debit_minor, credit_minor FROM journal_lines
      WHERE organization_id=? AND company_id=? AND journal_id=?`);
    exactStmt.setReadBigInts(true); // mutates statement; does not return the statement
    const totalsExact = rowsAs<{ debit_minor: bigint; credit_minor: bigint }>(exactStmt.all(organizationId, companyId, id));
    const debit = totalsExact.reduce((sum, line) => sum + line.debit_minor, 0n);
    const credit = totalsExact.reduce((sum, line) => sum + line.credit_minor, 0n);
    if (debit !== credit || totalsExact.length < 2) throw new Error('Unbalanced journal');
    const result = db.prepare(`UPDATE documents SET state='posted'
      WHERE organization_id=? AND company_id=? AND document_id=? AND state='draft'`)
      .run(organizationId, companyId, documentId);
    if (result.changes !== 1) throw new Error('State transition failed');
    db.exec('COMMIT');
    return { id, replayed: false };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
