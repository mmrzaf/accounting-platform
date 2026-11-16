export interface CompanyAction { sessionToken: string; companyId: string }
export type InvoiceKind = 'sale' | 'purchase'
export type PaymentKind = 'receipt' | 'payment'
export type ItemKind = 'service' | 'non_stock' | 'good'
export interface ContactInput extends CompanyAction {
  displayName: string
  code?: string | null
  requestKey?: string
}
export interface InvoiceLineInput {
  itemKind: ItemKind
  description: string
  /** Quantity in decimal notation, up to three fractional digits. */
  quantity: string
  /** Price per unit in integer base-currency minor units. */
  unitPriceMinor: string
  accountId: string
}
export interface CreateInvoiceInput extends CompanyAction {
  kind: InvoiceKind
  partyId: string
  issuedOn: string
  controlAccountId: string
  description: string
  lines: InvoiceLineInput[]
  requestKey: string
}
export interface ReviseInvoiceInput extends Omit<CreateInvoiceInput, 'requestKey'> {
  invoiceId: string
  expectedRevision: number
}
export interface CreatePaymentInput extends CompanyAction {
  kind: PaymentKind
  partyId: string
  paidOn: string
  controlAccountId: string
  bankAccountId: string
  amountMinor: string
  reference?: string
  description: string
  requestKey: string
}
export interface FinancialMutation extends CompanyAction {
  id: string
}
export interface ReverseDocumentInput extends FinancialMutation {
  reversedOn: string
  reason: string
  requestKey: string
}
export interface AllocatePaymentInput extends CompanyAction {
  invoiceId: string
  paymentId: string
  amountMinor: string
  requestKey: string
}
export interface ReverseAllocationInput extends CompanyAction {
  allocationId: string
  reason: string
  requestKey: string
}
