# Company, users and roles

- **Company:** Sole isolation and accounting boundary. Created through trusted local bootstrap. Company settings are manageable by authorized users but companies are never switched in the interface.
- **User:** Belongs to exactly one company for life. `users.company_id` is not editable, including via direct SQL. Username is globally unique (case-insensitive), so sign-in needs only username/password.
- **Session:** An opaque token stored hashed in SQLite, bound to one user and one company. Disabling users or changing passwords invalidates sessions.
- **Role:** A company-owned collection of named permissions. Users may have multiple roles; all effective permissions derive only from their assigned company roles. No direct user-specific grants or separate scope selectors.

All accounting books, journals, payments, invoices, contacts, attachments and AI settings belong to one company. Database composite FKs and scoped queries prevent cross-company references. All financial mutations use the authorized application services, not direct request-owned company IDs. No public registration.

