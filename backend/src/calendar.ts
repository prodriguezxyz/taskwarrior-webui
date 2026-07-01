import * as http from 'http';
import * as https from 'https';
import * as Router from '@koa/router';

import { Task } from 'taskwarrior-lib';
import { getProfile, hasProfile } from './profiles';
import { withProfileLock } from './queue';

interface CalendarConfig {
	enabled: boolean;
	baseUrl: string;
	username: string;
	password: string;
	alarmTrigger: string;
	durationMinutes: number;
	timeZone: string;
	requestTimeoutMs: number;
}

interface ReminderDate {
	source: 'scheduled' | 'due';
	date: Date;
}

const router = new Router();

function calendarConfig(): CalendarConfig {
	return {
		enabled: truthy(process.env.CALDAV_ENABLED),
		baseUrl: process.env.CALDAV_BASE_URL || '',
		username: process.env.CALDAV_USERNAME || '',
		password: process.env.CALDAV_PASSWORD || '',
		alarmTrigger: cleanRawIcalValue(process.env.CALDAV_ALARM_TRIGGER || '-PT10M'),
		durationMinutes: Math.max(1, Number(process.env.CALDAV_EVENT_DURATION_MINUTES || '15') || 15),
		timeZone: process.env.CALDAV_TIMEZONE || process.env.TZ || 'Europe/Madrid',
		requestTimeoutMs: Math.max(1000, Number(process.env.CALDAV_REQUEST_TIMEOUT_MS || '5000') || 5000)
	};
}

function truthy(value: string | undefined): boolean {
	return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

export function calendarSyncEnabled(): boolean {
	const config = calendarConfig();
	return config.enabled && Boolean(config.baseUrl);
}

export async function syncTaskCalendar(profile: string, task: Task): Promise<void> {
	const config = calendarConfig();
	if (!config.enabled || !config.baseUrl || !task.uuid) return;
	const reminder = reminderDate(task);
	if (!reminder) {
		await deleteTaskCalendar(profile, task.uuid);
		return;
	}
	await putCalendarEvent(config, profile, task, reminder);
}

export async function deleteTaskCalendar(profile: string, uuid: string | undefined): Promise<void> {
	const config = calendarConfig();
	if (!config.enabled || !config.baseUrl || !uuid) return;
	await caldavRequest(config, 'DELETE', eventUrl(config, profile, uuid));
}

export async function reconcileProfileCalendar(profile: string, tasks: Task[]): Promise<void> {
	const config = calendarConfig();
	if (!config.enabled || !config.baseUrl) return;
	for (const task of tasks) {
		if (!task.uuid) continue;
		await syncTaskCalendar(profile, task);
	}
}

export async function syncEligibleProfileCalendar(profile: string, tasks: Task[]): Promise<void> {
	const config = calendarConfig();
	if (!config.enabled || !config.baseUrl) return;
	for (const task of tasks) {
		const reminder = reminderDate(task);
		if (!task.uuid || !reminder) continue;
		await putCalendarEvent(config, profile, task, reminder);
	}
}

export async function syncChangedTasksCalendar(profile: string, changed: Task[], current: Task[]): Promise<void> {
	const config = calendarConfig();
	if (!config.enabled || !config.baseUrl) return;
	const byUuid = new Map<string, Task>();
	for (const task of current) {
		if (task.uuid) byUuid.set(task.uuid, task);
	}
	for (const task of changed) {
		if (!task.uuid) continue;
		await syncTaskCalendar(profile, byUuid.get(task.uuid) || task);
	}
}

export async function runCalendarSync(label: string, work: () => Promise<void>): Promise<void> {
	try {
		await work();
	}
	catch (err) {
		console.error(`[calendar] ${label} failed: ${(err as Error).message}`);
	}
}

function reminderDate(task: Task): ReminderDate | null {
	if (task.status !== 'pending') return null;
	const config = calendarConfig();
	const scheduled = parseTimedTaskDate(task.scheduled, config.timeZone);
	if (scheduled) return { source: 'scheduled', date: scheduled };
	const due = parseTimedTaskDate(task.due, config.timeZone);
	if (due) return { source: 'due', date: due };
	return null;
}

function parseTimedTaskDate(value: string | undefined, timeZone: string): Date | null {
	if (!value) return null;
	if (hasNoTime(value)) return null;
	const date = parseTaskDate(value);
	if (!date) return null;
	const localTime = new Intl.DateTimeFormat('en-GB', {
		timeZone,
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	}).format(date);
	if (localTime === '00:00:00') return null;
	return date;
}

function hasNoTime(value: string): boolean {
	if (/^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{8}$/.test(value)) return true;
	return /^\d{8}T000000Z$/.test(value)
		|| /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z$/.test(value);
}

function parseTaskDate(value: string): Date | null {
	const taskUtc = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
	if (taskUtc) {
		return validDate(`${taskUtc[1]}-${taskUtc[2]}-${taskUtc[3]}T${taskUtc[4]}:${taskUtc[5]}:${taskUtc[6]}Z`);
	}
	const compact = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(value);
	if (compact) {
		return validDate(`${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}`);
	}
	return validDate(value);
}

function validDate(value: string): Date | null {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function eventUrl(config: CalendarConfig, profile: string, uuid: string): string {
	const base = config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`;
	const uid = eventUid(profile, uuid);
	return `${base}${encodeURIComponent(uid)}.ics`;
}

function eventUid(profile: string, uuid: string): string {
	return `taskwarrior-${profile}-${uuid}`;
}

async function putCalendarEvent(
	config: CalendarConfig,
	profile: string,
	task: Task,
	reminder: ReminderDate
): Promise<void> {
	const start = reminder.date;
	const end = new Date(start.getTime() + config.durationMinutes * 60000);
	const body = serializeIcal([
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//taskwarrior-webui//caldav-alerts//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:${escapeIcalText(eventUid(profile, task.uuid!))}`,
		`DTSTAMP:${formatIcalDate(new Date())}`,
		`DTSTART:${formatIcalDate(start)}`,
		`DTEND:${formatIcalDate(end)}`,
		`SUMMARY:${escapeIcalText(task.description || 'Taskwarrior task')}`,
		`DESCRIPTION:${escapeIcalText(eventDescription(profile, task, reminder.source))}`,
		'BEGIN:VALARM',
		`TRIGGER:${config.alarmTrigger}`,
		'ACTION:DISPLAY',
		`DESCRIPTION:${escapeIcalText(task.description || 'Taskwarrior task')}`,
		'END:VALARM',
		'END:VEVENT',
		'END:VCALENDAR'
	]);
	await caldavRequest(config, 'PUT', eventUrl(config, profile, task.uuid!), body);
}

