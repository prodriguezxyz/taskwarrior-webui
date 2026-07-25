import assert from 'assert';
import { memberLabel, ProfileMember, resolveAssignee } from '../utils/assignee';

const members: ProfileMember[] = [
	{ email: 'pedro@empresa.com', name: 'Pedro García' },
	{ email: 'pedro@familia.com', name: 'Pedro García' },
	{ email: 'maria@example.com', name: 'María López' },
	{ email: 'ana+tasks@example.com', name: 'Ana' }
];

assert.strictEqual(resolveAssignee('pedro@empresa.com', members), 'pedro@empresa.com');
assert.strictEqual(resolveAssignee('PEDRO@FAMILIA.COM', members), 'pedro@familia.com');
assert.strictEqual(resolveAssignee('pedro', members), undefined);
assert.strictEqual(resolveAssignee('Pedro García', members), undefined);
assert.strictEqual(resolveAssignee('maria', members), 'maria@example.com');
assert.strictEqual(resolveAssignee('MariaLopez', members), 'maria@example.com');
assert.strictEqual(resolveAssignee('lopez', members), 'maria@example.com');
assert.strictEqual(resolveAssignee('ana+tasks@example.com', members), 'ana+tasks@example.com');
assert.strictEqual(resolveAssignee('unknown', members), undefined);
assert.strictEqual(resolveAssignee(undefined, members), undefined);
assert.strictEqual(memberLabel({ email: 'ana@example.com', name: '' }), 'ana');

console.log('assignee resolver tests passed');
