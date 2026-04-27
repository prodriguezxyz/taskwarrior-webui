import { Plugin } from '@nuxt/types';

const plugin: Plugin = async ({ $axios, store }) => {
	$axios.onRequest(config => {
		const profile = (store.state as any).settings.profile;
		if (profile) {
			config.headers = { ...(config.headers || {}), 'X-Profile': profile };
		}
		return config;
	});

	await store.dispatch('fetchMe');
	store.dispatch('fetchSettings');
	await store.dispatch('fetchProfiles');
	await store.dispatch('fetchMembers');
};

export default plugin;
