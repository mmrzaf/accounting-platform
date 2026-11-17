-- Credit notes are limited to original invoice-line adjustments against unpaid balances.
-- Refunds for already settled invoices require a separate explicit workflow.
CREATE TABLE trade_credit_notes (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, company_id TEXT NOT NULL,
 invoice_id TEXT NOT NULL, invoice_line_id TEXT NOT NULL, account_id TEXT NOT NULL,
 credited_on TEXT NOT NULL CHECK(length(credited_on)=10 AND credited_on GLOB '????-??-??'),
 amount_minor INTEGER NOT NULL CHECK(amount_minor>0), reason TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted','reversed','voided')),
 request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, journal_id TEXT, reversal_journal_id TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(organization_id,company_id,id), UNIQUE(organization_id,company_id,request_key),
 FOREIGN KEY(organization_id,company_id,invoice_id) REFERENCES trade_invoices(organization_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(invoice_line_id) REFERENCES trade_invoice_lines(id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,company_id,account_id) REFERENCES ledger_accounts(organization_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,company_id,journal_id) REFERENCES journal_entries(organization_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,company_id,reversal_journal_id) REFERENCES journal_entries(organization_id,company_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX credit_notes_by_invoice ON trade_credit_notes(organization_id,company_id,invoice_id,status);
CREATE TRIGGER credit_note_immutable BEFORE UPDATE ON trade_credit_notes
 WHEN OLD.status<>'draft' AND (NEW.organization_id<>OLD.organization_id OR NEW.company_id<>OLD.company_id
 OR NEW.invoice_id<>OLD.invoice_id OR NEW.invoice_line_id<>OLD.invoice_line_id OR NEW.account_id<>OLD.account_id
 OR NEW.amount_minor<>OLD.amount_minor OR NEW.credited_on<>OLD.credited_on OR NEW.reason<>OLD.reason
 OR NEW.request_key<>OLD.request_key OR NEW.fingerprint<>OLD.fingerprint OR NEW.journal_id IS NOT OLD.journal_id
 OR (NEW.reversal_journal_id IS NOT OLD.reversal_journal_id AND NOT (OLD.status='posted' AND NEW.status='reversed')))
 BEGIN SELECT RAISE(ABORT,'Credit note is immutable after posting'); END;
CREATE TRIGGER credit_note_status_guard BEFORE UPDATE OF status ON trade_credit_notes
 WHEN NOT ((OLD.status='draft' AND NEW.status IN ('posted','voided')) OR (OLD.status='posted' AND NEW.status='reversed'))
 BEGIN SELECT RAISE(ABORT,'Invalid credit note lifecycle'); END;
CREATE TRIGGER credit_note_post_guard BEFORE UPDATE OF status ON trade_credit_notes
 WHEN NEW.status='posted' AND (NEW.journal_id IS NULL OR NOT EXISTS (
 SELECT 1 FROM journal_entries j WHERE j.id=NEW.journal_id AND j.organization_id=NEW.organization_id
 AND j.company_id=NEW.company_id AND j.status='posted' AND j.source_type='trade.credit_note' AND j.source_id=NEW.id))
 BEGIN SELECT RAISE(ABORT,'Credit note must have a posted source journal'); END;
CREATE TRIGGER credit_note_no_delete BEFORE DELETE ON trade_credit_notes BEGIN SELECT RAISE(ABORT,'Credit notes cannot be deleted'); END;
-- A posted credit cannot exceed its source line or create a negative invoice balance.
CREATE TRIGGER credit_note_line_and_limit_guard AFTER UPDATE OF status ON trade_credit_notes
WHEN NEW.status='posted' AND (
 NOT EXISTS(SELECT 1 FROM trade_invoices i JOIN trade_invoice_lines l ON l.invoice_id=i.id
 WHERE i.id=NEW.invoice_id AND i.organization_id=NEW.organization_id AND i.company_id=NEW.company_id
 AND i.status='posted' AND l.id=NEW.invoice_line_id AND l.account_id=NEW.account_id)
 OR bigint_le((SELECT bigint_total(amount_minor) FROM trade_credit_notes
 WHERE invoice_line_id=NEW.invoice_line_id AND status='posted'),
 (SELECT line_total_minor FROM trade_invoice_lines WHERE id=NEW.invoice_line_id))=0
 OR bigint_le((SELECT bigint_total(amount_minor) FROM trade_credit_notes WHERE invoice_id=NEW.invoice_id AND status='posted'),
 (SELECT total_minor - COALESCE((SELECT SUM(amount_minor) FROM payment_allocations a WHERE a.invoice_id=NEW.invoice_id
 AND NOT EXISTS(SELECT 1 FROM allocation_reversals r WHERE r.allocation_id=a.id)),0)
 FROM trade_invoices WHERE id=NEW.invoice_id))=0)
BEGIN SELECT RAISE(ABORT,'Credit exceeds unallocated source invoice value'); END;
CREATE TRIGGER allocation_credit_limit_guard AFTER INSERT ON payment_allocations
WHEN bigint_le((SELECT bigint_total(a.amount_minor) FROM payment_allocations a WHERE a.invoice_id=NEW.invoice_id
 AND NOT EXISTS (SELECT 1 FROM allocation_reversals r WHERE r.allocation_id=a.id)),
 (SELECT total_minor-COALESCE((SELECT SUM(amount_minor) FROM trade_credit_notes c
 WHERE c.invoice_id=NEW.invoice_id AND c.status='posted'),0) FROM trade_invoices WHERE id=NEW.invoice_id))=0
BEGIN SELECT RAISE(ABORT,'Allocation exceeds remaining credited invoice amount'); END;
CREATE TRIGGER invoice_active_credits_reversal_guard BEFORE UPDATE OF status ON trade_invoices
WHEN NEW.status='reversed' AND EXISTS(SELECT 1 FROM trade_credit_notes WHERE invoice_id=OLD.id AND status='posted')
BEGIN SELECT RAISE(ABORT,'Reverse credit notes before reversing the original invoice'); END;
CREATE TRIGGER credit_note_reversal_guard BEFORE UPDATE OF status ON trade_credit_notes
WHEN NEW.status='reversed' AND (NEW.reversal_journal_id IS NULL OR NOT EXISTS (
 SELECT 1 FROM journal_entries j WHERE j.id=NEW.reversal_journal_id AND j.organization_id=NEW.organization_id
 AND j.company_id=NEW.company_id AND j.status='posted' AND j.reverses_id=OLD.journal_id))
BEGIN SELECT RAISE(ABORT,'Credit note requires a valid reversal journal'); END;
