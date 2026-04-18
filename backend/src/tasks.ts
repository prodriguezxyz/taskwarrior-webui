import * as Router from '@koa/router';

import { Task } from 'taskwarrior-lib';

const router = new Router();

router.get('/', async ctx => {
	const tasks = ctx.state.taskwarrior.load();
	ctx.body = tasks;
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
