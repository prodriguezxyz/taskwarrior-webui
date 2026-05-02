import * as Router from '@koa/router';
import { withProfileLock } from './queue';

const router = new Router();

router.post('/', async ctx => {
	const profile: string = ctx.state.profileName;
	const msg = await withProfileLock(profile, () => ctx.state.taskwarrior.executeCommand('sync'));
	console.log(msg);
	ctx.status = 200;
});

export default router;
