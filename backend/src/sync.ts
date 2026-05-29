import * as Router from '@koa/router';
import { withProfileLock } from './queue';
import { reconcileProfileCalendar, runCalendarSync } from './calendar';
import { Task } from 'taskwarrior-lib';

const router = new Router();

router.post('/', async ctx => {
	const profile: string = ctx.state.profileName;
	const msg = await withProfileLock(profile, () => ctx.state.taskwarrior.executeCommand('sync'));
	console.log(msg);
	await runCalendarSync(`reconcile ${profile} after task sync`, async () => {
		const tasks: Task[] = await withProfileLock(profile, () => ctx.state.taskwarrior.load());
		await reconcileProfileCalendar(profile, tasks);
	});
	ctx.status = 200;
});

export default router;
