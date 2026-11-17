-- Company-scoped first-release extensions. Financial truth stays in posted journal lines.
INSERT INTO permission_definitions(code,scope,description) VALUES
 ('tax.read','company','Read company tax-code schedule'),
 ('tax.manage','company','Configure dated company tax codes'),
 ('inventory.read','company','Read company stock catalogue and movements'),
 ('inventory.manage','company','Manage company stock movements and items'),
 ('documents.read','company','Read company attachments'),
 ('documents.manage','company','Upload and manage company attachments');
INSERT INTO role_permissions(organization_id,role_id,scope,permission_code)
 SELECT r.organization_id,r.id,'company',p.code FROM roles r
 JOIN permission_definitions p ON p.code IN ('tax.read','tax.manage','inventory.read','inventory.manage','documents.read','documents.manage')
 WHERE r.scope='company' AND r.system_role=1 AND (
 (r.code='company-admin') OR
 (r.code='company-accountant' AND p.code IN ('tax.read','tax.manage','inventory.read','documents.read')) OR
 (r.code='company-reader' AND p.code IN ('tax.read','inventory.read','documents.read')) OR
 (r.code='company-operator' AND p.code IN ('tax.read','inventory.read','inventory.manage','documents.read','documents.manage')));

-- Tax schedules are append-only; invoice tax calculations are not yet wired into trade invoices.
CREATE TABLE tax_code_versions (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, company_id TEXT NOT NULL,
 code TEXT NOT NULL CHECK(length(code) BETWEEN 1 AND 32),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
 effective_on TEXT NOT NULL CHECK(length(effective_on)=10 AND effective_on GLOB '????-??-??'),
 rate_ppm INTEGER NOT NULL CHECK(rate_ppm BETWEEN 0 AND 1000000),
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(organization_id,company_id,code,effective_on),
 UNIQUE(organization_id,company_id,id),
 FOREIGN KEY(organization_id,company_id) REFERENCES companies(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,created_by) REFERENCES users(organization_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX tax_codes_for_date ON tax_code_versions(organization_id,company_id,code,effective_on DESC);
CREATE TRIGGER tax_code_no_update BEFORE UPDATE ON tax_code_versions BEGIN SELECT RAISE(ABORT,'Tax schedule is append-only'); END;
CREATE TRIGGER tax_code_no_delete BEFORE DELETE ON tax_code_versions BEGIN SELECT RAISE(ABORT,'Tax schedule is append-only'); END;

