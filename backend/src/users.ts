import * as fs from 'fs';
import { hasProfile } from './profiles';

export interface User {
	email: string;
	profiles: string[];
	name?: string;
}

const configPath = process.env.USERS_CONFIG || '/users.json';

function loadUsers(): User[] {
	if (!fs.existsSync(configPath)) {
		throw new Error(`${configPath}: users config not found`);
	}
	const raw = fs.readFileSync(configPath, 'utf8');
	const parsed = JSON.parse(raw);
	if (!parsed || !Array.isArray(parsed.users)) {
		throw new Error(`${configPath}: expected { "users": [...] }`);
	}
	if (parsed.users.length === 0) {
		throw new Error(`${configPath}: at least one user is required`);
	}
	const emails = new Set<string>();
	const result: User[] = [];
	for (const u of parsed.users) {
		if (typeof u.email !== 'string' || u.email.length === 0) {
			throw new Error(`${configPath}: each user must have a non-empty string email`);
		}
		if (!Array.isArray(u.profiles) || u.profiles.length === 0) {
			throw new Error(`${configPath}: user "${u.email}" must have a non-empty profiles array`);
		}
		if (u.name !== undefined && (typeof u.name !== 'string' || u.name.length === 0)) {
			throw new Error(`${configPath}: user "${u.email}" name must be a non-empty string`);
		}
		const email = u.email.toLowerCase();
		if (emails.has(email)) {
			throw new Error(`${configPath}: duplicate user email "${email}"`);
		}
		for (const p of u.profiles) {
			if (typeof p !== 'string' || !hasProfile(p)) {
				throw new Error(`${configPath}: user "${email}" references unknown profile "${p}"`);
			}
		}
		emails.add(email);
		result.push({ email, profiles: u.profiles, name: u.name });
	}
	return result;
}

const users = loadUsers();
const byEmail: Map<string, User> = new Map();
for (const u of users) {
	byEmail.set(u.email, u);
}

export function findUserByEmail(email: string): User | undefined {
	return byEmail.get(email.toLowerCase());
}

export function listUsers(): User[] {
	return users;
}
