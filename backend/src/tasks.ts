import * as Router from '@koa/router';

import { Task } from 'taskwarrior-lib';
import { getProfile, hasProfile } from './profiles';
import { withProfileLock } from './queue';
import {
	deleteTaskCalendar,
	runCalendarSync,
	syncChangedTasksCalendar,
	syncEligibleProfileCalendar
} from './calendar';

const router = new Router();

router.get('/', async ctx => {
	const profile: string = ctx.state.profileName;
	const tasks = await withProfileLock(profile, () => ctx.state.taskwarrior.load());
	ctx.body = tasks;
});

router.get('/aggregate', async ctx => {
	const allowed: string[] = ctx.state.user.profiles;
	const out: Task[] = [];
	for (const name of allowed) {
		if (!hasProfile(name)) continue;
		const tasks: Task[] = await withProfileLock(name, () => getProfile(name).load());
		for (const t of tasks) (t as any)._profile = name;
		out.push(...tasks);
	}
	ctx.body = out;
});

router.put('/', async ctx => {
	const profile: string = ctx.state.profileName;
	const body = ctx.request.body as { tasks: Task[] };
	const msg = await withProfileLock(profile, () => ctx.state.taskwarrior.update(body.tasks));
	console.log(msg);
	await runCalendarSync(`sync changed tasks for ${profile}`, async () => {
		const tasks: Task[] = await withProfileLock(profile, () => ctx.state.taskwarrior.load());
		await syncChangedTasksCalendar(profile, body.tasks, tasks);
		if (body.tasks.some(task => !task.uuid)) {
			await syncEligibleProfileCalendar(profile, tasks);
		}
	});
	ctx.status = 200;
});

router.delete('/', async ctx => {
	const profile: string = ctx.state.profileName;
	const tasks = normalizeTaskUuids(ctx.query.tasks);
	const msg = await withProfileLock(profile, () =>
		ctx.state.taskwarrior.del(tasks.map(t => ({ uuid: t })))
	);
	console.log(msg);
	await runCalendarSync(`delete ${profile}`, async () => {
		await Promise.all(tasks.map(uuid => deleteTaskCalendar(profile, uuid)));
	});
	ctx.status = 200;
});

function normalizeTaskUuids(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(String);
	if (typeof value === 'string') return [value];
	return [];
}

export default router;
