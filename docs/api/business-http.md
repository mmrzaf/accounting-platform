# Business HTTP contract (initial)

This API is mounted by the local Node HTTP host at `/api/business/*` and is consumed by the React SPA. Responses are JSON; sensitive responses use `Cache-Control: no-store`. Error envelopes contain `{error:{code,message},requestId}`. No user-supplied `sessionToken` is accepted; the cookie is authoritative.

## Authentication

1. POST JSON to `/api/auth/login` with `organizationSlug`, `username`, `password`.
2. Preserve the returned HttpOnly session cookie. Keep the `csrfToken` returned with the login/session response in memory; never put it in a URL.
3. Include the `x-csrf-token` header and correct `Origin` with every state-changing request.
4. Send `companyId` in the query string for business endpoints. This ID is not trusted to authorize access; the service resolves it against the authenticated actor.

## Initial routes

| Method | Path | Required inputs | Effect |
|---|---|---|---|
| GET | `/api/business/contacts` | `companyId` | List organization contacts visible in this company |
| POST | `/api/business/contacts` | `companyId`, body `displayName`, optional `code`, `requestKey` | Create a contact |
| GET | `/api/business/accounts` | `companyId` | Chart of accounts |
| GET | `/api/business/invoices` | `companyId`, `kind=sale\|purchase`, optional `limit` (1–100) | List invoices |
| POST | `/api/business/invoices` | `companyId`, invoice body | Create a draft invoice |
| GET | `/api/business/invoices/:id` | `companyId` | Read invoice |
| POST | `/api/business/invoices/:id/post` | `companyId` | Idempotently post invoice and ledger |
| POST | `/api/business/invoices/:id/reverse` | `companyId`, `reversedOn`, `reason`, `requestKey` | Controlled correction |
| GET | `/api/business/payments` | `companyId`, optional `kind`, `limit` | List payments/receipts |
| POST | `/api/business/payments` | `companyId`, payment body | Create draft receipt/payment |
| GET | `/api/business/payments/:id` | `companyId` | Read payment |
| POST | `/api/business/payments/:id/post` | `companyId` | Post payment |
| POST | `/api/business/payments/:id/reverse` | `companyId`, reversal body | Reverse posted payment |
| GET | `/api/business/allocations` | `companyId`, optional `invoiceId` / `paymentId` | List allocations |
| POST | `/api/business/allocations` | `companyId`, `invoiceId`, `paymentId`, `amountMinor`, `requestKey` | Allocate a posted payment to invoice |
| GET | `/api/business/reports/aging` | `companyId`, `kind=sale\|purchase` | Invoice-age report (not due-date aging) |
| GET | `/api/business/reports/profit-and-loss` | `companyId`, `from`, `through` | Period results |
| GET | `/api/business/reports/balance-sheet` | `companyId` | Financial summary |

Amounts are **exact base-currency minor-unit integer strings**, not locale-formatted Rial/Toman values. Dates are canonical `YYYY-MM-DD`. Invalid IDs and cross-organization records do not disclose protected data. The listing endpoints remain bounded/small-installation oriented; production pagination and a human-friendly interface are future work.

### Example draft sales invoice body

```json
{
  "kind": "sale",
  "partyId": "contact-uuid-from-search",
  "issuedOn": "2026-11-17",
  "controlAccountId": "receivables-account-uuid",
  "description": "Service sale",
  "requestKey": "client-generated-unique-command-key",
  "lines": [{
    "itemKind": "service",
    "description": "Engineering service",
    "quantity": "1",
    "unitPriceMinor": "5000000",
    "accountId": "revenue-account-uuid"
  }]
}
```

Posting a draft does not bypass account, period, amount, company, or role checks. The client must distinguish draft vs posted states. This is an API boundary only; no supported general-purpose external integration or public API versioning policy has yet been defined.
