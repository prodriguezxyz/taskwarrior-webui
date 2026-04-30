import * as Router from '@koa/router';

import { Task } from 'taskwarrior-lib';
import { getProfile, hasProfile } from './profiles';

const router = new Router();

router.get('/', async ctx => {
	const tasks = ctx.state.taskwarrior.load();
	ctx.body = tasks;
});

router.get('/aggregate', async ctx => {
	const allowed: string[] = ctx.state.user.profiles;
	const out: Task[] = [];
	for (const name of allowed) {
		if (!hasProfile(name)) continue;
		const tasks: Task[] = getProfile(name).load();
		for (const t of tasks) (t as any)._profile = name;
		out.push(...tasks);
	}
	ctx.body = out;
});

router.put('/', async ctx => {
	const body = ctx.request.body as { tasks: Task[] };
	const msg = ctx.state.taskwarrior.update(body.tasks);
	console.log(msg);
	ctx.status = 200;
});

router.delete('/', async ctx => {
	const tasks = ctx.query.tasks as string[];
	const msg = ctx.state.taskwarrior.del(tasks.map(t => ({ uuid: t })));
	console.log(msg);
	ctx.status = 200;
});

export default router;
