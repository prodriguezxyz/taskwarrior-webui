import { Plugin } from '@nuxt/types';

const plugin: Plugin = async ({ $axios, store }) => {
	$axios.onRequest(config => {
		const profile = (store.state as any).settings.profile;
		if (!profile) return config;
		const headers = { ...(config.headers || {}) };
		// Caller-set X-Profile wins — cross-profile views (Today, Mine) target
		// the task's home profile, which may not match the active settings.profile.
		const hasOverride = Object.keys(headers).some(k => k.toLowerCase() === 'x-profile');
		if (!hasOverride) headers['X-Profile'] = profile;
		config.headers = headers;
		return config;
	});

	await store.dispatch('fetchMe');
	store.dispatch('fetchSettings');
	await store.dispatch('fetchProfiles');
	await store.dispatch('fetchMembers');
};

export default plugin;