function eventDescription(profile: string, task: Task, source: string): string {
	const lines = [
		`Taskwarrior profile: ${profile}`,
		`Task UUID: ${task.uuid}`,
		`Reminder source: ${source}`
	];
	if (task.project) lines.push(`Project: ${task.project}`);
	if (task.tags && task.tags.length > 0) lines.push(`Tags: ${task.tags.join(', ')}`);
	return lines.join('\n');
}

function formatIcalDate(date: Date): string {
	return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcalText(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/\r?\n/g, '\\n')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,');
}

function cleanRawIcalValue(value: string): string {
	return value.replace(/[\r\n]/g, '');
}

function serializeIcal(lines: string[]): string {
	return lines.flatMap(foldIcalLine).join('\r\n') + '\r\n';
}

function foldIcalLine(line: string): string[] {
	const out: string[] = [];
	let rest = line;
	while (rest.length > 75) {
		out.push(rest.slice(0, 75));
		rest = ` ${rest.slice(75)}`;
	}
	out.push(rest);
	return out;
}

function caldavRequest(config: CalendarConfig, method: string, urlString: string, body = ''): Promise<void> {
	return new Promise((resolve, reject) => {
		const url = new URL(urlString);
		const client = url.protocol === 'https:' ? https : http;
		const headers: Record<string, string | number> = {
			'User-Agent': 'taskwarrior-webui',
			'Content-Length': Buffer.byteLength(body)
		};
		if (body) headers['Content-Type'] = 'text/calendar; charset=utf-8';
		if (config.username || config.password) {
			headers.Authorization = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
		}
		const req = client.request(url, { method, headers }, res => {
			res.resume();
			res.on('end', () => {
				const ok = res.statusCode && res.statusCode >= 200 && res.statusCode < 300;
				const missingDelete = method === 'DELETE' && res.statusCode === 404;
				if (ok || missingDelete) resolve();
				else reject(new Error(`${method} ${urlString} returned ${res.statusCode}`));
			});
		});
		req.setTimeout(config.requestTimeoutMs, () => {
			req.destroy(new Error(`${method} ${urlString} timed out after ${config.requestTimeoutMs}ms`));
		});
		req.on('error', reject);
		if (body) req.write(body);
		req.end();
	});
}

router.post('/reconcile', async ctx => {
	const profile: string = ctx.state.profileName;
	const tasks: Task[] = await withProfileLock(profile, () => ctx.state.taskwarrior.load());
	await reconcileProfileCalendar(profile, tasks);
	ctx.body = { synced: tasks.filter(t => t.uuid && reminderDate(t)).length };
});

router.post('/reconcile/all', async ctx => {
	const allowed: string[] = ctx.state.user.profiles;
	const out: Array<{ profile: string, synced: number }> = [];
	for (const profile of allowed) {
		if (!hasProfile(profile)) continue;
		const tasks: Task[] = await withProfileLock(profile, () => getProfile(profile).load());
		await reconcileProfileCalendar(profile, tasks);
		out.push({ profile, synced: tasks.filter(t => t.uuid && reminderDate(t)).length });
	}
	ctx.body = { profiles: out };
});

export default router;
