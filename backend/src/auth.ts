import { Context, Next } from 'koa';
import * as Router from '@koa/router';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { findUserByEmail } from './users';

type AuthMode = 'cloudflare' | 'dev';

const mode: AuthMode = (process.env.AUTH_MODE === 'dev' ? 'dev' : 'cloudflare');
const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN || '';
const audience = process.env.CF_ACCESS_AUD || '';
const devEmail = (process.env.DEV_USER_EMAIL || 'dev@localhost').toLowerCase();

if (mode === 'cloudflare') {
	if (!teamDomain) {
		throw new Error('AUTH_MODE=cloudflare but CF_ACCESS_TEAM_DOMAIN is not set');
	}
	if (!audience) {
		throw new Error('AUTH_MODE=cloudflare but CF_ACCESS_AUD is not set');
	}
}

const issuer = mode === 'cloudflare' ? `https://${teamDomain}` : '';
const jwks = mode === 'cloudflare'
	? createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`))
	: null;

async function resolveEmail(ctx: Context): Promise<string> {
	if (mode === 'dev') {
		return devEmail;
	}
	const raw = ctx.request.headers['cf-access-jwt-assertion'];
	const token = Array.isArray(raw) ? raw[0] : raw;
	if (!token) {
		ctx.throw(401, 'missing Cf-Access-Jwt-Assertion header');
	}
	let payload;
	try {
		({ payload } = await jwtVerify(token, jwks!, { issuer, audience }));
	}
	catch (err) {
		ctx.throw(401, `invalid CF Access token: ${(err as Error).message}`);
	}
	const email = payload.email;
	if (typeof email !== 'string' || email.length === 0) {
		ctx.throw(401, 'token missing email claim');
	}
	return (email as string).toLowerCase();
}

export async function authMiddleware(ctx: Context, next: Next): Promise<void> {
	const email = await resolveEmail(ctx);
	const user = findUserByEmail(email);
	if (!user) {
		ctx.throw(403, `email "${email}" not provisioned`);
	}
	ctx.state.email = email;
	ctx.state.user = user;
	await next();
}

export const authRouter = new Router();
authRouter.get('/me', async ctx => {
	ctx.body = { email: ctx.state.user.email, profiles: ctx.state.user.profiles };
});

export function authMode(): AuthMode {
	return mode;
}
