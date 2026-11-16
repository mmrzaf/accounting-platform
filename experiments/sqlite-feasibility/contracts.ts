/** PHASE 1 type-checking spike only. Not application source code. */

type Brand<T, Name extends string> = T & { readonly __brand: Name };
export type OrganizationId = Brand<string, 'OrganizationId'>;
export type CompanyId = Brand<string, 'CompanyId'>;
export type MinorUnits = Brand<bigint, 'MinorUnits'>;
export type CurrencyCode = Brand<string, 'CurrencyCode'>;

export interface CompanyScope {
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
}

export interface PostInvoiceCommand extends CompanyScope {
  readonly invoiceId: string;
  readonly idempotencyKey: string;
  readonly currency: CurrencyCode;
  readonly amountMinor: MinorUnits;
}

export type PostInvoiceResult =
  | { readonly kind: 'posted'; readonly journalId: string }
  | { readonly kind: 'already-posted'; readonly journalId: string }
  | { readonly kind: 'requires-confirmation'; readonly proposalId: string };

// Compile-time guard examples (runtime validation remains mandatory).
declare const organizationId: OrganizationId;
declare const companyId: CompanyId;
declare const money: MinorUnits;
declare const currency: CurrencyCode;
const command: PostInvoiceCommand = {
  organizationId, companyId, amountMinor: money, currency,
  invoiceId: 'invoice-1', idempotencyKey: 'request-1',
};
void command;

// @ts-expect-error Amounts cannot be ordinary floating-point numbers.
const invalidAmount: MinorUnits = 123.45;
void invalidAmount;

// @ts-expect-error Company identifiers cannot replace organization identifiers.
const invalidOrganization: OrganizationId = companyId;
void invalidOrganization;
