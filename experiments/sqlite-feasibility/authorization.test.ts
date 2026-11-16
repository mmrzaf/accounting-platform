import test from 'node:test';
import assert from 'node:assert/strict';

// A pure contract proof, not real identity/session implementation.
interface RoleAssignment { organizationId: string; companyId: string | null; permissions: string[]; isGlobalAdmin: boolean }
interface Actor { organizationId: string; active: boolean; companyIds: string[]; roleAssignments: RoleAssignment[] }
interface Target { organizationId: string; companyId: string | null }

function permits({ actor, target, action }: { actor: Actor; target: Target; action: string }): boolean {
  if (!actor.active || actor.organizationId !== target.organizationId) return false;
  if (!target.companyId || !actor.companyIds.includes(target.companyId)) return false;
  return actor.roleAssignments.some(role => role.organizationId === actor.organizationId &&
    (role.companyId === target.companyId || (role.isGlobalAdmin && role.companyId === null)) &&
    role.permissions.includes(action));
}

const clerk: Actor = {
  organizationId: 'org-a', active: true, companyIds: ['co-a'],
  roleAssignments: [{ organizationId: 'org-a', companyId: 'co-a', permissions: ['invoice.read', 'invoice.create'], isGlobalAdmin: false }],
};

test('company and organization permissions are checked independently', () => {
  assert.equal(permits({ actor: clerk, target: { organizationId: 'org-a', companyId: 'co-a' }, action: 'invoice.read' }), true);
  assert.equal(permits({ actor: clerk, target: { organizationId: 'org-a', companyId: 'co-a' }, action: 'invoice.post' }), false);
  assert.equal(permits({ actor: clerk, target: { organizationId: 'org-a', companyId: 'co-b' }, action: 'invoice.read' }), false);
  assert.equal(permits({ actor: clerk, target: { organizationId: 'org-b', companyId: 'co-a' }, action: 'invoice.read' }), false);
  assert.equal(permits({ actor: { ...clerk, active: false }, target: { organizationId: 'org-a', companyId: 'co-a' }, action: 'invoice.read' }), false);
});

test('global admin semantics still require explicit company access', () => {
  const global = { ...clerk, roleAssignments: [{ organizationId: 'org-a', companyId: null, permissions: ['invoice.post'], isGlobalAdmin: true }] };
  assert.equal(permits({ actor: global, target: { organizationId: 'org-a', companyId: 'co-a' }, action: 'invoice.post' }), true);
  assert.equal(permits({ actor: global, target: { organizationId: 'org-a', companyId: 'co-b' }, action: 'invoice.post' }), false);
});
