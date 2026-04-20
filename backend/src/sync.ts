import * as Router from '@koa/router';

const router = new Router();

router.post('/', async ctx => {
	const msg = ctx.state.taskwarrior.executeCommand('sync');
	console.log(msg);
	ctx.status = 200;
});

export default router;
