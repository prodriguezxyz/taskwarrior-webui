import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as Router from '@koa/router';
import { TaskwarriorLib } from 'taskwarrior-lib';
import { renderProfileUdas, writeProfileUdas } from './profileUdas';

interface ProfileConfig {
	name: string;
	taskrc: string;
	taskdata: string;
}

const configPath = process.env.PROFILES_CONFIG || '/profiles.json';

function loadProfileConfigs(): ProfileConfig[] {
	if (!fs.existsSync(configPath)) {
		return [{
			name: 'default',
			taskrc: process.env.TASKRC || '',
			taskdata: process.env.TASKDATA || ''
		}];
	}
	const raw = fs.readFileSync(configPath, 'utf8');
	const parsed = JSON.parse(raw);
	if (!parsed || !Array.isArray(parsed.profiles)) {
		throw new Error(`${configPath}: expected { "profiles": [...] }`);
	}
	if (parsed.profiles.length === 0) {
		throw new Error(`${configPath}: at least one profile is required`);
	}
	const names = new Set<string>();
	for (const p of parsed.profiles) {
		if (typeof p.name !== 'string' || typeof p.taskrc !== 'string' || typeof p.taskdata !== 'string') {
			throw new Error(`${configPath}: each profile must have string {name, taskrc, taskdata}`);
		}
		if (p.name.length === 0) {
			throw new Error(`${configPath}: profile name must be non-empty`);
		}
		if (names.has(p.name)) {
			throw new Error(`${configPath}: duplicate profile name "${p.name}"`);
		}
		names.add(p.name);
	}
	return parsed.profiles;
}

function ensureProfileUdas(profile: ProfileConfig): void {
	try {
		const taskrc = profile.taskrc || process.env.TASKRC || path.join(os.homedir(), '.taskrc');
		const current = fs.existsSync(taskrc) ? fs.readFileSync(taskrc, 'utf8') : '';
		const next = renderProfileUdas(current);
		if (current !== next) writeProfileUdas(taskrc, next);
	}
	catch (err) {
		throw new Error(`[profiles] failed to ensure profile UDAs on "${profile.name}": ${(err as Error).message}`);
	}
}

const configs = loadProfileConfigs();
const instances: Map<string, TaskwarriorLib> = new Map();
for (const p of configs) {
	ensureProfileUdas(p);
	const lib = new TaskwarriorLib(p.taskrc, p.taskdata);
	instances.set(p.name, lib);
}
const defaultName = configs[0].name;

export function hasProfile(name: string): boolean {
	return instances.has(name);
}

export function getProfile(name?: string): TaskwarriorLib {
	const key = name && instances.has(name) ? name : defaultName;
	return instances.get(key)!;
}

export function listProfiles(): Array<{ name: string }> {
	return configs.map(c => ({ name: c.name }));
}

export function defaultProfileName(): string {
	return defaultName;
}

export const profilesRouter = new Router();
profilesRouter.get('/', async ctx => {
	const allowed: string[] = ctx.state.user.profiles;
	ctx.body = {
		profiles: allowed.map(name => ({ name })),
		default: allowed[0]
	};
});

profilesRouter.get('/:name/members', async ctx => {
	// Lazy import avoids the circular load between profiles.ts and users.ts
	// (users.ts already imports hasProfile from this module at top-level).
	const { listUsers } = require('./users') as typeof import('./users');
	const requested = ctx.params.name;
	const allowed: string[] = ctx.state.user.profiles;
	if (!allowed.includes(requested)) ctx.throw(403, `profile "${requested}" not allowed`);
	if (!hasProfile(requested)) ctx.throw(404, `unknown profile "${requested}"`);
	const members = listUsers()
		.filter(u => u.profiles.includes(requested))
		.map(u => ({ email: u.email, name: u.name ?? u.email.split('@')[0] }));
	ctx.body = { members };
});
