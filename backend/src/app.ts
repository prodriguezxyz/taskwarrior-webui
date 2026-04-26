import * as Koa from 'koa';
import * as Router from '@koa/router';
import * as bodyParser from 'koa-bodyparser';
import * as logger from 'koa-logger';
import * as qs from 'koa-qs';

import tasksRouter from './tasks';
import syncRouter from './sync';
import { profilesRouter, getProfile, hasProfile } from './profiles';
import { authMiddleware, authRouter, authMode } from './auth';
import { TaskError } from 'taskwarrior-lib';

const app = new Koa();

qs(app);
app.use(bodyParser());
app.use(logger());

app.use(async (ctx, next) => {
	try {
		await next();
	}
	catch (err) {
		if (err instanceof TaskError) {
			(err as any).expose = true;
			(err as any).status = 400;
		}
		throw err;
	}
});

app.use(authMiddleware);

app.use(async (ctx, next) => {
	if (ctx.path.startsWith('/profiles') || ctx.path.startsWith('/auth')) {
		await next();
		return;
	}
	const allowed: string[] = ctx.state.user.profiles;
	const raw = ctx.request.headers['x-profile'];
	const requested = typeof raw === 'string' && raw.length > 0 ? raw : undefined;
	let name: string;
	if (requested) {
		if (!hasProfile(requested)) {
			ctx.throw(400, `Unknown profile: ${requested}`);
		}
		if (!allowed.includes(requested)) {
			ctx.throw(403, `profile "${requested}" not allowed for this user`);
		}
		name = requested;
	}
	else {
		name = allowed[0];
	}
	ctx.state.taskwarrior = getProfile(name);
	await next();
});

const router = new Router();
router.use('/tasks', tasksRouter.routes());
router.use('/sync', syncRouter.routes());
router.use('/profiles', profilesRouter.routes());
router.use('/auth', authRouter.routes());

app.use(router.routes());
app.use(router.allowedMethods());

const prod = process.env.NODE_ENV === 'production';
const addr = prod ? '0.0.0.0' : 'localhost';
app.listen(3000, addr);

console.log(`Server listening on http://${addr}:3000 (auth: ${authMode()})`);
