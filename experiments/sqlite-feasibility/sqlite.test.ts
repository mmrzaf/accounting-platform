import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { backup } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeProbe, openProbeDatabase, postProbeJournal } from './probe-helpers.ts';

function fixture(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), 'accounting-feasibility-'));
  const file = join(dir, 'probe.sqlite');
  const db = openProbeDatabase(file);
  initializeProbe(db);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return { db, file, dir };
}

const command = Object.freeze({ organizationId: 'org-a', companyId: 'co-a', documentId: 'purchase', eventId: 'purchase-posted', idempotencyKey: 'request-1', amount: 50000000000n });

test('FK enforcement, WAL, basic SQLite integrity', (t) => {
  const { db } = fixture(t);
  assert.equal(db.prepare('PRAGMA foreign_keys').get()!['foreign_keys'], 1);
  assert.equal(db.prepare('PRAGMA journal_mode = WAL').get()!['journal_mode'], 'wal');
  assert.equal(db.prepare('PRAGMA integrity_check').get()!['integrity_check'], 'ok');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
});

test('foreign keys block cross-organization and cross-company references', (t) => {
  const { db } = fixture(t);
  assert.throws(() => db.prepare('INSERT INTO documents VALUES (?, ?, ?, ?)').run('org-b', 'co-a', 'injected', 'draft'), /constraint|FOREIGN KEY/i);
  assert.throws(() => db.prepare('INSERT INTO accounts VALUES (?, ?, ?, ?)').run('org-a', 'co-c', 'injected', 'X'), /constraint|FOREIGN KEY/i);
  const result = postProbeJournal(db, command);
  assert.throws(() => db.prepare(`INSERT INTO journal_lines
    (organization_id,company_id,journal_id,line_number,account_id,debit_minor,credit_minor)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run('org-b', 'co-c', result.id, 3, 'cash', 100n, 0n), /constraint|FOREIGN KEY/i);
  assert.throws(() => db.prepare(`INSERT INTO journal_lines
    (organization_id,company_id,journal_id,line_number,account_id,debit_minor,credit_minor)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run('org-a', 'co-b', result.id, 3, 'cash', 100n, 0n), /constraint|FOREIGN KEY/i);
});

test('journal posting is atomic and retrying same request is idempotent', (t) => {
  const { db } = fixture(t);
  assert.throws(() => postProbeJournal(db, { ...command, failAfterJournal: true }), /Simulated/);
  assert.equal(db.prepare('SELECT count(*) AS count FROM journals').get()!['count'], 0);
  assert.equal(db.prepare("SELECT state FROM documents WHERE organization_id='org-a' AND company_id='co-a'").get()!['state'], 'draft');
  const first = postProbeJournal(db, command);
  const second = postProbeJournal(db, command);
  assert.equal(first.id, second.id);
  assert.equal(second.replayed, true);
  assert.equal(db.prepare('SELECT count(*) AS count FROM journals').get()!['count'], 1);
  assert.equal(db.prepare('SELECT count(*) AS count FROM journal_lines').get()!['count'], 2);
  assert.equal(db.prepare("SELECT state FROM documents WHERE organization_id='org-a' AND company_id='co-a'").get()!['state'], 'posted');
  assert.throws(() => postProbeJournal(db, { ...command, amount: 5n }), /Idempotency key reused/);
  assert.throws(() => postProbeJournal(db, { ...command, idempotencyKey: 'different-key' }), /Not an unposted document/);
});

test('signed 64-bit amounts must be read as BigInt; reject out-of-range input', (t) => {
  const { db } = fixture(t);
  const amount = 9007199254740993n; // > Number.MAX_SAFE_INTEGER
  const posted = postProbeJournal(db, { ...command, amount });
  const stmt = db.prepare('SELECT debit_minor FROM journal_lines WHERE journal_id=? AND line_number=1');
  stmt.setReadBigInts(true);
  assert.equal(stmt.get(posted.id)!['debit_minor'], amount);
  assert.throws(() => postProbeJournal(db, { ...command, idempotencyKey: 'out-of-range', amount: 9223372036854775808n }), /Invalid signed 64-bit/);
  assert.throws(() => db.prepare('SELECT SUM(x) FROM (SELECT 9223372036854775807 AS x UNION ALL SELECT 1 AS x)').get(), /integer overflow/i);
});

test('second writer cannot enter while first write transaction is held', (t) => {
  const { db, file } = fixture(t);
  db.exec('PRAGMA journal_mode = WAL');
  const other = openProbeDatabase(file, { timeout: 25 });
  t.after(() => other.close());
  other.exec('PRAGMA busy_timeout = 25');
  db.exec('BEGIN IMMEDIATE');
  try {
    assert.throws(() => other.exec('BEGIN IMMEDIATE'), /database is locked|SQLITE_BUSY/i);
  } finally {
    db.exec('ROLLBACK');
  }
  other.exec('BEGIN IMMEDIATE');
  other.exec('ROLLBACK');
});

test('online backup yields a self-consistent and readable snapshot', async (t) => {
  const { db, dir } = fixture(t);
  db.exec('PRAGMA journal_mode = WAL');
  postProbeJournal(db, command);
  const dest = join(dir, 'snapshot.sqlite');
  await backup(db, dest);
  const snapshot = openProbeDatabase(dest);
  try {
    assert.equal(snapshot.prepare('PRAGMA integrity_check').get()!['integrity_check'], 'ok');
    assert.equal(snapshot.prepare('PRAGMA foreign_key_check').all().length, 0);
    assert.equal(snapshot.prepare('SELECT count(*) AS count FROM journals').get()!['count'], 1);
    assert.equal(snapshot.prepare("SELECT state FROM documents WHERE organization_id='org-a' AND company_id='co-a'").get()!['state'], 'posted');
  } finally {
    snapshot.close();
  }
});
