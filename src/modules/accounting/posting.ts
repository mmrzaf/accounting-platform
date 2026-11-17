import { createHash, randomUUID } from 'node:crypto'
import { rowAs, rowsAs } from '../../platform/database/rows.ts'
import { AccountingError, closed, conflict, invalid, missing } from './errors.ts'
import { MAX_SQLITE_INTEGER, convertedMinorUnits, currencyCode, minorUnits, positiveMinorUnits, positiveRatePart } from './money.ts'
import { dateOnly, key, optionalText, text, uuid } from './validation.ts'
import type { AccountingContext, AccountRow, PeriodRow } from './context.ts'
import type { Actor } from '../identity/types.ts'
import type { JournalLineInput, PostJournalInput, ReverseJournalInput } from './types.ts'
interface JournalRow {
  id: string
  company_id: string
  period_id: string
  posted_on: string
  source_type: string
  source_id: string
  source_event: string
  idempotency_key: string
  fingerprint: string
  description: string
  status: string
  reverses_id: string | null
  base_currency: string
  posted_by: string
  posted_at: string
}
export interface StoredLine {
  id: string
  line_no: number
  account_id: string
  debit_minor: bigint
  credit_minor: bigint
  currency: string
  transaction_minor: bigint
  rate_numerator: string | null
  rate_denominator: string | null
  rate_date: string | null
  rate_source: string | null
  memo: string | null
}
interface PreparedLine {
  accountId: string
  debit: bigint
  credit: bigint
  currency: string
  transaction: bigint
  rateNumerator: string | null
  rateDenominator: string | null
  rateDate: string | null
  rateSource: string | null
  memo: string | null
}
function decodeLines(lines: unknown): JournalLineInput[] {
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > 200)
    return invalid('A journal requires 2–200 lines')
  return lines as JournalLineInput[]
}
function encodeFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
/** Explicit transaction boundary. No model/HTTP calls or background IO while holding the lock. */
export function createPostingService(ctx: AccountingContext) {
  const { db, transaction, actorFor, bookFor, audit } = ctx
  const loadEntry = (actor: Actor, companyId: string, id: string): JournalRow | undefined => {
    if (actor.companyId !== companyId) return missing()
    return rowAs<JournalRow>(db.prepare('SELECT * FROM journal_entries WHERE id=? AND company_id=? AND status=?').get(id, actor.companyId, 'posted'))
  }
  const loadLines = (actor: Actor, companyId: string, id: string): StoredLine[] => {
    if (actor.companyId !== companyId) return missing()
    const stmt = db.prepare(`SELECT id,line_no,account_id,debit_minor,credit_minor,currency,transaction_minor,
   rate_numerator,rate_denominator,rate_date,rate_source,memo FROM journal_lines
   WHERE company_id=? AND journal_id=? ORDER BY line_no`)
    stmt.setReadBigInts(true)
    return rowsAs<StoredLine>(stmt.all(actor.companyId, id))
  }
  const canonical = (entry: JournalRow, lines: StoredLine[]) => ({
    id: entry.id, companyId: entry.company_id, periodId: entry.period_id, date: entry.posted_on,
    sourceType: entry.source_type, sourceId: entry.source_id, sourceEvent: entry.source_event,
    description: entry.description, reversesId: entry.reverses_id, baseCurrency: entry.base_currency,
    postedBy: entry.posted_by, postedAt: entry.posted_at,
    lines: lines.map(line => ({ accountId: line.account_id, debitMinor: line.debit_minor.toString(), creditMinor: line.credit_minor.toString(),
      currency: line.currency, transactionMinor: line.transaction_minor.toString(),
      rate: line.rate_numerator === null ? null : { numerator: line.rate_numerator, denominator: line.rate_denominator, date: line.rate_date, source: line.rate_source },
      memo: line.memo }))
  })
  const requirePeriod = (actor: Actor, companyId: string, date: string): PeriodRow => {
    if (actor.companyId !== companyId) return missing()
    const period = rowAs<PeriodRow>(db.prepare('SELECT id,code,starts_on,ends_on,status FROM fiscal_periods WHERE company_id=? AND starts_on<=? AND ends_on>=?').get(actor.companyId, date, date))
    if (!period)
      return invalid('Posting date has no configured fiscal period')
    if (period.status !== 'open')
      return closed()
    return period
  }
  const byIdempotency = (actor: Actor, companyId: string, idempotencyKey: string, fingerprint: string): ReturnType<typeof canonical> | null => {
    const existing = rowAs<JournalRow>(db.prepare('SELECT * FROM journal_entries WHERE company_id=? AND idempotency_key=?').get(actor.companyId, idempotencyKey))
    if (!existing)
      return null
    if (existing.fingerprint !== fingerprint || existing.status !== 'posted')
      return conflict('Idempotency key has already been used for another operation')
    return canonical(existing, loadLines(actor, companyId, existing.id))
  }
  const insertEntry = (actor: Actor, companyId: string, entry: {
    id: string
    periodId: string
    date: string
    sourceType: string
    sourceId: string
    sourceEvent: string
    idempotencyKey: string
    fingerprint: string
    description: string
    reversesId: string | null
    baseCurrency: string
  }, lines: PreparedLine[]) => {
    db.prepare(`INSERT INTO journal_entries(id,company_id,period_id,posted_on,source_type,source_id,source_event,idempotency_key,fingerprint,description,reverses_id,base_currency,posted_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(entry.id, companyId, entry.periodId, entry.date, entry.sourceType, entry.sourceId, entry.sourceEvent, entry.idempotencyKey, entry.fingerprint, entry.description, entry.reversesId, entry.baseCurrency, actor.userId)
    const insert = db.prepare(`INSERT INTO journal_lines(id,journal_id,company_id,line_no,account_id,debit_minor,credit_minor,currency,transaction_minor,rate_numerator,rate_denominator,rate_date,rate_source,memo) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      insert.run(randomUUID(), entry.id, companyId, i + 1, line.accountId, line.debit, line.credit, line.currency, line.transaction, line.rateNumerator, line.rateDenominator, line.rateDate, line.rateSource, line.memo)
    }
    // SQLite posting trigger uses exact bigint_total, not lossy SUM or TOTAL.
    db.prepare('UPDATE journal_entries SET status=? WHERE id=? AND status=?').run('posted', entry.id, 'staging')
    audit(actor, companyId, entry.reversesId ? 'accounting.journal.reverse' : 'accounting.journal.post', 'journal_entry', entry.id, { sourceType: entry.sourceType, sourceId: entry.sourceId, sourceEvent: entry.sourceEvent })
    const result = loadEntry(actor, companyId, entry.id)
    if (!result)
      throw new Error('Journal post invariant failed')
    return canonical(result, loadLines(actor, companyId, entry.id))
  }
  /** Trusted business document services compose posting inside their OWN BEGIN IMMEDIATE transaction. */
  function postWithinTransaction(input: PostJournalInput, options: { allowDocumentSource?: boolean } = {}) {
    if (!db.isTransaction)
      return invalid('Posting requires an active database transaction')
    const actor = actorFor(input, 'accounting.post')
    const book = bookFor(actor, input.companyId)
    const postedOn = dateOnly(input.date), sourceType = key(input.sourceType, 'sourceType'), sourceId = key(input.sourceId, 'sourceId')
    const sourceEvent = key(input.sourceEvent, 'sourceEvent'), idempotencyKey = key(input.idempotencyKey, 'idempotencyKey')
    if (sourceType === 'reversal')
      return invalid('Reversals must use the dedicated reverseJournal operation')
    if (sourceType.startsWith('trade.') && !options.allowDocumentSource)
      return invalid('Source documents must post through their owning business service')
    const description = text(input.description, 'Description', 500)
    const lineInputs = decodeLines(input.lines)
    const prepared: PreparedLine[] = lineInputs.map((line, index) => {
      if (!line || typeof line !== 'object')
        return invalid(`Invalid line ${index + 1}`)
      const accountId = uuid(line.accountId, 'accountId')
      const debit = minorUnits(line.debitMinor, 'debitMinor'), credit = minorUnits(line.creditMinor, 'creditMinor')
      if ((debit > 0n) === (credit > 0n))
        return invalid('Exactly one of debitMinor or creditMinor must be positive')
      const memo = optionalText(line.memo, 'Line memo')
      const baseAmount = debit + credit
      if (line.foreign === undefined)
        return { accountId, debit, credit, memo, currency: book.base_currency, transaction: baseAmount, rateNumerator: null, rateDenominator: null, rateDate: null, rateSource: null }
      const foreign = line.foreign
      if (!foreign || typeof foreign !== 'object')
        return invalid('Invalid foreign amount')
      const currency = currencyCode(foreign.currency)
      if (currency === book.base_currency)
        return invalid('Foreign currency must differ from accounting base currency')
      const transaction = positiveMinorUnits(foreign.amountMinor, 'foreign.amountMinor')
      if (!foreign.rate || typeof foreign.rate !== 'object')
        return invalid('Missing FX snapshot')
      const numerator = positiveRatePart(foreign.rate.numerator, 'FX numerator')
      const denominator = positiveRatePart(foreign.rate.denominator, 'FX denominator')
      const rateDate = dateOnly(foreign.rate.date, 'FX rate date')
      const rateSource = text(foreign.rate.source, 'FX rate source', 160)
      if (convertedMinorUnits(transaction, numerator, denominator) !== baseAmount)
        return invalid('Foreign conversion does not match base minor-unit amount')
      return { accountId, debit, credit, memo, currency, transaction, rateNumerator: numerator.toString(), rateDenominator: denominator.toString(), rateDate, rateSource }
    })
    const fingerprint = encodeFingerprint({ postedOn, sourceType, sourceId, sourceEvent, description, lines: prepared.map(line => ({
        ...line, debit: line.debit.toString(), credit: line.credit.toString(), transaction: line.transaction.toString()
      })) })
    const prior = byIdempotency(actor, input.companyId, idempotencyKey, fingerprint)
    if (prior)
      return { ...prior, replayed: true }
    const sourceAlready = db.prepare('SELECT 1 FROM journal_entries WHERE company_id=? AND source_type=? AND source_id=? AND source_event=?').get(actor.companyId, sourceType, sourceId, sourceEvent)
    if (sourceAlready)
      return conflict('Source accounting event has already been posted')
    const period = requirePeriod(actor, input.companyId, postedOn)
    const cache = new Map<string, AccountRow>()
    let debits = 0n, credits = 0n
    for (const line of prepared) {
      let account = cache.get(line.accountId)
      if (!account) {
        account = rowAs<AccountRow>(db.prepare('SELECT id,code,name,category,postable,active,parent_id FROM ledger_accounts WHERE id=? AND company_id=?').get(line.accountId, actor.companyId))
        if (!account)
          return missing()
        cache.set(line.accountId, account)
      }
      if (!account.active || !account.postable)
        return invalid('Journal line account must be active and postable')
      if (!db.prepare('SELECT 1 FROM accounting_currencies WHERE company_id=? AND code=?').get(actor.companyId, line.currency))
        return invalid('Transaction currency is not registered for this company')
      debits += line.debit
      credits += line.credit
    }
    if (debits !== credits)
      throw new AccountingError('UNBALANCED', 'Journal debits and credits must balance exactly')
    if (debits === 0n || debits > MAX_SQLITE_INTEGER * BigInt(prepared.length))
      return invalid('Invalid journal total')
    const result = insertEntry(actor, input.companyId, { id: randomUUID(), periodId: period.id, date: postedOn, sourceType, sourceId, sourceEvent, idempotencyKey,
      fingerprint, description, reversesId: null, baseCurrency: book.base_currency }, prepared)
    return { ...result, replayed: false }
  }
  function postJournal(input: PostJournalInput) { return transaction(db, () => postWithinTransaction(input)); }
  function getJournal(input: {
    sessionToken: string
    companyId: string
    journalId: string
  }) {
    const actor = actorFor(input, 'accounting.read')
    uuid(input.journalId, 'journalId')
    const journal = loadEntry(actor, input.companyId, input.journalId)
    if (!journal)
      return missing()
    return canonical(journal, loadLines(actor, input.companyId, journal.id))
  }
  function reverseWithinTransaction(input: ReverseJournalInput, options: { allowDocumentSource?: boolean } = {}) {
    if (!db.isTransaction) return invalid('Reversal requires an active database transaction')
    const journalId = uuid(input.journalId, 'journalId'), date = dateOnly(input.date)
    const idempotencyKey = key(input.idempotencyKey, 'idempotencyKey'), reason = text(input.reason, 'Reason', 500)
    const actor = actorFor(input, 'accounting.reverse')
    const book = bookFor(actor, input.companyId)
    const original = loadEntry(actor, input.companyId, journalId)
    if (!original)
      return missing()
    if (original.source_type.startsWith('trade.') && !options.allowDocumentSource)
      return invalid('Reverse business documents using their originating application service')
    if (original.reverses_id !== null)
      return invalid('Reversing a reversal requires an explicit adjustment entry')
    const fingerprint = encodeFingerprint({ journalId, date, reason })
    const prior = byIdempotency(actor, input.companyId, idempotencyKey, fingerprint)
    if (prior)
      return { ...prior, replayed: true }
    if (db.prepare('SELECT 1 FROM journal_entries WHERE company_id=? AND reverses_id=?').get(actor.companyId, journalId))
      return conflict('Journal already reversed')
    const period = requirePeriod(actor, input.companyId, date)
    const originalLines = loadLines(actor, input.companyId, journalId)
    const lines = originalLines.map(line => ({ accountId: line.account_id, debit: line.credit_minor, credit: line.debit_minor,
      currency: line.currency, transaction: line.transaction_minor, rateNumerator: line.rate_numerator,
      rateDenominator: line.rate_denominator, rateDate: line.rate_date, rateSource: line.rate_source, memo: line.memo }))
    const result = insertEntry(actor, input.companyId, { id: randomUUID(), periodId: period.id, date, sourceType: 'reversal', sourceId: journalId,
      sourceEvent: 'reverse', idempotencyKey, fingerprint, description: reason, reversesId: journalId, baseCurrency: book.base_currency }, lines)
    return { ...result, replayed: false }
  }
  function reverseJournal(input: ReverseJournalInput) {
    return transaction(db, () => reverseWithinTransaction(input))
  }
  return Object.freeze({ postJournal, postWithinTransaction, getJournal, reverseJournal, reverseWithinTransaction })
}
