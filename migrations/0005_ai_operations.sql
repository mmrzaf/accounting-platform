-- AI remains optional: provider secrets, work tracking, and approvals are scoped to an organization/company.
-- No financial mutations are performed by triggers; those are owned by existing application services.
INSERT INTO permission_definitions(code, scope, description) VALUES
 ('ai.configure','organization','Manage organization AI provider credentials'),
 ('ai.use','company','Use the AI assistant with company context'),
 ('ai.execute','company','Authorize AI-initiated routine business mutations'),
 ('ai.policy','company','Configure company AI autonomy policy');

INSERT INTO role_permissions(organization_id,role_id,scope,permission_code)
SELECT r.organization_id,r.id,r.scope,'ai.configure' FROM roles r
WHERE r.scope='organization' AND r.code='organization-admin' AND r.system_role=1;
INSERT INTO role_permissions(organization_id,role_id,scope,permission_code)
SELECT r.organization_id,r.id,r.scope,'ai.use' FROM roles r
WHERE r.scope='company' AND r.code IN ('company-admin','company-accountant','company-reader','company-operator') AND r.system_role=1;
INSERT INTO role_permissions(organization_id,role_id,scope,permission_code)
SELECT r.organization_id,r.id,r.scope,'ai.execute' FROM roles r
WHERE r.scope='company' AND r.code IN ('company-admin','company-accountant','company-operator') AND r.system_role=1;
INSERT INTO role_permissions(organization_id,role_id,scope,permission_code)
SELECT r.organization_id,r.id,r.scope,'ai.policy' FROM roles r
WHERE r.scope='company' AND r.code='company-admin' AND r.system_role=1;

CREATE TABLE ai_provider_configs (
 organization_id TEXT PRIMARY KEY NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 base_url TEXT NOT NULL CHECK(length(base_url) BETWEEN 8 AND 512),
 model TEXT NOT NULL CHECK(length(model) BETWEEN 1 AND 128),
 encrypted_api_key TEXT NOT NULL CHECK(length(encrypted_api_key) BETWEEN 32 AND 8192),
 supports_tools INTEGER NOT NULL DEFAULT 1 CHECK(supports_tools IN (0,1)),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE ai_company_policies (
 organization_id TEXT NOT NULL,
 company_id TEXT NOT NULL,
 auto_drafts INTEGER NOT NULL DEFAULT 1 CHECK(auto_drafts IN (0,1)),
 auto_post INTEGER NOT NULL DEFAULT 0 CHECK(auto_post IN (0,1)),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,company_id),
 FOREIGN KEY(organization_id,company_id) REFERENCES companies(organization_id,id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE ai_turns (
 id TEXT PRIMARY KEY NOT NULL,
 organization_id TEXT NOT NULL,
 company_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 client_request_id TEXT NOT NULL CHECK(length(client_request_id) BETWEEN 1 AND 128),
 prompt_hash TEXT NOT NULL CHECK(length(prompt_hash)=64),
 status TEXT NOT NULL CHECK(status IN ('processing','completed','awaiting_approval','failed')),
 reply TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(organization_id,company_id,user_id,client_request_id),
 UNIQUE(organization_id,company_id,id),
 FOREIGN KEY(organization_id,company_id) REFERENCES companies(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,user_id) REFERENCES users(organization_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX ai_turns_by_user ON ai_turns(organization_id,company_id,user_id,created_at DESC);
CREATE INDEX ai_turns_rate_limit ON ai_turns(organization_id,user_id,created_at DESC);

CREATE TABLE ai_actions (
 id TEXT PRIMARY KEY NOT NULL,
 turn_id TEXT NOT NULL,
 organization_id TEXT NOT NULL,
 company_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 tool_name TEXT NOT NULL CHECK(length(tool_name) BETWEEN 1 AND 80),
 input_json TEXT NOT NULL CHECK(length(input_json) BETWEEN 2 AND 20000),
 fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),
 state TEXT NOT NULL CHECK(state IN ('awaiting_approval','executing','completed','failed','rejected')),
 result_json TEXT,
 error_code TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(organization_id,company_id,turn_id),
 FOREIGN KEY(organization_id,company_id,turn_id) REFERENCES ai_turns(organization_id,company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,user_id) REFERENCES users(organization_id,id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX ai_actions_pending ON ai_actions(organization_id,company_id,user_id,state);

-- The request/identity, company and action must never be moved to another security scope.
CREATE TRIGGER ai_turns_scope_immutable BEFORE UPDATE OF organization_id,company_id,user_id,client_request_id,prompt_hash ON ai_turns
BEGIN SELECT RAISE(ABORT,'AI turn identity is immutable'); END;
CREATE TRIGGER ai_actions_scope_immutable BEFORE UPDATE OF organization_id,company_id,user_id,turn_id,tool_name,input_json,fingerprint ON ai_actions
BEGIN SELECT RAISE(ABORT,'AI action identity is immutable'); END;
