-- Phase 3: organization security boundary, company scopes and persistent identity.
-- Never move a user, role or company between organizations by updating foreign keys.
CREATE TABLE organizations (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (id, slug)
) STRICT;

CREATE TABLE companies (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, code)
) STRICT;
CREATE INDEX companies_by_org ON companies(organization_id, status);

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 160),
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  auth_version INTEGER NOT NULL DEFAULT 1 CHECK (auth_version >= 1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, username)
) STRICT;
CREATE INDEX users_by_org ON users(organization_id, status);

CREATE TABLE permission_definitions (
  code TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('organization','company')),
  description TEXT NOT NULL,
  UNIQUE (code, scope)
) STRICT;
INSERT INTO permission_definitions(code, scope, description) VALUES
 ('organizations.read','organization','View own organization'),
 ('companies.read','organization','List company directory in organization'),
 ('companies.manage','organization','Create and manage companies'),
 ('users.read','organization','View users in own organization'),
 ('users.manage','organization','Create and manage users'),
 ('roles.manage','organization','Define and assign roles'),
 ('audit.read','organization','Read organization security audit'),
 ('company.read','company','View assigned company'),
 ('accounting.read','company','Read accounting records (future module)'),
 ('accounting.post','company','Post accounting records (future module)'),
 ('sales.read','company','Read sales documents (future module)'),
 ('sales.manage','company','Manage sales documents (future module)'),
 ('purchasing.read','company','Read purchase documents (future module)'),
 ('purchasing.manage','company','Manage purchase documents (future module)'),
 ('payments.read','company','Read payments (future module)'),
 ('payments.manage','company','Manage payments (future module)');

CREATE TABLE roles (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  scope TEXT NOT NULL CHECK (scope IN ('organization','company')),
  code TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  system_role INTEGER NOT NULL DEFAULT 0 CHECK (system_role IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, id, scope),
  UNIQUE (organization_id, scope, code)
) STRICT;

CREATE TABLE role_permissions (
  organization_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  permission_code TEXT NOT NULL,
  PRIMARY KEY (organization_id, role_id, permission_code),
  FOREIGN KEY (organization_id, role_id, scope) REFERENCES roles(organization_id, id, scope) ON DELETE CASCADE,
  FOREIGN KEY (permission_code, scope) REFERENCES permission_definitions(code, scope) ON DELETE RESTRICT
) STRICT;

CREATE TABLE user_role_assignments (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('organization','company')),
  company_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK ((scope = 'organization' AND company_id IS NULL) OR (scope = 'company' AND company_id IS NOT NULL)),
  FOREIGN KEY (organization_id, user_id) REFERENCES users(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, role_id, scope) REFERENCES roles(organization_id, id, scope) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, company_id) REFERENCES companies(organization_id, id) ON DELETE RESTRICT
) STRICT;
CREATE UNIQUE INDEX unique_org_role_assignment ON user_role_assignments(organization_id, user_id, role_id) WHERE company_id IS NULL;
CREATE UNIQUE INDEX unique_company_role_assignment ON user_role_assignments(organization_id, user_id, role_id, company_id) WHERE company_id IS NOT NULL;
CREATE INDEX grants_by_user ON user_role_assignments(organization_id, user_id, scope, company_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  auth_version INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at TEXT,
  FOREIGN KEY (organization_id, user_id) REFERENCES users(organization_id, id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX sessions_by_user ON sessions(organization_id, user_id, expires_at);

-- Persistent account lockout without exposing whether usernames exist.
CREATE TABLE login_throttles (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  username TEXT NOT NULL,
  failures INTEGER NOT NULL DEFAULT 0 CHECK (failures >= 0),
  window_started_at TEXT NOT NULL,
  locked_until TEXT,
  PRIMARY KEY (organization_id, username)
) STRICT;

CREATE TABLE security_audit (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  company_id TEXT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success','failure')),
  subject_type TEXT NOT NULL,
  subject_id TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (organization_id, company_id) REFERENCES companies(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, actor_user_id) REFERENCES users(organization_id, id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX audit_by_org ON security_audit(organization_id, created_at DESC, id DESC);
CREATE TRIGGER security_audit_no_update BEFORE UPDATE ON security_audit BEGIN SELECT RAISE(ABORT, 'Audit events are append-only'); END;
CREATE TRIGGER security_audit_no_delete BEFORE DELETE ON security_audit BEGIN SELECT RAISE(ABORT, 'Audit events are append-only'); END;

-- Accidentally moving an identity or a legal entity between security boundaries is forbidden.
CREATE TRIGGER users_org_immutable BEFORE UPDATE OF organization_id ON users
WHEN OLD.organization_id <> NEW.organization_id BEGIN SELECT RAISE(ABORT, 'Cannot move a user between organizations'); END;
CREATE TRIGGER companies_org_immutable BEFORE UPDATE OF organization_id ON companies
WHEN OLD.organization_id <> NEW.organization_id BEGIN SELECT RAISE(ABORT, 'Cannot move a company between organizations'); END;
CREATE TRIGGER roles_org_immutable BEFORE UPDATE OF organization_id ON roles
WHEN OLD.organization_id <> NEW.organization_id BEGIN SELECT RAISE(ABORT, 'Cannot move a role between organizations'); END;
