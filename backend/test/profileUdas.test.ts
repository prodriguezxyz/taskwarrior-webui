import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { renderProfileUdas, writeProfileUdas } from '../src/profileUdas';

const expected = [
	'color=on',
	'# uda.twui_duration.type=string',
	'uda.assignee.type=string',
	'uda.assignee.label=Assigned to',
	'uda.twui_reminder.type=date',
	'uda.twui_reminder.label=Reminder',
	'uda.twui_duration.type=duration',
	'uda.twui_duration.label=Duration',
	''
].join('\n');

const rendered = renderProfileUdas([
	'color=on',
	'uda.assignee.type=numeric',
	'uda.assignee.type=string',
	'uda.twui_reminder.label=Old label',
	'# uda.twui_duration.type=string',
	''
].join('\r\n'));

assert.strictEqual(rendered, expected);
assert.strictEqual(renderProfileUdas(rendered), rendered, 'rendering must be idempotent');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'twui-profile-udas-'));
try {
	const target = path.join(directory, 'taskrc');
	const link = path.join(directory, 'linked-taskrc');
	fs.writeFileSync(target, 'color=off\n', { mode: 0o640 });
	fs.symlinkSync(target, link);
	writeProfileUdas(link, rendered);
	assert.strictEqual(fs.readFileSync(target, 'utf8'), rendered);
	assert.strictEqual(fs.lstatSync(link).isSymbolicLink(), true, 'the taskrc symlink must be preserved');
	assert.strictEqual(fs.statSync(target).mode & 0o777, 0o640, 'existing permissions must be preserved');
}
finally {
	fs.rmSync(directory, { recursive: true, force: true });
}
console.log('profile UDA tests passed');
