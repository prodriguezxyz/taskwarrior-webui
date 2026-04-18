import * as fs from 'fs';
import * as Router from '@koa/router';
import { TaskwarriorLib } from 'taskwarrior-lib';

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

const configs = loadProfileConfigs();
const instances: Map<string, TaskwarriorLib> = new Map();
for (const p of configs) {
	instances.set(p.name, new TaskwarriorLib(p.taskrc, p.taskdata));
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
	ctx.body = {
		profiles: listProfiles(),
		default: defaultProfileName()
	};
});
